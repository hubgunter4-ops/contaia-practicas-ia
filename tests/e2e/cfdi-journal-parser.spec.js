import { test, expect } from "@playwright/test";

const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="7" Fecha="2026-09-01T10:00:00" SubTotal="1000.00" Descuento="12.50" Total="1147.50" Moneda="MXN" TipoDeComprobante="I" FormaPago="03" MetodoPago="PPD">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor"/><cfdi:Receptor Rfc="BBB010101BBB" Nombre="Receptor"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="10101504" Cantidad="1" ClaveUnidad="H87" Descripcion="Servicio" ValorUnitario="1000.00" Importe="1000.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/><cfdi:Traslado Base="1000.00" Impuesto="003" TipoFactor="Tasa" TasaOCuota="0.080000" Importe="80.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="240.00"><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/><cfdi:Traslado Base="1000.00" Impuesto="003" TipoFactor="Tasa" TasaOCuota="0.080000" Importe="80.00"/></cfdi:Traslados><cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="25.00"/></cfdi:Retenciones></cfdi:Impuestos>
  <cfdi:CfdiRelacionados TipoRelacion="01"><cfdi:CfdiRelacionado UUID="REL-1"/><cfdi:CfdiRelacionado UUID="REL-2"/></cfdi:CfdiRelacionados>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="INV-7"/></cfdi:Complemento>
</cfdi:Comprobante>`;

const conceptOnlyXml = `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" SubTotal="10.00" Total="11.60" Moneda="MXN" TipoDeComprobante="I"><cfdi:Emisor Rfc="AAA"/><cfdi:Receptor Rfc="BBB"/><cfdi:Conceptos><cfdi:Concepto Importe="10.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="10.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1.60"/><cfdi:Traslado Base="10.00" Impuesto="003" TipoFactor="Cuota" TasaOCuota="0.500000" Importe="2.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos></cfdi:Comprobante>`;

const paymentXml = `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Fecha="2026-09-15T10:00:00" TipoDeComprobante="P" Moneda="XXX"><cfdi:Emisor Rfc="AAA"/><cfdi:Receptor Rfc="BBB"/><cfdi:Complemento><pago20:Pagos><pago20:Pago FechaPago="2026-09-15" FormaDePagoP="03" MonedaP="USD" Monto="100.0000"><pago20:DoctoRelacionado IdDocumento="INV-7" MonedaDR="MXN" EquivalenciaDR="20.000000" NumParcialidad="2" ImpSaldoAnt="200.00" ImpPagado="100.00" ImpSaldoInsoluto="100.00" ObjetoImpDR="02"><pago20:ImpuestosDR><pago20:RetencionesDR><pago20:RetencionDR BaseDR="100.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.100000" ImporteDR="10.00"/></pago20:RetencionesDR><pago20:TrasladosDR><pago20:TrasladoDR BaseDR="90.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="14.40"/></pago20:TrasladosDR></pago20:ImpuestosDR></pago20:DoctoRelacionado><pago20:DoctoRelacionado IdDocumento="INV-8" MonedaDR="MXN" ImpSaldoAnt="50.00" ImpPagado="25.00" ImpSaldoInsoluto="25.00"/></pago20:Pago></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;

async function parseInBrowser(page) {
  return page.evaluate(async ({ invoiceXml: invoice, conceptXml, paymentXml: payment }) => {
    const { parsearXML, enriquecerPagosConFacturas } = await import("/vendor/cfdi-parser.js");
    const invoiceResult = parsearXML(invoice, "invoice.xml");
    const conceptResult = parsearXML(conceptXml, "concept.xml");
    const paymentResult = parsearXML(payment, "payment.xml");
    const linked = enriquecerPagosConFacturas(paymentResult.pagos, invoiceResult.facturas);
    const estimated = enriquecerPagosConFacturas([
      { docRelacionado: "INV-7", impPagado: 573.75, baseIVA16: 0, iva16: 0, taxDetails: [] },
    ], invoiceResult.facturas);
    const ambiguous = enriquecerPagosConFacturas(
      [{ docRelacionado: "INV-7", impPagado: 100, baseIVA16: 0, iva16: 0, taxDetails: [] }],
      [{ uuid: "INV-7", total: 100 }, { uuid: "INV-7", total: 100 }],
    );
    return {
      invoice: invoiceResult.facturas[0], concept: conceptResult.facturas[0],
      payments: paymentResult.pagos, linked, estimated: estimated[0], ambiguous: ambiguous[0],
    };
  }, { invoiceXml, conceptXml: conceptOnlyXml, paymentXml });
}

test("extrae evidencia fiscal de factura sin duplicar impuestos de conceptos", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const result = await parseInBrowser(page);
  expect(result.invoice.rawAmounts).toEqual({ total: "1147.50", subtotal: "1000.00", discount: "12.50" });
  expect(result.invoice.formaPagoCode).toBe("03");
  expect(result.invoice.taxDetailsSource).toBe("document");
  expect(result.invoice.taxDetails).toHaveLength(3);
  expect(result.invoice.taxDetails).toEqual(expect.arrayContaining([
    { tax: "002", factor: "Tasa", rate: "0.160000", base: "1000.00", amount: "160.00", kind: "transfer" },
    { tax: "003", factor: "Tasa", rate: "0.080000", base: "1000.00", amount: "80.00", kind: "transfer" },
    { tax: "001", factor: "", rate: "", base: "", amount: "25.00", kind: "retention" },
  ]));
  expect(result.invoice.tipoRelacion).toBe("01");
  expect(result.invoice.cfdiRelations).toEqual([{ type: "01", uuids: ["REL-1", "REL-2"] }]);
  expect(result.invoice.cfdiRelacionado).toBe("REL-1, REL-2");
  expect(result.concept.taxDetailsSource).toBe("concept");
  expect(result.concept.taxDetails).toHaveLength(2);
});

test("conserva evidencia lexical de complementos y ordinales por pago/documento", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const result = await parseInBrowser(page);
  expect(result.payments).toHaveLength(2);
  expect(result.payments[0]).toMatchObject({
    rawAmounts: { paid: "100.00", prior: "200.00", remaining: "100.00" },
    paymentIndex: 1, relatedIndex: 1, formaPagoCode: "03", monedaPago: "USD", montoPago: "100.0000",
    equivalenciaDR: "20.000000", numParcialidad: "2", objetoImpDR: "02", rawPaymentTaxes: true,
  });
  expect(result.payments[0].taxDetails).toEqual([
    { tax: "002", factor: "Tasa", rate: "0.100000", base: "100.00", amount: "10.00", kind: "retention" },
    { tax: "002", factor: "Tasa", rate: "0.160000", base: "90.00", amount: "14.40", kind: "transfer" },
  ]);
  expect(result.payments[1]).toMatchObject({ paymentIndex: 1, relatedIndex: 2, taxDetails: [] });
  expect(result.payments[1].rawPaymentTaxes).toBeUndefined();
});

test("no reemplaza impuestos DR explícitos ni estima impuestos legacy sin evidencia", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const result = await parseInBrowser(page);
  expect(result.linked[0]).toMatchObject({ relationStatus: "matched", linkedInvoiceTotal: 1147.5, iva16: 14.4, ivaRetenido: 10 });
  expect(result.linked[0].estimatedTax).toBeUndefined();
  expect(result.linked[0].rawAmounts.paid).toBe("100.00");
  expect(result.estimated).toMatchObject({ relationStatus: "matched", taxEvidenceStatus: "missing", iva16: null });
  expect(result.ambiguous).toMatchObject({ relationStatus: "ambiguous", baseIVA16: null, iva16: null });
  expect(result.ambiguous.estimatedTax).toBeUndefined();
});
