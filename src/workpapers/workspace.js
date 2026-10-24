import { renderNoraContextCard, renderToolGuidance, renderToolHeader } from "../tools/tool-shell.js";
import { buildWorkpapersDemo, WORKPAPER_DEMO_PERIODS, WORKPAPER_DEMO_TYPES } from "./demo-data.js";

const TABS = Object.freeze([
  Object.freeze({ id: "demo", label: "Flujo guiado" }),
  Object.freeze({ id: "sheet", label: "Hoja de cálculo" }),
  Object.freeze({ id: "provenance", label: "Procedencia" }),
  Object.freeze({ id: "plans", label: "Planes" }),
]);
const STAGES = Object.freeze([
  Object.freeze({ id: "sources", label: "Fuentes" }),
  Object.freeze({ id: "rule", label: "Regla" }),
  Object.freeze({ id: "entry", label: "Póliza" }),
  Object.freeze({ id: "sheet", label: "Hoja" }),
  Object.freeze({ id: "save", label: "Confirmación" }),
]);

const emptyState = () => ({
  periodId: "2026-10",
  activeTab: "demo",
  stageIndex: 0,
  ruleState: "proposed",
  refreshCount: 0,
  saved: false,
  notice: "",
});

export const workpapersState = emptyState();

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);

export function resetWorkpapersWorkspace() {
  Object.assign(workpapersState, emptyState());
}

function currentDemo() {
  return buildWorkpapersDemo(workpapersState.periodId);
}

function renderStageRail() {
  return `<ol class="workpapers-stage-rail" aria-label="Flujo demostrativo">${STAGES.map((stage, index) => {
    const isCurrent = index === workpapersState.stageIndex;
    const state = index < workpapersState.stageIndex ? "Completada" : isCurrent ? "Etapa actual" : "Por iniciar";
    const className = index < workpapersState.stageIndex ? "is-complete" : isCurrent ? "is-current" : "is-upcoming";
    return `<li class="${className}"><button type="button" data-workpapers-stage="${index}" ${isCurrent ? 'aria-current="step"' : ""} aria-label="${escapeHtml(stage.label)} · ${state}"><span class="workpapers-stage-index" aria-hidden="true">${index < workpapersState.stageIndex ? "✓" : index + 1}</span><span class="workpapers-stage-copy"><b>${escapeHtml(stage.label)}</b><small>${state}</small></span></button></li>`;
  }).join("")}</ol>`;
}

function renderSources(demo) {
  return `<div class="workpapers-source-grid">${demo.sources.map((source) => `<article class="workpapers-source-card"><div><span class="workpapers-source-mark" aria-hidden="true">${source.id === "cfdi" ? "⌁" : source.id === "reconciliation" ? "↔" : "≡"}</span><p>${escapeHtml(source.status)}</p></div><h3>${escapeHtml(source.title)}</h3><b>${source.count.toLocaleString("es-MX")} registros ficticios</b><small>${escapeHtml(source.detail)}</small></article>`).join("")}</div>`;
}

function renderEntry(demo) {
  const debit = demo.entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = demo.entry.lines.reduce((sum, line) => sum + line.credit, 0);
  return `<div class="workpapers-entry-card"><div class="workpapers-entry-heading"><div><p class="eyebrow">VISTA PREVIA · SIN CONTABILIZAR</p><h3>${escapeHtml(demo.entry.title)}</h3><span>${escapeHtml(demo.entry.reference)} · ${escapeHtml(demo.entry.status)}</span></div><b class="workpapers-review-chip">Revisión humana</b></div><div class="workpapers-table-wrap"><table class="workpapers-entry-table"><thead><tr><th scope="col">Cuenta</th><th scope="col">Cargo</th><th scope="col">Abono</th></tr></thead><tbody>${demo.entry.lines.map((line) => `<tr><td>${escapeHtml(line.account)}</td><td>${line.debit ? money(line.debit) : "—"}</td><td>${line.credit ? money(line.credit) : "—"}</td></tr>`).join("")}</tbody><tfoot><tr><th>Total</th><td>${money(debit)}</td><td>${money(credit)}</td></tr></tfoot></table></div><p class="workpapers-inline-note">La demostración solo muestra una propuesta. No crea, modifica ni aprueba una póliza.</p></div>`;
}

function renderSheet(demo, { compact = false } = {}) {
  return `<section class="workpapers-sheet-card ${compact ? "is-compact" : ""}" aria-label="Vista previa de hoja de cálculo"><div class="workpapers-sheet-heading"><div><p class="eyebrow">LIBRO XLSX · DEMOSTRACIÓN</p><h3>${escapeHtml(demo.workbook.title)}</h3><span>${demo.workbook.sheets.map((sheet) => escapeHtml(sheet.name)).join(" · ")}</span></div><span class="workpapers-sheet-badge">Fórmulas visibles</span></div><div class="workpapers-table-wrap"><table class="workpapers-sheet-table"><thead><tr><th scope="col">Concepto</th><th scope="col">Fuente</th><th scope="col">Base</th><th scope="col">IVA</th><th scope="col">Total</th><th scope="col">Fórmula</th></tr></thead><tbody>${demo.workbook.rows.map((row) => `<tr><td>${escapeHtml(row.concept)}</td><td>${escapeHtml(row.source)}</td><td>${money(row.base)}</td><td>${money(row.tax)}</td><td>${money(row.total)}</td><td><code>${escapeHtml(row.formula)}</code></td></tr>`).join("")}</tbody></table></div><p class="workpapers-inline-note">En WP1 no se descarga, persiste ni recalcula un XLSX real; la tabla ilustra el formato que construirá WP3.</p></section>`;
}

function renderProvenance(demo) {
  return `<section class="workpapers-provenance" aria-labelledby="workpapers-provenance-title"><div class="workpapers-section-heading"><div><p class="eyebrow">TRAZABILIDAD DEMOSTRATIVA</p><h2 id="workpapers-provenance-title">Cada total explica su procedencia</h2><p>La demo registra qué consultaría, con qué corte y qué fórmula mostraría. No contiene datos de una empresa.</p></div></div><div class="workpapers-provenance-list">${demo.provenance.map((item) => `<article><div class="workpapers-provenance-cell"><b>${escapeHtml(item.cell)}</b><code>${escapeHtml(item.formula)}</code></div><dl><div><dt>Fuente</dt><dd>${escapeHtml(item.source)}</dd></div><div><dt>Corte</dt><dd>${escapeHtml(item.cutoff)}</dd></div><div><dt>Registros</dt><dd>${item.count.toLocaleString("es-MX")} ficticios</dd></div><div><dt>Total</dt><dd>${escapeHtml(item.total)}</dd></div></dl><p>${escapeHtml(item.note)}</p></article>`).join("")}</div></section>`;
}

function renderPlans() {
  return `<section class="workpapers-plans" aria-labelledby="workpapers-plans-title"><div class="workpapers-section-heading"><div><p class="eyebrow">ALCANCE DE PRODUCTO · PROPUESTA</p><h2 id="workpapers-plans-title">Demo para conocer el flujo; Premium para operar con volumen</h2><p>Estos límites son una vista de la propuesta comercial. WP1 no aplica cobros, créditos ni bloqueos.</p></div></div><div class="workpapers-plan-grid"><article><p>FREE</p><h3>Explora el formato</h3><ul><li>Demo con datos ficticios.</li><li>Un papel local en la propuesta.</li><li>Hasta 500 filas por ejecución futura.</li><li>Exportación CSV básica futura.</li></ul><b>Sin pagos en esta fase</b></article><article class="is-premium"><p>PREMIUM</p><h3>Repite y profundiza</h3><ul><li>Múltiples papeles y periodos.</li><li>Hasta 5,000 filas por ejecución futura.</li><li>XLSX con fórmulas y procedencia.</li><li>Créditos IA separados del volumen local.</li></ul><b>Requiere E2–E6 y WP2–WP5</b></article></div></section>`;
}

function renderFlowPanel(demo) {
  const stage = workpapersState.stageIndex;
  const ruleAccepted = workpapersState.ruleState === "accepted";
  const ruleRejected = workpapersState.ruleState === "rejected";
  const panel = stage === 0
    ? `<div class="workpapers-flow-copy"><p class="eyebrow">01 · SELECCIÓN SIMULADA</p><h2>Elige qué fuentes consultar</h2><p>La demostración reúne snapshots ficticios de CFDI, conciliación y pólizas. Una entrega posterior solicitará autorización expresa antes de leer cualquier fuente local real.</p></div>${renderSources(demo)}`
    : stage === 1
      ? `<div class="workpapers-flow-copy"><p class="eyebrow">02 · PROPUESTA DE REGLA</p><h2>La IA explica; tú decides</h2><p>Esta regla está predefinida para la demo. No llama a Nora, no usa un modelo y no cambia la contabilidad.</p></div><article class="workpapers-rule-card"><div><span class="workpapers-rule-mark" aria-hidden="true">◇</span><p>REGLA DEMOSTRATIVA</p><h3>${escapeHtml(demo.rule.title)}</h3><dl><div><dt>Condición</dt><dd>${escapeHtml(demo.rule.condition)}</dd></div><div><dt>Agrupación</dt><dd>${escapeHtml(demo.rule.grouping)}</dd></div><div><dt>Salida</dt><dd>${escapeHtml(demo.rule.output)}</dd></div></dl><small>${escapeHtml(demo.rule.rationale)}</small></div><div class="workpapers-rule-actions"><span class="workpapers-rule-state ${ruleAccepted ? "is-accepted" : ruleRejected ? "is-rejected" : ""}">${ruleAccepted ? "Regla revisada para la demo" : ruleRejected ? "Regla descartada en la demo" : "Pendiente de tu revisión"}</span><button type="button" class="button button-primary" data-workpapers-action="accept-rule">Aceptar para continuar</button><button type="button" class="button button-quiet" data-workpapers-action="reject-rule">Descartar propuesta</button></div></article>`
      : stage === 2
        ? `<div class="workpapers-flow-copy"><p class="eyebrow">03 · VISTA DE PÓLIZA</p><h2>Revisa antes de guardar</h2><p>${ruleAccepted ? "La demo muestra el resultado de la regla que aceptaste. Sigue siendo un borrador ficticio." : "La póliza se muestra como ejemplo; acepta una regla en el paso anterior para simular la decisión."}</p></div>${renderEntry(demo)}`
        : stage === 3
          ? `<div class="workpapers-flow-copy"><p class="eyebrow">04 · LIBRO CON FÓRMULAS</p><h2>Visualiza el papel de trabajo</h2><p>Los encabezados, fórmulas y totales son visibles para su revisión. Cambiar el periodo actualiza los valores demostrativos.</p></div>${renderSheet(demo)}`
          : `<div class="workpapers-flow-copy"><p class="eyebrow">05 · CONFIRMACIÓN</p><h2>${workpapersState.saved ? "Papel de demostración listo" : "Confirma el papel de demostración"}</h2><p>${workpapersState.saved ? "La confirmación solo vive en esta isla y se borrará al salir. No se creó ningún archivo ni se escribió en una contabilidad." : "En una fase posterior, esta acción guardará solo el papel de trabajo local y su procedencia. En WP1 simula el resultado sin persistir información."}</p></div><div class="workpapers-save-card"><span aria-hidden="true">${workpapersState.saved ? "✓" : "↓"}</span><div><b>${workpapersState.saved ? "Confirmación de demostración" : "Guardado local simulado"}</b><small>Periodo ${escapeHtml(demo.period.label)} · datos ficticios · procedencia visible</small></div><button type="button" class="button button-primary" data-workpapers-action="save-paper" ${workpapersState.saved ? "disabled" : ""}>${workpapersState.saved ? "Demo confirmada" : "Confirmar demostración"}</button></div>`;
  const previous = stage > 0 ? `<button type="button" class="button button-quiet" data-workpapers-action="previous-stage">Anterior</button>` : "";
  const next = stage < STAGES.length - 1 ? `<button type="button" class="button button-primary" data-workpapers-action="next-stage">${stage === 0 ? "Ver regla" : stage === 1 ? "Ver póliza" : stage === 2 ? "Ver hoja" : "Ver confirmación"} <span aria-hidden="true">→</span></button>` : "";
  return `<section class="workpapers-flow-stage" aria-labelledby="workpapers-flow-title"><div class="workpapers-stage-title"><div><p class="eyebrow">DEMO INTERACTIVA · DATOS FICTICIOS</p><h2 id="workpapers-flow-title">${escapeHtml(STAGES[stage].label)} · ${stage + 1} de ${STAGES.length}</h2></div><span>Sin fuentes reales ni IA remota</span></div>${panel}<div class="workpapers-flow-actions">${previous}${next}</div></section>`;
}

export function renderWorkpapersWorkspace() {
  const demo = currentDemo();
  const tab = TABS.some(({ id }) => id === workpapersState.activeTab) ? workpapersState.activeTab : "demo";
  const stageIndex = Math.max(0, Math.min(STAGES.length - 1, Number(workpapersState.stageIndex) || 0));
  const stage = STAGES[stageIndex];
  const tabLabel = TABS.find(({ id }) => id === tab)?.label || "Flujo guiado";
  const statusLabel = tab === "demo" ? workpapersState.saved ? "Demo confirmada · solo sesión" : `Paso ${stageIndex + 1} de ${STAGES.length} · ${stage.label}` : `${tabLabel} · datos ficticios`;
  const guidance = renderToolGuidance({
    state: statusLabel,
    nextStep: tab !== "demo" ? "Explora el flujo guiado para recorrer una demostración completa." : workpapersState.saved ? "Continúa explorando la hoja y su procedencia; la confirmación se borra al salir." : stageIndex < STAGES.length - 1 ? `Continúa con la etapa «${STAGES[stageIndex + 1].label}» del recorrido.` : "Revisa la confirmación de demostración; no se creará un archivo ni se escribirá en una contabilidad.",
    pending: tab === "demo" && !workpapersState.saved && stageIndex < STAGES.length - 1 ? [`Recorrer la etapa «${STAGES[stageIndex + 1].label}» si deseas completar la demo.`] : [],
    boundary: "WP1 usa cifras ficticias en memoria; no consulta fuentes reales, no usa IA remota y no persiste ni modifica contabilidad.",
    tone: workpapersState.saved ? "ready" : "info",
  });
  const header = renderToolHeader({
    id: "workpapers",
    eyebrow: "CONTAIA HERRAMIENTAS · DEMO INTERACTIVA",
    title: "Papeles de trabajo IA",
    description: "Explora cómo una hoja puede reunir fórmulas, totales y procedencia sin alterar la contabilidad. Esta versión usa exclusivamente datos ficticios.",
    statusLabel,
    statusKind: workpapersState.saved ? "ready" : "info",
    className: "workpapers-header",
    actions: [{ label: "Volver a Herramientas", section: "tools", arrow: false }],
  });
  const tabContent = tab === "sheet" ? renderSheet(demo) : tab === "provenance" ? renderProvenance(demo) : tab === "plans" ? renderPlans() : renderFlowPanel(demo);
  const maxTrend = Math.max(...demo.trend.map(({ value }) => value), 1);
  return `<main id="contenido" class="content workpapers-page" data-workpapers-page tabindex="-1">${header}${guidance}
    <section class="workpapers-privacy-banner" aria-label="Alcance de la demostración"><span aria-hidden="true">◉</span><p><b>Demo local y ficticia.</b> WP1 no consulta CFDI, bancos, perfiles ni pólizas reales; no usa créditos, modelos, endpoints ni persistencia. Al salir, se borra cada selección y confirmación de esta demostración.</p></section>
    <section class="workpapers-dashboard" aria-label="Resumen demostrativo"><div class="workpapers-period-control"><div><p class="eyebrow">PERIODO DE DEMOSTRACIÓN</p><label for="workpapers-period">Corte y recálculo simulado</label><select id="workpapers-period" data-workpapers-period>${WORKPAPER_DEMO_PERIODS.map((period) => `<option value="${period.id}" ${period.id === demo.period.id ? "selected" : ""}>${escapeHtml(period.label)} · corte ${escapeHtml(period.cutoff)}</option>`).join("")}</select></div><div><span>Actualización ${workpapersState.refreshCount ? `simulada · ${workpapersState.refreshCount}` : "pendiente"}</span><button type="button" class="button button-quiet" data-workpapers-action="refresh">Actualizar datos demo</button></div></div><div class="workpapers-metric-grid">${demo.metrics.map((metric) => `<article class="is-${metric.tone}"><span>${escapeHtml(metric.label)}</span><b>${money(metric.value)}</b><small>Valor ficticio agregado</small></article>`).join("")}</div><div class="workpapers-trend" aria-label="Tendencia demostrativa de ventas"><div><p class="eyebrow">TENDENCIA · DEMO</p><h2>Actividad por periodo</h2><span>Sin proyección financiera ni datos reales</span></div><div class="workpapers-bars" aria-hidden="true">${demo.trend.map((item) => `<span style="--bar:${Math.max(18, Math.round(item.value / maxTrend * 100))}%"><i></i><b>${escapeHtml(item.label)}</b></span>`).join("")}</div></div></section>
    <nav class="workpapers-tabs" role="tablist" aria-label="Vistas de Papeles de trabajo IA">${TABS.map((item) => `<button type="button" role="tab" id="workpapers-tab-${item.id}" aria-selected="${tab === item.id}" aria-controls="workpapers-panel-${item.id}" tabindex="${tab === item.id ? "0" : "-1"}" data-workpapers-tab="${item.id}">${escapeHtml(item.label)}</button>`).join("")}</nav>
    <section class="workpapers-tab-panel" id="workpapers-panel-${tab}" role="tabpanel" aria-labelledby="workpapers-tab-${tab}">${tab === "demo" ? renderStageRail() : ""}${tabContent}</section>
    ${workpapersState.notice ? `<p class="workpapers-notice" role="status">${escapeHtml(workpapersState.notice)}</p>` : ""}
    <section class="workpapers-template-strip" aria-label="Tipos de papel de trabajo futuros"><p class="eyebrow">PLANTILLAS PROPUESTAS</p>${WORKPAPER_DEMO_TYPES.map((type) => `<article><b>${escapeHtml(type.label)}</b><span>${escapeHtml(type.description)}</span></article>`).join("")}</section>
    ${renderNoraContextCard({ eyebrow: "NORA · ORIENTACIÓN", title: "Conoce el alcance antes de usar fuentes reales", description: "Puedes consultar cómo revisar una regla o una diferencia. Abrir Nora desde aquí no adjunta datos, hojas ni procedencia de esta demo.", actionLabel: "Preguntar a Nora", avatarState: "ready", className: "workpapers-nora-card" })}
    <footer class="workpapers-disclaimer"><b>Alcance de WP0/WP1.</b><p>El asistente de la demo organiza un ejemplo visual; no timbra, no cancela, no captura movimientos, no modifica contabilidad y no crea un archivo XLSX. Las fases WP2–WP5 definirán snapshots locales autorizados, motor de fórmulas, exportación, procedencia persistible y asistencia IA controlada.</p></footer>
  </main>`;
}

export function bindWorkpapersWorkspace(host, { onUpdate = () => {}, cleanupScope } = {}) {
  if (!host?.addEventListener) throw new TypeError("Papeles de trabajo necesita un host DOM.");
  if (!cleanupScope?.addEventListener) throw new TypeError("Papeles de trabajo necesita CleanupScope.");
  const update = () => onUpdate();
  cleanupScope.addEventListener(host, "click", (event) => {
    const stage = event.target.closest?.("[data-workpapers-stage]");
    if (stage) {
      const index = Number(stage.dataset.workpapersStage);
      if (Number.isInteger(index) && index >= 0 && index < STAGES.length) {
        workpapersState.stageIndex = index;
        workpapersState.activeTab = "demo";
        update();
      }
      return;
    }
    const tab = event.target.closest?.("[data-workpapers-tab]");
    if (tab) {
      const id = tab.dataset.workpapersTab;
      if (TABS.some((item) => item.id === id)) {
        workpapersState.activeTab = id;
        update();
      }
      return;
    }
    const action = event.target.closest?.("[data-workpapers-action]")?.dataset.workpapersAction;
    if (!action) return;
    if (action === "next-stage") workpapersState.stageIndex = Math.min(STAGES.length - 1, workpapersState.stageIndex + 1);
    else if (action === "previous-stage") workpapersState.stageIndex = Math.max(0, workpapersState.stageIndex - 1);
    else if (action === "accept-rule") {
      workpapersState.ruleState = "accepted";
      workpapersState.notice = "Regla demostrativa aceptada para esta sesión. No se modificó una fuente ni se aplicó un asiento.";
    } else if (action === "reject-rule") {
      workpapersState.ruleState = "rejected";
      workpapersState.notice = "Regla demostrativa descartada. Puedes volver a revisarla sin afectar datos.";
    } else if (action === "refresh") {
      workpapersState.refreshCount += 1;
      workpapersState.notice = `Periodo ${currentDemo().period.label} actualizado con valores ficticios. No se consultó una fuente real.`;
    } else if (action === "save-paper") {
      workpapersState.saved = true;
      workpapersState.notice = "Confirmación demostrativa lista en esta isla. No se creó ningún archivo ni se guardó información.";
    } else return;
    update();
  });
  cleanupScope.addEventListener(host, "change", (event) => {
    if (!event.target.matches?.("[data-workpapers-period]")) return;
    const periodId = event.target.value;
    if (!WORKPAPER_DEMO_PERIODS.some((period) => period.id === periodId)) return;
    workpapersState.periodId = periodId;
    workpapersState.saved = false;
    workpapersState.notice = `Periodo de demostración cambiado a ${currentDemo().period.label}. Las cifras siguen siendo ficticias.`;
    update();
  });
}

export const __test = { TABS, STAGES, emptyState };
