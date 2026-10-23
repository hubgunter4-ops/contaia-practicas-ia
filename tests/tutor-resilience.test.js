import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { handleCfdiPlanner } from "../src/tutor/server.js";
import { createAiAdmissionService } from "../src/cfdi/ai/ai-admission.js";
import { createCircuitBreaker } from "../src/cfdi/ai/ai-resilience.js";

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
  writeHead(status, headers = {}) { this.statusCode = status; Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value)); this.headersSent = true; }
  end(chunk = "") { if (chunk) this.chunks.push(String(chunk)); this.writableEnded = true; }
  get body() { return this.chunks.join(""); }
}

const env = {
  AI_PROVIDER_DEFAULT: "openai",
  AI_GATEWAY_OPENAI_API_KEY: "gateway-openai-secret-test",
  AI_GATEWAY_OPENAI_MODEL: "openai/gpt-test",
};
const accountId = "0b907fb8-9f2f-4e50-8f8a-e8a54a1591c2";
const request = (suffix) => ({
  method: "POST",
  body: { message: "¿Qué herramienta local resume CFDI?" },
  headers: { Authorization: "Bearer session-test", "Idempotency-Key": `ai_e3-${suffix}-12345678` },
  socket: { remoteAddress: `127.0.9.${suffix}` },
});
const plan = { intent: "cfdi.summary", toolId: "cfdi.summary", arguments: { scope: "all" }, missing: [], requiresExplicitUserAction: false, humanReviewRequired: true };

function service() {
  return createAiAdmissionService({ entitlementResolver: () => ({ plan: "free", status: "active", contractVersion: 1, source: "test" }) });
}

test("el planner bloquea nuevas llamadas cuando el circuit breaker está abierto y se recupera en half-open", async () => {
  let clock = 0;
  const breaker = createCircuitBreaker({ now: () => clock, failureThreshold: 2, resetTimeoutMs: 30 });
  let calls = 0;
  const failingFetch = async () => { calls += 1; return new Response("upstream unavailable", { status: 503 }); };
  for (const suffix of ["one", "two"]) {
    const response = new MockResponse();
    await handleCfdiPlanner(request(suffix), response, {
      env,
      admissionService: service(),
      resolveAccount: async () => ({ accountId }),
      circuitBreaker: breaker,
      fetchImpl: failingFetch,
    });
    assert.equal(response.statusCode, 502);
  }
  assert.equal(calls, 2);
  const blocked = new MockResponse();
  await handleCfdiPlanner(request("three"), blocked, {
    env,
    admissionService: service(),
    resolveAccount: async () => ({ accountId }),
    circuitBreaker: breaker,
    fetchImpl: failingFetch,
  });
  assert.equal(blocked.statusCode, 503);
  assert.equal(calls, 2);
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);

  clock = 31;
  const recovered = new MockResponse();
  await handleCfdiPlanner(request("four"), recovered, {
    env,
    admissionService: service(),
    resolveAccount: async () => ({ accountId }),
    circuitBreaker: breaker,
    fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200, headers: { "content-type": "application/json" } }); },
  });
  assert.equal(recovered.statusCode, 200);
  assert.equal(breaker.snapshot().state, "closed");
  assert.equal(calls, 3);
});

test("una configuración Redis insegura falla cerrada antes de Gateway", async () => {
  let called = false;
  const response = new MockResponse();
  await handleCfdiPlanner(request("invalid-store"), response, {
    env: { ...env, AI_RATE_LIMIT_KV_REST_URL: "http://not-secure.example", AI_RATE_LIMIT_KV_REST_TOKEN: "redis-secret-test" },
    resolveAccount: async () => ({ accountId }),
    fetchImpl: async () => { called = true; return new Response("must not run"); },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(called, false);
  assert.doesNotMatch(response.body, /redis-secret-test|not-secure/);
});
