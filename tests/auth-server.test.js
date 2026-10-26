import test from "node:test";
import assert from "node:assert/strict";
import { handleAuth, __test } from "../src/auth/server.js";

class ResponseMock {
  constructor() { this.statusCode = 0; this.headers = {}; this.body = ""; }
  writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); }
  end(body = "") { this.body = body; }
}
const request = (method = "POST", body) => ({ method, headers: { host: "localhost:3000" }, socket: {}, ...(body ? { body } : {}), async *[Symbol.asyncIterator]() {} });

test("normaliza identificadores de correo o usuario", () => {
  assert.equal(__test.normalizeIdentifier("  Usuario.Demo "), "usuario.demo");
  assert.equal(__test.normalizeIdentifier("persona@ejemplo.com"), "persona@ejemplo.com");
  assert.throws(() => __test.normalizeIdentifier("ab"), /no es válido/);
});

test("valida longitud de contraseña sin revelar su contenido", () => {
  assert.doesNotThrow(() => __test.normalizePassword("contraseña-segura"));
  assert.throws(() => __test.normalizePassword("corta"), /8 y 128/);
});

test("rechaza métodos distintos de POST", async () => {
  const response = new ResponseMock();
  await handleAuth(request("GET"), response, {});
  assert.equal(response.statusCode, 405);
  assert.equal(JSON.parse(response.body).error, "Método no permitido.");
});

test("no expone campos sensibles en una sesión pública", () => {
  const publicSession = __test.publicSession({ access_token: "access", refresh_token: "refresh", expires_at: 1, expires_in: 3600, token_type: "bearer", user: { id: "id", email: "a@b.com", user_metadata: { name: "A" }, role: "authenticated", factors: [{ secret: "no" }] } });
  assert.deepEqual(publicSession.user, { id: "id", email: "a@b.com", user_metadata: { name: "A" } });
});

test("reenvía el token CAPTCHA efímero al login por alias sin devolverlo", async () => {
  const originalFetch = globalThis.fetch;
  const captured = [];
  const token = "turnstile-one-time-token";
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options });
    return { status: 401, async text() { return JSON.stringify({ error: "Credenciales no válidas." }); } };
  };
  try {
    const response = new ResponseMock();
    await handleAuth(request("POST", { identifier: "Usuario.Demo", password: "ContaIA-test-123", captchaToken: token }), response, {
      SUPABASE_URL: "https://rjdhfajtttejskhuplzq.supabase.co",
    });
    assert.equal(response.statusCode, 401);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://rjdhfajtttejskhuplzq.supabase.co/functions/v1/login-by-alias");
    assert.deepEqual(JSON.parse(captured[0].options.body), { identifier: "usuario.demo", password: "ContaIA-test-123", captchaToken: token });
    assert.equal(response.body.includes(token), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
