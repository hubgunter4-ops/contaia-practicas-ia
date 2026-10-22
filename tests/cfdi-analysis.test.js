import test from "node:test";
import assert from "node:assert/strict";
import { buildCfdiAnalysis, buildCfdiTaxReport, buildNoraCfdiContext, buildStoredAnalysis } from "../src/cfdi/analysis.js";

const invoice = {
  uuid: "UUID-FACTURA-PRIVADO", tipo: "I", serieFolio: "A-7", fecha: "2026-09-01T10:00:00",
  moneda: "MXN", subtotal: 1000, descuento: 0, iva16: 160, ivaRetenido: 0, ieps: 0, total: 1160,
  rfcEmisor: "RFC-EMISOR-PRIVADO", fileName: "factura.xml",
};
const linkedPayment = {
  uuid: "UUID-PAGO-PRIVADO", docRelacionado: invoice.uuid, saldoAnterior: 1160, impPagado: 580,
  saldoInsoluto: 580, baseIVA16: 0, iva16: 0, ivaRetenido: 0, ieps: 0, moneda: "MXN", fileName: "pago.xml",
};

test("calcula el prorrateo de pago a factura como el parser PDFC y agrupa por moneda", () => {
  const result = buildCfdiAnalysis({ facturas: [invoice], pagos: [linkedPayment], conceptos: [{ uuid: invoice.uuid, moneda: "MXN", importe: 1000 }] });
  assert.equal(result.pagos[0].relationStatus, "matched");
  assert.equal(result.pagos[0].baseIVA16, 500);
  assert.equal(result.pagos[0].iva16, 80);
  assert.equal(result.pagos[0].exento, 0);
  assert.equal(result.summary.matchedPayments, 1);
  assert.equal(result.summary.alerts.length, 0);
  assert.deepEqual(result.summary.totalsByCurrency, [{ currency: "MXN", invoiced: 1160, paid: 580, remaining: 580 }]);
});

test("marca pagos sin factura e IVA estimado, y omite identificadores del contexto de Nora", () => {
  const unmatched = { ...linkedPayment, docRelacionado: "UUID-AUSENTE", impPagado: 116, saldoAnterior: 116, saldoInsoluto: 0 };
  const result = buildCfdiAnalysis({ facturas: [], pagos: [unmatched], conceptos: [] });
  assert.equal(result.pagos[0].relationStatus, "unmatched");
  assert.equal(result.pagos[0].estimatedTax, true);
  assert.ok(result.summary.alerts.some((alert) => alert.code === "estimated_tax_unmatched"));
  const context = buildNoraCfdiContext(result);
  const encoded = JSON.stringify(context);
  assert.match(encoded, /"status":"analyzed"/);
  assert.match(encoded, /"estimatedTax":true/);
  for (const privateValue of ["UUID-AUSENTE", "UUID-PAGO-PRIVADO", "UUID-FACTURA-PRIVADO", "RFC-EMISOR-PRIVADO", "factura.xml", "pago.xml"]) assert.equal(encoded.includes(privateValue), false);
});

test("el JSON de historial quita nombres de archivos y XML, conservando el resultado de revisión", () => {
  const result = buildCfdiAnalysis({ facturas: [invoice], pagos: [linkedPayment], conceptos: [] });
  const stored = buildStoredAnalysis(result);
  const encoded = JSON.stringify(stored);
  assert.equal(encoded.includes("factura.xml"), false);
  assert.equal(encoded.includes("pago.xml"), false);
  assert.equal(encoded.includes("rawXml"), false);
  assert.equal(stored.facturas[0].uuid, invoice.uuid);
  assert.equal(stored.summary.invoiceCount, 1);
});

test("separa ventas y compras por RFC y desglosa IVA 0%, 16% e IEPS", () => {
  const sales = {
    ...invoice, uuid: "UUID-VENTA", rfcEmisor: "AAA010101AAA", rfcReceptor: "CLI010101BBB",
    taxRates: ["0", "16"], taxBaseKnown: { zero: true, sixteen: true }, baseIva0: 400, iva0: 0, baseIva16: 600,
    ieps: 24, iepsBreakdown: { "8%": 24 },
  };
  const purchases = {
    ...invoice, uuid: "UUID-COMPRA", rfcEmisor: "PRO010101CCC", rfcReceptor: "AAA010101AAA",
    taxRates: ["16"], taxBaseKnown: { zero: false, sixteen: true }, baseIva16: 800, iva16: 128,
    ieps: 12, iepsBreakdown: { "Cuota ($0.50)": 12 },
  };
  const result = buildCfdiTaxReport({ facturas: [sales, purchases] }, " aaa010101aaa ");
  assert.equal(result.status, "classified");
  assert.equal(result.sales.invoiceCount, 1);
  assert.equal(result.purchases.invoiceCount, 1);
  assert.equal(result.unclassifiedCount, 0);
  assert.deepEqual(result.sales.byCurrency[0], {
    currency: "MXN", invoiceCount: 1, zeroRateInvoices: 1, sixteenRateInvoices: 1,
    baseIva0: 400, iva0: 0, baseIva16: 600, iva16: 160, ieps: 24, iepsBreakdown: { "8%": 24 },
    baseIva0Known: true, baseIva16Known: true,
  });
  assert.deepEqual(result.purchases.byCurrency[0].iepsBreakdown, { "Cuota ($0.50)": 12 });
});

test("no asigna ventas o compras sin el RFC explícito del comercio", () => {
  const result = buildCfdiTaxReport({ facturas: [invoice] });
  assert.equal(result.status, "needs_business_rfc");
  assert.equal(result.sales.invoiceCount, 0);
  assert.equal(result.purchases.invoiceCount, 0);
  assert.equal(result.unclassifiedCount, 1);
});
