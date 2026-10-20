import test from "node:test";
import assert from "node:assert/strict";
import { requestTools } from "../src/tools/client.js";

const client = (accessToken = "access-token-test") => ({
  auth: { async getSession() { return { data: { session: accessToken ? { access_token: accessToken } : null }, error: null }; } },
});

 test("la API usa la sesión Bearer y limita la solicitud al recurso solicitado", async () => {
  let request;
  const result = await requestTools("connections", {
    method: "POST",
    profileId: "profile-1",
    body: { profile_id: "profile-1", tool_key: "accounting", environment: "sandbox", status: "pending", provider: "pending" },
    client: client(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return { data: { id: "connection-1" } }; } };
    },
  });
  assert.equal(request.url, "/api/tools?resource=connections&profileId=profile-1");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer access-token-test");
  assert.deepEqual(JSON.parse(request.options.body), { profile_id: "profile-1", tool_key: "accounting", environment: "sandbox", status: "pending", provider: "pending" });
  assert.equal(result.data.id, "connection-1");
});

test("sin una sesión activa no llama a la API", async () => {
  let called = false;
  await assert.rejects(() => requestTools("profiles", {
    client: client(""),
    fetchImpl: async () => { called = true; return { ok: true, async json() { return {}; } }; },
  }), /Inicia sesión/);
  assert.equal(called, false);
});

test("rechaza recursos inválidos y campos de credenciales", async () => {
  await assert.rejects(() => requestTools("users", { client: client(), fetchImpl: async () => ({}) }), /recurso.*no es válido/i);
  await assert.rejects(() => requestTools("connections", {
    method: "POST", body: { tool_key: "accounting", api_token: "must-not-send" }, client: client(), fetchImpl: async () => ({ ok: true, async json() { return {}; } }),
  }), /No ingreses secretos/);
});

test("traduce errores HTTP del endpoint sin ocultar mensajes de validación", async () => {
  await assert.rejects(() => requestTools("profiles", {
    client: client(),
    fetchImpl: async () => ({ ok: false, status: 400, async json() { return { error: "rfc no es válido." }; } }),
  }), /rfc no es válido/);
});
