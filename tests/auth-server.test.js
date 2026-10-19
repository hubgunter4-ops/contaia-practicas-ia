import test from "node:test";
import assert from "node:assert/strict";
import { handleAuth, __test } from "../src/auth/server.js";

class ResponseMock {
  constructor() { this.statusCode = 0; this.headers = {}; this.body = ""; }
  writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); }
  end(body = "") { this.body = body; }
}
const request = (method = "POST") => ({ method, headers: { host: "localhost:3000" }, socket: {}, async *[Symbol.asyncIterator]() {} });

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
