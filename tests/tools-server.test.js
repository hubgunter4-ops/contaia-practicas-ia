import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/tools/server.js";

const validProfile = {
  legal_name: "ContaIA Demo, S.A. de C.V.",
  rfc: "CID010101AB1",
  tax_regime: "601",
  fiscal_zip: "01000",
  fiscal_email: "fiscal@example.com",
};

const validConnection = {
  profile_id: "11111111-1111-4111-8111-111111111111",
  tool_key: "cfdi",
  environment: "sandbox",
  status: "pending",
};

test("valida y normaliza el perfil fiscal antes de enviarlo a Supabase", () => {
  const profile = __test.parseProfileInput({ ...validProfile, rfc: "cid010101ab1" });
  assert.equal(profile.rfc, "CID010101AB1");
  assert.equal(profile.fiscal_zip, "01000");
  assert.equal(profile.fiscal_email, "fiscal@example.com");
});

test("rechaza RFC, correo y código postal inválidos", () => {
  assert.throws(() => __test.parseProfileInput({ ...validProfile, rfc: "INVALIDO" }), /rfc no es válido/);
  assert.throws(() => __test.parseProfileInput({ ...validProfile, fiscal_email: "no-es-correo" }), /fiscal_email no es válido/);
  assert.throws(() => __test.parseProfileInput({ ...validProfile, fiscal_zip: "123" }), /fiscal_zip no es válido/);
});

test("valida conexiones y no permite nombres de campos de secretos", () => {
  assert.deepEqual(__test.parseConnectionInput(validConnection), validConnection);
  assert.throws(() => __test.parseConnectionInput({ ...validConnection, api_token: "secret" }), /No envíes secretos/);
  assert.throws(() => __test.parseConnectionInput({ ...validConnection, credential_ref: "secret-ref" }), /No envíes secretos/);
  assert.throws(() => __test.parseConnectionInput({ ...validConnection, metadata: { provider: { password: "secret" } } }), /metadata no puede contener/);
});

test("solo acepta estados válidos para alertas y vencimientos", () => {
  assert.deepEqual(__test.parseStatusInput({ status: "resolved" }, "alerts"), { status: "resolved" });
  assert.deepEqual(__test.parseStatusInput({ status: "overdue" }, "deadlines"), { status: "overdue" });
  assert.throws(() => __test.parseStatusInput({ status: "connected" }, "alerts"), /status no es válido/);
});

test("extrae únicamente tokens Bearer de la cabecera de autorización", () => {
  assert.equal(__test.getBearerToken({ headers: { authorization: "Bearer abc123" } }), "abc123");
  assert.equal(__test.getBearerToken({ headers: { authorization: "Basic abc123" } }), "");
  assert.equal(__test.getBearerToken({ headers: {} }), "");
});
