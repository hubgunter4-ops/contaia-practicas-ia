const STATUS_LABELS = {
  available: "Disponible",
  connection: "Requiere conexión",
  preparation: "En preparación",
  review: "Requiere revisión",
};

export const defaultTools = [
  { id: "cfdi", eyebrow: "01 · DOCUMENTOS FISCALES", title: "CFDI 4.0", description: "Analiza XML y ZIP, relaciona complementos de pago y localiza diferencias para revisar.", status: "available", actionLabel: "Abrir analizador", icon: "XML" },
  { id: "accounting", eyebrow: "02 · REGISTRO CONTABLE", title: "Contabilidad", description: "Convierte comprobantes y movimientos en pólizas sugeridas, conciliaciones y evidencia.", status: "connection", actionLabel: "Preparar conexión", icon: "P" },
  { id: "payroll", eyebrow: "03 · PERSONAS", title: "Nómina", description: "Organiza periodos, incidencias y recibos con complemento de nómina y revisión humana.", status: "preparation", actionLabel: "Ver alcance", icon: "N" },
  { id: "diot", eyebrow: "04 · IMPUESTO AL VALOR AGREGADO", title: "DIOT", description: "Prepara operaciones con terceros, revisa IVA y exporta un expediente para presentar.", status: "preparation", actionLabel: "Ver alcance", icon: "IVA" },
  { id: "monitor", eyebrow: "05 · CONTROL CONTINUO", title: "Monitor fiscal", description: "Centraliza alertas de rechazos, cancelaciones, vencimientos y tareas por responsable.", status: "preparation", actionLabel: "Ver alcance", icon: "!" },
];

export default function ToolsPanel({ tools = defaultTools, fiscalProfile, onOpenTool, onOpenProfile }) {
  return (
    <main className="content tools-page" aria-labelledby="tools-title">
      <div className="tools-page-kicker"><span className="kicker-rule" /><span>OPERAR · REVISAR · DECIDIR</span></div>
      <header className="tools-hero">
        <div>
          <p className="eyebrow">Centro operativo · ContaIA</p>
          <h1 id="tools-title">Herramientas para<br /><em>trabajar con control.</em></h1>
          <p>Conecta tu perfil fiscal, revisa tus documentos y prepara cada acción antes de ejecutarla.</p>
        </div>
        <div className="tools-hero-mark" aria-hidden="true"><span>MX</span><b>01</b><i /></div>
      </header>
      <section className="tools-profile-strip" aria-label="Perfil fiscal">
        <div className="tools-profile-mark">RFC</div>
        <div>
          <p className="eyebrow">PERFIL FISCAL</p>
          <h2>{fiscalProfile?.legalName || "Aún no has configurado una empresa"}</h2>
          <p>{fiscalProfile?.rfc || "Guarda RFC, régimen y domicilio fiscal para habilitar las conexiones por empresa."}</p>
        </div>
        <button type="button" className="button button-quiet" onClick={onOpenProfile}>Configurar perfil <span aria-hidden="true">→</span></button>
      </section>
      <section className="tools-section-heading"><div><p className="eyebrow">MÓDULOS</p><h2>Elige una herramienta</h2></div><span className="tools-count">{tools.filter((tool) => tool.status === "available").length} disponible · {tools.length - 1} por conectar</span></section>
      <section className="tools-grid" aria-label="Herramientas de ContaIA">
        {tools.map((tool) => {
          const available = tool.status === "available";
          return <article className={`tools-card is-${tool.status}`} key={tool.id}>
            <div className="tools-card-head"><span className="tools-card-icon" aria-hidden="true">{tool.icon}</span><span className={`tools-card-status is-${tool.status}`}>{STATUS_LABELS[tool.status]}</span></div>
            <p className="tools-card-eyebrow">{tool.eyebrow}</p>
            <h2>{tool.title}</h2>
            <p className="tools-card-description">{tool.description}</p>
            <div className="tools-card-foot"><small>{available ? "Análisis local disponible" : "Conexión y reglas pendientes"}</small><button type="button" className={`tools-card-action ${available ? "button-primary" : "button-quiet"}`} onClick={() => onOpenTool?.(tool)}>{tool.actionLabel} <span aria-hidden="true">{available ? "↗" : "→"}</span></button></div>
          </article>;
        })}
      </section>
    </main>
  );
}
