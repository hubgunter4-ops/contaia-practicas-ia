import test from "node:test";
import assert from "node:assert/strict";
import { handleCfdiConfig } from "../src/cfdi/server.js";

class ResponseMock {
  constructor() { this.headers = {}; this.statusCode = 0; this.body = ""; }
  writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); }
  end(body = "") { this.body = body; }
}
const config = { SUPABASE_URL: "https://rjdhfajtttejskhuplzq.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890_abcdefghijklmnop", HCAPTCHA_SITEKEY: "15f8545c-5bae-4358-81a6-e0b4994aae14" };

const req = (method = "GET", origin) => ({ method, headers: { ...(origin ? { origin } : {}), host: "localhost:3000" }, socket: {} });

test("publica solo URL de proyecto y clave publicable, con cache deshabilitado", async () => {
  const response = new ResponseMock();
  await handleCfdiConfig(req(), response, { ...config, SUPABASE_SERVICE_ROLE_KEY: "service-role-not-public" });
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.deepEqual(payload, { enabled: true, url: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY, hcaptchaSitekey: config.HCAPTCHA_SITEKEY });
  assert.equal(response.body.includes("service-role-not-public"), false);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
});

test("deshabilita la persistencia si falta una clave pública válida", async () => {
  const response = new ResponseMock();
  await handleCfdiConfig(req(), response, { SUPABASE_URL: config.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: "service_role_secret" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { enabled: false, hcaptchaSitekey: "" });
});

test("rechaza orígenes externos no autorizados", async () => {
  const response = new ResponseMock();
  await handleCfdiConfig(req("GET", "https://attacker.example"), response, config);
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error, "Origen no autorizado.");
});
