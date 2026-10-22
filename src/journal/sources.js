import { normalizeCurrency, moneyFromMinor, normalizeMoney } from "./money.js";

function safeDate(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || text.slice(0, 10) || "Fecha pendiente";
}

function sourceId(prefix, value, index) {
  const base = String(value || `row-${index + 1}`).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 90);
  return `${prefix}:${base || index + 1}:${index + 1}`;
}

function currencyFor(item) {
  return normalizeCurrency(item?.moneda);
}

function cfdiSource({ item, index, kind }) {
  const isPayment = kind === "payment";
  const rawAmount = isPayment ? item.impPagado : item.total;
  const currency = currencyFor(item);
  const amount = normalizeMoney(rawAmount, currency, { quality: "derived_from_number" });
  const uuid = item.uuid || item.docRelacionado || "";
  const label = isPayment ? `Pago ${item.serieFolio || item.docRelacionado || uuid || index + 1}` : `Factura ${item.serieFolio || uuid || index + 1}`;
  const warnings = [];
  if (!currency) warnings.push("La moneda CFDI no es un código ISO de tres letras.");
  if (!amount) warnings.push("El importe CFDI no está disponible con precisión utilizable.");
  if (!item.uuid) warnings.push("La fuente no tiene UUID visible; su identidad solo es local a esta corrida.");
  if (isPayment && item.estimatedTax) warnings.push("El análisis marcó una estimación; no se usa como determinación fiscal.");
  return {
    sourceId: sourceId(isPayment ? "cfdi-payment" : "cfdi-invoice", uuid, index),
    kind,
    eventKind: isPayment ? "payment_settlement_candidate" : "invoice_accrual_candidate",
    label,
    date: safeDate(isPayment ? item.fechaPago : item.fecha),
    amount,
    currency,
    companySide: "unknown",
    relationStatus: isPayment ? String(item.relationStatus || "unmatched") : "",
    warnings,
    evidence: {
      source: "CFDI seleccionado en memoria",
      folio: String(item.serieFolio || "").slice(0, 80),
      relation: String(item.docRelacionado || "").slice(0, 80),
    },
  };
}

function bankSource(row, index, fileName = "extracto local") {
  const currency = normalizeCurrency(row.currency);
  const amount = Number.isSafeInteger(row.signedAmountCents) && currency
    ? moneyFromMinor(String(row.signedAmountCents), currency, { scale: 2, quality: "derived_from_normalized_bank_value" })
    : null;
  const warnings = [];
  if (row.status !== "ready") warnings.push(...(row.reasons || ["Fila bancaria no válida."]));
  if (!amount) warnings.push("El movimiento no tiene importe/moneda utilizable.");
  return {
    sourceId: sourceId(`bank-${fileName}`, row.rowNumber, index),
    kind: "bank_movement",
    eventKind: "bank_movement",
    label: `Movimiento fila ${row.rowNumber}`,
    date: row.dateIso || "Fecha pendiente",
    amount,
    currency,
    signed: row.signedAmountCents,
    companySide: "unknown",
    confidence: row.confidence || "none",
    reconciliationResult: row.result || "pending",
    warnings,
    evidence: {
      source: "Extracto local de esta pestaña",
      rowNumber: row.rowNumber,
      reference: String(row.reference || "").slice(0, 80),
      description: String(row.description || "").slice(0, 100),
    },
  };
}

export function buildJournalSources({ analysis = null, bankRows = [], bankFileName = "extracto local" } = {}) {
  const sources = [];
  const facturas = Array.isArray(analysis?.facturas) ? analysis.facturas : [];
  const pagos = Array.isArray(analysis?.pagos) ? analysis.pagos : [];
  facturas.forEach((item, index) => sources.push(cfdiSource({ item, index, kind: "invoice" })));
  pagos.forEach((item, index) => sources.push(cfdiSource({ item, index, kind: "payment" })));
  (Array.isArray(bankRows) ? bankRows : []).forEach((row, index) => sources.push(bankSource(row, index, bankFileName)));
  return sources;
}

export function sourceKindLabel(kind) {
  return ({ invoice: "Factura CFDI", payment: "Pago CFDI", bank_movement: "Movimiento bancario" })[kind] || "Fuente";
}
