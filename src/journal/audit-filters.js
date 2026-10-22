import { companyRole, normalizeRfc } from "./cfdi-policy.js";

export const DEFAULT_AUDIT_FILTERS = Object.freeze({
  period: "", role: "all", type: "all", method: "all", currency: "all", party: "",
  relation: "all", severity: "all", status: "all",
});

export function createAuditFilters(overrides = {}) {
  return { ...DEFAULT_AUDIT_FILTERS, ...overrides };
}

const sourceDate = (source) => String(source?.kind === "payment" ? source.cfdi?.fechaPago : source?.cfdi?.fecha || "").slice(0, 7);
const sourceType = (source) => String(source?.cfdi?.tipo || "");

export function filterAuditSources(sources = [], filters = {}, businessRfc = "") {
  const effective = createAuditFilters(filters);
  const party = normalizeRfc(effective.party);
  const all = Array.isArray(sources) ? sources : [];
  const paymentRefs = new Set(all.filter((source) => source.kind === "payment").map((source) => String(source.cfdi?.docRelacionado || "").toLowerCase()).filter(Boolean));
  return all.filter((source) => {
    const item = source?.cfdi || {};
    const type = sourceType(source);
    if (!type) return false;
    if (effective.period && sourceDate(source) !== effective.period) return false;
    if (effective.role !== "all" && companyRole(item, businessRfc) !== effective.role) return false;
    if (effective.type !== "all" && type !== effective.type) return false;
    if (effective.method !== "all" && item.metodoPago !== effective.method) return false;
    if (effective.currency !== "all" && item.moneda !== effective.currency) return false;
    if (party && normalizeRfc(item.rfcEmisor) !== party && normalizeRfc(item.rfcReceptor) !== party) return false;
    if (effective.relation === "credit_note" && type !== "E") return false;
    if (effective.relation === "payment" && source.kind !== "payment") return false;
    if (effective.relation === "ppd_without_payment" && !(type === "I" && item.metodoPago === "PPD" && !paymentRefs.has(String(item.uuid || "").toLowerCase()))) return false;
    if (effective.relation === "with_payment" && !(type === "I" && paymentRefs.has(String(item.uuid || "").toLowerCase()))) return false;
    return true;
  });
}

export function describeAuditScope(sources = [], { period = "", role = "all", type = "all", method = "all", currency = "all", party = "", relation = "all" } = {}) {
  const filters = [];
  if (period) filters.push(`periodo ${period}`);
  if (role !== "all") filters.push(role === "issuer" ? "empresa emisora" : "empresa receptora");
  if (type !== "all") filters.push(`tipo ${type}`);
  if (method !== "all") filters.push(method);
  if (currency !== "all") filters.push(currency);
  if (party) filters.push(`tercero ${normalizeRfc(party)}`);
  if (relation !== "all") filters.push(relation.replaceAll("_", " "));
  return `${sources.length} documento(s)/evento(s) · ${filters.length ? filters.join(" · ") : "sin filtros adicionales"}`;
}
