import test from "node:test";
import assert from "node:assert/strict";
import { maskRfc, normalizeFiscalProfile } from "../src/tools/workspace.js";

test("normaliza el RFC y conserva únicamente los campos permitidos del perfil", () => {
  const profile = normalizeFiscalProfile({
    legal_name: "  ContaIA Demo, S.A. de C.V.  ", rfc: "cid010101ab1", tax_regime: "601",
    fiscal_zip: "01000", fiscal_email: "fiscal@example.com", phone: "5555555555", active: false,
    service_role: "must-be-dropped",
  });
  assert.deepEqual(profile, {
    legal_name: "ContaIA Demo, S.A. de C.V.", rfc: "CID010101AB1", tax_regime: "601",
    fiscal_zip: "01000", fiscal_email: "fiscal@example.com", phone: "5555555555", active: false,
  });
  assert.equal("service_role" in profile, false);
});

test("rechaza formato fiscal inválido antes de llamar a la API", () => {
  assert.throws(() => normalizeFiscalProfile({ legal_name: "Demo", rfc: "INVALIDO" }), /RFC.*formato válido/);
  assert.throws(() => normalizeFiscalProfile({ legal_name: "Demo", rfc: "CID010101AB1", fiscal_zip: "123" }), /código postal.*5 dígitos/);
  assert.throws(() => normalizeFiscalProfile({ legal_name: "Demo", rfc: "CID010101AB1", fiscal_email: "no-es-correo" }), /correo fiscal.*formato válido/);
});

test("muestra el RFC parcialmente oculto", () => {
  assert.equal(maskRfc("CID010101AB1"), "CID••••••AB1");
  assert.equal(maskRfc("AB1"), "RFC protegido");
});

test("normaliza los campos opcionales vacíos para el contrato del servidor", () => {
  const profile = normalizeFiscalProfile({ legal_name: "Demo", rfc: "CID010101AB1", fiscal_zip: "" });
  assert.equal(profile.fiscal_zip, null);
});
