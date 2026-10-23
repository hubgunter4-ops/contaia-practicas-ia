import test from "node:test";
import assert from "node:assert/strict";
import { createAiObservability } from "../src/cfdi/ai/ai-observability.js";

test("E4 solo emite eventos del contrato y descarta campos prohibidos", () => {
  const emitted = [];
  const telemetry = createAiObservability({ environment: "test", sink: (event) => emitted.push(event) });
  const safe = telemetry.emit("ai.planner.completed", {
    requestId: "ai:e4-safe",
    route: "cfdi_planner",
    outcome: "completed",
    latencyMs: 120,
    toolId: "cfdi.alerts",
    environment: "test",
  });
  const blocked = telemetry.emit("ai.planner.completed", {
    requestId: "ai:e4-blocked",
    route: "cfdi_planner",
    outcome: "completed",
    latencyMs: 120,
    toolId: "cfdi.alerts",
    environment: "test",
    message: "RFC AAA010101AAA XML privado",
  });
  assert.equal(safe.contractVersion, "ai-governance-v1");
  assert.equal(blocked, null);
  assert.equal(emitted.length, 1);
  assert.equal(JSON.stringify(emitted[0]), JSON.stringify(safe));
  assert.equal(JSON.stringify(emitted).includes("AAA010101AAA"), false);
});

test("E4 agrega contadores y buckets sin conservar eventos completos", () => {
  const telemetry = createAiObservability({ environment: "production", sink: null });
  for (const latencyMs of [20, 240, 700, 1500, 4000]) {
    telemetry.emit("ai.planner.completed", {
      requestId: `ai:e4-${latencyMs}`,
      route: "cfdi_planner",
      outcome: "completed",
      latencyMs,
      toolId: "cfdi.summary",
      environment: "production",
    });
  }
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.contractVersion, "ai-observability-v1");
  assert.equal(snapshot.emittedEvents, 5);
  assert.deepEqual(snapshot.latencyBuckets, { lt_100: 1, "100_499": 1, "500_999": 1, "1s_2s": 1, "2s_plus": 1 });
  assert.equal(Object.keys(snapshot.counters).length, 1);
  assert.equal(JSON.stringify(snapshot).includes("ai:e4-"), false);
});

test("E4 crea referencias de cuenta no reversibles y proveedores allowlisted", () => {
  const telemetry = createAiObservability({ environment: "test" });
  const accountRef = telemetry.accountRef("0b907fb8-9f2f-4e50-8f8a-e8a54a1591c2");
  assert.match(accountRef, /^acct_[a-z0-9]+$/);
  assert.equal(accountRef.includes("0b907"), false);
  assert.equal(telemetry.providerFamily("openai/gpt-test"), "openai");
  assert.equal(telemetry.providerFamily("anthropic/claude-test"), "anthropic");
  assert.equal(telemetry.providerFamily("evil-provider"), "unknown");
});

test("E4 genera requestId opaco y calcula duración acotada", () => {
  let now = 1000;
  const telemetry = createAiObservability({ now: () => now, requestIdFactory: () => "ai:e4-request" });
  const trace = telemetry.startRequest();
  now = 1450;
  assert.equal(trace.requestId, "ai:e4-request");
  assert.equal(trace.elapsedMs(), 450);
});

test("E4 no rompe la solicitud si el sink falla y cuenta el intento rechazado", () => {
  const telemetry = createAiObservability({ sink: () => { throw new Error("sink offline"); } });
  const event = telemetry.emit("ai.admission.allowed", {
    requestId: "ai:e4-sink",
    capability: "tools.ai.planner.requests",
    quotaDecision: "reserved",
    plan: "free",
    environment: "test",
  });
  const snapshot = telemetry.snapshot();
  assert.ok(event);
  assert.equal(snapshot.emittedEvents, 1);
  assert.equal(snapshot.droppedEvents, 1);
});

test("E4 limita cardinalidad de contadores y conserva solo overflow agregado", () => {
  const telemetry = createAiObservability({ maxCounters: 1 });
  for (const [index, toolId] of ["cfdi.summary", "cfdi.alerts", "cfdi.payment_links"].entries()) {
    telemetry.emit("ai.planner.completed", {
      requestId: `ai:e4-tool-${index}`,
      route: "cfdi_planner",
      outcome: "completed",
      latencyMs: 1,
      toolId,
      environment: "test",
    });
  }
  const snapshot = telemetry.snapshot();
  assert.equal(Object.keys(snapshot.counters).length, 2);
  assert.ok(Object.keys(snapshot.counters).some((key) => key.includes("overflow")));
});

test("E4 reset elimina agregados sin conservar referencias de solicitudes", () => {
  const telemetry = createAiObservability({ environment: "test" });
  telemetry.emit("ai.planner.rate_limited", { requestId: "ai:e4-reset", capability: "tools.ai.planner.requests", errorCode: "ai_rate_limited", environment: "test" });
  telemetry.reset();
  assert.deepEqual(telemetry.snapshot().counters, {});
  assert.equal(telemetry.snapshot().emittedEvents, 0);
});
