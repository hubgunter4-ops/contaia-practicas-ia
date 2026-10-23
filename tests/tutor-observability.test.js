import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { handleCfdiPlanner, handleTutorStream } from "../src/tutor/server.js";
import { createAiAdmissionService } from "../src/cfdi/ai/ai-admission.js";
import { createAiObservability } from "../src/cfdi/ai/ai-observability.js";

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.statusCode = 0;
    this.chunks = [];
    this.headersSent = false;
    this.writableEnded = false;
    this.destroyed = false;
  }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value));
    this.headersSent = true;
  }
  flushHeaders() { this.headersSent = true; }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk = "") { if (chunk) this.chunks.push(String(chunk)); this.writableEnded = true; }
  get body() { return this.chunks.join(""); }
}

const env = {
  AI_PROVIDER_DEFAULT: "openai",
  AI_GATEWAY_OPENAI_API_KEY: "gateway-secret-test",
  AI_GATEWAY_OPENAI_MODEL: "openai/gpt-test",
};
const accountId = "0b907fb8-9f2f-4e50-8f8a-e8a54a1591c2";
const resolveAccount = async () => ({ accountId });
const admissionService = () => createAiAdmissionService({ entitlementResolver: () => ({ plan: "premium", status: "active", contractVersion: 1 }) });
const request = (body, headers = {}) => ({ method: "POST", body, headers, socket: { remoteAddress: "127.0.0.80" } });
const plannerPlan = { intent: "cfdi.summary", toolId: "cfdi.summary", arguments: { scope: "all" }, missing: [], requiresExplicitUserAction: false, humanReviewRequired: true };
const streamReply = () => new Response([
  `data: ${JSON.stringify({ choices: [{ delta: { content: "respuesta segura" } }] })}\n\n`,
  "data: [DONE]\n\n",
].join(""), { headers: { "content-type": "text/event-stream" } });

function telemetryFixture() {
  const events = [];
  return { telemetry: createAiObservability({ environment: "test", sink: (event) => events.push(event) }), events };
}

test("planner emite admisión, solicitud y completado sin registrar la pregunta ni la clave", async () => {
  const { telemetry, events } = telemetryFixture();
  const response = new MockResponse();
  await handleCfdiPlanner(request({ message: "¿Qué consulta local me ayuda?" }, { Authorization: "Bearer session-test", "Idempotency-Key": "ai_e4_planner-12345678" }), response, {
    env,
    admissionService: admissionService(),
    resolveAccount,
    observability: telemetry,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plannerPlan) } }] }), { status: 200 }),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(events.map(({ eventName }) => eventName), ["ai.admission.allowed", "ai.planner.requested", "ai.planner.completed"]);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("¿Qué consulta local me ayuda?"), false);
  assert.equal(serialized.includes("gateway-secret-test"), false);
  assert.equal(serialized.includes(accountId), false);
});

test("DLP bloqueado emite solo fallback local con código permitido", async () => {
  const { telemetry, events } = telemetryFixture();
  const response = new MockResponse();
  await handleCfdiPlanner(request({ message: "Revisa el RFC AAA010101AAA y el XML privado" }), response, { env, observability: telemetry, fetchImpl: async () => { throw new Error("no debe llamar Gateway"); } });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(events.map(({ eventName }) => eventName), ["ai.planner.fallback_local"]);
  assert.equal(events[0].errorCode, "ai_dlp_blocked");
  assert.equal(JSON.stringify(events).includes("AAA010101AAA"), false);
});

test("explicación CFDI emite sanitizado, admisión y confirmación sin copiar el snapshot", async () => {
  const { telemetry, events } = telemetryFixture();
  const response = new MockResponse();
  const cfdiContext = {
    schemaVersion: "cfdi-summary-v1",
    status: "analyzed",
    counts: { invoices: 2, payments: 1, concepts: 3, matchedPayments: 1, unmatchedPayments: 0 },
    checks: { duplicateUuids: 0, paymentBalanceDifferences: 1, paymentWithoutInvoice: 0, paymentsExceedingInvoice: 0, estimatedTaxPayments: 0 },
    totalsByCurrency: [{ currency: "MXN", invoiced: 1160, paid: 500, remaining: 660 }],
    samplePayments: [],
  };
  await handleTutorStream(request({ message: "Explica el resultado", context: { section: "advisor" }, cfdiContext }, { Authorization: "Bearer session-test", "Idempotency-Key": "ai_e4_explain-12345678" }), response, {
    env,
    admissionService: admissionService(),
    resolveAccount,
    observability: telemetry,
    fetchImpl: async () => streamReply(),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(events.some(({ eventName }) => eventName === "ai.explanation.sanitized"), true);
  assert.equal(events.some(({ eventName }) => eventName === "ai.explanation.confirmed"), true);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("1160"), false);
  assert.equal(serialized.includes("cfdiContext"), false);
  assert.equal(serialized.includes(accountId), false);
});

test("sink redacted no rompe una ruta CFDI cuando el logger falla", async () => {
  const telemetry = createAiObservability({ environment: "test", sink: () => { throw new Error("logger offline"); } });
  const response = new MockResponse();
  await handleCfdiPlanner(request({ message: "¿Qué consulta local me ayuda?" }, { Authorization: "Bearer session-test", "Idempotency-Key": "ai_e4_logger-12345678" }), response, {
    env,
    admissionService: admissionService(),
    resolveAccount,
    observability: telemetry,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plannerPlan) } }] }), { status: 200 }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(telemetry.snapshot().emittedEvents, 3);
  assert.equal(telemetry.snapshot().droppedEvents, 3);
});
