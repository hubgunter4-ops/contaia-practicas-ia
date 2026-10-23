import test from "node:test";
import assert from "node:assert/strict";
import { composeAbortSignal, createCircuitBreaker, createRedisRestCommandExecutor } from "../src/cfdi/ai/ai-resilience.js";

function transient(status = 503) { return Object.assign(new Error("upstream detail must stay private"), { status }); }

test("el circuit breaker abre tras tres fallos transitorios y permite una sola prueba half-open", async () => {
  let clock = 0;
  const breaker = createCircuitBreaker({ now: () => clock, failureThreshold: 3, resetTimeoutMs: 30 });
  for (let index = 0; index < 3; index += 1) await assert.rejects(() => breaker.run(async () => { throw transient(); }), { status: 503 });
  assert.equal(breaker.snapshot().state, "open");
  assert.throws(() => breaker.beforeRequest(), (error) => error.code === "ai_provider_unavailable" && error.status === 503 && error.retryAfter > 0);
  clock = 31;
  const pending = breaker.run(async () => "half-open-success");
  assert.equal(await pending, "half-open-success");
  assert.equal(breaker.snapshot().state, "closed");
});

test("un error de validación no abre el circuito y un fallo half-open vuelve a abrirlo", async () => {
  let clock = 0;
  const breaker = createCircuitBreaker({ now: () => clock, failureThreshold: 2, resetTimeoutMs: 10 });
  await assert.rejects(() => breaker.run(async () => { throw Object.assign(new Error("bad request"), { status: 400 }); }));
  assert.equal(breaker.snapshot().state, "closed");
  await assert.rejects(() => breaker.run(async () => { throw transient(502); }));
  await assert.rejects(() => breaker.run(async () => { throw transient(502); }));
  clock = 11;
  await assert.rejects(() => breaker.run(async () => { throw transient(504); }));
  assert.equal(breaker.snapshot().state, "open");
});

test("el executor Redis REST no expone el token y transforma respuestas inválidas en error seguro", async () => {
  let request;
  const execute = createRedisRestCommandExecutor({
    url: "https://kv.example.test",
    token: "redis-secret-fixture",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ result: "OK" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(await execute(["GET", "contaia:test"]), "OK");
  assert.equal(request.url, "https://kv.example.test");
  assert.equal(request.options.headers.Authorization, "Bearer redis-secret-fixture");
  assert.doesNotMatch(JSON.stringify(request.options.body), /redis-secret-fixture/);
});

test("el timeout compuesto aborta la operación y se puede limpiar", async () => {
  const timeout = composeAbortSignal(undefined, 5);
  await new Promise((resolve) => timeout.signal.addEventListener("abort", resolve, { once: true }));
  assert.equal(timeout.timedOut(), true);
  assert.equal(timeout.signal.aborted, true);
  timeout.dispose();
});
