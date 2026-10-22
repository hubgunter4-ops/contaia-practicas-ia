import { renderToolHeader } from "../tools/tool-shell.js";
import { createJournalCatalog, validateCatalog } from "./catalog.js";
import { buildJournalSources, sourceKindLabel } from "./sources.js";
import { cloneJournalRules, generateJournalDraft, ruleMap } from "./rules.js";
import { formatMinor } from "./money.js";
import { validateJournalDraft } from "./validation.js";

const INITIAL_ASSISTANT_MESSAGE = "Puedo explicar la plantilla, el catálogo o el motivo de un descuadre. Abrir esta ayuda no comparte tus fuentes; envía solo la duda que escribas explícitamente.";

function createCompanyLocalId() {
  try { return `company-${crypto.randomUUID()}`; } catch { return `company-local-${Date.now()}`; }
}

function emptyState() {
  return {
    companyLocalId: createCompanyLocalId(), companyName: "Empresa local sin nombre", period: "", companySide: "unknown", cashDirection: "unknown", currency: "MXN",
    activeTab: "drafts", selectedRuleId: "invoice-sale-example", selectedSourceIds: [], sources: [], sourcesFingerprint: "", bankFileName: "",
    catalog: createJournalCatalog(), rules: cloneJournalRules(), drafts: [], activeDraftId: "", notice: "", error: "", catalogError: "", ruleError: "",
    assistant: { open: false, pending: false, error: "", draft: "", requestId: 0, abortController: null, messages: [{ role: "assistant", text: INITIAL_ASSISTANT_MESSAGE }] },
  };
}

export const journalState = emptyState();

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const sourceAmount = (source) => source?.amount ? formatMinor(source.amount, source.amount.currency) : "Importe pendiente";
const ruleLabels = { issuer: "emisor", receiver: "receptor" };

export function resetJournalWorkspace() {
  const next = emptyState();
  Object.assign(journalState, next);
}

function syncSources({ analysis = null, bankRows = [], bankFileName = "" } = {}) {
  const nextSources = buildJournalSources({ analysis, bankRows, bankFileName });
  const fingerprint = JSON.stringify(nextSources.map((source) => [source.sourceId, source.amount?.minor, source.date, source.kind, source.reconciliationResult]));
  if (fingerprint === journalState.sourcesFingerprint) return;
  const validIds = new Set(nextSources.map((source) => source.sourceId));
  journalState.sources = nextSources;
  journalState.sourcesFingerprint = fingerprint;
  journalState.bankFileName = bankFileName;
  journalState.selectedSourceIds = journalState.selectedSourceIds.filter((sourceId) => validIds.has(sourceId));
  journalState.drafts = journalState.drafts.filter((draft) => draft.sourceRefs.every((sourceId) => validIds.has(sourceId)));
  if (!journalState.drafts.some((draft) => draft.draftId === journalState.activeDraftId)) journalState.activeDraftId = journalState.drafts[0]?.draftId || "";
}

function selectedSources() {
  const selected = new Set(journalState.selectedSourceIds);
  return journalState.sources.filter((source) => selected.has(source.sourceId));
}

function accountOptions(selected = "") {
  return journalState.catalog.accounts.map((account) => `<option value="${escapeHtml(account.accountId)}" ${account.accountId === selected ? "selected" : ""} ${!account.active || !account.imputable ? "disabled" : ""}>${escapeHtml(account.codeText)} · ${escapeHtml(account.name)}${account.active ? "" : " · inactiva"}</option>`).join("");
}

function renderSourceCard(source) {
  const selected = journalState.selectedSourceIds.includes(source.sourceId);
  const warning = source.warnings?.length ? `<small class="journal-source-warning">${escapeHtml(source.warnings[0])}</small>` : "";
  return `<label class="journal-source-card ${selected ? "is-selected" : ""} ${source.warnings?.length ? "has-warning" : ""}"><input type="checkbox" data-journal-source="${escapeHtml(source.sourceId)}" ${selected ? "checked" : ""}/><span class="journal-source-check" aria-hidden="true">${selected ? "✓" : ""}</span><span class="journal-source-copy"><b>${escapeHtml(source.label)}</b><small>${escapeHtml(sourceKindLabel(source.kind))} · ${escapeHtml(source.date)} · ${escapeHtml(sourceAmount(source))}</small><small>${escapeHtml(source.evidence?.source || "Fuente local")}${source.evidence?.reference ? ` · Ref. ${escapeHtml(source.evidence.reference)}` : ""}</small>${warning}</span></label>`;
}

function renderSourceSelector() {
  const counts = journalState.sources.reduce((result, source) => { result[source.kind] = (result[source.kind] || 0) + 1; return result; }, {});
  return `<section class="journal-source-stage" aria-labelledby="journal-sources-title"><div class="journal-section-heading"><div><p class="eyebrow">01 · EVIDENCIA LOCAL</p><h2 id="journal-sources-title">Selecciona las fuentes de esta revisión</h2><p>Elige CFDI o movimientos concretos. Una fuente seleccionada no se modifica ni se envía al asistente.</p></div><span class="journal-count-pill">${journalState.selectedSourceIds.length} seleccionada(s) · ${journalState.sources.length} disponible(s)</span></div>
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
  return validateJournalDraft(draft, journalState.catalog);
}

function renderDraftList() {
  if (!journalState.drafts.length) return `<div class="journal-empty-drafts"><span aria-hidden="true">P</span><h3>Aún no hay borradores</h3><p>Selecciona fuentes, elige una regla y genera una propuesta local para revisarla aquí.</p></div>`;
  return `<div class="journal-draft-list" aria-label="Borradores locales">${journalState.drafts.map((draft) => { const validation = getValidation(draft); const effective = draft.status === "approved" ? "approved" : validation.status; return `<button type="button" class="journal-draft-item ${draft.draftId === journalState.activeDraftId ? "is-active" : ""}" data-journal-draft="${escapeHtml(draft.draftId)}"><span class="journal-draft-icon" aria-hidden="true">${effective === "approved" ? "✓" : effective === "ready" ? "!" : "P"}</span><span><b>Revisión ${draft.revision}</b><small>${escapeHtml(draft.sources?.map((source) => source.label).join(" · ") || "Sin fuentes")}</small><em class="journal-status ${statusClass(draft.status === "approved" ? "approved" : effective)}">${statusLabel(draft.status === "approved" ? "approved" : effective)}</em></span></button>`; }).join("")}</div>`;
}

function renderDraftDetail() {
  const draft = journalState.drafts.find((item) => item.draftId === journalState.activeDraftId);
  if (!draft) return `<div class="journal-detail-empty"><p>Selecciona un borrador para ver sus partidas y validaciones.</p></div>`;
  const validation = getValidation(draft);
  const effectiveStatus = draft.status === "approved" ? "approved" : validation.status;
  const errors = validation.errors.length ? `<div class="journal-validation journal-validation--error" role="alert"><b>Bloqueos de aprobación</b><ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : "";
  const warnings = validation.warnings.length ? `<div class="journal-validation journal-validation--warning"><b>Advertencias de revisión</b><ul>${validation.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul><label class="journal-acknowledge"><input type="checkbox" data-journal-ack ${draft.warningsAcknowledged ? "checked" : ""} ${draft.status === "approved" ? "disabled" : ""}/> Confirmo que revisé estas advertencias antes de aprobar.</label></div>` : "";
  const totals = validation.totalsByCurrency.length ? `<div class="journal-totals">${validation.totalsByCurrency.map((total) => `<div><span>Total cargos</span><b>${escapeHtml(formatMinor({ minor: total.debit, scale: 2 }, total.currency))}</b></div><div><span>Total abonos</span><b>${escapeHtml(formatMinor({ minor: total.credit, scale: 2 }, total.currency))}</b></div><div class="${total.difference === "0" ? "is-balanced" : "is-unbalanced"}"><span>Diferencia</span><b>${escapeHtml(formatMinor({ minor: total.difference, scale: 2 }, total.currency))}</b></div>`).join("")}</div>` : "";
  return `<article class="journal-draft-detail" aria-labelledby="journal-detail-title"><div class="journal-detail-heading"><div><p class="eyebrow">03 · REVISIÓN HUMANA · REVISIÓN ${draft.revision}</p><h3 id="journal-detail-title">${escapeHtml(draft.sources?.map((source) => source.label).join(" + ") || "Borrador local")}</h3><p>Regla ${escapeHtml(draft.ruleId)} · Empresa local · ${escapeHtml(draft.period || "Periodo pendiente")}</p></div><span class="journal-status ${statusClass(effectiveStatus)}">${statusLabel(effectiveStatus)}</span></div><div class="journal-evidence-strip">${(draft.sources || []).map((source) => `<span>${escapeHtml(source.label)} · ${escapeHtml(source.eventKind)}</span>`).join("")}</div><div class="journal-lines-wrap"><table class="journal-lines"><thead><tr><th>Cuenta</th><th>Concepto</th><th>Cargo</th><th>Abono</th></tr></thead><tbody>${draft.lines.map((line, index) => `<tr><td><select data-journal-line-account data-draft-id="${escapeHtml(draft.draftId)}" data-line-index="${index}" ${draft.status === "approved" ? "disabled" : ""}>${accountOptions(line.accountId)}</select></td><td>${escapeHtml(line.concept)}</td><td>${line.side === "debit" ? escapeHtml(line.amount ? formatMinor(line.amount, line.amount.currency) : "—") : "—"}</td><td>${line.side === "credit" ? escapeHtml(line.amount ? formatMinor(line.amount, line.amount.currency) : "—") : "—"}</td></tr>`).join("")}</tbody></table></div>${totals}${errors}${warnings}<div class="journal-detail-actions">${draft.status !== "approved" ? `<button type="button" class="button button-primary" data-journal-approve data-draft-id="${escapeHtml(draft.draftId)}" ${validation.canApprove ? "" : "disabled"}>${effectiveStatus === "ready" ? "Aprobar esta revisión" : "Resolver bloqueos para aprobar"}</button><button type="button" class="button button-quiet" data-journal-reject data-draft-id="${escapeHtml(draft.draftId)}">Rechazar borrador</button>` : `<span class="journal-approved-note">Aprobada localmente el ${escapeHtml(new Date(draft.approvedAt).toLocaleString("es-MX"))}. No se contabilizó.</span>`}</div><p class="journal-detail-disclaimer">La aprobación solo confirma este snapshot en esta pestaña. No crea un asiento, no actualiza saldos y no se envía a un ERP.</p></article>`;
}

function renderDraftsTab() {
  return `${renderSourceSelector()}${renderRuleSelector()}<section class="journal-review-stage" aria-labelledby="journal-review-title"><div class="journal-section-heading"><div><p class="eyebrow">03 · BORRADORES LOCALES</p><h2 id="journal-review-title">Revisa antes de aprobar</h2></div><button type="button" class="button button-primary" data-journal-generate ${journalState.selectedSourceIds.length ? "" : "disabled"}>Generar borrador</button></div><div class="journal-review-layout"><div>${renderDraftList()}</div><div>${renderDraftDetail()}</div></div></section>`;
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
  syncSources({ analysis, bankRows, bankFileName });
  const header = renderToolHeader({ id: "accounting-journal", eyebrow: "CONTAIA HERRAMIENTAS · CONTABILIDAD LOCAL", title: "Pólizas contables sugeridas", description: "Genera borradores explicables desde fuentes seleccionadas. Revisa cargos y abonos antes de aprobar; nada se contabiliza automáticamente.", statusLabel: "Local · requiere revisión", statusKind: "attention", className: "journal-header", actions: [{ label: "Volver a Herramientas", section: "tools", arrow: false }] });
  return `<main id="contenido" class="content journal-page" data-journal-page tabindex="-1">${header}<section class="journal-privacy-banner" aria-label="Privacidad de las pólizas"><span aria-hidden="true">◉</span><p><b>Trabajo local de esta sesión.</b> CFDI, movimientos, catálogo y borradores no se guardan ni se envían al abrir Nora. La aprobación significa «aprobada localmente; no contabilizada».</p></section><section class="journal-context-bar" aria-label="Contexto de la revisión"><label class="journal-field"><span>Empresa</span><input data-journal-company value="${escapeHtml(journalState.companyName)}" maxlength="160" placeholder="Empresa local"/></label><span class="journal-context-id">ID local opaco · ${escapeHtml(journalState.companyLocalId.slice(0, 18))}…</span></section><nav class="journal-tabs" aria-label="Secciones de pólizas"><button type="button" class="${journalState.activeTab === "drafts" ? "is-active" : ""}" data-journal-tab="drafts">Borradores</button><button type="button" class="${journalState.activeTab === "catalog" ? "is-active" : ""}" data-journal-tab="catalog">Catálogo de cuentas</button><button type="button" class="${journalState.activeTab === "rules" ? "is-active" : ""}" data-journal-tab="rules">Reglas editables</button></nav>${journalState.activeTab === "catalog" ? renderCatalogTab() : journalState.activeTab === "rules" ? renderRulesTab() : renderDraftsTab()}${renderAssistantPanel()}<footer class="journal-disclaimer"><b>Alcance de esta entrega</b><p>Las plantillas son configurables y los datos se procesan localmente. No constituyen determinación fiscal, libro mayor, contabilidad electrónica ni asesoría profesional.</p></footer></main>`;
}

function updateDraft(draft, onUpdate) {
  const index = journalState.drafts.findIndex((item) => item.draftId === draft.draftId);
  if (index >= 0) journalState.drafts[index] = draft;
  onUpdate();
}

function generateDraft(onUpdate) {
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

export function bindJournalWorkspace(app, { getSources = () => ({}), onUpdate = () => {}, onAssistantSend = () => {}, onAssistantCancel = () => {} } = {}) {
  app.addEventListener("change", (event) => {
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
    if (event.target.matches("[data-journal-period]")) { journalState.period = event.target.value; onUpdate(); return; }
    if (event.target.matches("[data-journal-company]")) { journalState.companyName = event.target.value; return; }
    if (event.target.matches("[data-journal-ack]")) {
      const draft = journalState.drafts.find((item) => item.draftId === event.target.closest("[data-journal-draft]")?.dataset.journalDraft || journalState.activeDraftId);
      if (draft) { draft.warningsAcknowledged = event.target.checked; updateDraft(draft, onUpdate); }
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
  app.addEventListener("click", (event) => {
    if (event.target.closest("[data-journal-clear-selection]")) { journalState.selectedSourceIds = []; onUpdate(); return; }
    if (event.target.closest("[data-journal-generate]")) { generateDraft(onUpdate); return; }
    const draftButton = event.target.closest("[data-journal-draft]");
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
    if (reject) { const draft = journalState.drafts.find((item) => item.draftId === reject.dataset.draftId); if (draft) { draft.status = "rejected"; draft.rejectedAt = new Date().toISOString(); journalState.notice = "Borrador marcado como rechazado en esta sesión."; onUpdate(); } }
  });
  app.addEventListener("submit", (event) => {
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
