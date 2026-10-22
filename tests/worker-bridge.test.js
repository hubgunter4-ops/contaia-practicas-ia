import test from "node:test";
import assert from "node:assert/strict";
import { createWorkerBridge, SessionExpiredError, WorkerBridgeError } from "../src/app/worker-bridge.js";

class FakeWorker {
  constructor() { this.messages = []; this.terminated = false; }
  postMessage(message, transfer) {
    this.messages.push({ message, transfer });
    queueMicrotask(() => this.onmessage?.({ data: { type: "result", requestId: message.requestId, sessionEpoch: message.sessionEpoch, result: { rows: [["Fecha", "Importe"], ["2026-10-01", 100]] } } }));
  }
  terminate() { this.terminated = true; }
}

test("WorkerBridge transfiere solo ArrayBuffer y devuelve el resultado local", async () => {
  let worker;
  const bridge = createWorkerBridge({
    workerUrls: { reconciliation: "/src/workers/reconciliation-parser.worker.js" },
    workerFactory: () => { worker = new FakeWorker(); return worker; },
    epochProvider: () => 4,
  });
  const buffer = new ArrayBuffer(12);
  const result = await bridge.run("reconciliation", { operation: "file", file: { name: "extracto.csv", size: 12, buffer } }, { sessionEpoch: 4, transfer: [buffer] });
  assert.deepEqual(result.rows[0], ["Fecha", "Importe"]);
  assert.equal(worker.messages[0].transfer[0], buffer);
  assert.equal(worker.terminated, true);
  assert.equal(bridge.pendingCount, 0);
});

test("WorkerBridge no permite File ni campos sensibles en el mensaje", async () => {
  const bridge = createWorkerBridge({ workerUrls: { reconciliation: "/worker.js" }, workerFactory: () => new FakeWorker() });
  await assert.rejects(() => bridge.run("reconciliation", { operation: "file", rfc: "AAA010101AAA" }), (error) => error instanceof WorkerBridgeError && error.code === "payload_sensitive");
  await assert.rejects(() => bridge.run("reconciliation", { operation: "file", file: new Blob(["private"]) }), (error) => error instanceof WorkerBridgeError && error.code === "payload_blob");
});

test("WorkerBridge aborta y termina el Worker sin conservar trabajos pendientes", async () => {
  let worker;
  const bridge = createWorkerBridge({
    workerUrls: { cfdi: "/worker.js" },
    workerFactory: () => { worker = new FakeWorker(); return worker; },
  });
  const controller = new AbortController();
  controller.abort("reset-island");
  await assert.rejects(() => bridge.run("cfdi", { files: [] }, { signal: controller.signal }), /reset-island/);
  assert.equal(bridge.pendingCount, 0);
  assert.equal(worker, undefined);
});

test("WorkerBridge rechaza resultados de una época de sesión antigua", async () => {
  let epoch = 5;
  const bridge = createWorkerBridge({
    workerUrls: { cfdi: "/worker.js" },
    workerFactory: () => ({
      terminate() {},
      postMessage(message) { queueMicrotask(() => { epoch = 6; this.onmessage?.({ data: { type: "result", requestId: message.requestId, sessionEpoch: message.sessionEpoch, result: {} } }); }); },
    }),
    epochProvider: () => epoch,
  });
  await assert.rejects(() => bridge.run("cfdi", { files: [] }, { sessionEpoch: 5 }), SessionExpiredError);
});
