import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { detectCsvDelimiter, parseCsvText, readBankFile } from "../src/reconciliation/parser.js";
import { buildReconciliationRows, normalizeBankRows, normalizeReference, parseAmountToCents, parseDateToIso, summarizeReconciliationRows } from "../src/reconciliation/matching.js";

const headers = ["Fecha", "Importe", "Referencia", "Moneda", "Descripción"];
const mapping = { date: 0, amount: 1, reference: 2, currency: 3, description: 4, direction: -1 };
const invoice = (overrides = {}) => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tipo: "I", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", total: 1250, moneda: "MXN", ...overrides });
const analysis = (facturas = [invoice()], pagos = []) => ({ facturas, pagos });

test("el parser CSV respeta comillas, comas internas, saltos de línea y BOM", () => {
  const rows = parseCsvText('\uFEFFFecha;Importe;Referencia\r\n"10/03/2025";1.234,50;"Pago, cliente A"\r\n11/03/2025;-20,00;REF-2', ";");
  assert.deepEqual(rows, [
    ["Fecha", "Importe", "Referencia"],
    ["10/03/2025", "1.234,50", "Pago, cliente A"],
    ["11/03/2025", "-20,00", "REF-2"],
  ]);
});

test("detecta delimitador estable y rechaza filas con comillas sin cerrar", () => {
  assert.equal(detectCsvDelimiter("Fecha;Importe\n10/03/2025;10,00\n11/03/2025;20,00"), ";");
  assert.throws(() => parseCsvText('Fecha,Importe\n"10/03/2025,10', ","), /comilla sin cerrar/);
});

test("lee CSV en memoria y conserva el original para corregir el delimitador", async () => {
  const text = "Fecha;Importe\n10/03/2025;1250,00";
  const parsed = await readBankFile({ name: "extracto.csv", size: Buffer.byteLength(text), text: async () => text });
  assert.equal(parsed.kind, "csv");
  assert.equal(parsed.text, text);
  assert.equal(parsed.delimiter, ";");
  assert.deepEqual(parsed.rawRows[1], ["10/03/2025", "1250,00"]);
});

test("lee XLSX en memoria, conserva nombres de hojas y expone filas sin enviar el archivo", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Fecha", "Importe"], [45726, 1250]]), "Movimientos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Otra", "Hoja"], ["x", "y"]]), "Auxiliar");
  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = await readBankFile({ name: "extracto.xlsx", size: bytes.byteLength, arrayBuffer: async () => buffer }, { loadXlsx: async () => XLSX });
  assert.deepEqual(parsed.sheetNames, ["Movimientos", "Auxiliar"]);
  assert.deepEqual(parsed.sheets.Movimientos[1], [45726, 1250]);
});

test("moneda, fecha, importe y referencia requieren normalización explícita", () => {
  assert.equal(parseAmountToCents("1.234,50", ","), 123450);
  assert.equal(parseAmountToCents("(20.00)", "."), -2000);
  assert.equal(parseAmountToCents("1.234,500", ","), null);
  assert.equal(parseDateToIso("03/04/2025", ""), "");
  assert.equal(parseDateToIso("03/04/2025", "dmy"), "2025-04-03");
  assert.equal(parseDateToIso(45726, "excel"), "2025-03-10");
  assert.equal(normalizeReference(" a-100 / ñ "), "A100N");
});

test("normaliza filas válidas sin inferir moneda ni convención de signo", () => {
  const rows = normalizeBankRows([["10/03/2025", "1.250,00", "A-100", "MXN", "Pago"]], headers, mapping, {
    dateFormat: "dmy", decimalMark: ",", amountConvention: "signed", defaultCurrency: "",
  });
  assert.equal(rows[0].dateIso, "2025-03-10");
  assert.equal(rows[0].amountCents, 125000);
  assert.equal(rows[0].currency, "MXN");
  assert.equal(rows[0].status, "ready");
  const missing = normalizeBankRows([["10/03/2025", "1.250,00", "A-100", "", ""]], headers, { ...mapping, currency: 3 }, {
    dateFormat: "dmy", decimalMark: ",", amountConvention: "signed",
  });
  assert.equal(missing[0].status, "invalid");
  assert.match(missing[0].reasons.join(" "), /Moneda/);
});

test("sugiere importe/moneda/fecha compatibles sin aprobar ni validar dirección", () => {
  const movement = normalizeBankRows([["10/03/2025", "1.250,00", "", "MXN", ""]], headers, mapping, {
    dateFormat: "dmy", decimalMark: ",", amountConvention: "signed",
  });
  const rows = buildReconciliationRows(movement, analysis(), { sourceType: "invoices", dateToleranceDays: 3 });
  assert.equal(rows[0].result, "suggested");
  assert.equal(rows[0].confidence, "medium");
  assert.equal(rows[0].candidates[0].label, "A-100");
  assert.ok(rows[0].evidence.some((item) => /Sentido cargo\/abono pendiente/.test(item)));
  assert.equal(summarizeReconciliationRows(rows).suggested, 1);
});

test("clasifica como alta solo una sugerencia única con referencia, importe y fecha exactos", () => {
  const movement = normalizeBankRows([["10/03/2025", "1.250,00", "A-100", "MXN", ""]], headers, mapping, {
    dateFormat: "dmy", decimalMark: ",", amountConvention: "signed",
  });
  const rows = buildReconciliationRows(movement, analysis(), { sourceType: "invoices", dateToleranceDays: 3 });
  assert.equal(rows[0].result, "suggested");
  assert.equal(rows[0].confidence, "high");
});

test("una referencia exacta con importe distinto queda como diferencia, nunca como sugerencia", () => {
  const movement = normalizeBankRows([["10/03/2025", "1.200,00", "A-100", "MXN", ""]], headers, mapping, {
    dateFormat: "dmy", decimalMark: ",", amountConvention: "signed",
  });
  const rows = buildReconciliationRows(movement, analysis(), { sourceType: "invoices", dateToleranceDays: 3 });
  assert.equal(rows[0].result, "difference");
  assert.equal(rows[0].confidence, "low");
  assert.ok(rows[0].candidates[0].evidence.some((item) => item.includes("Diferencia de importe")));
});

test("el mismo importe con moneda o fecha no compatible no produce coincidencia", () => {
  const movement = normalizeBankRows([["20/03/2025", "1.250,00", "", "USD", ""]], headers, mapping, {
    dateFormat: "dmy", decimalMark: ",", amountConvention: "signed",
  });
  const rows = buildReconciliationRows(movement, analysis(), { sourceType: "invoices", dateToleranceDays: 3 });
  assert.equal(rows[0].result, "unmatched");
  assert.equal(rows[0].confidence, "none");
});

test("candidatos duplicados y reutilización del mismo CFDI se muestran como ambiguos", () => {
  const movements = normalizeBankRows([
    ["10/03/2025", "1.250,00", "", "MXN", "uno"],
    ["10/03/2025", "1.250,00", "", "MXN", "dos"],
  ], headers, mapping, { dateFormat: "dmy", decimalMark: ",", amountConvention: "signed" });
  const rows = buildReconciliationRows(movements, analysis([invoice(), invoice({ uuid: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff", serieFolio: "B-200" })]), { sourceType: "invoices" });
  assert.ok(rows.every((row) => row.result === "ambiguous"));
  assert.ok(rows.every((row) => row.confidence === "low"));
});
