import { categoryRequiresTransferredVat, DIOT_REVIEW_SCHEMA } from "./schema.js";
import { aggregateDiotRecords, summarizeGlobalEligibility } from "./aggregator.js";
import { isValidRfc } from "./sources.js";

function issue(severity, code, message, { sourceId = "", action = "Revisa esta preparación antes de descargar." } = {}) {
  return { severity, code, message, sourceId, action };
}

function hasMoney(value) {
  return Boolean(value && /^-?\d+$/.test(String(value.minor)) && !String(value.minor).startsWith("-"));
}

function validPeriod(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

export function validateDiotPreparation({ records = [], context = {}, schema = DIOT_REVIEW_SCHEMA, warningsAcknowledged = false } = {}) {
  const errors = [];
  const warnings = [];
  const rowIssues = new Map();
  const add = (item) => {
    (item.severity === "error" ? errors : warnings).push(item);
    if (item.sourceId) {
      const list = rowIssues.get(item.sourceId) || [];
      list.push(item);
      rowIssues.set(item.sourceId, list);
    }
  };

  if (!schema?.schemaVersion || schema.officialCompatible) add(issue("error", "schema_invalid", "El esquema local no es válido para esta preparación."));
  if (!validPeriod(context.period)) add(issue("error", "period_missing", "Selecciona un periodo mensual válido antes de continuar.", { action: "Vuelve a Contexto y confirma el periodo." }));
  if (!context.taxpayerType) add(issue("error", "taxpayer_missing", "Selecciona el contexto del contribuyente; no se infiere desde un perfil abierto.", { action: "Vuelve a Contexto y elige el tipo de contribuyente." }));
  if (!['receiver', 'issuer'].includes(context.companyRole)) add(issue("error", "company_role_missing", "Confirma el papel de la empresa frente a los CFDI seleccionados.", { action: "Indica si la empresa figura como receptor o emisor para esta revisión." }));
  if (!records.length) add(issue("error", "sources_missing", "Selecciona al menos una fuente CFDI antes de descargar.", { action: "Vuelve a Fuentes y selecciona comprobantes." }));

  for (const record of records) {
    if (record.excluded) {
      if (!String(record.exclusionReason || "").trim()) add(issue("error", "exclusion_reason_missing", "Una operación excluida requiere un motivo visible para esta preparación.", { sourceId: record.sourceId, action: "Indica por qué se excluye, sin borrar su evidencia." }));
      continue;
    }
    if (record.duplicate) add(issue("error", "duplicate_source", "El UUID de esta fuente está duplicado y requiere resolución humana.", { sourceId: record.sourceId, action: "Revisa las fuentes repetidas antes de incluir una fila." }));
    if (record.currency !== context.currency) add(issue("error", "currency_incompatible", `La moneda ${record.currency || "faltante"} no coincide con la moneda de trabajo ${context.currency || "pendiente"}; no se convierte automáticamente.`, { sourceId: record.sourceId, action: "Corrige la moneda o excluye la operación de esta preparación." }));
    const party = record.thirdParty || {};
    if (!party.type) add(issue("error", "party_type_missing", "Falta clasificar el tipo de tercero.", { sourceId: record.sourceId, action: "Selecciona proveedor nacional, extranjero o revisa si aplica global." }));
    if (party.type === "national" && !isValidRfc(party.identifier)) add(issue("error", "rfc_missing", "El proveedor nacional requiere un RFC con estructura válida.", { sourceId: record.sourceId, action: "Confirma el RFC del tercero o corrige la fuente." }));
    if (party.type === "foreign") {
      if (!party.identifier || !party.name || !party.country || !party.nationality) add(issue("error", "foreign_details_missing", "El proveedor extranjero requiere identificador, nombre, país y nacionalidad en esta revisión.", { sourceId: record.sourceId, action: "Completa los datos requeridos por el esquema activo." }));
    }
    if (party.type === "global") add(issue("error", "global_not_determinable", "Proveedor global no puede validarse con un conjunto parcial de fuentes.", { sourceId: record.sourceId, action: "Relaciona individualmente la operación o confirma la totalidad del periodo en una fase futura." }));
    if (!record.operationType) add(issue("error", "operation_missing", "Falta seleccionar el tipo de operación de revisión.", { sourceId: record.sourceId, action: "Clasifica la operación mediante el catálogo cerrado." }));
    if (!record.category) add(issue("error", "category_missing", "Falta seleccionar la categoría de IVA de revisión.", { sourceId: record.sourceId, action: "Confirma la categoría conforme a la evidencia disponible." }));
    if (!hasMoney(record.amounts?.base)) add(issue("error", "base_missing", "Falta una base positiva utilizable; no se sustituye por cero.", { sourceId: record.sourceId, action: "Confirma o captura manualmente la base con respaldo documental." }));
    if (categoryRequiresTransferredVat(record.category, schema) && !hasMoney(record.amounts?.ivaTransferred)) add(issue("error", "iva_missing", "La categoría gravada requiere un IVA trasladado confirmado; no se infiere desde cero.", { sourceId: record.sourceId, action: "Confirma o captura el IVA conforme al CFDI." }));
    if (record.quality === "derived_from_number" || Object.values(record.amounts || {}).some((amount) => amount?.quality === "derived_from_number")) add(issue("warning", "derived_amount", "Los importes provienen del análisis numérico actual y requieren cotejo con la evidencia original.", { sourceId: record.sourceId, action: "Coteja los importes antes de descargar." }));
    for (const warning of record.warnings || []) add(issue("warning", "source_warning", warning, { sourceId: record.sourceId, action: "Revisa el dato de origen antes de continuar." }));
  }

  const included = records.filter((record) => !record.excluded);
  const aggregates = aggregateDiotRecords(records);
  const global = summarizeGlobalEligibility(records, schema?.globalRule);
  const canDownload = included.length > 0 && errors.length === 0 && (warnings.length === 0 || warningsAcknowledged);
  const status = canDownload ? "ready" : errors.length ? "review" : "acknowledgement";
  return { errors, warnings, rowIssues, aggregates, global, included, canDownload, status };
}

export function diotStatusLabel(validation, downloadedAt = "") {
  if (downloadedAt) return "Descargada para revisión";
  if (!validation?.included?.length) return "Sin configurar";
  if (validation?.canDownload) return "Lista para descargar";
  return "Requiere revisión";
}
