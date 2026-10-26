import test from "node:test";
import assert from "node:assert/strict";
import { handleCfdiConfig } from "../src/cfdi/server.js";

class ResponseMock {
  constructor() { this.headers = {}; this.statusCode = 0; this.body = ""; }
  writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); }
  end(body = "") { this.body = body; }
}

const baseConfig = {
  SUPABASE_URL: "https://rjdhfajtttejskhuplzq.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890_abcdefghijklmnop",
};
const turnstileSitekey = "1x00000000000000000000AA";
const hcaptchaSitekey = "15f8545c-5bae-4358-81a6-e0b4994aae14";
const req = (method = "GET", origin) => ({ method, headers: { ...(origin ? { origin } : {}), host: "localhost:3000" }, socket: {} });

async function getPayload(env) {
  const response = new ResponseMock();
  await handleCfdiConfig(req(), response, env);
  return { response, payload: JSON.parse(response.body) };
}

test("publica solo sitekey y proveedor Turnstile junto con la configuración pública de Supabase", async () => {
  const { response, payload } = await getPayload({
    ...baseConfig,
    CAPTCHA_PROVIDER: "turnstile",
    TURNSTILE_SITEKEY: turnstileSitekey,
    TURNSTILE_SECRET: "never-expose-this-secret",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-not-public",
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(payload, {
    enabled: true,
    url: baseConfig.SUPABASE_URL,
    publishableKey: baseConfig.SUPABASE_PUBLISHABLE_KEY,
    captchaProvider: "turnstile",
    captchaSitekey: turnstileSitekey,
  });
  assert.equal(response.body.includes("never-expose-this-secret"), false);
  assert.equal(response.body.includes("service-role-not-public"), false);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
});

test("requiere proveedor explícito para habilitar hCaptcha durante una reversión", async () => {
  const { payload: missingProviderPayload } = await getPayload({ ...baseConfig, HCAPTCHA_SITEKEY: hcaptchaSitekey });
  assert.equal(missingProviderPayload.captchaProvider, "");
  assert.equal(missingProviderPayload.captchaSitekey, "");

  const { payload: explicitPayload } = await getPayload({
    ...baseConfig,
    CAPTCHA_PROVIDER: "hcaptcha",
    HCAPTCHA_SITEKEY: hcaptchaSitekey,
    TURNSTILE_SITEKEY: turnstileSitekey,
  });
  assert.equal(explicitPayload.captchaProvider, "hcaptcha");
  assert.equal(explicitPayload.captchaSitekey, hcaptchaSitekey);
});

test("un proveedor explícito prevalece y una sitekey inválida falla cerrada", async () => {
  const { payload: turnstilePayload } = await getPayload({
    ...baseConfig,
    CAPTCHA_PROVIDER: "TURNSTILE",
    TURNSTILE_SITEKEY: turnstileSitekey,
    HCAPTCHA_SITEKEY: hcaptchaSitekey,
  });
  assert.equal(turnstilePayload.captchaProvider, "turnstile");
  assert.equal(turnstilePayload.captchaSitekey, turnstileSitekey);

  const { payload: invalidPayload } = await getPayload({
    ...baseConfig,
    CAPTCHA_PROVIDER: "turnstile",
    TURNSTILE_SITEKEY: "invalid key",
    HCAPTCHA_SITEKEY: hcaptchaSitekey,
  });
  assert.equal(invalidPayload.captchaProvider, "");
  assert.equal(invalidPayload.captchaSitekey, "");
});

test("no publica CAPTCHA ni permite credenciales privadas cuando falta una clave pública válida", async () => {
  const { response, payload } = await getPayload({ ...baseConfig, SUPABASE_PUBLISHABLE_KEY: "service_role_secret" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(payload, { enabled: false, captchaProvider: "", captchaSitekey: "" });
});

test("rechaza orígenes externos no autorizados", async () => {
  const response = new ResponseMock();
  await handleCfdiConfig(req("GET", "https://attacker.example"), response, baseConfig);
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error, "Origen no autorizado.");
});
