import { renderToolGuidance, renderToolHeader } from "../tools/tool-shell.js";
import { formatMinor, normalizeMoney } from "../journal/money.js";
import { buildDiotReviewCsv, buildDiotReviewJson, downloadLocalArtifact, minorToDecimal } from "./exporter.js";
import { DIOT_REVIEW_SCHEMA, schemaLabel } from "./schema.js";
import { buildDiotSources, suggestedThirdParty } from "./sources.js";
import { diotStatusLabel, validateDiotPreparation } from "./validation.js";

const INITIAL_ASSISTANT_MESSAGE = "Puedo explicar el flujo de preparación, los campos pendientes o una incidencia. Abrir esta ayuda no comparte tus CFDI, terceros, importes ni archivos.";
const STEPS = Object.freeze([
  Object.freeze({ id: "context", number: "01", label: "Contexto" }),
  Object.freeze({ id: "sources", number: "02", label: "Fuentes" }),
  Object.freeze({ id: "classify", number: "03", label: "Clasificar" }),
  Object.freeze({ id: "review", number: "04", label: "Revisar" }),
  Object.freeze({ id: "download", number: "05", label: "Descargar" }),
]);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

function createRunId() {
  try { return `diot-${crypto.randomUUID()}`; } catch { return `diot-${Date.now()}`; }
}

function emptyState() {
  return {
    diotRunId: createRunId(), schema: DIOT_REVIEW_SCHEMA, activeStep: "context",
    context: { period: "", taxpayerType: "", companyRole: "unknown", currency: "MXN" },
    sources: [], sourcesFingerprint: "", selectedSourceIds: [], overrides: {}, filter: "all", handoffAnalysis: null, handoffSourceIds: [], handoffNotice: "",
    warningsAcknowledged: false, downloadedAt: "", notice: "", error: "",
    assistant: { open: false, pending: false, error: "", draft: "", requestId: 0, abortController: null, messages: [{ role: "assistant", text: INITIAL_ASSISTANT_MESSAGE }] },
  };
}

export const diotState = emptyState();

export function resetDiotWorkspace() {
  const next = emptyState();
  Object.assign(diotState, next);
}

export function acceptCfdiHandoff(snapshot) {
  if (!snapshot?.analysis || snapshot.target !== "diot" || !Array.isArray(snapshot.sourceIds)) return false;
  diotState.handoffAnalysis = snapshot.analysis;
  diotState.handoffSourceIds = [...snapshot.sourceIds];
  diotState.handoffNotice = `${snapshot.sourceIds.length} fuente(s) CFDI entregada(s) por acción explícita. Selecciona las que formarán esta preparación.`;
  diotState.sourcesFingerprint = "";
  diotState.selectedSourceIds = [];
  diotState.overrides = {};
  diotState.activeStep = "sources";
  return true;
}

function syncSources(analysis) {
  const sources = buildDiotSources({ analysis });
  const fingerprint = JSON.stringify(sources.map((source) => [source.sourceId, source.evidence?.uuid, source.currency, source.amounts?.base?.minor, source.amounts?.ivaTransferred?.minor]));
  if (fingerprint === diotState.sourcesFingerprint) return;
  const validIds = new Set(sources.map((source) => source.sourceId));
  diotState.sources = sources;
  diotState.sourcesFingerprint = fingerprint;
  diotState.selectedSourceIds = diotState.selectedSourceIds.filter((sourceId) => validIds.has(sourceId));
  diotState.overrides = Object.fromEntries(Object.entries(diotState.overrides).filter(([sourceId]) => validIds.has(sourceId)));
  diotState.warningsAcknowledged = false;
  diotState.downloadedAt = "";
}

function overrideFor(sourceId) {
  return diotState.overrides[sourceId] || {};
}

function setOverride(sourceId, key, value) {
  const existing = overrideFor(sourceId);
  diotState.overrides[sourceId] = { ...existing, [key]: value };
  diotState.warningsAcknowledged = false;
  diotState.downloadedAt = "";
}

function amountFromOverride(override, key, fallback, currency) {
  if (!Object.hasOwn(override, key)) return fallback;
  const value = String(override[key] ?? "").trim();
  return value ? normalizeMoney(value, currency, { quality: "manual_confirmed" }) : null;
}

function recordFromSource(source) {
  const override = overrideFor(source.sourceId);
  const partySuggestion = suggestedThirdParty(source, diotState.context.companyRole);
  const amounts = {
    base: amountFromOverride(override, "base", source.amounts?.base, source.currency),
    ivaTransferred: amountFromOverride(override, "ivaTransferred", source.amounts?.ivaTransferred, source.currency),
    ivaWithheld: amountFromOverride(override, "ivaWithheld", source.amounts?.ivaWithheld, source.currency),
  };
  const quality = Object.values(amounts).some((value) => value?.quality === "derived_from_number") ? "derived_from_number" : "manual_confirmed";
  return {
    ...source,
    thirdParty: {
      type: String(override.thirdPartyType || ""), identifier: String(override.partyIdentifier || ""), name: String(override.partyName || ""),
      country: String(override.country || ""), nationality: String(override.nationality || ""),
    },
    operationType: String(override.operationType || ""), category: String(override.category || ""), amounts, quality,
    excluded: Boolean(override.excluded), exclusionReason: String(override.exclusionReason || ""), partySuggestion,
  };
}

function selectedRecords() {
  const selected = new Set(diotState.selectedSourceIds);
  return diotState.sources.filter((source) => selected.has(source.sourceId)).map(recordFromSource);
}

function validation() {
  return validateDiotPreparation({ records: selectedRecords(), context: diotState.context, schema: diotState.schema, warningsAcknowledged: diotState.warningsAcknowledged });
}

function currentStepIndex() { return Math.max(0, STEPS.findIndex((step) => step.id === diotState.activeStep)); }
function statusClass(label) { return label === "Lista para descargar" ? "is-ready" : label === "Descargada para revisión" ? "is-ready" : label === "Requiere revisión" ? "is-review" : "is-error"; }

function renderStepper() {
  const index = currentStepIndex();
  return `<nav class="diot-stepper" aria-label="Etapas de DIOT asistida">${STEPS.map((step, stepIndex) => `<button type="button" class="${step.id === diotState.activeStep ? "is-active" : ""}" data-diot-step="${step.id}" aria-current="${step.id === diotState.activeStep ? "step" : "false"}"><b>${step.number}</b><span>${escapeHtml(step.label)}</span>${stepIndex < index ? "<i aria-hidden=\"true\">✓</i>" : ""}</button>`).join("")}</nav>`;
}

function renderContextStep() {
  const context = diotState.context;
  return `<section class="diot-stage" aria-labelledby="diot-context-title"><div class="diot-section-heading"><div><p class="eyebrow">01 · CONTEXTO DE PREPARACIÓN</p><h2 id="diot-context-title">Define qué revisarás</h2><p>El periodo, el papel de la empresa y el tipo de contribuyente requieren selección humana. No se infieren desde un perfil abierto ni desde el RFC de un CFDI.</p></div><span class="diot-count-pill">${escapeHtml(diotState.schema.schemaVersion)}</span></div><div class="diot-form-grid"><label class="diot-field"><span>Periodo mensual</span><input type="month" data-diot-context="period" value="${escapeHtml(context.period)}"/></label><label class="diot-field"><span>Tipo de contribuyente</span><select data-diot-context="taxpayerType"><option value="">Selecciona</option><option value="natural" ${context.taxpayerType === "natural" ? "selected" : ""}>Persona física · revisar obligación</option><option value="moral" ${context.taxpayerType === "moral" ? "selected" : ""}>Persona moral · revisar obligación</option><option value="other" ${context.taxpayerType === "other" ? "selected" : ""}>Otro contexto · revisar obligación</option></select></label><label class="diot-field"><span>Papel de la empresa en los CFDI</span><select data-diot-context="companyRole"><option value="unknown" ${context.companyRole === "unknown" ? "selected" : ""}>Sin confirmar</option><option value="receiver" ${context.companyRole === "receiver" ? "selected" : ""}>Receptor</option><option value="issuer" ${context.companyRole === "issuer" ? "selected" : ""}>Emisor</option></select></label><label class="diot-field"><span>Moneda de trabajo</span><select data-diot-context="currency"><option value="MXN" ${context.currency === "MXN" ? "selected" : ""}>MXN · sin conversión</option></select></label></div><p class="diot-inline-note">Esquema local: ${escapeHtml(diotState.schema.label)}. No es una plantilla oficial compatible y no habilita presentación ante el SAT.</p><div class="diot-download-actions"><button type="button" class="button button-primary" data-diot-next="sources">Confirmar contexto <span aria-hidden="true">→</span></button></div></section>`;
}

function renderSourceCard(source) {
  const selected = diotState.selectedSourceIds.includes(source.sourceId);
  const amount = source.amounts?.base ? formatMinor(source.amounts.base, source.currency) : "Base pendiente";
  const warning = source.warnings?.[0] ? `<small>${escapeHtml(source.warnings[0])}</small>` : "";
  return `<label class="diot-source-card ${selected ? "is-selected" : ""} ${source.warnings.length ? "has-warning" : ""}"><input type="checkbox" data-diot-source="${escapeHtml(source.sourceId)}" ${selected ? "checked" : ""}/><span class="diot-source-check" aria-hidden="true">${selected ? "✓" : ""}</span><span class="diot-source-copy"><b>${escapeHtml(source.label)}</b><small>${escapeHtml(source.date || "Fecha pendiente")} · ${escapeHtml(source.currency || "Moneda pendiente")} · ${escapeHtml(amount)}</small><small>${escapeHtml(source.evidence?.source || "Fuente local")}</small>${warning}</span></label>`;
}

function renderSourcesStep() {
  return `<section class="diot-stage" aria-labelledby="diot-sources-title"><div class="diot-section-heading"><div><p class="eyebrow">02 · FUENTES SELECCIONADAS</p><h2 id="diot-sources-title">Elige comprobantes para esta preparación</h2><p>Solo se usan los CFDI seleccionados en memoria. No se lee el historial, no se sube XML y abrir Nora no comparte estas fuentes.</p></div><span class="diot-count-pill">${diotState.selectedSourceIds.length} seleccionada(s)</span></div>${diotState.handoffNotice ? `<p class="diot-source-note" role="status">${escapeHtml(diotState.handoffNotice)}</p>` : ""}${diotState.sources.length ? `<div class="diot-source-grid">${diotState.sources.map(renderSourceCard).join("")}</div><p class="diot-source-note">Los importes actuales provienen de números ya analizados; se señalan como derivados y se cotejan antes de descargar.</p><div class="diot-download-actions"><button type="button" class="button button-quiet" data-diot-step="context">← Contexto</button><button type="button" class="button button-primary" data-diot-next="classify" ${diotState.selectedSourceIds.length ? "" : "disabled"}>Clasificar seleccionadas <span aria-hidden="true">→</span></button></div>` : `<div class="diot-empty"><b>No hay CFDI I/E seleccionables en esta sesión.</b><p>Analiza XML o ZIP localmente en el Analizador CFDI y vuelve a esta herramienta para elegirlos de forma explícita.</p><div class="island-empty-actions"><button type="button" class="button button-primary" data-section="cfdi">Abrir Analizador CFDI <span aria-hidden="true">→</span></button></div></div>`}</section>`;
}

function renderOptions(items, selected, placeholder = "Selecciona") {
  return `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `<option value="${escapeHtml(item.code)}" ${item.code === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}`;
}

function issueMarkup(record, result) {
  const issues = result.rowIssues.get(record.sourceId) || [];
  if (!issues.length) return `<span class="diot-status is-ready">Lista para revisar</span>`;
  const errors = issues.filter((item) => item.severity === "error");
  return `<ul class="diot-row-issues ${errors.length ? "is-error" : ""}">${issues.slice(0, 3).map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>`;
}

function fieldValue(record, key) {
  const override = overrideFor(record.sourceId);
  if (Object.hasOwn(override, key)) return String(override[key] ?? "");
  return minorToDecimal(record.amounts?.[key]);
}

function renderRecord(record, result) {
  const party = record.partySuggestion;
  const fieldsDisabled = record.excluded ? "disabled" : "";
  const issues = result.rowIssues.get(record.sourceId) || [];
  const hasError = issues.some((item) => item.severity === "error");
  const suggestion = party?.rfc || party?.name ? `<div class="diot-suggestion"><span>Contraparte disponible en el CFDI: <b>${escapeHtml(party.name || "Sin nombre")}</b>${party.rfc ? ` · ${escapeHtml(party.rfc)}` : ""}. Es una sugerencia; no se aplica sola.</span><button type="button" class="button button-quiet" data-diot-use-suggestion="${escapeHtml(record.sourceId)}">Usar sugerencia</button></div>` : `<div class="diot-suggestion">No hay contraparte suficiente en esta fuente. Completa los campos manualmente sin suponer identidad.</div>`;
  return `<article class="diot-row ${record.excluded ? "is-excluded" : ""} ${hasError ? "has-error" : issues.length ? "has-warning" : ""}" data-diot-record="${escapeHtml(record.sourceId)}"><div class="diot-row-heading"><div><b>${escapeHtml(record.label)}</b><small>${escapeHtml(record.evidence?.date || "Fecha pendiente")} · ${escapeHtml(record.currency || "Moneda pendiente")} · ${escapeHtml(record.evidence?.folio || "Sin folio")}</small></div>${issueMarkup(record, result)}</div>${suggestion}<div class="diot-row-grid"><label class="diot-field"><span>Tipo de tercero</span><select data-diot-field="thirdPartyType" data-source-id="${escapeHtml(record.sourceId)}" ${fieldsDisabled}>${renderOptions(diotState.schema.thirdPartyTypes, record.thirdParty.type, "Selecciona")}</select></label><label class="diot-field"><span>RFC / ID fiscal</span><input data-diot-field="partyIdentifier" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(record.thirdParty.identifier)}" maxlength="30" placeholder="No se infiere" ${fieldsDisabled}/></label><label class="diot-field"><span>Nombre del tercero</span><input data-diot-field="partyName" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(record.thirdParty.name)}" maxlength="160" placeholder="Revisión manual" ${fieldsDisabled}/></label><label class="diot-field"><span>Tipo de operación</span><select data-diot-field="operationType" data-source-id="${escapeHtml(record.sourceId)}" ${fieldsDisabled}>${renderOptions(diotState.schema.operationTypes, record.operationType, "Selecciona")}</select></label><label class="diot-field"><span>Categoría IVA</span><select data-diot-field="category" data-source-id="${escapeHtml(record.sourceId)}" ${fieldsDisabled}>${renderOptions(diotState.schema.categories, record.category, "Selecciona")}</select></label><label class="diot-field"><span>País (extranjero)</span><input data-diot-field="country" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(record.thirdParty.country)}" maxlength="80" ${fieldsDisabled}/></label><label class="diot-field"><span>Nacionalidad (extranjero)</span><input data-diot-field="nationality" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(record.thirdParty.nationality)}" maxlength="80" ${fieldsDisabled}/></label><label class="diot-field"><span>Calidad</span><input value="${record.quality === "derived_from_number" ? "Derivado · cotejar" : "Confirmado manualmente"}" readonly/></label></div><div class="diot-row-amounts"><label class="diot-field"><span>Base ${escapeHtml(record.currency || "")}</span><input inputmode="decimal" data-diot-field="base" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(fieldValue(record, "base"))}" ${fieldsDisabled}/></label><label class="diot-field"><span>IVA trasladado ${escapeHtml(record.currency || "")}</span><input inputmode="decimal" data-diot-field="ivaTransferred" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(fieldValue(record, "ivaTransferred"))}" placeholder="Faltante" ${fieldsDisabled}/></label><label class="diot-field"><span>IVA retenido ${escapeHtml(record.currency || "")}</span><input inputmode="decimal" data-diot-field="ivaWithheld" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(fieldValue(record, "ivaWithheld"))}" placeholder="No aplica o confirmar" ${fieldsDisabled}/></label></div><label class="diot-exclude"><input type="checkbox" data-diot-exclude="${escapeHtml(record.sourceId)}" ${record.excluded ? "checked" : ""}/> Excluir de esta preparación sin borrar el CFDI</label>${record.excluded ? `<label class="diot-field"><span>Motivo de exclusión</span><input data-diot-field="exclusionReason" data-source-id="${escapeHtml(record.sourceId)}" value="${escapeHtml(record.exclusionReason)}" maxlength="240" required/></label>` : ""}</article>`;
}

function recordMatchesFilter(record, result) {
  const issues = result.rowIssues.get(record.sourceId) || [];
  if (diotState.filter === "all") return true;
  if (diotState.filter === "missing-id") return issues.some((item) => ["rfc_missing", "foreign_details_missing", "party_type_missing"].includes(item.code));
  if (diotState.filter === "operation") return issues.some((item) => item.code === "operation_missing");
  if (diotState.filter === "iva") return issues.some((item) => item.code === "iva_missing" || item.code === "category_missing");
  if (diotState.filter === "duplicate") return issues.some((item) => item.code === "duplicate_source");
  if (diotState.filter === "currency") return issues.some((item) => item.code === "currency_incompatible");
  if (diotState.filter === "global") return record.thirdParty.type === "global";
  if (diotState.filter === "ready") return !issues.length && !record.excluded;
  return true;
}

function renderClassifyStep() {
  const records = selectedRecords();
  const result = validation();
  const filters = [["all", "Todos"], ["missing-id", "Sin RFC/ID"], ["operation", "Tipo pendiente"], ["iva", "IVA pendiente"], ["duplicate", "Duplicados"], ["currency", "Moneda"], ["global", "Proveedor global"], ["ready", "Listos"]];
  const visible = records.filter((record) => recordMatchesFilter(record, result));
  return `<section class="diot-stage" aria-labelledby="diot-classify-title"><div class="diot-section-heading"><div><p class="eyebrow">03 · CLASIFICACIÓN REVERSIBLE</p><h2 id="diot-classify-title">Completa lo que el CFDI no determina</h2><p>Las sugerencias no cambian una fila por sí mismas. Mantén el dato de origen, selecciona el tercero y confirma operación, categoría e importes.</p></div><span class="diot-count-pill">${records.length} fila(s) seleccionada(s)</span></div>${records.length ? `<div class="diot-toolbar" aria-label="Filtros de clasificación">${filters.map(([id, label]) => `<button type="button" class="diot-filter ${diotState.filter === id ? "is-active" : ""}" data-diot-filter="${id}" aria-pressed="${diotState.filter === id}">${escapeHtml(label)}</button>`).join("")}</div><div class="diot-rows">${visible.length ? visible.map((record) => renderRecord(record, result)).join("") : `<div class="diot-empty">No hay filas con este filtro.</div>`}</div><div class="diot-download-actions"><button type="button" class="button button-quiet" data-diot-step="sources">← Fuentes</button><button type="button" class="button button-primary" data-diot-next="review">Revisar incidencias <span aria-hidden="true">→</span></button></div>` : `<div class="diot-empty"><b>No seleccionaste fuentes.</b><p>Vuelve a Fuentes para elegir CFDI de esta sesión; no se cargarán documentos automáticamente.</p><div class="island-empty-actions"><button type="button" class="button button-primary" data-diot-step="sources">Volver a Fuentes <span aria-hidden="true">→</span></button></div></div>`}</section>`;
}

function renderIssue(item) {
  return `<article class="diot-issue ${item.severity === "error" ? "is-error" : ""}"><b>${escapeHtml(item.message)}</b><span>${escapeHtml(item.action)}</span></article>`;
}

function renderAggregate(item) {
  const name = item.thirdParty?.name || item.thirdParty?.identifier || "Tercero pendiente";
  const summary = [item.amounts.base ? `Base ${formatMinor(item.amounts.base, item.currency)}` : "Base pendiente", item.amounts.ivaTransferred ? `IVA ${formatMinor(item.amounts.ivaTransferred, item.currency)}` : "IVA pendiente"].join(" · ");
  return `<article class="diot-aggregate"><div><b>${escapeHtml(name)}</b><small>${escapeHtml(schemaLabel(diotState.schema.operationTypes, item.operationType))} · ${escapeHtml(schemaLabel(diotState.schema.categories, item.category))} · ${item.count} evidencia(s)</small></div><strong>${escapeHtml(summary)}</strong></article>`;
}

function renderReviewStep() {
  const result = validation();
  const issues = [...result.errors, ...result.warnings];
  return `<section class="diot-review-stage" aria-labelledby="diot-review-title"><div class="diot-section-heading"><div><p class="eyebrow">04 · REVISIÓN HUMANA</p><h2 id="diot-review-title">Resuelve incidencias antes de descargar</h2><p>Los totales se agrupan por tercero, operación, categoría y moneda. No mezclan divisas y se abren hasta su evidencia local.</p></div><span class="diot-status ${statusClass(diotStatusLabel(result, diotState.downloadedAt))}">${escapeHtml(diotStatusLabel(result, diotState.downloadedAt))}</span></div><div class="diot-review-grid"><section class="diot-issues"><h3>Incidencias · ${issues.length}</h3>${issues.length ? issues.map(renderIssue).join("") : `<p class="diot-source-note">No hay incidencias en las filas incluidas.</p>`}${result.warnings.length ? `<label class="diot-acknowledge"><input type="checkbox" data-diot-ack ${diotState.warningsAcknowledged ? "checked" : ""}/> Confirmo que cotejé las advertencias derivadas antes de descargar.</label>` : ""}</section><section class="diot-aggregates"><h3>Totales trazables</h3>${result.aggregates.length ? `<div class="diot-aggregate-list">${result.aggregates.map(renderAggregate).join("")}</div>` : `<p class="diot-source-note">No hay filas incluidas para agrupar.</p>`}</section><aside class="diot-global-card"><h3>Proveedor global · revisión separada</h3><p>${escapeHtml(result.global.message)}</p><p>Regla consultada: ${escapeHtml(result.global.rule.sourceLabel || "Pendiente")} · límite de referencia ${escapeHtml(String(result.global.rule.maximumPeriodSharePercent || ""))}% y ${escapeHtml(String(result.global.rule.maximumPerSupplierMx || ""))} por proveedor. No se aplica automáticamente.</p></aside></div><div class="diot-download-actions"><button type="button" class="button button-quiet" data-diot-step="classify">← Clasificar</button><button type="button" class="button button-primary" data-diot-next="download">Ver vista previa <span aria-hidden="true">→</span></button></div></section>`;
}

function safeFilenamePart(value) { return String(value || "pendiente").replace(/[^a-z0-9_-]/gi, "-").slice(0, 40); }

function renderDownloadStep() {
  const records = selectedRecords();
  const result = validation();
  const canDownload = result.canDownload;
  const period = diotState.context.period || "periodo-pendiente";
  const excluded = records.filter((record) => record.excluded).length;
  const generated = diotState.downloadedAt ? new Date(diotState.downloadedAt).toLocaleString("es-MX") : "Aún no descargado";
  return `<section class="diot-download-stage" aria-labelledby="diot-download-title"><div class="diot-section-heading"><div><p class="eyebrow">05 · DESCARGA LOCAL</p><h2 id="diot-download-title">Vista previa de revisión</h2><p>La descarga se genera en este navegador. No presenta, envía ni valida una declaración ante el SAT.</p></div><span class="diot-status ${statusClass(diotStatusLabel(result, diotState.downloadedAt))}">${escapeHtml(diotStatusLabel(result, diotState.downloadedAt))}</span></div><section class="diot-preview"><h3>Archivo de trabajo</h3><div class="diot-preview-grid"><div><span>Nombre</span><b>diot-revision-${escapeHtml(safeFilenamePart(period))}</b></div><div><span>Esquema</span><b>${escapeHtml(diotState.schema.schemaVersion)}</b></div><div><span>Filas incluidas</span><b>${result.included.length}</b></div><div><span>Excluidas con motivo</span><b>${excluded}</b></div><div><span>Incidencias restantes</span><b>${result.errors.length} bloqueo(s) · ${result.warnings.length} advertencia(s)</b></div><div><span>Última descarga local</span><b>${escapeHtml(generated)}</b></div></div></section><p class="diot-export-notice">Solo está disponible el CSV/JSON de trabajo. El esquema local no declara compatibilidad con el archivo oficial del SAT; la presentación, autenticación y acuse ocurren fuera de ContaIA.</p><div class="diot-download-actions"><button type="button" class="button button-quiet" data-diot-step="review">← Revisar</button><button type="button" class="button button-primary" data-diot-download="csv" ${canDownload ? "" : "disabled"}>Descargar para revisar · CSV</button><button type="button" class="button button-quiet" data-diot-download="json" ${canDownload ? "" : "disabled"}>Descargar copia JSON</button><button type="button" class="button button-quiet" disabled title="Requiere una plantilla oficial vigente verificada">Formato oficial compatible · no disponible</button></div>${diotState.error ? `<p class="diot-issue is-error" role="alert"><b>${escapeHtml(diotState.error)}</b></p>` : ""}${diotState.notice ? `<p class="diot-source-note" role="status">${escapeHtml(diotState.notice)}</p>` : ""}</section>`;
}

function renderAssistantPanel() {
  const assistant = diotState.assistant;
  return `<section class="diot-assistant ${assistant.open ? "is-open" : ""}" aria-label="Nora dentro de DIOT asistida"><button type="button" class="diot-assistant-toggle" data-diot-assistant-toggle aria-expanded="${assistant.open}" aria-controls="diot-assistant-body"><span class="diot-assistant-avatar" aria-hidden="true">N</span><span><b>Nora · Asistente abierto · DIOT asistida</b><small>Ayuda contextual · no comparte tus fuentes al abrir</small></span><span aria-hidden="true">${assistant.open ? "−" : "+"}</span></button>${assistant.open ? `<div id="diot-assistant-body" class="diot-assistant-body"><div class="diot-assistant-privacy">Puedes preguntar sobre estados, campos o pasos de revisión. Esta ayuda no recibe RFC, XML, importes, terceros, filas ni archivos automáticamente.</div><div class="diot-assistant-messages" aria-live="polite">${assistant.messages.slice(-8).map((message, index, list) => `<p class="diot-assistant-message ${message.role === "user" ? "is-user" : ""}"><b>${message.role === "user" ? "Tú" : "Nora"}</b><span ${assistant.pending && index === list.length - 1 && message.role === "assistant" ? "data-diot-assistant-stream" : ""}>${escapeHtml(message.text)}</span></p>`).join("")}</div>${assistant.error ? `<p class="diot-issue is-error" role="alert"><b>${escapeHtml(assistant.error)}</b></p>` : ""}<form data-diot-assistant-form><label class="diot-field"><span class="sr-only">Pregunta a Nora</span><textarea name="message" maxlength="2000" rows="2" placeholder="Escribe una duda sin pegar datos identificables…" ${assistant.pending ? "disabled" : ""}>${escapeHtml(assistant.draft)}</textarea></label><div class="diot-assistant-actions"><button type="submit" class="button button-primary" ${assistant.pending ? "disabled" : ""}>${assistant.pending ? "Nora está respondiendo…" : "Enviar consulta"}</button>${assistant.pending ? `<button type="button" class="button button-quiet" data-diot-assistant-cancel>Detener</button>` : ""}</div></form><p class="diot-assistant-disclaimer">La respuesta orienta; no modifica categorías, importes, estados, exclusiones ni archivos. No hay adjuntos ni voz en este panel.</p></div>` : ""}</section>`;
}

export function renderDiotWorkspace({ analysis = null } = {}) {
  syncSources(diotState.handoffAnalysis || analysis);
  const result = validation();
  const label = diotStatusLabel(result, diotState.downloadedAt);
  const step = STEPS.find(({ id }) => id === diotState.activeStep) || STEPS[0];
  const guidanceByStep = {
    context: { nextStep: "Completa periodo, tipo de contribuyente y papel de la empresa antes de clasificar.", pending: [!diotState.context.period && "Indicar periodo fiscal.", !diotState.context.taxpayerType && "Indicar tipo de contribuyente.", diotState.context.companyRole === "unknown" && "Confirmar el papel de la empresa en las operaciones."].filter(Boolean) },
    sources: { nextStep: "Selecciona las fuentes que formarían parte de esta preparación y continúa a su clasificación.", pending: diotState.selectedSourceIds.length ? [] : ["Seleccionar al menos una fuente CFDI."] },
    classify: { nextStep: "Revisa tercero, operación, categoría e importes de cada fila; después abre la revisión humana.", pending: result.errors.length ? [`Resolver ${result.errors.length} bloqueo(s) de validación.`] : [] },
    review: { nextStep: result.errors.length ? "Resuelve los bloqueos y vuelve a revisar los totales trazables." : "Coteja las incidencias y advertencias antes de abrir la vista previa.", pending: [...(result.errors.length ? [`${result.errors.length} bloqueo(s) pendiente(s).`] : []), ...(result.warnings.length && !diotState.warningsAcknowledged ? [`Reconocer ${result.warnings.length} advertencia(s) tras cotejarlas.`] : [])] },
    download: { nextStep: result.canDownload ? "Descarga el CSV o JSON de trabajo y verifica el archivo fuera de ContaIA." : "Vuelve a Revisión y resuelve los bloqueos antes de descargar.", pending: result.canDownload ? [] : [`${result.errors.length} bloqueo(s) de descarga pendiente(s).`] },
  }[step.id];
  const guidance = renderToolGuidance({ state: `${label} · paso ${step.number} de ${STEPS.length}`, ...guidanceByStep, boundary: "El CSV/JSON es un archivo de trabajo local, no un formato oficial ni una presentación ante el SAT; requiere revisión profesional." });
  const header = renderToolHeader({ id: "diot", eyebrow: "CONTAIA HERRAMIENTAS · IVA Y TERCEROS", title: "DIOT asistida", description: "Prepara, revisa y descarga; no presenta declaraciones. Revisa operaciones con terceros e IVA sin validar ante el SAT.", statusLabel: label, statusKind: label.includes("Lista") || label.includes("Descargada") ? "ready" : label === "Requiere revisión" ? "attention" : "info", className: "diot-header", actions: [{ label: "Volver a Herramientas", section: "tools", arrow: false }] });
  const content = diotState.activeStep === "context" ? renderContextStep() : diotState.activeStep === "sources" ? renderSourcesStep() : diotState.activeStep === "classify" ? renderClassifyStep() : diotState.activeStep === "review" ? renderReviewStep() : renderDownloadStep();
  return `<main id="contenido" class="content diot-page" data-diot-page tabindex="-1">${header}${guidance}<section class="diot-privacy-banner" aria-label="Privacidad de DIOT"><span aria-hidden="true">◉</span><p><b>Preparación local de esta sesión.</b> CFDI, terceros, importes y descargas permanecen en este navegador. La herramienta produce archivos de trabajo; no presenta declaraciones ni contacta al SAT.</p></section>${renderStepper()}${content}${renderAssistantPanel()}<footer class="diot-disclaimer"><b>Alcance de esta entrega</b><p>El esquema local está versionado para revisión y no es un formato oficial compatible. Confirma obligación, datos, categoría, importes y aplicación de facilidades con fuentes vigentes y revisión profesional.</p></footer></main>`;
}

function updateField(event, { render = true, onUpdate }) {
  const sourceId = event.target.dataset.sourceId;
  const key = event.target.dataset.diotField;
  if (!sourceId || !key) return false;
  setOverride(sourceId, key, event.target.value);
  if (render) onUpdate();
  return true;
}

function download(type, onUpdate) {
  const records = selectedRecords();
  const result = validation();
  if (!result.canDownload) {
    diotState.error = "Resuelve los bloqueos y reconoce las advertencias antes de descargar.";
    onUpdate();
    return;
  }
  const timestamp = new Date().toISOString();
  const period = safeFilenamePart(diotState.context.period || "periodo");
  const prefix = `diot-revision-${period}-${diotState.schema.schemaVersion}`;
  const content = type === "json"
    ? buildDiotReviewJson({ records, context: diotState.context, schema: diotState.schema, validation: result, generatedAt: timestamp })
    : buildDiotReviewCsv({ records, context: diotState.context, schema: diotState.schema, generatedAt: timestamp });
  const downloaded = downloadLocalArtifact({ content, type: type === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8", filename: `${prefix}.${type === "json" ? "json" : "csv"}` });
  diotState.downloadedAt = timestamp;
  diotState.error = downloaded ? "" : "Este navegador no permitió generar la descarga local.";
  diotState.notice = downloaded ? `Archivo ${type.toUpperCase()} generado localmente para revisión. No se presentó ni se envió una declaración.` : "No se pudo generar la descarga local.";
  onUpdate();
}

export function bindDiotWorkspace(app, { onUpdate = () => {}, onAssistantSend = () => {}, onAssistantCancel = () => {}, cleanupScope = null } = {}) {
  const listen = (type, handler) => cleanupScope?.addEventListener(app, type, handler) || app.addEventListener(type, handler);
  listen("change", (event) => {
    const context = event.target.closest?.("[data-diot-context]");
    if (context) { diotState.context[context.dataset.diotContext] = context.value; diotState.warningsAcknowledged = false; diotState.downloadedAt = ""; onUpdate(); return; }
    const source = event.target.closest?.("[data-diot-source]");
    if (source) { const sourceId = source.dataset.diotSource; diotState.selectedSourceIds = source.checked ? [...new Set([...diotState.selectedSourceIds, sourceId])] : diotState.selectedSourceIds.filter((id) => id !== sourceId); diotState.warningsAcknowledged = false; diotState.downloadedAt = ""; onUpdate(); return; }
    if (event.target.matches("[data-diot-field]")) { updateField(event, { render: true, onUpdate }); return; }
    if (event.target.matches("[data-diot-exclude]")) { setOverride(event.target.dataset.diotExclude, "excluded", event.target.checked); onUpdate(); return; }
    if (event.target.matches("[data-diot-ack]")) { diotState.warningsAcknowledged = event.target.checked; onUpdate(); }
  });
  listen("input", (event) => {
    if (event.target.matches("[data-diot-context]")) {
      diotState.context[event.target.dataset.diotContext] = event.target.value;
      diotState.warningsAcknowledged = false;
      diotState.downloadedAt = "";
      return;
    }
    if (event.target.matches("[data-diot-field]")) updateField(event, { render: false, onUpdate });
  });
  listen("click", (event) => {
    const step = event.target.closest("[data-diot-step]");
    if (step) { diotState.activeStep = step.dataset.diotStep; onUpdate(); return; }
    const next = event.target.closest("[data-diot-next]");
    if (next) { diotState.activeStep = next.dataset.diotNext; onUpdate(); return; }
    const filter = event.target.closest("[data-diot-filter]");
    if (filter) { diotState.filter = filter.dataset.diotFilter; onUpdate(); return; }
    const suggestion = event.target.closest("[data-diot-use-suggestion]");
    if (suggestion) { const source = diotState.sources.find((item) => item.sourceId === suggestion.dataset.diotUseSuggestion); const party = suggestedThirdParty(source, diotState.context.companyRole); if (party) { setOverride(source.sourceId, "partyIdentifier", party.rfc || ""); setOverride(source.sourceId, "partyName", party.name || ""); diotState.notice = "Sugerencia copiada para revisión; confirma tipo de tercero y clasificación antes de descargar."; onUpdate(); } return; }
    const action = event.target.closest("[data-diot-download]");
    if (action) { download(action.dataset.diotDownload, onUpdate); return; }
    if (event.target.closest("[data-diot-assistant-toggle]")) { diotState.assistant.open = !diotState.assistant.open; onUpdate(); return; }
    if (event.target.closest("[data-diot-assistant-cancel]")) { onAssistantCancel(); }
  });
  listen("submit", (event) => {
    const form = event.target.closest("[data-diot-assistant-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("[name='message']");
    const message = String(input?.value || "").trim();
    if (!message || diotState.assistant.pending) return;
    diotState.assistant.draft = "";
    onAssistantSend(message);
  });
}
