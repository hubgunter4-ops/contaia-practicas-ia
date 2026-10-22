import { TOOL_AVAILABILITY, TOOL_DEFINITIONS, TOOL_GROUPS } from "./catalog.js";
import { renderNoraContextCard, renderToolHeader } from "./tool-shell.js";

export { TOOL_DEFINITIONS } from "./catalog.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

const TOOL_ICON_PATHS = Object.freeze({
  cfdi: '<path d="M6.5 2.5h7l4 4v15h-11z"/><path d="M13.5 2.5v4h4M9 11h6M9 14.5h6"/><path d="m9 18 1.5 1.5 3.5-3.5"/>',
  folder: '<path d="M3 6.5h7l2 2h9v10.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 19.3z"/><path d="M3 9h18"/><path d="m9 14 2 2 4-4"/>',
  accounting: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7.5 7h9M7.5 10h9M8 17v-2M12 17v-4M16 17v-6"/>',
  payroll: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.5a5 5 0 0 1 4.5 5.2"/>',
  diot: '<path d="M6 3h12v18l-2-1.4L14 21l-2-1.4L10 21l-2-1.4L6 21z"/><path d="M9 8h6M9 12h3"/><circle cx="9" cy="16.5" r=".9"/><circle cx="15" cy="14.5" r=".9"/><path d="m9.7 15.8 4.6-3.1"/>',
  monitor: '<path d="M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z"/><path d="m8.5 12.3 2.2 2.2 4.8-5"/>',
});

function toolIcon(id) {
  const iconId = TOOL_ICON_PATHS[id] ? id : "monitor";
  return `<svg class="tools-ui-icon tools-ui-icon--${iconId}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOOL_ICON_PATHS[iconId]}</svg>`;
}

const CONNECTION_STATES = Object.freeze({
  not_configured: { label: "Sin configurar", className: "is-not-configured", icon: "○", description: "No hay un registro de conexión para este ambiente." },
  pending: { label: "Pendiente", className: "is-pending", icon: "◷", description: "El registro está pendiente; esto no confirma una conexión real." },
  connected: { label: "Conectada", className: "is-connected", icon: "✓", description: "El registro figura como conectado; confirma su estado con el proveedor." },
  requires_review: { label: "Requiere revisión", className: "is-review", icon: "!", description: "La conexión necesita revisión antes de continuar." },
  error: { label: "Error", className: "is-error", icon: "×", description: "El registro contiene un error que debe revisarse." },
  disabled: { label: "Deshabilitada", className: "is-disabled", icon: "—", description: "La integración está deshabilitada." },
  unknown: { label: "Estado desconocido", className: "is-unknown", icon: "?", description: "El servidor devolvió un estado no reconocido." },
});
const CONNECTION_ENVIRONMENTS = Object.freeze([
  { key: "sandbox", label: "Pruebas" },
  { key: "production", label: "Producción" },
]);
const CONNECTION_LEGEND_STATES = Object.freeze(["not_configured", "pending", "connected", "requires_review", "error"]);
const TOOL_LABELS = Object.freeze(Object.fromEntries(TOOL_DEFINITIONS.map(({ id, title }) => [id, title])));

function normalizeConnectionStatus(status) {
  if (["degraded", "review_required", "requires_review"].includes(status)) return "requires_review";
  if (Object.hasOwn(CONNECTION_STATES, status)) return status;
  return status ? "unknown" : "not_configured";
}

function renderConnectionStatusBadge(status, environment = "") {
  const statusKey = normalizeConnectionStatus(status);
  const state = CONNECTION_STATES[statusKey];
  const environmentInfo = CONNECTION_ENVIRONMENTS.find((item) => item.key === environment);
  const accessibleLabel = environmentInfo ? `${environmentInfo.label}: ${state.label}` : state.label;
  return `<span class="tools-connection-status ${state.className}" data-connection-status="${statusKey}"${environmentInfo ? ` data-environment="${environmentInfo.key}"` : ""} aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(state.description)}"><span class="tools-connection-status-icon" aria-hidden="true">${state.icon}</span>${environmentInfo ? `<span class="tools-connection-status-environment">${escapeHtml(environmentInfo.label)} ·</span>` : ""}<span class="tools-connection-status-label">${escapeHtml(state.label)}</span></span>`;
}

function renderToolConnectionSummary(tool, workspace = {}) {
  if (workspace.loading || workspace.connectionsLoading) {
    return `<div class="tools-card-connection"><span class="tools-card-connection-label">ESTADO DE INTEGRACIÓN</span><span class="tools-connection-loading" role="status">Consultando estados…</span></div>`;
  }
  if (!workspace.selectedProfileId) {
    return `<div class="tools-card-connection"><span class="tools-card-connection-label">ESTADO DE INTEGRACIÓN</span><span class="tools-connection-loading">Selecciona un perfil fiscal para consultar sus ambientes.</span></div>`;
  }
  const connections = Array.isArray(workspace.connections) ? workspace.connections : [];
  const badges = CONNECTION_ENVIRONMENTS.map(({ key }) => {
    const connection = connections.find((item) => item.tool_key === tool.id && item.environment === key);
    return renderConnectionStatusBadge(connection?.status ?? "not_configured", key);
  }).join("");
  return `<div class="tools-card-connection"><span class="tools-card-connection-label">ESTADO DE INTEGRACIÓN · SOLO REGISTRO</span><div class="tools-card-connection-list">${badges}</div></div>`;
}

function renderToolCard(tool, workspace = {}) {
  const availability = TOOL_AVAILABILITY[tool.availability] ?? TOOL_AVAILABILITY.preparation;
  const isReady = tool.availability === "ready";
  return `<article class="tools-card ${availability.className}" data-tool-card="${escapeHtml(tool.id)}">
    <div class="tools-card-head"><span class="tools-card-icon" role="img" aria-label="${escapeHtml(tool.title)}">${toolIcon(tool.id)}</span><span class="tools-card-status ${availability.className}" title="Disponibilidad funcional del módulo">${escapeHtml(availability.label)}</span></div>
    <p class="tools-card-eyebrow">${escapeHtml(tool.eyebrow)}</p>
    <h3>${escapeHtml(tool.title)}</h3>
    <p class="tools-card-description">${escapeHtml(tool.description)}</p>
    ${renderToolConnectionSummary(tool, workspace)}
    <div class="tools-card-foot"><small>${escapeHtml(tool.detail)}</small><button type="button" class="tools-card-action ${isReady ? "button-primary" : "button-quiet"}" data-tool-action="${escapeHtml(tool.id)}">${escapeHtml(tool.actionLabel)} <span aria-hidden="true">${isReady ? "↗" : "→"}</span></button></div>
  </article>`;
}

function renderToolGroups(workspace) {
  return TOOL_GROUPS.map((group) => {
    const tools = TOOL_DEFINITIONS.filter((tool) => tool.group === group.id);
    if (!tools.length) return "";
    return `<section class="tools-objective" aria-labelledby="tools-group-${escapeHtml(group.id)}"><div class="tools-objective-heading"><div><p class="eyebrow">${escapeHtml(group.eyebrow)}</p><h2 id="tools-group-${escapeHtml(group.id)}">${escapeHtml(group.title)}</h2><p>${escapeHtml(group.description)}</p></div><span class="tools-objective-count">${tools.length} ${tools.length === 1 ? "herramienta" : "herramientas"}</span></div><div class="tools-grid">${tools.map((tool) => renderToolCard(tool, workspace)).join("")}</div></section>`;
  }).join("");
}

function maskRfc(value = "") {
  const rfc = String(value);
  return rfc.length < 6 ? "RFC protegido" : `${rfc.slice(0, 3)}••••••${rfc.slice(-3)}`;
}

function renderProfileForm(workspace) {
  const profile = workspace.profileForm || {};
  const editing = Boolean(profile.id);
  const header = renderToolHeader({
    id: "fiscal-profile",
    eyebrow: "PERFIL FISCAL · CONFIGURACIÓN",
    title: editing ? "Revisa el perfil fiscal" : "Configura un perfil fiscal",
    description: "Administra la información fiscal de tu cuenta. El formulario no comparte sus datos con Nora ni con proveedores.",
    statusLabel: editing ? profile.active === false ? "Perfil inactivo" : "Perfil activo" : "Aún sin guardar",
    statusKind: editing ? profile.active === false ? "attention" : "ready" : "info",
    className: "tools-module-header",
    headingLevel: 2,
    titleId: "tools-profile-form-title",
    actions: [{ label: "Cancelar", toolsUi: "cancel", arrow: false }],
  });
  return `<section class="tools-inline-panel tools-module-panel" aria-labelledby="tools-profile-form-title">${header}
    <div class="tools-module-summary"><span class="tools-module-summary-icon" aria-hidden="true">${toolIcon("accounting")}</span><div><b>${editing ? "Perfil guardado en tu cuenta privada" : "Perfil aún no configurado"}</b><span>Los campos son para administración de cuenta. No ingreses contraseñas, certificados, e.firma, CSD ni claves.</span></div></div>
    ${renderNoraContextCard({ eyebrow: "NORA · PERFIL FISCAL", title: "¿Necesitas orientación sobre estos campos?", description: "Nora puede explicar el propósito del perfil; abrir el asistente no comparte este formulario ni sus datos.", actionLabel: "Consultar orientación", avatarState: "explaining", className: "tools-module-nora" })}
    <form class="tools-data-form" data-tools-profile-form>
      <label>Razón o nombre fiscal<input name="legal_name" required maxlength="300" autocomplete="organization" value="${escapeHtml(profile.legal_name)}"/></label>
      <label>RFC<input name="rfc" required maxlength="13" pattern="[A-Za-zÑñ&amp;]{3,4}[0-9]{6}[A-Za-z0-9]{2,3}" autocapitalize="characters" autocomplete="off" value="${escapeHtml(profile.rfc)}"/><small>Se guarda en tu perfil privado y se muestra parcialmente oculto en el panel.</small></label>
      <div class="tools-form-grid"><label>Régimen fiscal<input name="tax_regime" maxlength="120" value="${escapeHtml(profile.tax_regime)}"/></label><label>Código postal fiscal<input name="fiscal_zip" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" autocomplete="postal-code" value="${escapeHtml(profile.fiscal_zip)}"/></label></div>
      <div class="tools-form-grid"><label>Correo fiscal<input name="fiscal_email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(profile.fiscal_email)}"/></label><label>Teléfono<input name="phone" type="tel" maxlength="120" autocomplete="tel" value="${escapeHtml(profile.phone)}"/></div>
      <label class="tools-checkbox"><input type="hidden" name="active" value="false"/><input type="checkbox" name="active" value="true" ${profile.active === false ? "" : "checked"}/><span>Perfil activo</span></label>
      <p class="tools-form-privacy">El perfil se envía a la API autenticada de ContaIA y queda sujeto a las políticas RLS. No ingreses contraseñas, e.firma, CSD, certificados ni claves.</p>
      <label class="tools-checkbox"><input type="checkbox" name="acknowledge" required/><span>Confirmo que puedo registrar estos datos y que se guardarán en mi cuenta privada.</span></label>
      <button type="submit" class="button button-primary" ${workspace.saving ? "disabled" : ""}>${workspace.saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear perfil"}</button>
    </form>
  </section>`;
}

function renderConnectionForm(workspace) {
  const toolKey = workspace.connectionForm?.tool_key || "accounting";
  const environment = workspace.connectionForm?.environment || "sandbox";
  const connections = Array.isArray(workspace.connections) ? workspace.connections : [];
  const existing = connections.find((item) => item.tool_key === toolKey && item.environment === environment);
  const environmentLabel = CONNECTION_ENVIRONMENTS.find((item) => item.key === environment)?.label || "Pruebas";
  const statusKey = normalizeConnectionStatus(existing?.status);
  const connectionState = CONNECTION_STATES[statusKey];
  const statusKind = statusKey === "pending" ? "pending" : statusKey === "requires_review" ? "attention" : statusKey === "error" ? "error" : "info";
  const header = renderToolHeader({
    id: "connection-record",
    eyebrow: `CONEXIONES · ${environmentLabel.toUpperCase()}`,
    title: `Registro de ${TOOL_LABELS[toolKey] || "herramienta"}`,
    description: "Guarda un estado administrativo por perfil y ambiente. Este formulario no conecta ni verifica servicios externos.",
    statusLabel: `${existing ? connectionState.label : "Sin configurar"} · ${environmentLabel.toLowerCase()}`,
    statusKind,
    className: "tools-module-header",
    headingLevel: 2,
    titleId: "tools-connection-form-title",
    actions: [{ label: "Cancelar", toolsUi: "cancel", arrow: false }],
  });
  return `<section class="tools-inline-panel tools-module-panel" aria-labelledby="tools-connection-form-title">${header}
    <div class="tools-module-summary"><span class="tools-module-summary-icon" aria-hidden="true">${toolIcon(toolKey)}</span><div><b>Estado del registro · ${existing ? escapeHtml(connectionState.label) : "Sin configurar"}</b><span>${escapeHtml(connectionState.description)} Ninguna credencial se solicita ni se envía a un proveedor.</span></div></div>
    ${renderNoraContextCard({ eyebrow: "NORA · CONEXIONES", title: "¿Qué significa este estado?", description: "Nora puede explicar el registro administrativo. El chat no recibe el perfil, el ambiente ni credenciales al abrirse.", actionLabel: "Consultar a Nora", avatarState: "explaining", className: "tools-module-nora" })}
    <form class="tools-data-form" data-tools-connection-form>
      <input type="hidden" name="tool_key" value="${escapeHtml(toolKey)}"/>
      <label>Ambiente<select name="environment"><option value="sandbox" ${environment === "sandbox" ? "selected" : ""}>Pruebas (sandbox)</option><option value="production" ${environment === "production" ? "selected" : ""}>Producción</option></select></label>
      <p class="tools-form-privacy">Esto solo registra un estado “Pendiente” para el perfil seleccionado. No configura ni verifica una integración y no envía información a un proveedor. No pegues credenciales, tokens, certificados ni e.firma aquí.</p>
      <button type="submit" class="button button-primary" ${workspace.saving ? "disabled" : ""}>${workspace.saving ? "Guardando…" : existing ? "Actualizar registro" : "Guardar como pendiente"}</button>
    </form>
  </section>`;
}

function renderConnections(workspace) {
  if (workspace.loading) return `<p class="tools-empty-state" role="status">Cargando conexiones…</p>`;
  if (!workspace.selectedProfileId) return `<p class="tools-empty-state">Crea o selecciona un perfil fiscal para consultar sus conexiones.</p>`;
  if (workspace.connectionsLoading) return `<p class="tools-empty-state" role="status">Cargando conexiones de este perfil…</p>`;
  const connections = Array.isArray(workspace.connections) ? workspace.connections : [];
  return `<div class="tools-connection-list">${TOOL_DEFINITIONS.map((tool) => CONNECTION_ENVIRONMENTS.map(({ key, label }) => {
    const connection = connections.find((item) => item.tool_key === tool.id && item.environment === key);
    return `<article class="tools-connection-row" data-tool-key="${escapeHtml(tool.id)}" data-environment="${key}"><div><b>${escapeHtml(tool.title)}</b><span class="tools-connection-row-environment">${label}</span></div>${renderConnectionStatusBadge(connection?.status ?? "not_configured")}<button type="button" class="button button-quiet" data-tools-ui="connection-open" data-tool-key="${escapeHtml(tool.id)}" data-tool-environment="${key}">${connection ? "Actualizar registro" : "Registrar pendiente"}</button></article>`;
  }).join("")).join("")}</div>`;
}

function renderWorkspaceSignals(workspace, selectedProfile) {
  const connections = Array.isArray(workspace.connections) ? workspace.connections : [];
  const alerts = Array.isArray(workspace.alerts) ? workspace.alerts : [];
  const deadlines = Array.isArray(workspace.deadlines) ? workspace.deadlines : [];
  const profileState = workspace.loading
    ? { label: "Consultando…", detail: "Cargando perfiles fiscales.", className: "is-pending" }
    : selectedProfile
      ? { label: selectedProfile.active === false ? "Perfil inactivo" : "Perfil seleccionado", detail: `${maskRfc(selectedProfile.rfc)}${selectedProfile.tax_regime ? ` · Régimen ${escapeHtml(selectedProfile.tax_regime)}` : ""}`, className: selectedProfile.active === false ? "is-review" : "is-ready" }
      : { label: "Sin configurar", detail: "Agrega o selecciona un perfil fiscal para empezar.", className: "is-not-configured" };
  let connectionState;
  if (!selectedProfile) connectionState = { label: "Selecciona un perfil", detail: "Los estados se consultan por empresa.", className: "is-not-configured" };
  else if (workspace.connectionsLoading) connectionState = { label: "Consultando…", detail: "Cargando registros por ambiente.", className: "is-pending" };
  else {
    const normalized = connections.map((connection) => normalizeConnectionStatus(connection.status));
    const connected = normalized.filter((status) => status === "connected").length;
    const pending = normalized.filter((status) => status === "pending").length;
    const attention = normalized.filter((status) => ["requires_review", "error"].includes(status)).length;
    connectionState = connections.length
      ? { label: `${connected} conectada(s) · ${pending} pendiente(s)`, detail: `${attention} requiere(n) revisión/error. Son registros administrativos, no verificaciones externas.`, className: attention ? "is-review" : connected ? "is-ready" : "is-pending" }
      : { label: "Sin registros", detail: "No hay estados guardados para este perfil.", className: "is-not-configured" };
  }
  let activityState;
  if (workspace.loading || workspace.signalsLoading) {
    activityState = { label: "Consultando…", detail: "Leyendo alertas y vencimientos del perfil seleccionado.", className: "is-pending" };
  } else if (!selectedProfile) {
    activityState = { label: "Selecciona un perfil", detail: "Las alertas y fechas se consultan por perfil fiscal.", className: "is-not-configured" };
  } else if (workspace.signalsError) {
    activityState = { label: "Consulta incompleta", detail: "No se pudieron consultar todos los registros; no se asumen valores en cero.", className: "is-review" };
  } else if (alerts.length + deadlines.length === 0) {
    activityState = { label: "Sin registros", detail: "No hay alertas ni vencimientos registrados para este perfil; no se generan automáticamente.", className: "is-not-configured" };
  } else {
    const openAlerts = alerts.filter((item) => item.status === "open").length;
    const reviewAlerts = alerts.filter((item) => item.status === "in_review").length;
    const pendingDeadlines = deadlines.filter((item) => item.status === "pending").length;
    const overdueDeadlines = deadlines.filter((item) => item.status === "overdue").length;
    const attentionCount = openAlerts + reviewAlerts + pendingDeadlines + overdueDeadlines;
    activityState = attentionCount
      ? { label: `${attentionCount} asunto(s) requieren atención`, detail: `${openAlerts} alerta(s) abierta(s) · ${reviewAlerts} en revisión · ${pendingDeadlines} vencimiento(s) pendiente(s) · ${overdueDeadlines} marcado(s) vencido(s).`, className: "is-review" }
      : { label: "Sin pendientes registrados", detail: `${alerts.length} alerta(s) y ${deadlines.length} vencimiento(s) consultados; sus estados no están marcados como pendientes.`, className: "is-ready" };
  }
  return `<section class="tools-overview" aria-label="Resumen del espacio"><article class="tools-overview-card"><span class="tools-overview-icon" aria-hidden="true">${toolIcon("accounting")}</span><div><p>PERFIL FISCAL</p><b class="${profileState.className}">${escapeHtml(profileState.label)}</b><small>${profileState.detail}</small></div></article><article class="tools-overview-card"><span class="tools-overview-icon" aria-hidden="true">${toolIcon("monitor")}</span><div><p>CONEXIONES</p><b class="${connectionState.className}">${escapeHtml(connectionState.label)}</b><small>${connectionState.detail}</small></div></article><article class="tools-overview-card"><span class="tools-overview-icon" aria-hidden="true">${toolIcon("cfdi")}</span><div><p>ACTIVIDAD Y ALERTAS</p><b class="${activityState.className}">${escapeHtml(activityState.label)}</b><small>${escapeHtml(activityState.detail)}</small></div></article></section>`;
}

export function renderToolsPanel({ notice = "", workspace = {} } = {}) {
  const profiles = Array.isArray(workspace.profiles) ? workspace.profiles : [];
  const selectedProfile = profiles.find((profile) => profile.id === workspace.selectedProfileId) || null;
  const readyCount = TOOL_DEFINITIONS.filter((tool) => tool.availability === "ready").length;
  const preparationCount = TOOL_DEFINITIONS.length - readyCount;
  const currentNotice = workspace.notice || notice;
  const currentError = workspace.error || "";
  const profileSelect = profiles.length
    ? `<label class="tools-profile-select-label" for="tools-profile-select">Perfil seleccionado</label><select id="tools-profile-select" class="tools-profile-select" data-tools-profile-select ${workspace.saving ? "disabled" : ""}>${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === workspace.selectedProfileId ? "selected" : ""}>${escapeHtml(profile.legal_name)}${profile.active === false ? " · inactivo" : ""}</option>`).join("")}</select>`
    : `<p>${workspace.loading ? "Cargando perfiles fiscales…" : "Aún no has agregado un perfil fiscal."}</p>`;
  const profileDetails = selectedProfile
    ? `<p>${escapeHtml(maskRfc(selectedProfile.rfc))}${selectedProfile.tax_regime ? ` · Régimen ${escapeHtml(selectedProfile.tax_regime)}` : ""}</p>`
    : `<p>Guarda RFC, régimen y domicilio fiscal para habilitar conexiones por empresa.</p>`;
  const forms = workspace.profileForm ? renderProfileForm(workspace) : workspace.connectionForm ? renderConnectionForm(workspace) : "";
  const toolHeader = renderToolHeader({
    id: "tools",
    eyebrow: "CONTAIA HERRAMIENTAS · CENTRO OPERATIVO",
    title: "Herramientas fiscales con claridad.",
    description: "Configura tu perfil, revisa el estado de cada herramienta y decide el siguiente paso. Las operaciones sensibles requieren aprobación.",
    statusLabel: `${readyCount} lista · ${preparationCount} en preparación`,
    statusKind: "info",
    className: "tools-dashboard-header",
    actions: [
      { label: "Configurar perfil", primary: true, toolsUi: "profile-new" },
      { label: "Preguntar a Nora", section: "advisor" },
    ],
  });
  return `<main id="contenido" class="content tools-page" tabindex="-1">
    <div class="tools-page-kicker"><span class="kicker-rule"></span><span>OPERAR · REVISAR · DECIDIR</span></div>
    ${toolHeader}
    ${renderWorkspaceSignals(workspace, selectedProfile)}
    <section class="tools-profile-strip" aria-label="Perfil fiscal"><div class="tools-profile-mark">RFC</div><div class="tools-profile-summary"><p class="eyebrow">PERFIL FISCAL</p><h2>${escapeHtml(selectedProfile?.legal_name || (workspace.loading ? "Cargando perfil fiscal…" : "Aún no has configurado una empresa"))}</h2>${profileDetails}${profiles.length > 1 ? profileSelect : ""}</div><div class="tools-profile-actions"><button type="button" class="button button-quiet" data-tools-ui="profile-new" ${workspace.saving ? "disabled" : ""}>Agregar perfil</button><button type="button" class="button button-quiet" data-tools-ui="profile-edit" ${!selectedProfile || workspace.saving ? "disabled" : ""}>Editar</button></div></section>
    ${currentError ? `<p class="tools-notice is-error" role="alert">${escapeHtml(currentError)}</p>` : ""}${currentNotice ? `<p class="tools-notice" role="status">${escapeHtml(currentNotice)}</p>` : ""}
    ${workspace.loading && !workspace.loaded ? `<p class="tools-load-status" role="status">Conectando con tu espacio privado…</p>` : ""}
    ${forms}
    <section class="tools-connections" aria-labelledby="tools-connections-title"><div class="tools-section-heading"><div><p class="eyebrow">ESTADO POR AMBIENTE</p><h2 id="tools-connections-title">Conexiones por perfil</h2></div><button type="button" class="button button-quiet" data-tools-ui="refresh" ${workspace.loading || workspace.saving ? "disabled" : ""}>Actualizar</button></div><p class="tools-connections-note">El estado es un registro administrativo: solo una verificación externa confirma una conexión. «Pendiente» no significa que exista una conexión real.</p><div class="tools-status-legend" aria-label="Leyenda de estados de conexión"><span class="tools-status-legend-label">Estados:</span>${CONNECTION_LEGEND_STATES.map((status) => renderConnectionStatusBadge(status)).join("")}</div>${renderConnections(workspace)}</section>
    <section class="tools-section-heading tools-modules-heading"><div><p class="eyebrow">HERRAMIENTAS POR OBJETIVO</p><h2>Elige el siguiente paso</h2></div><span class="tools-count">${readyCount} operativa · ${preparationCount} en preparación</span></section>
    ${renderToolGroups(workspace)}
    <section class="tools-resources" aria-label="Acompañamiento y estudio"><article class="tools-resource-card"><span class="tools-resource-mark" aria-hidden="true">${toolIcon("diot")}</span><div><p class="eyebrow">BASE DE ESTUDIO</p><h2>Repasa antes de actuar</h2><p>Consulta conceptos, procedimientos y materiales educativos disponibles.</p></div><button type="button" class="button button-quiet" data-section="study">Abrir estudio <span aria-hidden="true">→</span></button></article><article class="tools-resource-card"><span class="tools-resource-mark" aria-hidden="true">${toolIcon("folder")}</span><div><p class="eyebrow">DOCUMENTOS CON NORA</p><h2>Leer archivos de apoyo</h2><p>Desde el asistente puedes adjuntar XML, CSV, XLSX, PDF, DOCX o TXT. Evita compartir datos fiscales identificables; el archivo solo se envía a la ruta documental cuando la instrucción solicita una operación.</p></div><button type="button" class="button button-quiet" data-section="advisor">Abrir documentos <span aria-hidden="true">→</span></button></article>${renderNoraContextCard({ title: "Nora te acompaña con contexto", description: "Pregunta sobre el uso de ContaIA o pide orientación educativa. No se comparte el perfil ni los archivos al abrir el asistente.", actionLabel: "Abrir Nora", avatarState: "ready", className: "tools-nora-card" })}</section>
    <footer class="tools-disclaimer"><span aria-hidden="true">!</span><p><b>Control antes de enviar.</b> Las herramientas pueden preparar, validar y explicar información. El timbrado, la cancelación, la nómina y cualquier presentación fiscal requieren conexión autorizada y confirmación humana.</p></footer>
  </main>`;
}
