import { TOOL_AVAILABILITY, TOOL_DEFINITIONS } from "./catalog.js";

export const defaultTools = TOOL_DEFINITIONS;

function ToolStatus({ availability }) {
  const status = TOOL_AVAILABILITY[availability] ?? TOOL_AVAILABILITY.preparation;
  return <span className={`tools-card-status ${status.className}`}>{status.label}</span>;
}

export default function ToolsPanel({ tools = defaultTools, fiscalProfile, onOpenTool, onOpenProfile }) {
  return (
    <main className="content tools-page" aria-labelledby="tools-title">
      <header className="tool-shell-header tools-hero">
        <div className="tool-shell-copy">
          <p className="tool-shell-eyebrow">CONTAIA · CENTRO OPERATIVO</p>
          <h1 id="tools-title">Herramientas fiscales con claridad.</h1>
          <p className="tool-shell-description">Configura tu perfil, revisa el estado de cada herramienta y decide el siguiente paso.</p>
        </div>
        <div className="tool-shell-actions"><span className="tool-shell-status is-info">{tools.filter((tool) => tool.availability === "ready").length} lista · {tools.filter((tool) => tool.availability !== "ready").length} en preparación</span></div>
      </header>
      <section className="tools-profile-strip" aria-label="Perfil fiscal">
        <div className="tools-profile-mark">RFC</div>
        <div className="tools-profile-summary"><p className="eyebrow">PERFIL FISCAL</p><h2>{fiscalProfile?.legalName || "Aún no has configurado una empresa"}</h2><p>{fiscalProfile?.rfc || "Guarda RFC, régimen y domicilio fiscal para habilitar conexiones por empresa."}</p></div>
        <button type="button" className="button button-quiet" onClick={onOpenProfile}>Configurar perfil <span aria-hidden="true">→</span></button>
      </section>
      <section className="tools-section-heading"><div><p className="eyebrow">HERRAMIENTAS POR OBJETIVO</p><h2>Elige una herramienta</h2></div></section>
      <section className="tools-grid" aria-label="Herramientas de ContaIA">
        {tools.map((tool) => {
          const ready = tool.availability === "ready";
          return <article className={`tools-card ${TOOL_AVAILABILITY[tool.availability]?.className || "is-preparation"}`} key={tool.id}>
            <div className="tools-card-head"><span className="tools-card-icon" aria-hidden="true">{tool.icon}</span><ToolStatus availability={tool.availability}/></div>
            <p className="tools-card-eyebrow">{tool.eyebrow}</p><h2>{tool.title}</h2><p className="tools-card-description">{tool.description}</p>
            <div className="tools-card-foot"><small>{tool.detail}</small><button type="button" className={`tools-card-action ${ready ? "button-primary" : "button-quiet"}`} onClick={() => onOpenTool?.(tool)}>{tool.actionLabel} <span aria-hidden="true">{ready ? "↗" : "→"}</span></button></div>
          </article>;
        })}
      </section>
    </main>
  );
}
