import test from "node:test";
import assert from "node:assert/strict";
import { requestCfdiPlanner } from "../src/cfdi/ai/planner-api.js";

test("el cliente del planner envía únicamente la petición textual y respeta la respuesta JSON", async () => {
  let request;
  const plan = { intent: "cfdi.alerts", toolId: "cfdi.alerts", arguments: {}, missing: [], requiresExplicitUserAction: false, humanReviewRequired: true };
  const result = await requestCfdiPlanner({
    message: "¿Qué alertas debo revisar?",
    accessToken: "session-token-test",
    idempotencyKey: "ai_planner-client-12345678",
    apiBaseUrl: "https://contaia.test",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(plan), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(request.url, "https://contaia.test/api/cfdi/planner");
  assert.equal(JSON.stringify(JSON.parse(request.options.body)).includes("analysisRef"), false);
  assert.deepEqual(JSON.parse(request.options.body), { message: "¿Qué alertas debo revisar?" });
  assert.equal(request.options.headers.Authorization, "Bearer session-token-test");
  assert.equal(request.options.headers["Idempotency-Key"], "ai_planner-client-12345678");
  assert.deepEqual(result, plan);
});

test("el cliente del planner traduce un error HTTP sin inventar un resultado local", async () => {
  await assert.rejects(() => requestCfdiPlanner({
    message: "Consulta general",
    fetchImpl: async () => new Response(JSON.stringify({ error: "planner no configurado" }), { status: 503 }),
  }), /planner no configurado/);
});
