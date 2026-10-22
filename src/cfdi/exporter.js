const normalizedRfc = (value) => String(value || "").trim().toUpperCase();
const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const valueOrBlank = (value) => value === null || value === undefined ? "" : value;
const currencyOf = (invoice) => invoice?.moneda || "Sin moneda indicada";
const dateOf = (value) => value ? String(value).slice(0, 19) : "";

const INVOICE_HEADERS = [
  "UUID", "Serie / folio", "Tipo", "Fecha", "RFC emisor", "Emisor", "RFC receptor", "Receptor", "Moneda",
  "Subtotal", "Descuento", "Base IVA 0%", "IVA 0%", "Base IVA 16%", "IVA 16%", "IEPS", "Total",
  "Tasa 0%", "Tasa 16%", "Calidad de lectura",
];
const PAYMENT_HEADERS = [
  "UUID pago", "Documento relacionado", "Fecha de pago", "Moneda", "Saldo anterior", "Importe pagado",
  "Saldo insoluto", "Estado de relación", "Evidencia de impuestos", "Diferencia aritmética",
];
const CONCEPT_HEADERS = ["UUID comprobante", "Descripción", "Emisor", "Clave SAT", "Cantidad", "Importe", "IVA 16%", "IEPS", "Moneda", "Serie / folio"];
const TAX_HEADERS = ["Vista", "Moneda", "Comprobantes", "Impuesto / tasa", "Base", "Importe de impuesto", "Calidad", "Detalle"];

function classifyInvoices(invoices, businessRfc) {
  const normalizedBusinessRfc = normalizedRfc(businessRfc);
  const sales = [];
  const purchases = [];
  const unclassified = [];
  for (const invoice of invoices) {
    const issuerMatches = normalizedBusinessRfc && normalizedRfc(invoice.rfcEmisor) === normalizedBusinessRfc;
    const receiverMatches = normalizedBusinessRfc && normalizedRfc(invoice.rfcReceptor) === normalizedBusinessRfc;
    if (issuerMatches && !receiverMatches) sales.push(invoice);
    else if (receiverMatches && !issuerMatches) purchases.push(invoice);
    else unclassified.push(invoice);
  }
  return { sales, purchases, unclassified };
}

function invoiceQuality(invoice) {
  const missing = [];
  if (!invoice?.uuid) missing.push("UUID");
  if (!invoice?.moneda) missing.push("moneda");
  if (!invoice?.fecha) missing.push("fecha");
  if (missing.length) return `Revisar: falta ${missing.join(", ")}`;
  if (invoice.taxBaseKnown?.zero === false || invoice.taxBaseKnown?.sixteen === false) return "Base de impuesto no determinable";
  return "Extraído del XML";
}

function rateLabel(invoice, rate) {
  return Array.isArray(invoice?.taxRates) && invoice.taxRates.includes(rate) ? "Identificada" : "No identificada";
}

function invoiceRow(invoice) {
  return [
    valueOrBlank(invoice.uuid), valueOrBlank(invoice.serieFolio), invoice.tipo === "E" ? "Egreso" : "Ingreso", dateOf(invoice.fecha),
    valueOrBlank(invoice.rfcEmisor), valueOrBlank(invoice.nombreEmisor || invoice.emisor), valueOrBlank(invoice.rfcReceptor),
    valueOrBlank(invoice.nombreReceptor || invoice.receptor), currencyOf(invoice), Number(invoice.subtotal || 0), Number(invoice.descuento || 0),
    Number(invoice.baseIva0 || 0), Number(invoice.iva0 || 0), Number(invoice.baseIva16 || 0), Number(invoice.iva16 || 0),
    Number(invoice.ieps || 0), Number(invoice.total || 0), rateLabel(invoice, "0"), rateLabel(invoice, "16"), invoiceQuality(invoice),
  ];
}

function paymentRow(payment) {
  const difference = round2(Number(payment.saldoAnterior || 0) - Number(payment.impPagado || 0) - Number(payment.saldoInsoluto || 0));
  return [
    valueOrBlank(payment.uuid), valueOrBlank(payment.docRelacionado), dateOf(payment.fechaPago), payment.moneda || "Sin moneda indicada",
    Number(payment.saldoAnterior || 0), Number(payment.impPagado || 0), Number(payment.saldoInsoluto || 0),
    payment.relationStatus === "matched" ? "Factura encontrada" : "Requiere revisión", payment.taxEvidenceStatus === "missing" ? "No disponible · sin estimación" : payment.estimatedTax ? "Estimación histórica · revisar" : "Revisar desglose XML", difference,
  ];
}

function conceptRow(concept) {
  return [
    valueOrBlank(concept.uuid), valueOrBlank(concept.descripcion), valueOrBlank(concept.emisor), valueOrBlank(concept.claveProdServ),
    Number(concept.cantidad || 0), Number(concept.importe || 0), Number(concept.iva16 || 0), Number(concept.ieps || 0),
    concept.moneda || "Sin moneda indicada", valueOrBlank(concept.serieFolio),
  ];
}

function taxRowsForSide(label, side) {
  const rows = [];
  for (const item of side?.byCurrency || []) {
    rows.push([label, item.currency, item.invoiceCount, "IVA 0% · base", item.baseIva0, item.iva0, item.baseIva0Known ? "Base identificada" : "Base no determinable", `${item.zeroRateInvoices} comprobante(s) con tasa explícita`]);
    rows.push([label, item.currency, item.invoiceCount, "IVA 16% · base", item.baseIva16, item.iva16, item.baseIva16Known ? "Base identificada" : "Base no determinable", `${item.sixteenRateInvoices} comprobante(s) con tasa explícita`]);
    rows.push([label, item.currency, item.invoiceCount, "IEPS total", "", item.ieps, Object.keys(item.iepsBreakdown || {}).length ? "Importe explícito" : "No identificado", "El detalle conserva la tasa o cuota cuando el XML la expone"]);
    for (const [detail, amount] of Object.entries(item.iepsBreakdown || {})) rows.push([label, item.currency, item.invoiceCount, `IEPS · ${detail}`, "", amount, "Importe explícito", "Desglose por tasa o cuota"]);
  }
  return rows;
}

function summaryRows({ analysis, businessRfc, taxReport, classification, generatedAt }) {
  const summary = analysis.summary || {};
  const totalTaxRows = [...(taxReport?.sales?.byCurrency || []), ...(taxReport?.purchases?.byCurrency || [])];
  const currencies = [...new Set(totalTaxRows.map((item) => item.currency).filter(Boolean))].join(", ") || "No separadas";
  return [
    ["ContaIA · Libro fiscal avanzado"],
    ["Hoja de trabajo local para revisión; no es declaración, envío ni acuse del SAT."],
    [],
    ["Campo", "Valor", "Nota"],
    ["Generado", generatedAt, "Generado en este navegador"],
    ["RFC de comercio/empresa", businessRfc || "No indicado", businessRfc ? "Separación explícita por emisor/receptor" : "Ventas y compras no se atribuyen sin RFC"],
    ["Esquema de análisis", analysis.version || "pdfc-compatible-1", "No equivale a una plantilla oficial"],
    ["Comprobantes", summary.invoiceCount || 0, "Ingreso y egreso"],
    ["Pagos", summary.paymentCount || 0, "Complementos seleccionados"],
    ["Conceptos", summary.conceptCount || 0, "Detalle extraído del XML"],
    ["Ventas clasificadas", classification.sales.length, businessRfc ? "RFC emisor coincide" : "No determinable"],
    ["Compras clasificadas", classification.purchases.length, businessRfc ? "RFC receptor coincide" : "No determinable"],
    ["No clasificadas", classification.unclassified.length, "Requieren contexto o revisión"],
    ["Monedas fiscales", currencies, "Nunca se mezclan divisas"],
    ["Advertencias del análisis", (summary.alerts || []).reduce((total, alert) => total + Number(alert.count || 0), 0), "No equivalen a un dictamen"],
    ["Hojas incluidas", "Resumen · Comprobantes · Ventas · Compras · Impuestos · Pagos · Conceptos", "Libro XLSX avanzado"],
  ];
}

export function buildCfdiWorkbookSpec({ analysis = {}, taxReport = null, businessRfc = "", generatedAt = new Date().toISOString() } = {}) {
  const invoices = Array.isArray(analysis.facturas) ? analysis.facturas : [];
  const payments = Array.isArray(analysis.pagos) ? analysis.pagos : [];
  const concepts = Array.isArray(analysis.conceptos) ? analysis.conceptos : [];
  const classification = classifyInvoices(invoices, businessRfc || taxReport?.businessRfc || "");
  const effectiveRfc = normalizedRfc(businessRfc || taxReport?.businessRfc || "");
  const effectiveTaxReport = taxReport || { sales: { byCurrency: [] }, purchases: { byCurrency: [] } };
  const taxRows = [
    ...taxRowsForSide("Ventas", effectiveTaxReport.sales),
    ...taxRowsForSide("Compras", effectiveTaxReport.purchases),
  ];
  const period = invoices.map((invoice) => String(invoice.fecha || "").slice(0, 7)).find(Boolean) || "revision";
  return {
    fileName: `contaia-libro-fiscal-${period}.xlsx`,
    generatedAt,
    sheets: [
      { name: "Resumen", headerRow: 4, widths: [30, 36, 58], rows: summaryRows({ analysis, businessRfc: effectiveRfc, taxReport: effectiveTaxReport, classification, generatedAt }) },
      { name: "Comprobantes", headerRow: 1, widths: [38, 16, 12, 20, 16, 28, 16, 28, 16, 14, 14, 16, 14, 16, 14, 14, 16, 16, 16, 30], rows: [INVOICE_HEADERS, ...invoices.map(invoiceRow)] },
      { name: "Ventas", headerRow: 1, widths: [38, 16, 12, 20, 16, 28, 16, 28, 16, 14, 14, 16, 14, 16, 14, 14, 16, 16, 16, 30], rows: [INVOICE_HEADERS, ...classification.sales.map(invoiceRow)] },
      { name: "Compras", headerRow: 1, widths: [38, 16, 12, 20, 16, 28, 16, 28, 16, 14, 14, 16, 14, 16, 14, 14, 16, 16, 16, 30], rows: [INVOICE_HEADERS, ...classification.purchases.map(invoiceRow)] },
      { name: "Impuestos", headerRow: 1, widths: [14, 16, 14, 25, 18, 20, 24, 54], rows: [TAX_HEADERS, ...taxRows] },
      { name: "Pagos", headerRow: 1, widths: [38, 38, 20, 18, 18, 18, 18, 24, 20, 22], rows: [PAYMENT_HEADERS, ...payments.map(paymentRow)] },
      { name: "Conceptos", headerRow: 1, widths: [38, 38, 28, 16, 12, 18, 16, 16, 18, 16], rows: [CONCEPT_HEADERS, ...concepts.map(conceptRow)] },
    ],
  };
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function decorateSheet(sheet, spec) {
  sheet["!cols"] = spec.widths.map((wch) => ({ wch }));
  if (spec.rows.length && spec.rows[0].length) {
    const lastColumn = columnName(spec.rows[0].length - 1);
    sheet["!autofilter"] = { ref: `A${spec.headerRow}:${lastColumn}${spec.rows.length}` };
    sheet["!freeze"] = { xSplit: 0, ySplit: spec.headerRow };
  }
  const header = spec.rows[spec.headerRow - 1] || [];
  header.forEach((_, index) => {
    const cell = sheet[`${columnName(index)}${spec.headerRow}`];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "123B43" } } };
  });
}

export function buildCfdiWorkbook(xlsx, spec) {
  const utils = xlsx?.utils || xlsx?.default?.utils;
  if (!utils?.book_new || !utils?.aoa_to_sheet || !utils?.book_append_sheet) throw new Error("No se pudo iniciar el generador local de hojas de cálculo.");
  const workbook = utils.book_new();
  for (const sheetSpec of spec.sheets) {
    const sheet = utils.aoa_to_sheet(sheetSpec.rows);
    decorateSheet(sheet, sheetSpec);
    utils.book_append_sheet(workbook, sheet, sheetSpec.name);
  }
  workbook.Props = { Title: "ContaIA · Libro fiscal avanzado", Subject: "Hoja de trabajo local para revisión fiscal", Author: "ContaIA", Comments: "No es declaración oficial ni presentación ante el SAT." };
  return workbook;
}

export function buildCfdiWorkbookDownload(xlsx, spec) {
  const write = xlsx?.write || xlsx?.default?.write;
  if (typeof write !== "function") throw new Error("No se pudo iniciar la descarga XLSX local.");
  const workbook = buildCfdiWorkbook(xlsx, spec);
  return write(workbook, { bookType: "xlsx", type: "array", compression: true });
}

export const __test = { classifyInvoices, invoiceRow, taxRowsForSide };
