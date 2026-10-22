import test from "node:test";
import assert from "node:assert/strict";
import { createEventBus, EventPayloadError } from "../src/app/event-bus.js";
import { createCleanupScope } from "../src/app/cleanup-scope.js";
import { createIslandRegistry } from "../src/app/island-registry.js";
import { createIslandManager } from "../src/app/island-manager.js";

class Host extends EventTarget {
  constructor() { super(); this.children = []; }
  replaceChildren(...nodes) { this.children = nodes; }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("EventBus añade metadatos y rechaza datos fiscales sensibles", () => {
  const target = new EventTarget();
  const bus = createEventBus(target);
  const received = [];
  bus.on("navigation:request", (detail) => received.push(detail));
  const eventId = bus.emit("navigation:request", { sourceIsland: "shell", target: "journal", sessionEpoch: 3, explicitUserAction: true });
  assert.equal(received.length, 1);
  assert.equal(received[0].eventId, eventId);
  assert.equal(received[0].target, "journal");
  assert.equal(received[0].eventVersion, 1);
  assert.throws(() => bus.emit("cfdi:analysis-available", { sourceIsland: "cfdi", analysis: { facturas: [] } }), EventPayloadError);
  assert.throws(() => bus.emit("bank:selection-available", { sourceIsland: "reconciliation", bankRows: [] }), EventPayloadError);
});

test("EventBus se desuscribe con AbortSignal y close elimina listeners", () => {
  const target = new EventTarget();
  const bus = createEventBus(target);
  const controller = new AbortController();
  let count = 0;
  bus.on("workspace:reset", () => { count += 1; }, { signal: controller.signal });
  bus.emit("workspace:reset", { sourceIsland: "journal", reason: "test" });
  controller.abort();
  bus.emit("workspace:reset", { sourceIsland: "journal", reason: "test" });
  assert.equal(count, 1);
  bus.close();
  assert.equal(bus.closed, true);
  assert.equal(bus.emit("workspace:reset", { sourceIsland: "journal", reason: "test" }), "");
});

test("CleanupScope aborta, revoca y ejecuta recursos en orden inverso una sola vez", async () => {
  const scope = createCleanupScope({ islandId: "reconciliation", sessionEpoch: 2 });
  const controller = scope.addAbortController();
  const calls = [];
  scope.add(() => calls.push("first"));
  scope.add(async () => { calls.push("second"); });
  await scope.run("navigation");
  await scope.run("navigation-again");
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(calls, ["second", "first"]);
});

test("CleanupScope desconecta listeners registrados en un host", async () => {
  const target = new EventTarget();
  const scope = createCleanupScope({ islandId: "diot" });
  let count = 0;
  scope.addEventListener(target, "click", () => { count += 1; });
  target.dispatchEvent(new Event("click"));
  await scope.run("navigation");
  target.dispatchEvent(new Event("click"));
  assert.equal(count, 1);
});

test("IslandManager desmonta antes de montar la isla siguiente y publica el orden de eventos", async () => {
  const host = new Host();
  const target = new EventTarget();
  const bus = createEventBus(target);
  const registry = createIslandRegistry({
    cfdi: { mountIsland: async ({ host: root, signal }) => { root.replaceChildren({ island: "cfdi" }); return { destroy: async () => { root.replaceChildren(); signal.throwIfAborted?.(); } }; } },
    journal: { mountIsland: async ({ host: root }) => { root.replaceChildren({ island: "journal" }); return { destroy: async () => root.replaceChildren() }; } },
  });
  const events = [];
  for (const name of ["island:before-unmount", "island:destroyed", "island:mounted"]) bus.on(name, (detail) => events.push(`${name}:${detail.islandId}`));
  const manager = createIslandManager({ host, registry, bus, initialSessionEpoch: 4 });
  await manager.navigate("cfdi");
  assert.equal(manager.active.islandId, "cfdi");
  await manager.navigate("journal");
  assert.equal(manager.active.islandId, "journal");
  assert.deepEqual(events, ["island:mounted:cfdi", "island:before-unmount:cfdi", "island:destroyed:cfdi", "island:mounted:journal"]);
  assert.deepEqual(host.children, [{ island: "journal" }]);
});

test("IslandManager invalida una carga tardía cuando llega una navegación más reciente", async () => {
  const host = new Host();
  const target = new EventTarget();
  const bus = createEventBus(target);
  const slow = deferred();
  const destroyed = [];
  const registry = createIslandRegistry({
    slow: async () => slow.promise,
    fast: { mountIsland: async ({ host: root }) => { root.replaceChildren({ island: "fast" }); return { destroy: async (reason) => destroyed.push(reason) }; } },
  });
  const manager = createIslandManager({ host, registry, bus });
  const first = manager.navigate("slow");
  const second = manager.navigate("fast");
  slow.resolve({ mountIsland: async ({ host: root }) => { root.replaceChildren({ island: "slow" }); return { destroy: async (reason) => destroyed.push(reason) }; } });
  await Promise.all([first, second]);
  assert.equal(manager.active.islandId, "fast");
  assert.deepEqual(host.children, [{ island: "fast" }]);
  assert.equal(destroyed.includes("superseded-navigation"), false);
});

test("clearSession incrementa SessionEpoch y destruye la isla activa", async () => {
  const host = new Host();
  const bus = createEventBus(new EventTarget());
  const registry = createIslandRegistry({ journal: { mountIsland: async () => ({ destroy: async () => {} }) } });
  const manager = createIslandManager({ host, registry, bus, initialSessionEpoch: 7 });
  await manager.navigate("journal");
  const cleared = [];
  bus.on("session:cleared", (detail) => cleared.push(detail));
  await manager.clearSession("auth-signout");
  assert.equal(manager.sessionEpoch, 8);
  assert.equal(manager.active, null);
  assert.equal(host.children.length, 0);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].sessionEpoch, 8);
});
