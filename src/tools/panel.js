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
    actionLabel: "Preparar conexión",
    icon: "P",
    detail: "Catálogo y banco pendientes",
  },
  {
    id: "payroll",
    eyebrow: "03 · PERSONAS",
    title: "Nómina",
    description: "Organiza periodos, incidencias y recibos con complemento de nómina y revisión humana.",
    status: "preparation",
    actionLabel: "Ver alcance",
    icon: "N",
    detail: "Motor laboral en preparación",
  },
  {
    id: "diot",
    eyebrow: "04 · IMPUESTO AL VALOR AGREGADO",
    title: "DIOT",
    description: "Prepara operaciones con terceros, revisa IVA y exporta un expediente para presentar.",
    status: "preparation",
    actionLabel: "Ver alcance",
    icon: "IVA",
    detail: "Preparación y revisión primero",
  },
  {
    id: "monitor",
    eyebrow: "05 · CONTROL CONTINUO",
    title: "Monitor fiscal",
    description: "Centraliza alertas de rechazos, cancelaciones, vencimientos y tareas por responsable.",
    status: "preparation",
    actionLabel: "Ver alcance",
    icon: "!",
    detail: "Alertas conectadas a la base",
  },
]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function renderToolCard(tool) {
  const status = TOOL_STATUS[tool.status] ?? TOOL_STATUS.preparation;
  const isAvailable = tool.status === "available";
  return `<article class="tools-card ${status.className}" data-tool-card="${escapeHtml(tool.id)}">
    <div class="tools-card-head"><span class="tools-card-icon" aria-hidden="true">${escapeHtml(tool.icon)}</span><span class="tools-card-status ${status.className}">${escapeHtml(status.label)}</span></div>
    <p class="tools-card-eyebrow">${escapeHtml(tool.eyebrow)}</p>
    <h2>${escapeHtml(tool.title)}</h2>
    <p class="tools-card-description">${escapeHtml(tool.description)}</p>
    <div class="tools-card-foot"><small>${escapeHtml(tool.detail)}</small><button type="button" class="tools-card-action ${isAvailable ? "button-primary" : "button-quiet"}" data-tool-action="${escapeHtml(tool.id)}">${escapeHtml(tool.actionLabel)} <span aria-hidden="true">${isAvailable ? "↗" : "→"}</span></button></div>
  </article>`;
}

export function renderToolsPanel({ notice = "" } = {}) {
  return `<main id="contenido" class="content tools-page" tabindex="-1">
    <div class="tools-page-kicker"><span class="kicker-rule"></span><span>OPERAR · REVISAR · DECIDIR</span></div>
    <header class="tools-hero"><div><p class="eyebrow">Centro operativo · ContaIA</p><h1>Herramientas para<br/><em>trabajar con control.</em></h1><p>Conecta tu perfil fiscal, revisa tus documentos y prepara cada acción antes de ejecutarla. Las operaciones sensibles siempre requieren aprobación.</p></div><div class="tools-hero-mark" aria-hidden="true"><span>MX</span><b>01</b><i></i></div></header>
    <section class="tools-profile-strip" aria-label="Perfil fiscal"><div class="tools-profile-mark">RFC</div><div><p class="eyebrow">PERFIL FISCAL</p><h2>Aún no has configurado una empresa</h2><p>Guarda RFC, régimen y domicilio fiscal para habilitar las conexiones por herramienta.</p></div><button type="button" class="button button-quiet" data-tool-action="fiscal-profile">Configurar perfil <span aria-hidden="true">→</span></button></section>
    ${notice ? `<p class="tools-notice" role="status">${escapeHtml(notice)}</p>` : ""}
    <section class="tools-section-heading"><div><p class="eyebrow">MÓDULOS</p><h2>Elige una herramienta</h2></div><span class="tools-count">${TOOL_DEFINITIONS.filter((tool) => tool.status === "available").length} disponible · ${TOOL_DEFINITIONS.length - 1} por conectar</span></section>
    <section class="tools-grid" aria-label="Herramientas de ContaIA">${TOOL_DEFINITIONS.map(renderToolCard).join("")}</section>
    <footer class="tools-disclaimer"><span aria-hidden="true">!</span><p><b>Control antes de enviar.</b> Las herramientas pueden preparar, validar y explicar información. El timbrado, la cancelación, la nómina y cualquier presentación fiscal requieren conexión autorizada y confirmación humana.</p></footer>
  </main>`;
}
