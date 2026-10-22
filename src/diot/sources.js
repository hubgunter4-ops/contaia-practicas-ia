import { normalizeCurrency, normalizeMoney } from "../journal/money.js";

const safeDate = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
};

const safeText = (value, length = 160) => String(value ?? "").trim().slice(0, length);
const uuidKey = (value) => safeText(value, 100).toLowerCase();

export function isValidRfc(value) {
  return /^(?:[A-ZÑ&]{3}|[A-ZÑ&]{4})\d{6}[A-Z0-9]{3}$/i.test(String(value || "").trim());
}

function sourceId(item, index) {
  const key = safeText(item?.uuid || item?.serieFolio || `row-${index + 1}`, 90).replace(/[^a-zA-Z0-9:_-]/g, "");
  return `diot-cfdi:${key || "row"}:${index + 1}`;
}

function derivedMoney(value, currency) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0 || !currency) return null;
  return normalizeMoney(Number(value), currency, { quality: "derived_from_number" });
}

function sourceFromInvoice(item, index, duplicateUuids) {
  const currency = normalizeCurrency(item?.moneda);
  const baseValue = Number(item?.subtotal || 0) - Number(item?.descuento || 0);
  const uuid = safeText(item?.uuid, 100);
  const duplicate = Boolean(uuid && (duplicateUuids.get(uuidKey(uuid)) || 0) > 1);
  const warnings = [];
  if (!currency) warnings.push("La moneda del CFDI no es un código ISO de tres letras.");
  if (!uuid) warnings.push("El CFDI no tiene UUID visible; su identidad solo es local a esta sesión.");
  if (duplicate) warnings.push("El UUID aparece más de una vez en las fuentes seleccionables.");
  if (String(item?.tipo || "").toUpperCase() === "E") warnings.push("El CFDI es de egreso; confirma su tratamiento antes de incluirlo en esta preparación.");
  if (!Number.isFinite(baseValue) || baseValue <= 0) warnings.push("La base disponible no es utilizable; confirma o captura el importe antes de revisar.");
  if (!(Number(item?.iva16) > 0)) warnings.push("El análisis actual no conserva un IVA trasladado positivo verificable; no se asume cero.");
  return {
    sourceId: sourceId(item, index),
    kind: "invoice",
    label: `CFDI ${safeText(item?.serieFolio || uuid || `fila ${index + 1}`, 80)}`,
    date: safeDate(item?.fecha),
    currency,
    duplicate,
    warnings,
    quality: "derived_from_number",
    amounts: {
      base: derivedMoney(baseValue, currency),
      ivaTransferred: derivedMoney(item?.iva16, currency),
      ivaWithheld: derivedMoney(item?.ivaRetenido, currency),
    },
    evidence: {
      uuid,
      folio: safeText(item?.serieFolio, 80),
      date: safeDate(item?.fecha),
      type: safeText(item?.tipo, 4),
      source: "CFDI seleccionado en memoria",
      issuer: { rfc: safeText(item?.rfcEmisor, 13), name: safeText(item?.nombreEmisor || item?.emisor, 160) },
      receiver: { rfc: safeText(item?.rfcReceptor, 13), name: safeText(item?.nombreReceptor || item?.receptor, 160) },
    },
  };
}

export function buildDiotSources({ analysis = null } = {}) {
  const invoices = Array.isArray(analysis?.facturas) ? analysis.facturas : [];
  const duplicateUuids = new Map();
  invoices.forEach((item) => {
    const uuid = uuidKey(item?.uuid);
    if (uuid) duplicateUuids.set(uuid, (duplicateUuids.get(uuid) || 0) + 1);
  });
  return invoices
    .filter((item) => ["I", "E"].includes(String(item?.tipo || "").toUpperCase()))
    .map((item, index) => sourceFromInvoice(item, index, duplicateUuids));
}

export function suggestedThirdParty(source, companyRole) {
  if (companyRole === "receiver") return source?.evidence?.issuer || null;
  if (companyRole === "issuer") return source?.evidence?.receiver || null;
  return null;
}
