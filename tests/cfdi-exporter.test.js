import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildCfdiTaxReport } from "../src/cfdi/analysis.js";
import { buildCfdiWorkbook, buildCfdiWorkbookDownload, buildCfdiWorkbookSpec } from "../src/cfdi/exporter.js";

const analysis = {
  version: "pdfc-compatible-1",
  facturas: [
    { uuid: "VENTA-1", tipo: "I", serieFolio: "V-1", fecha: "2026-09-01T10:00:00", rfcEmisor: "AAA010101AAA", nombreEmisor: "Comercio demo", rfcReceptor: "CLI010101BBB", nombreReceptor: "Cliente demo", moneda: "MXN", subtotal: 1000, descuento: 0, baseIva0: 400, iva0: 0, baseIva16: 600, iva16: 96, ieps: 24, iepsBreakdown: { "8%": 24 }, taxRates: ["0", "16"], taxBaseKnown: { zero: true, sixteen: true }, total: 1120 },
    { uuid: "COMPRA-1", tipo: "I", serieFolio: "C-1", fecha: "2026-09-02T10:00:00", rfcEmisor: "PRO010101CCC", nombreEmisor: "Proveedor demo", rfcReceptor: "AAA010101AAA", nombreReceptor: "Comercio demo", moneda: "MXN", subtotal: 800, descuento: 0, baseIva16: 800, iva16: 128, ieps: 12, iepsBreakdown: { "Cuota ($0.50)": 12 }, taxRates: ["16"], taxBaseKnown: { zero: false, sixteen: true }, total: 940 },
  ],
  pagos: [{ uuid: "PAGO-1", docRelacionado: "VENTA-1", fechaPago: "2026-09-15T10:00:00", moneda: "MXN", saldoAnterior: 1120, impPagado: 500, saldoInsoluto: 620, relationStatus: "matched" }],
  conceptos: [{ uuid: "VENTA-1", descripcion: "Servicio demo", emisor: "Comercio demo", claveProdServ: "80101500", cantidad: 1, importe: 1000, iva16: 96, ieps: 24, moneda: "MXN", serieFolio: "V-1" }],
  summary: { invoiceCount: 2, paymentCount: 1, conceptCount: 1, alerts: [], totalsByCurrency: [] },
};

test("construye el libro fiscal con siete hojas y clasificación explícita por RFC", () => {
  const taxReport = buildCfdiTaxReport(analysis, "aaa010101aaa");
  const spec = buildCfdiWorkbookSpec({ analysis, taxReport, businessRfc: "aaa010101aaa", generatedAt: "2026-09-30T12:00:00.000Z" });
  assert.equal(spec.fileName, "contaia-libro-fiscal-2026-09.xlsx");
  assert.deepEqual(spec.sheets.map((sheet) => sheet.name), ["Resumen", "Comprobantes", "Ventas", "Compras", "Impuestos", "Pagos", "Conceptos"]);
  assert.equal(spec.sheets.find((sheet) => sheet.name === "Ventas").rows.length, 2);
  assert.equal(spec.sheets.find((sheet) => sheet.name === "Compras").rows.length, 2);
  assert.match(JSON.stringify(spec), /no es declaración/i);
  assert.doesNotMatch(JSON.stringify(spec), /<cfdi:Comprobante|rawXml|sourceXml/);
});

test("genera un XLSX que conserva hojas, encabezados, filtros y datos fiscales", () => {
  const taxReport = buildCfdiTaxReport(analysis, "AAA010101AAA");
  const spec = buildCfdiWorkbookSpec({ analysis, taxReport, businessRfc: "AAA010101AAA" });
  const workbook = buildCfdiWorkbook(XLSX, spec);
  assert.deepEqual(workbook.SheetNames, ["Resumen", "Comprobantes", "Ventas", "Compras", "Impuestos", "Pagos", "Conceptos"]);
  assert.equal(workbook.Sheets.Ventas["A2"].v, "VENTA-1");
  assert.equal(workbook.Sheets.Compras["A2"].v, "COMPRA-1");
  assert.equal(workbook.Sheets.Ventas["!autofilter"].ref, "A1:T2");
  assert.equal(workbook.Sheets.Ventas["!cols"][0].wch, 38);

  const bytes = buildCfdiWorkbookDownload(XLSX, spec);
  const roundTrip = XLSX.read(bytes, { type: "array" });
  const rows = XLSX.utils.sheet_to_json(roundTrip.Sheets.Impuestos, { header: 1 });
  assert.equal(rows[0][0], "Vista");
  assert.ok(rows.some((row) => row[3] === "IVA 0% · base"));
  assert.ok(rows.some((row) => row[3] === "IEPS · 8%"));
});
