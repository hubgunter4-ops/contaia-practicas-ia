import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildJournalSources } from "../src/journal/sources.js";
import { buildCfdiAudit } from "../src/journal/audit-engine.js";
import { createAuditFilters, filterAuditSources } from "../src/journal/audit-filters.js";
import { buildAuditReportSpec, buildAuditWorkbook, buildAuditWorkbookDownload } from "../src/journal/audit-exporter.js";

const BUSINESS_RFC = "AAA010101AAA";
const CUSTOMER_RFC = "BBB010101BBB";
const INVOICE_UUID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_UUID = "22222222-2222-4222-8222-222222222222";
const CREDIT_UUID = "33333333-3333-4333-8333-333333333333";
const iva16 = (base = "1000.00", amount = "160.00") => ({ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base, amount });

function invoice(overrides = {}) {
  return { uuid: INVOICE_UUID, tipo: "I", serieFolio: "VENTA-PPD", fecha: "2026-10-01T09:00:00", moneda: "MXN", metodoPago: "PPD", formaPagoCode: "99", rfcEmisor: BUSINESS_RFC, rfcReceptor: CUSTOMER_RFC, rawAmounts: { subtotal: "1000.00", discount: "0", total: "1160.00" }, taxDetails: [iva16()], taxObjectCodes: ["02"], ...overrides };
}
function payment(overrides = {}) {
  return { uuid: PAYMENT_UUID, tipo: "P", serieFolio: "REP-1", fechaPago: "2026-10-03T09:00:00", moneda: "MXN", monedaPago: "MXN", montoPago: "580.00", formaPagoCode: "03", docRelacionado: INVOICE_UUID, paymentIndex: 1, relatedIndex: 1, numParcialidad: "1", objetoImpDR: "02", rawAmounts: { prior: "1160.00", paid: "580.00", remaining: "580.00" }, taxDetails: [iva16("500.00", "80.00")], rfcEmisor: BUSINESS_RFC, rfcReceptor: CUSTOMER_RFC, ...overrides };
}
function creditNote(overrides = {}) {
  return { uuid: CREDIT_UUID, tipo: "E", serieFolio: "NC-1", fecha: "2026-10-04T09:00:00", moneda: "MXN", metodoPago: "PUE", formaPagoCode: "17", rfcEmisor: BUSINESS_RFC, rfcReceptor: CUSTOMER_RFC, rawAmounts: { subtotal: "100.00", discount: "0", total: "116.00" }, taxDetails: [iva16("100.00", "16.00")], taxObjectCodes: ["02"], cfdiRelations: [{ type: "01", uuids: [INVOICE_UUID] }], ...overrides };
}
function sources({ includePayment = true, includeCredit = true } = {}) {
  return buildJournalSources({ analysis: { facturas: [invoice(), ...(includeCredit ? [creditNote()] : [])], pagos: includePayment ? [payment()] : [] } });
}

function auditFor(allSources, scopeSourceIds, availableSourceIds = scopeSourceIds, decisions = {}) {
  return buildCfdiAudit({ sources: allSources, scopeSourceIds, availableSourceIds, businessRfc: BUSINESS_RFC, period: "2026-10", decisions });
}

test("auditoría global conserva PPD, REP y nota E como eventos distintos, y exige aplicación humana", () => {
  const current = sources();
  const audit = auditFor(current, current.map((source) => source.sourceId));
  assert.equal(audit.scope.kind, "global");
  assert.equal(audit.scope.sourceCount, 3);
  assert.equal(audit.findings.some((finding) => finding.code === "CFDI-I-PPD-001"), false);
  const adjustment = audit.findings.find((finding) => finding.code === "CFDI-E-APP-001");
  assert.ok(adjustment);
  assert.equal(adjustment.status, "open");
  assert.equal(adjustment.source.uuid, CREDIT_UUID);
  assert.equal(audit.findings.some((finding) => finding.code === "CFDI-P-BAL-001"), false);
});

test("auditoría parcial marca relaciones existentes fuera de alcance en vez de decir que faltan", () => {
  const current = sources({ includeCredit: false });
  const invoiceSource = current.find((source) => source.kind === "invoice");
  const audit = auditFor(current, [invoiceSource.sourceId], current.map((source) => source.sourceId));
  const finding = audit.findings.find((entry) => entry.code === "CFDI-P-REL-002");
  assert.ok(finding);
  assert.equal(finding.status, "out_of_scope");
  assert.equal(audit.findings.some((entry) => entry.code === "CFDI-I-PPD-001"), false);
});

test("filtros parciales no cambian fuentes y permiten aislar CFDI E", () => {
  const current = sources();
  const filters = createAuditFilters({ type: "E", relation: "credit_note", period: "2026-10" });
  const result = filterAuditSources(current, filters, BUSINESS_RFC);
  assert.equal(result.length, 1);
  assert.equal(result[0].cfdi.uuid, CREDIT_UUID);
  assert.equal(current.length, 3);
});

test("la aplicación de nota E elimina el pendiente de aplicación sin reescribir fuentes", () => {
  const current = sources();
  const note = current.find((source) => source.cfdi.uuid === CREDIT_UUID);
  const before = JSON.stringify(note.cfdi);
  const audit = auditFor(current, current.map((source) => source.sourceId), current.map((source) => source.sourceId), { [`credit:${note.sourceId}`]: { application: "compensation", note: "Decisión local." } });
  assert.equal(audit.findings.some((entry) => entry.code === "CFDI-E-APP-001"), false);
  assert.equal(JSON.stringify(note.cfdi), before);
});

test("exporta un libro XLSX local con resumen, hallazgos, documentos y evidencia", () => {
  const current = sources();
  const audit = auditFor(current, current.map((source) => source.sourceId));
  const spec = buildAuditReportSpec(audit, { generatedAt: "2026-10-05T12:00:00.000Z" });
  assert.match(spec.fileName, /^contaia-revision-ciclo-cfdi-2026-10\.xlsx$/);
  assert.deepEqual(spec.sheets.map((sheet) => sheet.name), ["Resumen", "Hallazgos", "Documentos", "Evidencia"]);
  const workbook = buildAuditWorkbook(XLSX, spec);
  assert.ok(workbook.Sheets.Hallazgos);
  const bytes = buildAuditWorkbookDownload(XLSX, spec);
  const readBack = XLSX.read(bytes, { type: "array" });
  assert.equal(XLSX.utils.sheet_to_json(readBack.Sheets.Documentos, { header: 1 })[1][1], INVOICE_UUID);
});
