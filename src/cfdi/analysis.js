import { enriquecerPagosConFacturas } from "./relations.js";

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const normalizedUuid = (value) => String(value || "").trim().toLowerCase();
const normalizedRfc = (value) => String(value || "").trim().toUpperCase();

function emptyTaxCurrency(currency) {
  return {
    currency, invoiceCount: 0, zeroRateInvoices: 0, sixteenRateInvoices: 0,
    baseIva0: 0, iva0: 0, baseIva16: 0, iva16: 0, ieps: 0, iepsBreakdown: {},
    baseIva0Known: true, baseIva16Known: true,
  };
}

function summarizeTaxSide(invoices) {
  const byCurrency = new Map();
  for (const invoice of invoices) {
    const currency = invoice.moneda || "Sin moneda indicada";
    const row = byCurrency.get(currency) || emptyTaxCurrency(currency);
    const rates = Array.isArray(invoice.taxRates) ? invoice.taxRates : [];
    const hasZero = rates.includes("0");
    const hasSixteen = rates.includes("16");
    row.invoiceCount += 1;
    if (hasZero) {
      row.zeroRateInvoices += 1;
      row.baseIva0 += Number(invoice.baseIva0 || 0);
      row.iva0 += Number(invoice.iva0 || 0);
      row.baseIva0Known = row.baseIva0Known && invoice.taxBaseKnown?.zero !== false;
    }
    if (hasSixteen) {
      row.sixteenRateInvoices += 1;
      row.baseIva16 += Number(invoice.baseIva16 || 0);
      row.iva16 += Number(invoice.iva16 || 0);
      row.baseIva16Known = row.baseIva16Known && invoice.taxBaseKnown?.sixteen !== false;
    }
    row.ieps += Number(invoice.ieps || 0);
    for (const [label, amount] of Object.entries(invoice.iepsBreakdown || {})) row.iepsBreakdown[label] = (row.iepsBreakdown[label] || 0) + Number(amount || 0);
    byCurrency.set(currency, row);
  }
  return {
    invoiceCount: invoices.length,
    byCurrency: [...byCurrency.values()].map((row) => ({
      ...row,
      baseIva0: round2(row.baseIva0), iva0: round2(row.iva0), baseIva16: round2(row.baseIva16), iva16: round2(row.iva16), ieps: round2(row.ieps),
      iepsBreakdown: Object.fromEntries(Object.entries(row.iepsBreakdown).map(([label, amount]) => [label, round2(amount)])),
    })),
  };
}

export function buildCfdiTaxReport(analysis, businessRfc = "") {
  const normalizedBusinessRfc = normalizedRfc(businessRfc);
  const invoices = Array.isArray(analysis?.facturas) ? analysis.facturas : [];
  if (!normalizedBusinessRfc) {
    return { schemaVersion: "cfdi-tax-report-v1", status: "needs_business_rfc", businessRfc: "", sales: summarizeTaxSide([]), purchases: summarizeTaxSide([]), unclassifiedCount: invoices.length };
  }
  const sales = [];
  const purchases = [];
  const unclassified = [];
  for (const invoice of invoices) {
    const issuerMatches = normalizedRfc(invoice.rfcEmisor) === normalizedBusinessRfc;
    const receiverMatches = normalizedRfc(invoice.rfcReceptor) === normalizedBusinessRfc;
    if (issuerMatches && !receiverMatches) sales.push(invoice);
    else if (receiverMatches && !issuerMatches) purchases.push(invoice);
    else unclassified.push(invoice);
  }
  return {
    schemaVersion: "cfdi-tax-report-v1", status: "classified", businessRfc: normalizedBusinessRfc,
    sales: summarizeTaxSide(sales), purchases: summarizeTaxSide(purchases), unclassifiedCount: unclassified.length,
  };
}

export function buildCfdiAnalysis(parsed) {
  const facturas = Array.isArray(parsed?.facturas) ? parsed.facturas : [];
  const pagos = enriquecerPagosConFacturas(Array.isArray(parsed?.pagos) ? parsed.pagos : [], facturas);
  const conceptos = Array.isArray(parsed?.conceptos) ? parsed.conceptos : [];
  const invoiceUuidCounts = new Map();
  facturas.forEach((invoice) => {
    const uuid = normalizedUuid(invoice.uuid);
    if (uuid) invoiceUuidCounts.set(uuid, (invoiceUuidCounts.get(uuid) || 0) + 1);
  });
  const duplicateUuids = [...invoiceUuidCounts.values()].filter((count) => count > 1).length;
  const invoiceIds = new Set(facturas.map((invoice) => normalizedUuid(invoice.uuid)).filter(Boolean));
  const matchedPayments = pagos.filter((payment) => payment.relationStatus === "matched").length;
  const unmatchedPayments = pagos.length - matchedPayments;
  const paymentBalanceDifferences = pagos.map((payment) => round2(payment.saldoAnterior - payment.impPagado - payment.saldoInsoluto));
  const balanceAlerts = paymentBalanceDifferences.filter((difference) => Math.abs(difference) > 0.01).length;
  const missingInvoiceReferences = pagos.filter((payment) => payment.docRelacionado && !invoiceIds.has(normalizedUuid(payment.docRelacionado))).length;
  const overpaidLinks = pagos.filter((payment) => payment.relationStatus === "matched" && Number(payment.impPagado) > Number(payment.linkedInvoiceTotal || 0) + 0.01).length;
  const currencies = [...new Set([
    ...facturas.map((item) => item.moneda || "Sin moneda indicada"),
    ...pagos.map((item) => item.moneda || "Sin moneda indicada"),
  ])];
  const totalsByCurrency = currencies.map((currency) => ({
    currency,
    invoiced: round2(facturas.filter((item) => (item.moneda || "Sin moneda indicada") === currency).reduce((sum, item) => sum + Number(item.total || 0), 0)),
    paid: round2(pagos.filter((item) => (item.moneda || "Sin moneda indicada") === currency).reduce((sum, item) => sum + Number(item.impPagado || 0), 0)),
    remaining: round2(pagos.filter((item) => (item.moneda || "Sin moneda indicada") === currency).reduce((sum, item) => sum + Number(item.saldoInsoluto || 0), 0)),
  }));
  const alerts = [];
  if (duplicateUuids) alerts.push({ code: "duplicate_uuid", count: duplicateUuids, severity: "review" });
  if (missingInvoiceReferences) alerts.push({ code: "payment_without_invoice", count: missingInvoiceReferences, severity: "review" });
  if (balanceAlerts) alerts.push({ code: "payment_balance_difference", count: balanceAlerts, severity: "review" });
  if (overpaidLinks) alerts.push({ code: "payment_exceeds_invoice", count: overpaidLinks, severity: "review" });
  if (pagos.some((payment) => payment.estimatedTax)) alerts.push({ code: "estimated_tax_unmatched", count: pagos.filter((payment) => payment.estimatedTax).length, severity: "caution" });
  return {
    version: "pdfc-compatible-1",
    facturas, pagos, conceptos,
    summary: { invoiceCount: facturas.length, paymentCount: pagos.length, conceptCount: conceptos.length, matchedPayments, unmatchedPayments, duplicateUuids, balanceAlerts, missingInvoiceReferences, overpaidLinks, totalsByCurrency, alerts },
  };
}

const omittedStorageFields = new Set(["fileName", "rawXml", "xml", "sourcePath", "localPath"]);
function stripLocalFields(value) {
  if (Array.isArray(value)) return value.map(stripLocalFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omittedStorageFields.has(key)).map(([key, child]) => [key, stripLocalFields(child)]));
}

export function buildStoredAnalysis(analysis) {
  if (!analysis || !analysis.summary) throw new Error("No hay un análisis CFDI válido para guardar.");
  const safe = stripLocalFields(analysis);
  const serialized = JSON.stringify(safe);
  if (new TextEncoder().encode(serialized).byteLength > 900_000) throw new Error("El resultado supera el límite seguro de 900 KB para guardarlo.");
  return safe;
}

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(-1_000_000_000_000, Math.min(1_000_000_000_000, parsed)) : 0;
};
const countOrZero = (value) => Math.max(0, Math.min(1000, Math.trunc(numberOrZero(value))));

export function buildNoraCfdiContext(analysis) {
  if (!analysis?.summary) return { schemaVersion: "cfdi-summary-v1", status: "no_result" };
  const summary = analysis.summary;
  const items = analysis.pagos.slice(0, 8).map((payment) => ({
    kind: "payment",
    amount: numberOrZero(payment.impPagado),
    priorBalance: numberOrZero(payment.saldoAnterior),
    remainingBalance: numberOrZero(payment.saldoInsoluto),
    arithmeticDifference: round2(numberOrZero(payment.saldoAnterior) - numberOrZero(payment.impPagado) - numberOrZero(payment.saldoInsoluto)),
    relation: payment.relationStatus === "matched" ? "matched" : "unmatched",
    estimatedTax: Boolean(payment.estimatedTax),
    currency: String(payment.moneda || "Sin moneda indicada").slice(0, 12),
  }));
  return {
    schemaVersion: "cfdi-summary-v1",
    status: "analyzed",
    counts: {
      invoices: countOrZero(summary.invoiceCount), payments: countOrZero(summary.paymentCount), concepts: countOrZero(summary.conceptCount),
      matchedPayments: countOrZero(summary.matchedPayments), unmatchedPayments: countOrZero(summary.unmatchedPayments),
    },
    checks: {
      duplicateUuids: countOrZero(summary.duplicateUuids), paymentBalanceDifferences: countOrZero(summary.balanceAlerts),
      paymentWithoutInvoice: countOrZero(summary.missingInvoiceReferences), paymentsExceedingInvoice: countOrZero(summary.overpaidLinks),
      estimatedTaxPayments: countOrZero(analysis.pagos.filter((payment) => payment.estimatedTax).length),
    },
    totalsByCurrency: (summary.totalsByCurrency || []).slice(0, 8).map((item) => ({
      currency: String(item.currency || "Sin moneda indicada").slice(0, 12),
      invoiced: numberOrZero(item.invoiced), paid: numberOrZero(item.paid), remaining: numberOrZero(item.remaining),
    })),
    samplePayments: items,
  };
}
