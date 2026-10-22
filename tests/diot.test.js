import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMoney } from "../src/journal/money.js";
import { aggregateDiotRecords } from "../src/diot/aggregator.js";
import { buildDiotReviewCsv, buildDiotReviewJson } from "../src/diot/exporter.js";
import { DIOT_REVIEW_SCHEMA } from "../src/diot/schema.js";
import { buildDiotSources } from "../src/diot/sources.js";
import { validateDiotPreparation } from "../src/diot/validation.js";
import { diotState, renderDiotWorkspace, resetDiotWorkspace } from "../src/diot/workspace.js";

function analysisFixture(overrides = {}) {
  return {
    facturas: [{
      uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tipo: "I", serieFolio: "A-100", fecha: "2025-03-10T12:00:00",
      rfcEmisor: "AAA010101AAA", nombreEmisor: "Proveedor de prueba", rfcReceptor: "BBB010101BBB", nombreReceptor: "Empresa de prueba",
      moneda: "MXN", subtotal: 1000, descuento: 0, iva16: 160, ivaRetenido: 0, total: 1160, ...overrides,
    }], pagos: [], conceptos: [],
  };
}

function completeRecord(source) {
  return {
    ...source,
    thirdParty: { type: "national", identifier: "AAA010101AAA", name: "Proveedor de prueba", country: "", nationality: "" },
    operationType: "goods", category: "taxable", currency: "MXN", excluded: false, exclusionReason: "", duplicate: false,
    quality: "manual_confirmed",
    amounts: {
      base: normalizeMoney("1000.00", "MXN", { quality: "manual_confirmed" }),
      ivaTransferred: normalizeMoney("160.00", "MXN", { quality: "manual_confirmed" }),
      ivaWithheld: null,
    },
    warnings: [],
  };
}

const completeContext = Object.freeze({ period: "2025-03", taxpayerType: "moral", companyRole: "receiver", currency: "MXN" });

test("adapta CFDI a una fuente local DIOT sin inferir tercero ni tratar números derivados como exactos", () => {
  const [source] = buildDiotSources({ analysis: analysisFixture() });
  assert.equal(source.kind, "invoice");
  assert.equal(source.amounts.base?.minor, "100000");
  assert.equal(source.amounts.base?.quality, "derived_from_number");
  assert.equal(source.amounts.ivaTransferred?.minor, "16000");
  assert.equal(source.evidence.issuer.rfc, "AAA010101AAA");
  assert.equal(source.evidence.receiver.rfc, "BBB010101BBB");
  assert.equal(source.evidence.uuid, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

test("detecta UUID duplicados y deja CFDI de egreso sujeto a revisión humana", () => {
  const duplicate = analysisFixture().facturas[0];
  const sources = buildDiotSources({ analysis: { facturas: [duplicate, { ...duplicate, tipo: "E", serieFolio: "E-200" }] } });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].duplicate, true);
  assert.match(sources[1].warnings.join(" "), /egreso/i);
});

test("bloquea contexto, RFC, categoría e IVA faltantes sin reemplazarlos por cero", () => {
  const source = buildDiotSources({ analysis: analysisFixture({ iva16: 0 }) })[0];
  const record = { ...completeRecord(source), thirdParty: { type: "national", identifier: "", name: "", country: "", nationality: "" }, category: "", amounts: { ...completeRecord(source).amounts, ivaTransferred: null }, quality: "derived_from_number" };
  const result = validateDiotPreparation({ records: [record], context: { period: "", taxpayerType: "", companyRole: "unknown", currency: "MXN" }, schema: DIOT_REVIEW_SCHEMA });
  const codes = result.errors.map((item) => item.code);
  assert.ok(codes.includes("period_missing"));
  assert.ok(codes.includes("rfc_missing"));
  assert.ok(codes.includes("category_missing"));
  assert.equal(result.canDownload, false);
});

test("queda lista para descarga local solo con fila clasificada y sin bloquear por historial", () => {
  const source = buildDiotSources({ analysis: analysisFixture() })[0];
  const result = validateDiotPreparation({ records: [completeRecord(source)], context: completeContext, schema: DIOT_REVIEW_SCHEMA });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.canDownload, true);
  assert.equal(result.status, "ready");
});

test("no mezcla monedas ni calidad al agrupar y conserva evidencia trazable", () => {
  const source = buildDiotSources({ analysis: analysisFixture() })[0];
  const first = completeRecord(source);
  const second = { ...completeRecord(source), sourceId: "diot-cfdi:other:2", currency: "USD", amounts: { base: normalizeMoney("20.00", "USD", { quality: "manual_confirmed" }), ivaTransferred: normalizeMoney("3.20", "USD", { quality: "manual_confirmed" }), ivaWithheld: null } };
  const groups = aggregateDiotRecords([first, second]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.currency).sort(), ["MXN", "USD"]);
  assert.equal(groups[0].evidence.length, 1);
});

test("el CSV y JSON de revisión no declaran presentación ni incluyen XML completo", () => {
  const source = buildDiotSources({ analysis: analysisFixture() })[0];
  const record = completeRecord(source);
  const validation = validateDiotPreparation({ records: [record], context: completeContext, schema: DIOT_REVIEW_SCHEMA });
  const csv = buildDiotReviewCsv({ records: [record], context: completeContext, schema: DIOT_REVIEW_SCHEMA, generatedAt: "2025-03-31T12:00:00.000Z" });
  const json = buildDiotReviewJson({ records: [record], context: completeContext, schema: DIOT_REVIEW_SCHEMA, validation, generatedAt: "2025-03-31T12:00:00.000Z" });
  assert.match(csv, /Archivo de trabajo local; no es presentación/i);
  assert.match(csv, /diot-review-cfdi-v1/);
  assert.match(csv, /1000\.00/);
  assert.equal(csv.includes("<cfdi:Comprobante"), false);
  assert.equal(json.includes("<cfdi:Comprobante"), false);
  assert.equal(JSON.parse(json).schema.officialCompatible, false);
});

test("el workspace comunica cinco etapas, privacidad local y Nora sin fuentes automáticas", () => {
  resetDiotWorkspace();
  const html = renderDiotWorkspace({ analysis: analysisFixture() });
  assert.match(html, /DIOT asistida/);
  assert.match(html, /Prepara, revisa y descarga; no presenta declaraciones/);
  assert.match(html, /01.*Contexto/);
  assert.match(html, /Nora · Asistente abierto · DIOT asistida/);
  assert.match(html, /no comparte tus fuentes al abrir/i);
  assert.equal(diotState.sources.length, 1);
});
