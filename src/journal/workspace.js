import { renderToolHeader } from "../tools/tool-shell.js";
import { createJournalCatalog, validateCatalog } from "./catalog.js";
import { buildJournalSources, sourceKindLabel } from "./sources.js";
import { cloneJournalRules, generateJournalDraft, ruleMap } from "./rules.js";
import { formatMinor } from "./money.js";
import { validateJournalDraft } from "./validation.js";
import { emptyLifecycleAccounts } from "./cfdi-policy.js";
import { generateLifecycleDrafts, mergeLifecycleDrafts } from "./journal-events.js";
import { stableSnapshotKey } from "./cfdi-lifecycle.js";
import { renderLifecycleConfiguration } from "./lifecycle-panel.js";
import { buildCfdiAudit, filterAuditFindings } from "./audit-engine.js";
import { createAuditFilters, DEFAULT_AUDIT_FILTERS, describeAuditScope, filterAuditSources } from "./audit-filters.js";
import { buildAuditReportSpec, buildAuditWorkbookDownload } from "./audit-exporter.js";

const INITIAL_ASSISTANT_MESSAGE = "Puedo explicar la plantilla, el catálogo o el motivo de un descuadre. Abrir esta ayuda no comparte tus fuentes; envía solo la duda que escribas explícitamente.";

function createCompanyLocalId() {
  try { return `company-${crypto.randomUUID()}`; } catch { return `company-local-${Date.now()}`; }
}

function emptyState() {
  return {
    companyLocalId: createCompanyLocalId(), companyName: "Empresa local sin nombre", period: "", companySide: "unknown", cashDirection: "unknown", currency: "MXN",
    activeTab: "drafts", selectedRuleId: "invoice-sale-example", selectedSourceIds: [], sources: [], sourcesFingerprint: "", bankFileName: "", handoffAnalysis: null, handoffSourceIds: [], handoffNotice: "", handoffBankRows: [], handoffBankSourceIds: [], handoffBankNotice: "",
    generationMode: "lifecycle", businessRfc: "", lifecycleAccounts: emptyLifecycleAccounts(), lifecycleConfigured: false,
    catalog: createJournalCatalog(), rules: cloneJournalRules(), drafts: [], activeDraftId: "", notice: "", error: "", catalogError: "", ruleError: "",
    creditNoteApplications: {}, auditFilters: createAuditFilters(), auditDecisions: {}, auditActiveFindingId: "", auditExportBusy: false, auditExportNotice: "", auditExportError: false,
    assistant: { open: false, pending: false, error: "", draft: "", requestId: 0, abortController: null, messages: [{ role: "assistant", text: INITIAL_ASSISTANT_MESSAGE }] },
  };
}

export const journalState = emptyState();

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const sourceAmount = (source) => source?.amount ? formatMinor(source.amount, source.amount.currency) : "Importe pendiente";
const ruleLabels = { issuer: "emisor", receiver: "receptor" };

export function resetJournalWorkspace() {
  journalState.assistant.abortController?.abort();
  const next = emptyState();
  Object.assign(journalState, next);
}

export function acceptCfdiHandoff(snapshot) {
  if (!snapshot?.analysis || snapshot.target !== "journal" || !Array.isArray(snapshot.sourceIds)) return false;
  journalState.handoffAnalysis = snapshot.analysis;
  journalState.handoffSourceIds = [...snapshot.sourceIds];
  journalState.handoffNotice = `${snapshot.sourceIds.length} fuente(s) CFDI entregada(s) por acción explícita. Selecciona las que formarán esta revisión.`;
  journalState.sourcesFingerprint = "";
  journalState.selectedSourceIds = [];
  journalState.drafts = journalState.drafts.filter((draft) => draft.status === "approved");
  journalState.activeTab = "drafts";
  return true;
}

export function acceptBankHandoff(snapshot) {
  if (!snapshot?.bankRows || snapshot.target !== "journal" || !Array.isArray(snapshot.sourceIds)) return false;
  journalState.handoffBankRows = snapshot.bankRows;
  journalState.handoffBankSourceIds = [...snapshot.sourceIds];
  journalState.handoffBankNotice = `${snapshot.sourceIds.length} movimiento(s) bancario(s) entregado(s) por acción explícita. Selecciona la evidencia que formará esta revisión.`;
  journalState.sourcesFingerprint = "";
  journalState.selectedSourceIds = [];
  journalState.drafts = journalState.drafts.filter((draft) => draft.status === "approved");
  journalState.activeTab = "drafts";
  return true;
}

function syncSources({ analysis = null, bankRows = [], bankFileName = "" } = {}) {
  const nextSources = buildJournalSources({ analysis, bankRows, bankFileName });
  const fingerprint = stableSnapshotKey(nextSources);
  if (fingerprint === journalState.sourcesFingerprint) return;
  const validIds = new Set(nextSources.map((source) => source.sourceId));
  journalState.sources = nextSources;
  journalState.sourcesFingerprint = fingerprint;
  journalState.bankFileName = bankFileName;
  journalState.selectedSourceIds = journalState.selectedSourceIds.filter((sourceId) => validIds.has(sourceId));
  journalState.creditNoteApplications = Object.fromEntries(Object.entries(journalState.creditNoteApplications).filter(([sourceId]) => validIds.has(sourceId)));
  journalState.drafts = journalState.drafts.filter((draft) => draft.status === "approved");
  if (journalState.drafts.length) journalState.notice = "Las fuentes cambiaron. Se conservaron los snapshots aprobados; genera nuevas propuestas para revisar el lote actual.";
  journalState.assistant.abortController?.abort();
  journalState.assistant = { ...emptyState().assistant, requestId: journalState.assistant.requestId + 1 };
  if (!journalState.drafts.some((draft) => draft.draftId === journalState.activeDraftId)) journalState.activeDraftId = journalState.drafts[0]?.draftId || "";
}

function selectedSources() {
  const selected = new Set(journalState.selectedSourceIds);
  return journalState.sources.filter((source) => selected.has(source.sourceId));
}

function accountOptions(selected = "") {
  return `<option value="" ${selected ? "" : "selected"}>Sin cuenta configurada</option>` + journalState.catalog.accounts.map((account) => `<option value="${escapeHtml(account.accountId)}" ${account.accountId === selected ? "selected" : ""} ${!account.active || !account.imputable ? "disabled" : ""}>${escapeHtml(account.codeText)} · ${escapeHtml(account.name)}${account.active ? "" : " · inactiva"}</option>`).join("");
}

function renderSourceCard(source) {
  const selected = journalState.selectedSourceIds.includes(source.sourceId);
  const warning = source.warnings?.length ? `<small class="journal-source-warning">${escapeHtml(source.warnings[0])}</small>` : "";
  return `<label class="journal-source-card ${selected ? "is-selected" : ""} ${source.warnings?.length ? "has-warning" : ""}"><input type="checkbox" data-journal-source="${escapeHtml(source.sourceId)}" ${selected ? "checked" : ""}/><span class="journal-source-check" aria-hidden="true">${selected ? "✓" : ""}</span><span class="journal-source-copy"><b>${escapeHtml(source.label)}</b><small>${escapeHtml(sourceKindLabel(source.kind))} · ${escapeHtml(source.date)} · ${escapeHtml(sourceAmount(source))}</small><small>${escapeHtml(source.evidence?.source || "Fuente local")}${source.evidence?.reference ? ` · Ref. ${escapeHtml(source.evidence.reference)}` : ""}</small>${warning}</span></label>`;
}

function renderSourceSelector() {
  const counts = journalState.sources.reduce((result, source) => { result[source.kind] = (result[source.kind] || 0) + 1; return result; }, {});
  return `<section class="journal-source-stage" aria-labelledby="journal-sources-title"><div class="journal-section-heading"><div><p class="eyebrow">01 · EVIDENCIA LOCAL</p><h2 id="journal-sources-title">Selecciona las fuentes de esta revisión</h2><p>Elige CFDI o movimientos concretos. Una fuente seleccionada no se modifica ni se envía al asistente.</p></div><span class="journal-count-pill">${journalState.selectedSourceIds.length} seleccionada(s) · ${journalState.sources.length} disponible(s)</span></div>${journalState.handoffNotice ? `<p class="journal-inline-note" role="status">${escapeHtml(journalState.handoffNotice)}</p>` : ""}
    ${journalState.sources.length ? `<div class="journal-source-toolbar"><span>${counts.invoice || 0} factura(s) · ${counts.payment || 0} pago(s)${counts.bank_movement ? ` · ${counts.bank_movement} movimiento(s)` : ""}</span><button type="button" class="button button-quiet" data-journal-clear-selection ${journalState.selectedSourceIds.length ? "" : "disabled"}>Limpiar selección</button></div><div class="journal-source-grid">${journalState.sources.map(renderSourceCard).join("")}</div>` : `<div class="journal-empty-source"><b>No hay fuentes seleccionables en esta sesión.</b><p>Analiza CFDI localmente o carga y compara un extracto en Conciliación bancaria. El catálogo y las reglas pueden revisarse sin fuentes.</p><div><button type="button" class="button button-quiet" data-section="cfdi">Abrir Analizador CFDI</button><button type="button" class="button button-quiet" data-section="reconciliation">Abrir Conciliación</button></div></div>`}
  </section>`;
}

function renderRuleSelector() {
  const rule = ruleMap(journalState.rules).get(journalState.selectedRuleId) || journalState.rules[0];
  if (!rule) return "";
  const sourceHint = rule.sourceKinds.map((kind) => sourceKindLabel(kind)).join(" + ");
  return `<section class="journal-rule-stage" aria-labelledby="journal-rule-title"><div class="journal-section-heading"><div><p class="eyebrow">02 · REGLA DECLARATIVA</p><h2 id="journal-rule-title">Define la plantilla de borrador</h2><p>La regla solo propone cuentas; no ejecuta código, no aplica impuestos y no contabiliza.</p></div><span class="journal-rule-version">v${Number(rule.version) || 1}</span></div><label class="journal-field"><span>Regla activa para esta generación</span><select data-journal-rule><option value="">Selecciona una regla</option>${journalState.rules.map((item) => `<option value="${escapeHtml(item.ruleId)}" ${item.ruleId === rule.ruleId ? "selected" : ""} ${item.enabled === false ? "disabled" : ""}>${escapeHtml(item.title)}${item.enabled === false ? " · desactivada" : ""}</option>`).join("")}</select></label><div class="journal-rule-description"><b>${escapeHtml(rule.title)}</b><span>${escapeHtml(rule.description)}</span><small>Fuentes requeridas: ${escapeHtml(sourceHint)} · papel: ${escapeHtml(ruleLabels[rule.requiredCompanySide] || "confirmación explícita")}</small></div><div class="journal-form-grid"><label class="journal-field"><span>Papel de la empresa</span><select data-journal-company-side><option value="unknown" ${journalState.companySide === "unknown" ? "selected" : ""}>No confirmado</option><option value="issuer" ${journalState.companySide === "issuer" ? "selected" : ""}>Emisor</option><option value="receiver" ${journalState.companySide === "receiver" ? "selected" : ""}>Receptor</option></select></label><label class="journal-field"><span>Movimiento bancario</span><select data-journal-cash-direction><option value="unknown" ${journalState.cashDirection === "unknown" ? "selected" : ""}>No aplica / no confirmado</option><option value="incoming" ${journalState.cashDirection === "incoming" ? "selected" : ""}>Ingreso</option><option value="outgoing" ${journalState.cashDirection === "outgoing" ? "selected" : ""}>Egreso</option></select></label><label class="journal-field"><span>Periodo de revisión</span><input type="month" data-journal-period value="${escapeHtml(journalState.period)}"/></label></div><p class="journal-inline-note">Confirma empresa, periodo y dirección según la evidencia. El motor no infiere estos valores desde RFC, signo o tipo I/E/P.</p></section>`;
}

function statusLabel(status) {
  return ({ review: "Requiere revisión", ready: "Listo para aprobar", approved: "Aprobada localmente", rejected: "Rechazada", superseded: "Sustituida" })[status] || "Borrador";
}

function statusClass(status) { return ({ review: "is-review", ready: "is-ready", approved: "is-approved", rejected: "is-rejected", superseded: "is-superseded" })[status] || "is-draft"; }

function getValidation(draft) {
  const validation = validateJournalDraft(draft, draft.status === "approved" && draft.catalogSnapshot ? draft.catalogSnapshot : journalState.catalog);
  if (draft.eventKey && draft.status !== "approved") {
    if (draft.businessRfc !== journalState.businessRfc.trim().toUpperCase() || draft.period !== journalState.period
      || stableSnapshotKey(draft.accountsSnapshot) !== stableSnapshotKey(journalState.lifecycleAccounts)
      || draft.catalogVersion !== journalState.catalog.version) {
      validation.errors.push("El contexto o las cuentas cambiaron; vuelve a generar la propuesta antes de aprobar.");
      validation.canApprove = false;
      validation.status = "review";
    }
  }
  if (["rejected", "superseded", "approved"].includes(draft.status)) validation.canApprove = false;
  return validation;
}

function renderDraftList() {
  if (!journalState.drafts.length) return `<div class="journal-empty-drafts"><span aria-hidden="true">P</span><h3>Aún no hay borradores</h3><p>Selecciona fuentes, elige una regla y genera una propuesta local para revisarla aquí.</p></div>`;
  return `<div class="journal-draft-list" aria-label="Borradores locales">${journalState.drafts.map((draft) => { const validation = getValidation(draft); const effective = ["approved", "rejected", "superseded"].includes(draft.status) ? draft.status : validation.status; return `<button type="button" class="journal-draft-item ${draft.draftId === journalState.activeDraftId ? "is-active" : ""}" data-journal-draft="${escapeHtml(draft.draftId)}"><span class="journal-draft-icon" aria-hidden="true">${effective === "approved" ? "✓" : effective === "ready" ? "!" : "P"}</span><span><b>Revisión ${draft.revision}</b><small>${escapeHtml(draft.sources?.map((source) => source.label).join(" · ") || "Sin fuentes")}</small><em class="journal-status ${statusClass(draft.status === "approved" ? "approved" : effective)}">${statusLabel(draft.status === "approved" ? "approved" : effective)}</em></span></button>`; }).join("")}</div>`;
}

function renderDraftDetail() {
  const draft = journalState.drafts.find((item) => item.draftId === journalState.activeDraftId);
  if (!draft) return `<div class="journal-detail-empty"><p>Selecciona un borrador para ver sus partidas y validaciones.</p></div>`;
  const validation = getValidation(draft);
  const effectiveStatus = ["approved", "rejected", "superseded"].includes(draft.status) ? draft.status : validation.status;
  const errors = validation.errors.length ? `<div class="journal-validation journal-validation--error" role="alert"><b>Bloqueos de aprobación</b><ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : "";
  const warnings = validation.warnings.length ? `<div class="journal-validation journal-validation--warning"><b>Advertencias de revisión</b><ul>${validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul><label class="journal-acknowledge"><input type="checkbox" data-journal-ack ${draft.warningsAcknowledged ? "checked" : ""} ${draft.status === "approved" ? "disabled" : ""}/> Confirmo que revisé estas advertencias antes de aprobar.</label></div>` : "";
  const totals = validation.totalsByCurrency.length ? `<div class="journal-totals">${validation.totalsByCurrency.map((total) => `<div><span>Total cargos</span><b>${escapeHtml(formatMinor({ minor: total.debit, scale: 2 }, total.currency))}</b></div><div><span>Total abonos</span><b>${escapeHtml(formatMinor({ minor: total.credit, scale: 2 }, total.currency))}</b></div><div class="${total.difference === "0" ? "is-balanced" : "is-unbalanced"}"><span>Diferencia</span><b>${escapeHtml(formatMinor({ minor: total.difference, scale: 2 }, total.currency))}</b></div>`).join("")}</div>` : "";
  return `<article class="journal-draft-detail" aria-labelledby="journal-detail-title"><div class="journal-detail-heading"><div><p class="eyebrow">03 · REVISIÓN HUMANA · REVISIÓN ${draft.revision}</p><h3 id="journal-detail-title">${escapeHtml(draft.sources?.map((source) => source.label).join(" + ") || "Borrador local")}</h3><p>Regla ${escapeHtml(draft.ruleId)} · ${escapeHtml(draft.businessRfc || "Empresa local")} · ${escapeHtml(draft.period || "Periodo pendiente")} · ${escapeHtml(draft.eventKind || "Plantilla manual")}</p></div><span class="journal-status ${statusClass(effectiveStatus)}">${statusLabel(effectiveStatus)}</span></div><div class="journal-evidence-strip">${(draft.sources || []).map((source) => `<span>${escapeHtml(source.label)} · ${escapeHtml(source.eventKind)}</span>`).join("")}</div><div class="journal-lines-wrap"><table class="journal-lines"><thead><tr><th>Cuenta</th><th>Concepto</th><th>Cargo</th><th>Abono</th></tr></thead><tbody>${draft.lines.map((line, index) => `<tr><td><select data-journal-line-account data-draft-id="${escapeHtml(draft.draftId)}" data-line-index="${index}" ${draft.status === "approved" ? "disabled" : ""}>${accountOptions(line.accountId)}</select></td><td>${escapeHtml(line.concept)}</td><td>${line.side === "debit" ? escapeHtml(line.amount ? formatMinor(line.amount, line.amount.currency) : "—") : "—"}</td><td>${line.side === "credit" ? escapeHtml(line.amount ? formatMinor(line.amount, line.amount.currency) : "—") : "—"}</td></tr>`).join("")}</tbody></table></div>${totals}${errors}${warnings}<div class="journal-detail-actions">${draft.status !== "approved" ? `<button type="button" class="button button-primary" data-journal-approve data-draft-id="${escapeHtml(draft.draftId)}" ${validation.canApprove ? "" : "disabled"}>${effectiveStatus === "ready" ? "Aprobar esta revisión" : "Resolver bloqueos para aprobar"}</button><button type="button" class="button button-quiet" data-journal-reject data-draft-id="${escapeHtml(draft.draftId)}">Rechazar borrador</button>` : `<span class="journal-approved-note">Aprobada localmente el ${escapeHtml(new Date(draft.approvedAt).toLocaleString("es-MX"))}. No se contabilizó.</span>`}</div><p class="journal-detail-disclaimer">La aprobación solo confirma este snapshot en esta pestaña. No crea un asiento, no actualiza saldos y no se envía a un ERP.</p></article>`;
}

function renderDraftsTab() {
  const modeSelector = `<label class="journal-field journal-generation-mode"><span>Modo de generación</span><select data-journal-generation-mode><option value="lifecycle" ${journalState.generationMode === "lifecycle" ? "selected" : ""}>Ciclo CFDI · PUE, PPD y complementos</option><option value="manual" ${journalState.generationMode === "manual" ? "selected" : ""}>Plantillas manuales de revisión</option></select></label>`;
  const notices = `${journalState.error ? `<p class="journal-inline-error" role="alert">${escapeHtml(journalState.error)}</p>` : ""}${journalState.notice ? `<p class="journal-inline-note" role="status">${escapeHtml(journalState.notice)}</p>` : ""}`;
  return `${notices}${renderSourceSelector()}${modeSelector}${journalState.generationMode === "lifecycle" ? renderLifecycleConfiguration(journalState) : renderRuleSelector()}<section class="journal-review-stage" aria-labelledby="journal-review-title"><div class="journal-section-heading"><div><p class="eyebrow">03 · BORRADORES LOCALES</p><h2 id="journal-review-title">Revisa antes de aprobar</h2></div><button type="button" class="button button-primary" data-journal-generate ${journalState.selectedSourceIds.length ? "" : "disabled"}>${journalState.generationMode === "lifecycle" ? "Generar pólizas del ciclo CFDI" : "Generar borrador"}</button></div><div class="journal-review-layout"><div>${renderDraftList()}</div><div>${renderDraftDetail()}</div></div></section>`;
}

function auditDecisionState() {
  return {
    ...journalState.auditDecisions,
    ...Object.fromEntries(Object.entries(journalState.creditNoteApplications).map(([sourceId, decision]) => [`credit:${sourceId}`, decision])),
  };
}

function buildAuditView(kind = "global") {
  const available = selectedSources().filter((source) => source.cfdi);
  const filters = kind === "partial" ? journalState.auditFilters : DEFAULT_AUDIT_FILTERS;
  const scoped = kind === "partial" ? filterAuditSources(available, filters, journalState.businessRfc) : available;
  return {
    sources: scoped,
    audit: buildCfdiAudit({ sources: journalState.sources, scopeSourceIds: scoped.map((source) => source.sourceId), availableSourceIds: available.map((source) => source.sourceId), businessRfc: journalState.businessRfc, period: journalState.period, drafts: journalState.drafts, decisions: auditDecisionState() }),
  };
}

function auditSeverityLabel(severity) {
  return ({ blocking: "Bloqueo", high: "Alto", review: "Revisión", info: "Información" })[severity] || "Revisión";
}

function auditStatusLabel(status) {
  return ({ open: "Abierto", acknowledged: "Reconocido", not_applicable: "No aplicable", excluded: "Excluido", out_of_scope: "Fuera de alcance" })[status] || "Abierto";
}

function renderAuditFindingRows(audit, filters = DEFAULT_AUDIT_FILTERS) {
  const findings = filterAuditFindings(audit.findings, filters);
  if (!findings.length) return `<div class="journal-audit-empty"><b>No hay hallazgos para este alcance y filtros.</b><p>${audit.scope.sourceCount ? "Esto no equivale a validación SAT ni a una conclusión de cumplimiento." : "Selecciona fuentes y confirma el contexto para iniciar una revisión."}</p></div>`;
  return `<div class="journal-audit-findings" aria-label="Hallazgos de auditoría">${findings.map((entry) => `<article class="journal-audit-finding is-${escapeHtml(entry.severity)} ${entry.findingId === journalState.auditActiveFindingId ? "is-active" : ""}"><div><span class="journal-audit-severity">${escapeHtml(auditSeverityLabel(entry.severity))}</span><span class="journal-audit-code">${escapeHtml(entry.code)}</span><span class="journal-audit-status">${escapeHtml(auditStatusLabel(entry.status))}</span></div><b>${escapeHtml(entry.message)}</b><p>${escapeHtml(entry.source.label)} · ${escapeHtml(entry.source.date || "fecha pendiente")} · ${escapeHtml(entry.source.currency || "moneda pendiente")}</p><button type="button" class="button button-quiet" data-journal-finding="${escapeHtml(entry.findingId)}">Ver evidencia</button></article>`).join("")}</div>`;
}

function renderFindingDetail(audit) {
  const finding = audit.findings.find((entry) => entry.findingId === journalState.auditActiveFindingId);
  if (!finding) return `<div class="journal-audit-detail-empty"><b>Selecciona un hallazgo para ver la evidencia.</b><p>Reconocer una advertencia no modifica el XML ni concluye su estado fiscal.</p></div>`;
  const selectedStatus = journalState.auditDecisions[finding.findingId]?.status || finding.status || "open";
  const selectedNote = journalState.auditDecisions[finding.findingId]?.note || finding.decisionNote || "";
  const related = finding.related?.length ? `<ul>${finding.related.map((entry) => `<li>${escapeHtml(entry.label)} · ${escapeHtml(entry.uuid || "UUID pendiente")}</li>`).join("")}</ul>` : `<p>Sin documento relacionado visible en este alcance.</p>`;
  return `<article class="journal-finding-detail" aria-labelledby="journal-finding-detail-title"><div class="journal-detail-heading"><div><p class="eyebrow">EVIDENCIA LOCAL · ${escapeHtml(finding.code)}</p><h3 id="journal-finding-detail-title">${escapeHtml(finding.message)}</h3><p><span class="journal-status is-${escapeHtml(finding.severity)}">${escapeHtml(auditSeverityLabel(finding.severity))}</span> · ${escapeHtml(auditStatusLabel(finding.status))}</p></div></div><dl class="journal-finding-evidence"><div><dt>Documento</dt><dd>${escapeHtml(finding.source.label)} · ${escapeHtml(finding.source.uuid || "UUID pendiente")}</dd></div><div><dt>Observado</dt><dd>${escapeHtml(finding.observed || "No disponible")}</dd></div><div><dt>Esperado</dt><dd>${escapeHtml(finding.expected || "Revisión humana")}</dd></div><div><dt>Origen</dt><dd>${escapeHtml(finding.evidenceRefs?.map((entry) => `${entry.origin}${entry.reference ? ` · ${entry.reference}` : ""}`).join(" | ") || "Fuente local")}</dd></div></dl><div class="journal-finding-related"><b>Documentos y ocurrencias relacionadas</b>${related}</div><p class="journal-finding-action"><b>Acción sugerida:</b> ${escapeHtml(finding.recommendedAction)}</p><form class="journal-finding-decision" data-audit-decision-form data-finding-id="${escapeHtml(finding.findingId)}" data-source-id="${escapeHtml(finding.source.sourceId)}"><label class="journal-field"><span>Decisión humana local</span><select name="status"><option value="acknowledged" ${selectedStatus === "acknowledged" ? "selected" : ""}>Reconocer advertencia</option><option value="not_applicable" ${selectedStatus === "not_applicable" ? "selected" : ""}>Marcar no aplicable</option><option value="excluded" ${selectedStatus === "excluded" ? "selected" : ""}>Excluir de esta preparación</option></select></label><label class="journal-field"><span>Motivo de la decisión</span><textarea name="note" maxlength="500" required placeholder="Explica la revisión local antes de guardar…">${escapeHtml(selectedNote)}</textarea></label><button type="submit" class="button button-primary">Guardar decisión local</button></form><p class="journal-detail-disclaimer">Una decisión local no corrige la fuente, no consulta al SAT y no aprueba una póliza bloqueada.</p></article>`;
}

function renderAuditSummary(audit) {
  const severity = audit.summary.bySeverity || {};
  const coverage = audit.summary.coverage || {};
  return `<div class="journal-audit-summary"><article><span>Fuentes</span><b>${audit.scope.sourceCount}</b><small>${audit.scope.documentCount} documentos · ${audit.scope.paymentCount} pagos</small></article><article class="is-blocking"><span>Bloqueos</span><b>${severity.blocking || 0}</b><small>Hallazgos abiertos</small></article><article class="is-review"><span>Revisiones</span><b>${(severity.high || 0) + (severity.review || 0)}</b><small>${audit.summary.outOfScopeCount || 0} fuera de alcance</small></article><article><span>Cobertura local</span><b>${coverage.recognized + coverage.liquidated + coverage.adjusted}</b><small>${coverage.invoices || 0} I · ${coverage.ppdInvoices || 0} PPD · ${coverage.adjustments || 0} E</small></article></div>`;
}

function renderGlobalAuditTab() {
  const { audit } = buildAuditView("global");
  const isEmpty = audit.status === "empty";
  return `<section class="journal-audit-stage" aria-labelledby="journal-global-audit-title"><div class="journal-section-heading"><div><p class="eyebrow">04 · AUDITORÍA GLOBAL · LOCAL</p><h2 id="journal-global-audit-title">Revisión de ciclo CFDI</h2><p>Alcance: ${escapeHtml(`${audit.scope.sourceCount} fuentes · ${audit.scope.documentCount} documentos · ${audit.scope.paymentCount} pagos · ${audit.scope.adjustmentCount} ajustes`)}.</p></div><div class="journal-audit-actions"><button type="button" class="button button-quiet" data-audit-refresh>Reconstruir auditoría</button><button type="button" class="button button-primary" data-audit-export ${isEmpty || journalState.auditExportBusy ? "disabled" : ""}>${journalState.auditExportBusy ? "Preparando reporte…" : "Descargar reporte de revisión"}</button></div></div><p class="journal-audit-policy">Política: ${escapeHtml(audit.policy.label)} · ${escapeHtml(audit.policy.version)}. ${escapeHtml(audit.policy.disclaimer)}</p>${journalState.auditExportNotice ? `<p class="journal-inline-${journalState.auditExportError ? "error" : "note"}" role="status">${escapeHtml(journalState.auditExportNotice)}</p>` : ""}${isEmpty ? `<div class="journal-audit-empty"><b>No hay fuentes seleccionadas.</b><p>Selecciona CFDI en Borradores, confirma RFC y periodo; una auditoría vacía nunca se presenta como «0 incidencias».</p></div>` : `${renderAuditSummary(audit)}<div class="journal-audit-layout"><div>${renderAuditFindingRows(audit)}</div><div>${renderFindingDetail(audit)}</div></div>`}</section>`;
}

function renderPartialAuditTab() {
  const filters = journalState.auditFilters;
  const { audit, sources } = buildAuditView("partial");
  return `<section class="journal-audit-stage" aria-labelledby="journal-partial-audit-title"><div class="journal-section-heading"><div><p class="eyebrow">05 · AUDITORÍA PARCIAL · LOCAL</p><h2 id="journal-partial-audit-title">Filtra sin alterar la auditoría global</h2><p>Alcance parcial: ${escapeHtml(describeAuditScope(sources, filters))}.</p></div><button type="button" class="button button-quiet" data-audit-reset>Restablecer filtros</button></div><form class="journal-audit-filter-form" data-audit-filter-form><div class="journal-form-grid"><label class="journal-field"><span>Periodo</span><input type="month" name="period" value="${escapeHtml(filters.period)}"/></label><label class="journal-field"><span>Papel</span><select name="role"><option value="all">Todos</option><option value="issuer" ${filters.role === "issuer" ? "selected" : ""}>Empresa emisora</option><option value="receiver" ${filters.role === "receiver" ? "selected" : ""}>Empresa receptora</option></select></label><label class="journal-field"><span>Tipo CFDI</span><select name="type"><option value="all">Todos</option>${["I", "E", "P"].map((type) => `<option value="${type}" ${filters.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label><label class="journal-field"><span>Método</span><select name="method"><option value="all">Todos</option><option value="PUE" ${filters.method === "PUE" ? "selected" : ""}>PUE</option><option value="PPD" ${filters.method === "PPD" ? "selected" : ""}>PPD</option></select></label><label class="journal-field"><span>Moneda</span><select name="currency"><option value="all">Todas</option><option value="MXN" ${filters.currency === "MXN" ? "selected" : ""}>MXN</option></select></label><label class="journal-field"><span>Tercero / RFC</span><input name="party" maxlength="13" value="${escapeHtml(filters.party)}" placeholder="RFC exacto"/></label><label class="journal-field"><span>Relación</span><select name="relation"><option value="all">Todas</option><option value="with_payment" ${filters.relation === "with_payment" ? "selected" : ""}>Con complemento</option><option value="ppd_without_payment" ${filters.relation === "ppd_without_payment" ? "selected" : ""}>PPD sin complemento local</option><option value="credit_note" ${filters.relation === "credit_note" ? "selected" : ""}>Notas de crédito</option><option value="payment" ${filters.relation === "payment" ? "selected" : ""}>Complementos de pago</option></select></label><label class="journal-field"><span>Severidad</span><select name="severity"><option value="all">Todas</option>${["blocking", "high", "review", "info"].map((severity) => `<option value="${severity}" ${filters.severity === severity ? "selected" : ""}>${auditSeverityLabel(severity)}</option>`).join("")}</select></label><label class="journal-field"><span>Estado</span><select name="status"><option value="all">Todos</option>${["open", "acknowledged", "not_applicable", "excluded", "out_of_scope"].map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${auditStatusLabel(status)}</option>`).join("")}</select></label></div><button type="submit" class="button button-primary">Aplicar filtros</button></form>${audit.status === "empty" ? `<div class="journal-audit-empty"><b>No hay fuentes seleccionadas dentro de este filtro.</b><p>El resultado parcial no cambia el resultado global ni los borradores existentes.</p></div>` : `${renderAuditSummary(audit)}<div class="journal-audit-layout"><div>${renderAuditFindingRows(audit, filters)}</div><div>${renderFindingDetail(audit)}</div></div>`}</section>`;
}

function renderCreditNotesTab() {
  const notes = journalState.sources.filter((source) => source.cfdi?.tipo === "E");
  const selectedCount = notes.filter((source) => journalState.selectedSourceIds.includes(source.sourceId)).length;
  return `<section class="journal-adjustment-stage" aria-labelledby="journal-adjustment-title"><div class="journal-section-heading"><div><p class="eyebrow">03B · AJUSTES · CFDI E</p><h2 id="journal-adjustment-title">Notas de crédito con aplicación humana</h2><p>Una nota de crédito es un ajuste; nunca se convierte automáticamente en efectivo, transferencia, condonación ni complemento de pago.</p></div><button type="button" class="button button-primary" data-journal-generate-adjustments ${selectedCount ? "" : "disabled"}>Generar ajustes seleccionados</button></div>${notes.length ? `<div class="journal-credit-notes">${notes.map((source) => { const item = source.cfdi; const selected = journalState.selectedSourceIds.includes(source.sourceId); const decision = journalState.creditNoteApplications[source.sourceId] || {}; const relations = (item.cfdiRelations || []).flatMap((relation) => relation.uuids || []); return `<article class="journal-credit-note ${selected ? "is-selected" : ""}"><div class="journal-credit-note-head"><div><span>CFDI E · ${escapeHtml(item.tipoRelacion || "relación pendiente")}</span><h3>${escapeHtml(source.label)}</h3><p>${escapeHtml(item.rawAmounts?.total || "importe pendiente")} ${escapeHtml(item.moneda || "")} · Relaciona: ${escapeHtml(relations.join(", ") || "sin UUID relacionado")}</p></div><span class="journal-status ${selected ? "is-review" : "is-draft"}">${selected ? "Seleccionada" : "Fuera de preparación"}</span></div>${selected ? `<form data-credit-note-form data-source-id="${escapeHtml(source.sourceId)}"><div class="journal-form-grid"><label class="journal-field"><span>Tipo de ajuste</span><input value="Nota de crédito · relación ${escapeHtml(item.tipoRelacion || "pendiente")}" disabled/></label><label class="journal-field"><span>Aplicación obligatoria</span><select name="application"><option value="">Selecciona una aplicación</option><option value="reduce_balance" ${decision.application === "reduce_balance" ? "selected" : ""}>Reducir saldo de cliente/proveedor</option><option value="refund" ${decision.application === "refund" ? "selected" : ""}>Devolución confirmada localmente</option><option value="compensation" ${decision.application === "compensation" ? "selected" : ""}>Compensación confirmada localmente</option></select></label></div><label class="journal-field"><span>Nota de revisión local</span><textarea name="note" maxlength="500" placeholder="Describe la evidencia; no se envía ni modifica el CFDI…">${escapeHtml(decision.note || "")}</textarea></label><button type="submit" class="button button-primary">Guardar decisión local</button></form>` : `<p class="journal-inline-note">Selecciona esta nota y su CFDI relacionado en Borradores antes de definir la aplicación. Si la relación está fuera de la selección, la auditoría lo mostrará como fuera de alcance.</p>`}</article>`; }).join("")}</div>` : `<div class="journal-audit-empty"><b>No hay CFDI E disponibles en esta sesión.</b><p>Las notas de crédito aparecerán aquí al analizar XML locales de tipo E.</p></div>`}<p class="journal-detail-disclaimer">La decisión queda solo en memoria. Si el saldo no es determinable, el motor mantiene el ajuste en revisión y no lo contabiliza.</p></section>`;
}

function renderCatalogTab() {
  const catalogErrors = validateCatalog(journalState.catalog);
  return `<section class="journal-config-stage" aria-labelledby="journal-catalog-title"><div class="journal-section-heading"><div><p class="eyebrow">CATÁLOGO LOCAL · EMPRESA</p><h2 id="journal-catalog-title">Cuentas de esta sesión</h2><p>Los códigos son internos y ficticios; no representan el catálogo oficial del SAT.</p></div><span class="journal-count-pill">v${journalState.catalog.version} · ${journalState.catalog.accounts.length} cuentas</span></div>${catalogErrors.length ? `<div class="journal-validation journal-validation--error" role="alert"><b>Catálogo con errores</b><ul>${catalogErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : ""}<div class="journal-account-table"><table><thead><tr><th>Código</th><th>Nombre</th><th>Naturaleza</th><th>Moneda</th><th>Recibe partidas</th><th>Estado</th></tr></thead><tbody>${journalState.catalog.accounts.map((account) => `<tr><td><b>${escapeHtml(account.codeText)}</b></td><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.nature)}</td><td>${escapeHtml(account.currencyCode || "Sin definir")}</td><td>${account.imputable ? "Sí" : "No"}</td><td><button type="button" class="journal-account-toggle ${account.active ? "is-active" : ""}" data-journal-account-toggle="${escapeHtml(account.accountId)}">${account.active ? "Activa" : "Inactiva"}</button></td></tr>`).join("")}</tbody></table></div><form class="journal-account-form" data-journal-account-form><h3>Agregar cuenta local</h3><div class="journal-form-grid"><label class="journal-field"><span>Código</span><input name="codeText" maxlength="40" required placeholder="601-SERVICIOS"/></label><label class="journal-field"><span>Nombre</span><input name="name" maxlength="120" required placeholder="Servicios"/></label><label class="journal-field"><span>Naturaleza</span><select name="nature"><option value="deudora">Deudora</option><option value="acreedora">Acreedora</option></select></label><label class="journal-field"><span>Moneda</span><input name="currencyCode" maxlength="3" value="MXN" pattern="[A-Za-z]{3}" required/></label></div><button type="submit" class="button button-primary">Agregar a esta sesión</button>${journalState.catalogError ? `<p class="journal-inline-error" role="alert">${escapeHtml(journalState.catalogError)}</p>` : ""}</form></section>`;
}

function renderRulesTab() {
  return `<section class="journal-config-stage" aria-labelledby="journal-rules-title"><div class="journal-section-heading"><div><p class="eyebrow">REGLAS DECLARATIVAS · SIN CÓDIGO</p><h2 id="journal-rules-title">Plantillas editables</h2><p>Editar una cuenta afecta nuevas generaciones; no reescribe un snapshot aprobado.</p></div><span class="journal-count-pill">${journalState.rules.length} reglas</span></div>${journalState.ruleError ? `<p class="journal-inline-error" role="alert">${escapeHtml(journalState.ruleError)}</p>` : ""}<div class="journal-rules-list">${journalState.rules.map((rule) => `<article class="journal-rule-card ${rule.enabled === false ? "is-disabled" : ""}"><div class="journal-rule-card-head"><div><b>${escapeHtml(rule.title)}</b><span>${escapeHtml(rule.description)}</span><small>Fuentes: ${rule.sourceKinds.map(sourceKindLabel).join(" + ")} · v${rule.version}</small></div><label class="journal-rule-enabled"><input type="checkbox" data-journal-rule-enabled="${escapeHtml(rule.ruleId)}" ${rule.enabled === false ? "" : "checked"}/> Activa</label></div><div class="journal-rule-lines">${rule.lines.map((line, index) => `<label class="journal-field"><span>${line.side === "debit" ? "Cargo" : "Abono"} · línea ${index + 1}</span><select data-journal-rule-account data-rule-id="${escapeHtml(rule.ruleId)}" data-line-index="${index}">${accountOptions(line.accountId)}</select></label>`).join("")}</div></article>`).join("")}</div></section>`;
}

function renderAssistantPanel() {
  const assistant = journalState.assistant;
  return `<section class="journal-assistant ${assistant.open ? "is-open" : ""}" aria-label="Nora dentro de Pólizas sugeridas"><button type="button" class="journal-assistant-toggle" data-journal-assistant-toggle aria-expanded="${assistant.open}" aria-controls="journal-assistant-body"><span class="journal-assistant-avatar" aria-hidden="true">N</span><span><b>Nora · Asistente abierto</b><small>Ayuda contextual · no comparte tus fuentes al abrir</small></span><span aria-hidden="true">${assistant.open ? "−" : "+"}</span></button>${assistant.open ? `<div id="journal-assistant-body" class="journal-assistant-body"><div class="journal-assistant-privacy">Puedes preguntar sobre reglas, cuentas o descuadres. Esta ayuda no recibe CFDI, movimientos, catálogo ni borradores automáticamente.</div><div class="journal-assistant-messages" aria-live="polite">${assistant.messages.slice(-8).map((message, index, list) => `<p class="journal-assistant-message ${message.role === "user" ? "is-user" : ""}"><b>${message.role === "user" ? "Tú" : "Nora"}</b><span ${assistant.pending && index === list.length - 1 && message.role === "assistant" ? "data-journal-assistant-stream" : ""}>${escapeHtml(message.text)}</span></p>`).join("")}</div>${assistant.error ? `<p class="journal-inline-error" role="alert">${escapeHtml(assistant.error)}</p>` : ""}<form data-journal-assistant-form><label class="journal-assistant-input"><span class="sr-only">Pregunta a Nora</span><textarea name="message" maxlength="2000" rows="2" placeholder="Escribe una duda sin pegar datos identificables…" ${assistant.pending ? "disabled" : ""}>${escapeHtml(assistant.draft)}</textarea></label><div class="journal-assistant-actions"><button type="submit" class="button button-primary" ${assistant.pending ? "disabled" : ""}>${assistant.pending ? "Nora está respondiendo…" : "Enviar consulta"}</button>${assistant.pending ? `<button type="button" class="button button-quiet" data-journal-assistant-cancel>Detener</button>` : ""}</div></form><p class="journal-assistant-disclaimer">La respuesta orienta; no cambia reglas, partidas, estados ni aprobaciones. No hay adjuntos ni voz en este panel.</p></div>` : ""}</section>`;
}

export function renderJournalWorkspace({ analysis = null, bankRows = [], bankFileName = "" } = {}) {
  syncSources({ analysis: journalState.handoffAnalysis || analysis, bankRows: journalState.handoffBankRows.length ? journalState.handoffBankRows : bankRows, bankFileName: journalState.handoffBankRows.length ? "Selección bancaria local" : bankFileName });
  const header = renderToolHeader({ id: "accounting-journal", eyebrow: "CONTAIA HERRAMIENTAS · CONTABILIDAD Y AUDITORÍA LOCAL", title: "Pólizas contables sugeridas", description: "Reconstruye factura, pago y ajuste desde fuentes seleccionadas; la auditoría CFDI local muestra evidencia y pendientes. Revisa antes de aprobar; nada se contabiliza automáticamente.", statusLabel: "Local · requiere revisión", statusKind: "attention", className: "journal-header", actions: [{ label: "Volver a Herramientas", section: "tools", arrow: false }] });
  const tabs = [["drafts", "Contexto y pólizas"], ["adjustments", "Notas de crédito"], ["audit-global", "Auditoría global"], ["audit-partial", "Auditoría parcial"], ["catalog", "Catálogo"], ["rules", "Reglas"]];
  const activeContent = journalState.activeTab === "catalog" ? renderCatalogTab() : journalState.activeTab === "rules" ? renderRulesTab() : journalState.activeTab === "adjustments" ? renderCreditNotesTab() : journalState.activeTab === "audit-global" ? renderGlobalAuditTab() : journalState.activeTab === "audit-partial" ? renderPartialAuditTab() : renderDraftsTab();
  return `<main id="contenido" class="content journal-page" data-journal-page tabindex="-1">${header}<section class="journal-privacy-banner" aria-label="Privacidad de las pólizas"><span aria-hidden="true">◉</span><p><b>Trabajo local de esta sesión.</b> CFDI, movimientos, catálogo, hallazgos y borradores no se guardan ni se envían al abrir Nora. La aprobación significa «aprobada localmente; no contabilizada».</p></section><section class="journal-context-bar" aria-label="Contexto de la revisión"><label class="journal-field"><span>Empresa</span><input data-journal-company value="${escapeHtml(journalState.companyName)}" maxlength="160" placeholder="Empresa local"/></label><span class="journal-context-id">ID local opaco · ${escapeHtml(journalState.companyLocalId.slice(0, 18))}…</span></section><nav class="journal-tabs" aria-label="Secciones de pólizas y auditoría">${tabs.map(([id, label]) => `<button type="button" class="${journalState.activeTab === id ? "is-active" : ""}" data-journal-tab="${id}" aria-current="${journalState.activeTab === id ? "page" : "false"}">${label}</button>`).join("")}</nav>${activeContent}${renderAssistantPanel()}<footer class="journal-disclaimer"><b>Alcance de esta entrega</b><p>Las plantillas y los reportes son locales y revisables. No constituyen determinación fiscal ni auditoría certificada, libro mayor, contabilidad electrónica ni asesoría profesional.</p></footer></main>`;
}

function updateDraft(draft, onUpdate) {
  const index = journalState.drafts.findIndex((item) => item.draftId === draft.draftId);
  if (index >= 0) journalState.drafts[index] = draft;
  onUpdate();
}

function generateDraft(onUpdate) {
  if (journalState.generationMode === "lifecycle") {
    const generated = generateLifecycleDrafts({ sources: journalState.sources,
      selectedSourceIds: journalState.selectedSourceIds, businessRfc: journalState.businessRfc,
      companyLocalId: journalState.companyLocalId, period: journalState.period,
      accounts: journalState.lifecycleAccounts, catalog: journalState.catalog,
      creditNoteApplications: journalState.creditNoteApplications });
    journalState.drafts = mergeLifecycleDrafts(journalState.drafts, generated);
    journalState.activeDraftId = generated[0]?.draftId || journalState.activeDraftId;
    journalState.error = generated.length ? "" : "Selecciona facturas o complementos CFDI; los movimientos bancarios no generan otro evento en este modo.";
    journalState.notice = generated.length ? "Propuestas del ciclo generadas en memoria. Repetir no duplica el evento ni reescribe aprobaciones. Los bancos seleccionados no se suman como ventas/pagos adicionales." : "";
    onUpdate();
    return;
  }
  const rule = ruleMap(journalState.rules).get(journalState.selectedRuleId);
  if (!rule) {
    journalState.error = "Selecciona una regla declarativa antes de generar.";
    onUpdate();
    return;
  }
  if (rule.enabled === false) {
    journalState.error = "La regla está desactivada en este catálogo local.";
    onUpdate();
    return;
  }
  const draft = generateJournalDraft({
    rule,
    selectedSources: selectedSources(),
    companyLocalId: journalState.companyLocalId,
    companySide: journalState.companySide,
    cashDirection: journalState.cashDirection,
    period: journalState.period,
  });
  journalState.drafts.push(draft);
  journalState.activeDraftId = draft.draftId;
  journalState.error = "";
  journalState.notice = "Borrador creado en memoria. Todavía requiere revisión y aprobación expresa.";
  onUpdate();
}

async function downloadAuditReport(onUpdate) {
  const { audit } = buildAuditView("global");
  if (!audit.scope.sourceCount) {
    journalState.auditExportError = true;
    journalState.auditExportNotice = "Selecciona fuentes antes de descargar un reporte de revisión.";
    onUpdate();
    return;
  }
  journalState.auditExportBusy = true;
  journalState.auditExportError = false;
  journalState.auditExportNotice = "Preparando el libro de revisión en este navegador…";
  onUpdate();
  try {
    const xlsx = await import("/vendor/reconciliation-xlsx.js");
    const spec = buildAuditReportSpec(audit);
    const bytes = buildAuditWorkbookDownload(xlsx, spec);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = spec.fileName; link.hidden = true;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    journalState.auditExportNotice = "Reporte XLSX descargado localmente. Incluye UUID, hallazgos y evidencia del alcance seleccionado.";
  } catch (error) {
    journalState.auditExportError = true;
    journalState.auditExportNotice = `No se pudo crear el reporte local: ${error instanceof Error ? error.message : "error desconocido"}`;
  } finally {
    journalState.auditExportBusy = false;
    onUpdate();
  }
}

export function bindJournalWorkspace(app, { getSources = () => ({}), onUpdate = () => {}, onAssistantSend = () => {}, onAssistantCancel = () => {}, cleanupScope = null } = {}) {
  const addListener = (type, handler) => cleanupScope?.addEventListener ? cleanupScope.addEventListener(app, type, handler) : app.addEventListener(type, handler);
  const clearAssistantContext = () => {
    const previousId = journalState.assistant.requestId;
    journalState.assistant.abortController?.abort();
    journalState.assistant = { ...emptyState().assistant, requestId: previousId + 1 };
    app.querySelector?.("#journal-assistant-body")?.remove();
    app.querySelector?.("[data-journal-assistant-toggle]")?.setAttribute("aria-expanded", "false");
  };
  const refreshReview = () => {
    const review = app.querySelector?.(".journal-review-layout");
    if (review) review.innerHTML = `<div>${renderDraftList()}</div><div>${renderDraftDetail()}</div>`;
  };
  addListener("change", (event) => {
    if (event.target.matches("[data-journal-generation-mode]")) {
      journalState.generationMode = event.target.value === "manual" ? "manual" : "lifecycle";
      journalState.error = "";
      onUpdate(); return;
    }
    if (event.target.matches("[data-journal-business-rfc]")) {
      const rfc = event.target.value.trim().toUpperCase();
      if (rfc !== journalState.businessRfc) {
        const hadCompany = Boolean(journalState.businessRfc);
        journalState.businessRfc = rfc;
        journalState.companyLocalId = createCompanyLocalId();
        journalState.drafts = [];
        journalState.activeDraftId = "";
        journalState.selectedSourceIds = [];
        journalState.creditNoteApplications = {};
        journalState.auditDecisions = {};
        journalState.auditActiveFindingId = "";
        if (hadCompany) {
          journalState.catalog = createJournalCatalog(journalState.companyLocalId);
          journalState.rules = cloneJournalRules();
        }
        journalState.catalog.companyLocalId = journalState.companyLocalId;
        journalState.lifecycleAccounts = emptyLifecycleAccounts();
        journalState.lifecycleConfigured = false;
        clearAssistantContext();
        app.querySelectorAll?.("[data-journal-source]").forEach((input) => { input.checked = false; input.closest(".journal-source-card")?.classList.remove("is-selected"); });
        app.querySelectorAll?.("[data-journal-lifecycle-account]").forEach((input) => { input.innerHTML = accountOptions(); input.value = ""; });
        refreshReview();
      }
      return;
    }
    const accountRole = event.target.closest?.("[data-journal-lifecycle-account]");
    if (accountRole) {
      const role = accountRole.dataset.journalLifecycleAccount;
      if (role.startsWith("payment:")) journalState.lifecycleAccounts.paymentForms[role.slice(8)] = accountRole.value;
      else if (Object.hasOwn(journalState.lifecycleAccounts, role)) journalState.lifecycleAccounts[role] = accountRole.value;
      journalState.lifecycleConfigured = false;
      clearAssistantContext();
      onUpdate(); return;
    }
    const source = event.target.closest?.("[data-journal-source]");
    if (source) {
      const sourceId = source.dataset.journalSource;
      journalState.selectedSourceIds = source.checked ? [...new Set([...journalState.selectedSourceIds, sourceId])] : journalState.selectedSourceIds.filter((id) => id !== sourceId);
      onUpdate();
      return;
    }
    if (event.target.matches("[data-journal-tab]")) { journalState.activeTab = event.target.dataset.journalTab; onUpdate(); return; }
    if (event.target.matches("[data-journal-rule]")) { journalState.selectedRuleId = event.target.value; onUpdate(); return; }
    if (event.target.matches("[data-journal-company-side]")) { journalState.companySide = event.target.value; onUpdate(); return; }
    if (event.target.matches("[data-journal-cash-direction]")) { journalState.cashDirection = event.target.value; onUpdate(); return; }
    if (event.target.matches("[data-journal-period]")) { journalState.period = event.target.value; clearAssistantContext(); refreshReview(); return; }
    if (event.target.matches("[data-journal-company]")) { journalState.companyName = event.target.value; return; }
    if (event.target.matches("[data-journal-ack]")) {
      const draftId = event.target.closest("[data-journal-draft]")?.dataset.journalDraft || journalState.activeDraftId;
      const draft = journalState.drafts.find((item) => item.draftId === draftId);
      if (draft && draft.status !== "approved") { draft.warningsAcknowledged = event.target.checked; updateDraft(draft, onUpdate); }
      return;
    }
    if (event.target.matches("[data-journal-line-account]")) {
      const draft = journalState.drafts.find((item) => item.draftId === event.target.dataset.draftId);
      const line = draft?.lines?.[Number(event.target.dataset.lineIndex)];
      if (line && draft.status !== "approved") { line.accountId = event.target.value; draft.warningsAcknowledged = false; updateDraft(draft, onUpdate); }
      return;
    }
    if (event.target.matches("[data-journal-rule-account]")) {
      const rule = journalState.rules.find((item) => item.ruleId === event.target.dataset.ruleId);
      const line = rule?.lines?.[Number(event.target.dataset.lineIndex)];
      if (line) { line.accountId = event.target.value; rule.version += 1; journalState.ruleError = ""; onUpdate(); }
      return;
    }
    if (event.target.matches("[data-journal-rule-enabled]")) {
      const rule = journalState.rules.find((item) => item.ruleId === event.target.dataset.journalRuleEnabled);
      if (rule) { rule.enabled = event.target.checked; rule.version += 1; onUpdate(); }
    }
  });
  addListener("click", (event) => {
    const tab = event.target.closest("[data-journal-tab]");
    if (tab) { journalState.activeTab = tab.dataset.journalTab || "drafts"; journalState.auditActiveFindingId = ""; onUpdate(); return; }
    if (event.target.closest("[data-journal-clear-selection]")) { journalState.selectedSourceIds = []; onUpdate(); return; }
    if (event.target.closest("[data-journal-generate]")) { generateDraft(onUpdate); return; }
    if (event.target.closest("[data-journal-generate-adjustments]")) { journalState.generationMode = "lifecycle"; journalState.activeTab = "drafts"; generateDraft(onUpdate); return; }
    if (event.target.closest("[data-audit-refresh]")) { journalState.auditExportNotice = "Auditoría reconstruida a partir de las fuentes de esta sesión."; journalState.auditExportError = false; onUpdate(); return; }
    if (event.target.closest("[data-audit-reset]")) { journalState.auditFilters = createAuditFilters(); journalState.auditActiveFindingId = ""; onUpdate(); return; }
    if (event.target.closest("[data-audit-export]")) { void downloadAuditReport(onUpdate); return; }
    const finding = event.target.closest("[data-journal-finding]");
    if (finding) { journalState.auditActiveFindingId = finding.dataset.journalFinding || ""; onUpdate(); return; }
    const draftButton = event.target.closest("button.journal-draft-item[data-journal-draft]");
    if (draftButton) { journalState.activeDraftId = draftButton.dataset.journalDraft; onUpdate(); return; }
    const accountToggle = event.target.closest("[data-journal-account-toggle]");
    if (accountToggle) { const account = journalState.catalog.accounts.find((item) => item.accountId === accountToggle.dataset.journalAccountToggle); if (account) { account.active = !account.active; journalState.catalog.version += 1; onUpdate(); } return; }
    if (event.target.closest("[data-journal-assistant-toggle]")) { journalState.assistant.open = !journalState.assistant.open; onUpdate(); return; }
    if (event.target.closest("[data-journal-assistant-cancel]")) { onAssistantCancel(); return; }
    const approve = event.target.closest("[data-journal-approve]");
    if (approve) {
      const draft = journalState.drafts.find((item) => item.draftId === approve.dataset.draftId);
      if (!draft) return;
      const validation = getValidation(draft);
      if (!validation.canApprove) { journalState.error = "Resuelve los bloqueos y reconoce las advertencias antes de aprobar."; onUpdate(); return; }
      draft.status = "approved"; draft.approvedAt = new Date().toISOString(); journalState.notice = "Revisión aprobada localmente. No se creó un asiento ni se actualizaron saldos."; onUpdate(); return;
    }
    const reject = event.target.closest("[data-journal-reject]");
    if (reject) { const draft = journalState.drafts.find((item) => item.draftId === reject.dataset.draftId); if (draft && draft.status !== "approved") { draft.status = "rejected"; draft.rejectedAt = new Date().toISOString(); journalState.notice = "Borrador marcado como rechazado en esta sesión."; onUpdate(); } }
  });
  addListener("submit", (event) => {
    const auditFilters = event.target.closest("[data-audit-filter-form]");
    if (auditFilters) {
      event.preventDefault();
      const data = new FormData(auditFilters);
      journalState.auditFilters = createAuditFilters(Object.fromEntries([...Object.keys(DEFAULT_AUDIT_FILTERS)].map((key) => [key, String(data.get(key) || "").trim()])));
      journalState.auditActiveFindingId = "";
      onUpdate();
      return;
    }
    const creditNoteForm = event.target.closest("[data-credit-note-form]");
    if (creditNoteForm) {
      event.preventDefault();
      const sourceId = creditNoteForm.dataset.sourceId || "";
      if (!journalState.selectedSourceIds.includes(sourceId)) { journalState.error = "Selecciona la nota de crédito antes de guardar una aplicación."; onUpdate(); return; }
      const data = new FormData(creditNoteForm);
      journalState.creditNoteApplications[sourceId] = { application: String(data.get("application") || ""), note: String(data.get("note") || "").trim(), savedAt: new Date().toISOString() };
      journalState.notice = "Aplicación de nota de crédito guardada solo en memoria. Genera el ajuste y revísalo antes de aprobar.";
      onUpdate();
      return;
    }
    const auditDecision = event.target.closest("[data-audit-decision-form]");
    if (auditDecision) {
      event.preventDefault();
      const data = new FormData(auditDecision);
      const findingId = auditDecision.dataset.findingId || "";
      const sourceId = auditDecision.dataset.sourceId || "";
      const note = String(data.get("note") || "").trim();
      if (!findingId || !note) { journalState.error = "Escribe un motivo antes de guardar una decisión de auditoría."; onUpdate(); return; }
      const activeAudit = buildAuditView(journalState.activeTab === "audit-partial" ? "partial" : "global").audit;
      const activeFinding = activeAudit.findings.find((entry) => entry.findingId === findingId);
      if (activeFinding?.severity === "blocking") { journalState.error = "Un hallazgo blocking permanece abierto; excluye la fuente o resuelve la evidencia antes de continuar."; onUpdate(); return; }
      const status = String(data.get("status") || "acknowledged");
      journalState.auditDecisions[findingId] = { status, note, savedAt: new Date().toISOString() };
      if (status === "excluded" && sourceId) {
        journalState.selectedSourceIds = journalState.selectedSourceIds.filter((id) => id !== sourceId);
        delete journalState.creditNoteApplications[sourceId];
        journalState.auditActiveFindingId = "";
        journalState.notice = "Fuente excluida de esta preparación local con el motivo indicado. No se borró ni se modificó el CFDI.";
      } else {
        journalState.notice = "Decisión de auditoría guardada solo en memoria; no cambia la fuente ni aprueba pólizas.";
      }
      onUpdate();
      return;
    }
    const accountForm = event.target.closest("[data-journal-account-form]");
    if (accountForm) {
      event.preventDefault();
      const data = new FormData(accountForm);
      const codeText = String(data.get("codeText") || "").trim();
      const name = String(data.get("name") || "").trim();
      const currencyCode = String(data.get("currencyCode") || "").trim().toUpperCase();
      if (!codeText || !name || journalState.catalog.accounts.some((account) => account.codeText === codeText)) { journalState.catalogError = "El código es obligatorio y no puede repetirse."; onUpdate(); return; }
      journalState.catalog.accounts.push({ accountId: codeText, codeText, name, nature: String(data.get("nature") || "deudora"), parentAccountId: "", active: true, imputable: true, currencyCode });
      journalState.catalog.version += 1; journalState.catalogError = ""; journalState.notice = "Cuenta añadida solo a esta sesión."; onUpdate(); return;
    }
    const assistantForm = event.target.closest("[data-journal-assistant-form]");
    if (assistantForm) {
      event.preventDefault();
      const input = assistantForm.querySelector("[name='message']");
      const message = String(input?.value || "").trim();
      if (!message || journalState.assistant.pending) return;
      journalState.assistant.draft = "";
      onAssistantSend(message);
    }
  });
}
