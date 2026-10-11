import { enriquecerPagosConFacturas } from "./relations.js";

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const normalizedUuid = (value) => String(value || "").trim().toLowerCase();

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
