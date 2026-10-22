import { normalizeCurrency, moneyFromMinor, normalizeMoney } from "./money.js";
import { stableSnapshotKey } from "./cfdi-lifecycle.js";

function safeDate(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || text.slice(0, 10) || "Fecha pendiente";
}

function sourceId(prefix, value, index) {
  const base = String(value || "missing").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 160);
  return `${prefix}:${base}`;
}

function localFingerprint(item) {
  let hash = 2166136261;
  for (const character of stableSnapshotKey(item)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return `unverified-${hash.toString(16)}`;
}

function currencyFor(item) {
  return normalizeCurrency(item?.moneda);
}

function cfdiSource({ item, index, kind }) {
  const isPayment = kind === "payment";
  const isAdjustment = !isPayment && item?.tipo === "E";
  const rawAmount = isPayment ? item.rawAmounts?.paid ?? item.impPagado : item.rawAmounts?.total ?? item.total;
  const currency = currencyFor(item);
  const amount = normalizeMoney(rawAmount, currency);
  const uuid = item.uuid || item.docRelacionado || "";
  const identity = String(item.uuid || localFingerprint(item)).trim().toLowerCase();
  const occurrence = isPayment ? `${identity}:${item.paymentIndex || "legacy"}:${item.relatedIndex || `${item.docRelacionado || "missing"}:${item.numParcialidad || "missing"}:${item.fechaPago || "missing"}`}` : identity;
  const label = isPayment ? `Pago ${item.serieFolio || item.docRelacionado || uuid || index + 1}` : isAdjustment ? `Nota de crédito ${item.serieFolio || uuid || index + 1}` : `Factura ${item.serieFolio || uuid || index + 1}`;
  const warnings = [];
  if (!currency) warnings.push("La moneda CFDI no es un código ISO de tres letras.");
  if (!amount) warnings.push("El importe CFDI no está disponible con precisión utilizable.");
  if (!item.uuid) warnings.push("La fuente no tiene UUID visible; su identidad solo es local a esta corrida.");
  if (isPayment && item.estimatedTax) warnings.push("El análisis marcó una estimación; no se usa como determinación fiscal.");
  return {
    sourceId: sourceId(isPayment ? "cfdi-payment" : "cfdi-invoice", occurrence, index),
    kind,
    eventKind: isPayment ? "payment_settlement_candidate" : isAdjustment ? "credit_note_adjustment_candidate" : "invoice_accrual_candidate",
    label,
    date: safeDate(isPayment ? item.fechaPago : item.fecha),
    amount,
    currency,
    cfdi: JSON.parse(JSON.stringify(item)),
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
