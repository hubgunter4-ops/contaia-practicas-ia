const TOOL_STATUS = Object.freeze({
  available: { label: "Disponible", className: "is-available" },
  connection: { label: "Requiere conexión", className: "is-connection" },
  preparation: { label: "En preparación", className: "is-preparation" },
  review: { label: "Requiere revisión", className: "is-review" },
});

export const TOOL_DEFINITIONS = Object.freeze([
  {
    id: "cfdi",
    eyebrow: "01 · DOCUMENTOS FISCALES",
    title: "CFDI 4.0",
    description: "Analiza XML y ZIP, relaciona complementos de pago y localiza diferencias para revisar.",
    status: "available",
    actionLabel: "Abrir analizador",
    icon: "XML",
    detail: "Análisis local disponible",
  },
  {
    id: "accounting",
    eyebrow: "02 · REGISTRO CONTABLE",
    title: "Contabilidad",
    description: "Convierte comprobantes y movimientos en pólizas sugeridas, conciliaciones y evidencia.",
    status: "connection",
    actionLabel: "Registrar integración",
    icon: "P",
    detail: "Catálogo y banco pendientes",
  },
  {
    id: "payroll",
    eyebrow: "03 · PERSONAS",
    title: "Nómina",
    description: "Organiza periodos, incidencias y recibos con complemento de nómina y revisión humana.",
    status: "preparation",
    actionLabel: "Registrar integración",
    icon: "N",
    detail: "Motor laboral en preparación",
  },
  {
    id: "diot",
    eyebrow: "04 · IMPUESTO AL VALOR AGREGADO",
    title: "DIOT",
    description: "Prepara operaciones con terceros, revisa IVA y exporta un expediente para presentar.",
    status: "preparation",
    actionLabel: "Registrar integración",
    icon: "IVA",
    detail: "Preparación y revisión primero",
  },
  {
    id: "monitor",
    eyebrow: "05 · CONTROL CONTINUO",
    title: "Monitor fiscal",
    description: "Centraliza alertas de rechazos, cancelaciones, vencimientos y tareas por responsable.",
    status: "preparation",
    actionLabel: "Registrar integración",
    icon: "!",
    detail: "Alertas conectadas a la base",
  },
]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

const TOOL_ICON_PATHS = Object.freeze({
  cfdi: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
  accounting: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/>',
  payroll: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  diot: '<path d="M4 19V5M4 19h16"/><path d="M8 16v-4M12 16V8M16 16v-7"/>',
  monitor: '<path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/><path d="M12 8v5M12 16h.01"/>',
});
function toolIcon(id) {
  return `<svg class="tools-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOOL_ICON_PATHS[id] || TOOL_ICON_PATHS.monitor}</svg>`;
}

function renderToolCard(tool) {
  const status = TOOL_STATUS[tool.status] ?? TOOL_STATUS.preparation;
  const isAvailable = tool.status === "available";
  return `<article class="tools-card ${status.className}" data-tool-card="${escapeHtml(tool.id)}">
    <div class="tools-card-head"><span class="tools-card-icon" aria-label="${escapeHtml(tool.title)}">${toolIcon(tool.id)}</span><span class="tools-card-status ${status.className}">${escapeHtml(status.label)}</span></div>
    <p class="tools-card-eyebrow">${escapeHtml(tool.eyebrow)}</p>
    <h2>${escapeHtml(tool.title)}</h2>
    <p class="tools-card-description">${escapeHtml(tool.description)}</p>
    <div class="tools-card-foot"><small>${escapeHtml(tool.detail)}</small><button type="button" class="tools-card-action ${isAvailable ? "button-primary" : "button-quiet"}" data-tool-action="${escapeHtml(tool.id)}">${escapeHtml(tool.actionLabel)} <span aria-hidden="true">${isAvailable ? "↗" : "→"}</span></button></div>
  </article>`;
}

const CONNECTION_LABELS = Object.freeze({
  not_configured: "Sin configurar", pending: "Pendiente", connected: "Conectada",
  degraded: "Degradada", error: "Error", disabled: "Deshabilitada",
});
const TOOL_LABELS = Object.freeze(Object.fromEntries(TOOL_DEFINITIONS.map(({ id, title }) => [id, title])));

function maskRfc(value = "") {
  const rfc = String(value);
  return rfc.length < 6 ? "RFC protegido" : `${rfc.slice(0, 3)}••••••${rfc.slice(-3)}`;
}

function renderProfileForm(workspace) {
  const profile = workspace.profileForm || {};
  const editing = Boolean(profile.id);
  return `<section class="tools-inline-panel" aria-labelledby="tools-profile-form-title"><div class="tools-inline-heading"><div><p class="eyebrow">PERFIL FISCAL</p><h3 id="tools-profile-form-title">${editing ? "Editar perfil" : "Agregar perfil"}</h3></div><button type="button" class="button button-quiet" data-tools-ui="cancel">Cancelar</button></div>
    <form class="tools-data-form" data-tools-profile-form>
      <label>Razón o nombre fiscal<input name="legal_name" required maxlength="300" autocomplete="organization" value="${escapeHtml(profile.legal_name)}"/></label>
      <label>RFC<input name="rfc" required maxlength="13" pattern="[A-Za-zÑñ&amp;]{3,4}[0-9]{6}[A-Za-z0-9]{2,3}" autocapitalize="characters" autocomplete="off" value="${escapeHtml(profile.rfc)}"/><small>Se guarda en tu perfil privado y se muestra parcialmente oculto en el panel.</small></label>
      <div class="tools-form-grid"><label>Régimen fiscal<input name="tax_regime" maxlength="120" value="${escapeHtml(profile.tax_regime)}"/></label><label>Código postal fiscal<input name="fiscal_zip" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" autocomplete="postal-code" value="${escapeHtml(profile.fiscal_zip)}"/></label></div>
      <div class="tools-form-grid"><label>Correo fiscal<input name="fiscal_email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(profile.fiscal_email)}"/></label><label>Teléfono<input name="phone" type="tel" maxlength="120" autocomplete="tel" value="${escapeHtml(profile.phone)}"/></label></div>
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
  const existing = workspace.connections.find((item) => item.tool_key === toolKey && item.environment === environment);
  return `<section class="tools-inline-panel" aria-labelledby="tools-connection-form-title"><div class="tools-inline-heading"><div><p class="eyebrow">REGISTRO DE CONEXIÓN</p><h3 id="tools-connection-form-title">${escapeHtml(TOOL_LABELS[toolKey] || "Herramienta")}</h3></div><button type="button" class="button button-quiet" data-tools-ui="cancel">Cancelar</button></div>
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
  return `<div class="tools-connection-list">${TOOL_DEFINITIONS.map((tool) => {
    const connections = workspace.connections.filter((item) => item.tool_key === tool.id);
    if (!connections.length) return `<article class="tools-connection-row"><div><b>${escapeHtml(tool.title)}</b><span>Sin registro</span></div><button type="button" class="button button-quiet" data-tools-ui="connection-open" data-tool-key="${escapeHtml(tool.id)}" data-tool-environment="sandbox">Registrar pendiente</button></article>`;
    return connections.map((connection) => {
      const status = CONNECTION_LABELS[connection.status] || "Estado desconocido";
      const environment = connection.environment === "production" ? "Producción" : "Sandbox";
      return `<article class="tools-connection-row"><div><b>${escapeHtml(tool.title)}</b><span>${escapeHtml(status)} · ${environment}</span></div><button type="button" class="button button-quiet" data-tools-ui="connection-open" data-tool-key="${escapeHtml(tool.id)}" data-tool-environment="${escapeHtml(connection.environment)}">Actualizar registro</button></article>`;
    }).join("");
  }).join("")}</div>`;
}

export function renderToolsPanel({ notice = "", workspace = {} } = {}) {
  const profiles = Array.isArray(workspace.profiles) ? workspace.profiles : [];
  const selectedProfile = profiles.find((profile) => profile.id === workspace.selectedProfileId) || null;
  const availableCount = TOOL_DEFINITIONS.filter((tool) => tool.status === "available").length;
  const currentNotice = workspace.notice || notice;
  const currentError = workspace.error || "";
  const profileSelect = profiles.length
    ? `<label class="tools-profile-select-label" for="tools-profile-select">Perfil seleccionado</label><select id="tools-profile-select" class="tools-profile-select" data-tools-profile-select>${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === workspace.selectedProfileId ? "selected" : ""}>${escapeHtml(profile.legal_name)}${profile.active === false ? " · inactivo" : ""}</option>`).join("")}</select>`
    : `<p>${workspace.loading ? "Cargando perfiles fiscales…" : "Aún no has agregado un perfil fiscal."}</p>`;
  const profileDetails = selectedProfile
    ? `<p>${escapeHtml(maskRfc(selectedProfile.rfc))}${selectedProfile.tax_regime ? ` · Régimen ${escapeHtml(selectedProfile.tax_regime)}` : ""}</p>`
    : `<p>Guarda RFC, régimen y domicilio fiscal para habilitar conexiones por empresa.</p>`;
  const forms = workspace.profileForm ? renderProfileForm(workspace) : workspace.connectionForm ? renderConnectionForm(workspace) : "";
  return `<main id="contenido" class="content tools-page" tabindex="-1">
    <div class="tools-page-kicker"><span class="kicker-rule"></span><span>OPERAR · REVISAR · DECIDIR</span></div>
    <header class="tools-hero"><div><p class="eyebrow">Centro operativo · ContaIA</p><h1>Herramientas para<br/><em>trabajar con control.</em></h1><p>Conecta tu perfil fiscal, revisa tus documentos y prepara cada acción antes de ejecutarla. Las operaciones sensibles siempre requieren aprobación.</p></div><div class="tools-hero-mark" aria-hidden="true"><span>MX</span><b>01</b><i></i></div></header>
    <section class="tools-profile-strip" aria-label="Perfil fiscal"><div class="tools-profile-mark">RFC</div><div class="tools-profile-summary"><p class="eyebrow">PERFIL FISCAL</p><h2>${escapeHtml(selectedProfile?.legal_name || (workspace.loading ? "Cargando perfil fiscal…" : "Aún no has configurado una empresa"))}</h2>${profileDetails}${profiles.length > 1 ? profileSelect : ""}</div><div class="tools-profile-actions"><button type="button" class="button button-quiet" data-tools-ui="profile-new" ${workspace.saving ? "disabled" : ""}>Agregar perfil</button><button type="button" class="button button-quiet" data-tools-ui="profile-edit" ${!selectedProfile || workspace.saving ? "disabled" : ""}>Editar</button></div></section>
    ${currentError ? `<p class="tools-notice is-error" role="alert">${escapeHtml(currentError)}</p>` : ""}${currentNotice ? `<p class="tools-notice" role="status">${escapeHtml(currentNotice)}</p>` : ""}
    ${workspace.loading && !workspace.loaded ? `<p class="tools-load-status" role="status">Conectando con tu espacio privado…</p>` : ""}
    ${forms}
    <section class="tools-connections" aria-labelledby="tools-connections-title"><div class="tools-section-heading"><div><p class="eyebrow">INTEGRACIONES</p><h2 id="tools-connections-title">Conexiones por perfil</h2></div><button type="button" class="button button-quiet" data-tools-ui="refresh" ${workspace.loading || workspace.saving ? "disabled" : ""}>Actualizar</button></div><p class="tools-connections-note">El estado mostrado es un registro administrativo; “Pendiente” no significa que exista una conexión real.</p>${renderConnections(workspace)}</section>
    <section class="tools-section-heading"><div><p class="eyebrow">MÓDULOS</p><h2>Elige una herramienta</h2></div><span class="tools-count">${availableCount} disponible · ${TOOL_DEFINITIONS.length - availableCount} en preparación o por conectar</span></section>
    <section class="tools-grid" aria-label="Herramientas de ContaIA">${TOOL_DEFINITIONS.map(renderToolCard).join("")}</section>
    <footer class="tools-disclaimer"><span aria-hidden="true">!</span><p><b>Control antes de enviar.</b> Las herramientas pueden preparar, validar y explicar información. El timbrado, la cancelación, la nómina y cualquier presentación fiscal requieren conexión autorizada y confirmación humana.</p></footer>
  </main>`;
}
