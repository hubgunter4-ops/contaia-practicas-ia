import test from "node:test";
import assert from "node:assert/strict";
import { AiDlpError, assertPlannerSafeText, assessAiText } from "../src/cfdi/ai/ai-dlp-gate.js";
import { buildCfdiPlannerRequest } from "../src/cfdi/ai/planner.js";
import { createCfdiToolRegistry } from "../src/cfdi/ai/cfdi-tools.js";

function registry() {
  return createCfdiToolRegistry({ getAnalysis: () => null });
}

test("el DLP permite una pregunta general, normaliza espacios y no conserva un preview sensible", () => {
  const result = assessAiText("  ¿Qué   alertas   conviene revisar primero?  ");
  assert.equal(result.decision, "allow");
  assert.equal(result.normalizedMessage, "¿Qué alertas conviene revisar primero?");
  assert.deepEqual(result.categories, []);
  assert.equal(result.redactedPreview, "");
});

test("el DLP bloquea XML, UUID y RFC con redacción sin devolver el contenido original", () => {
  const cases = [
    ["Procesa <cfdi:Comprobante Total=\"100\">dato</cfdi:Comprobante>", "xml_content", "cfdi:Comprobante"],
    ["Revisa 11111111-1111-4111-8111-111111111111", "cfdi_uuid", "11111111-1111-4111-8111-111111111111"],
    ["Revisa el RFC AAA010101AAA", "rfc", "AAA010101AAA"],
  ];
  for (const [message, category, secret] of cases) {
    const result = assessAiText(message);
    assert.equal(result.decision, "block");
    assert.ok(result.categories.includes(category));
    assert.doesNotMatch(result.redactedPreview, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("el DLP bloquea CURP, NSS, CLABE y tarjeta cuando aparecen como datos identificables", () => {
  const cases = [
    ["CURP GODE561231HDFRRN09", "curp"],
    ["NSS 12 34 56 78 901", "nss"],
    ["La CLABE 646180157012345678 corresponde al banco", "clabe_or_bank_account"],
    ["La tarjeta 4111 1111 1111 1111 fue usada", "payment_card"],
  ];
  for (const [message, category] of cases) {
    const result = assessAiText(message);
    assert.equal(result.decision, "block");
    assert.ok(result.categories.includes(category), `${category} no detectada`);
  }
});

test("el DLP clasifica como confirmación datos personales y referencias de contacto", () => {
  const cases = [
    ["Escribe a contabilidad@example.com", "email", "contabilidad@example.com"],
    ["Llama al 55 1234 5678", "phone", "55 1234 5678"],
    ["cliente: Juan Pérez", "named_party", "cliente: Juan Pérez"],
    ["domicilio: Calle Falsa 123", "address", "domicilio: Calle Falsa 123"],
    ["Consulta https://example.test/revision?token=secret", "url_query", "token=secret"],
  ];
  for (const [message, category, secret] of cases) {
    const result = assessAiText(message);
    assert.equal(result.decision, "confirm");
    assert.ok(result.categories.includes(category), `${category} no detectada`);
    assert.doesNotMatch(result.redactedPreview, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("el DLP bloquea tablas, JSON, Base64 y caracteres de control como payloads estructurados", () => {
  const table = assessAiText("Fecha,Referencia,Importe\n2026-01-01,ABC,100\n2026-01-02,DEF,200");
  assert.equal(table.decision, "confirm");
  assert.ok(table.categories.includes("tabular_content"));

  const json = assessAiText('{"total":100,"currency":"MXN"}');
  assert.equal(json.decision, "confirm");
  assert.ok(json.categories.includes("structured_payload"));

  const encoded = assessAiText(`Adjunto ${"A".repeat(100)}`);
  assert.equal(encoded.decision, "block");
  assert.ok(encoded.categories.includes("base64_or_encoded_block"));

  const control = assessAiText("Pregunta\u0000 con control");
  assert.equal(control.decision, "block");
  assert.ok(control.categories.includes("control_characters"));
});

test("el DLP normaliza caracteres invisibles y bloquea entradas sobre el límite", () => {
  const hidden = assessAiText("Revisa\u200B el resultado");
  assert.equal(hidden.decision, "confirm");
  assert.ok(hidden.categories.includes("hidden_characters"));
  assert.equal(hidden.normalizedMessage, "");

  const long = assessAiText("a".repeat(2001));
  assert.equal(long.decision, "block");
  assert.ok(long.categories.includes("oversized_text"));
  assert.equal(long.normalizedLength, 2001);
  assert.equal(long.redactedPreview, "[DATO_REDACTADO:oversized_text]");
});

test("el planner usa el DLP y conserva códigos diferenciados para bloqueo y confirmación", () => {
  assert.throws(() => buildCfdiPlannerRequest({ message: "Consulta el RFC AAA010101AAA", toolRegistry: registry() }), { code: "planner_input_sensitive" });
  assert.throws(() => buildCfdiPlannerRequest({ message: "Mi correo es user@example.com, ¿qué alertas reviso?", toolRegistry: registry() }), { code: "planner_input_confirmation_required" });
  assert.throws(() => buildCfdiPlannerRequest({ message: "a".repeat(2001), toolRegistry: registry() }), { code: "planner_input_invalid" });
});

test("los errores del DLP no incluyen el texto original ni son reemplazables por una excepción genérica", () => {
  try {
    assertPlannerSafeText("cliente: Juan Pérez, RFC AAA010101AAA");
    assert.fail("se esperaba bloqueo");
  } catch (error) {
    assert.ok(error instanceof AiDlpError);
    assert.equal(error.code, "planner_input_sensitive");
    assert.doesNotMatch(error.message, /Juan|AAA010101AAA/);
    assert.ok(error.redactedPreview.includes("DATO_REDACTADO"));
    assert.equal(error.policyVersion, "ai-dlp-v1");
  }
});
