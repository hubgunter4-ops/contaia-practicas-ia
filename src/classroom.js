export const CLASSROOM_PHASES = Object.freeze([
  Object.freeze({ id: "activate", label: "Activación", short: "Conectar" }),
  Object.freeze({ id: "concept", label: "Concepto", short: "Aprender" }),
  Object.freeze({ id: "practice", label: "Práctica guiada", short: "Intentar" }),
  Object.freeze({ id: "review", label: "Revisión", short: "Verificar" }),
  Object.freeze({ id: "close", label: "Cierre", short: "Registrar" }),
]);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function normalizePhaseIndex(index) {
  const parsed = Number.isInteger(index) ? index : 0;
  return Math.min(Math.max(parsed, 0), CLASSROOM_PHASES.length - 1);
}

export function buildClassroomScene(module, phaseIndex = 0) {
  if (!module) throw new TypeError("Se requiere un módulo para construir la escena del aula.");
  const phase = CLASSROOM_PHASES[normalizePhaseIndex(phaseIndex)];
  const guide = module.guide ?? {};
  const foundation = module.teachFirst ?? {};
  const demonstration = module.demonstration ?? {};
  const concepts = Array.isArray(foundation.concepts) ? foundation.concepts : [];
  const steps = Array.isArray(guide.steps) ? guide.steps : [];
  let scene;

  if (phase.id === "activate") {
    scene = {
      id: phase.id,
      title: "Empecemos por una pregunta",
      lead: guide.opening || module.focus,
      calloutLabel: "OBJETIVO DE APRENDIZAJE",
      callout: module.outcome || module.focus,
      narration: `${guide.opening || module.focus} La meta de esta clase es: ${module.outcome || module.focus}`,
    };
  } else if (phase.id === "concept") {
    scene = {
      id: phase.id,
      title: "Una idea, un ejemplo y algo que comprobar",
      lead: foundation.why || module.focus,
      concepts,
      example: foundation.example || demonstration.after || "Trabaja solo con la información ficticia del ejercicio.",
      narration: `${foundation.why || module.focus} Ejemplo: ${foundation.example || demonstration.after || module.outcome}`,
    };
  } else if (phase.id === "practice") {
    scene = {
      id: phase.id,
      title: "Ahora lo intentas tú",
      lead: "Avanza por partes. Nora puede orientar el razonamiento, pero tu criterio y la evidencia deciden el resultado.",
      steps,
      before: demonstration.before,
      after: demonstration.after,
      why: demonstration.why,
      narration: `Vamos a practicar. ${steps.join(" ")} ${demonstration.why || "Si falta información, déjala como pendiente en lugar de adivinar."}`,
    };
  } else if (phase.id === "review") {
    scene = {
      id: phase.id,
      title: "Verifica antes de aceptar una respuesta",
      lead: guide.checkpoint || "¿Qué dato puedes comprobar y qué sigue siendo una hipótesis?",
      calloutLabel: "PREGUNTA DE CONTROL",
      callout: guide.checkpoint || module.outcome,
      guardrail: module.context?.protect || demonstration.why || "Distingue los hechos comprobados de los supuestos y solicita revisión humana cuando falte evidencia.",
      narration: `${guide.checkpoint || module.outcome} ${module.context?.protect || demonstration.why || "Contrasta la propuesta con la evidencia antes de aceptarla."}`,
    };
  } else {
    scene = {
      id: phase.id,
      title: "Cierra con una evidencia de aprendizaje",
      lead: guide.deliverable || module.outcome,
      calloutLabel: "PRODUCTO DE SALIDA",
      callout: guide.deliverable || module.outcome,
      summary: module.outcome || module.focus,
      narration: `Para cerrar, registra: ${guide.deliverable || module.outcome}. Recuerda: ${module.outcome || module.focus}`,
    };
  }

  return { ...scene, phase, phaseIndex: normalizePhaseIndex(phaseIndex) };
}

function renderSceneContent(scene, module) {
  if (scene.id === "activate" || scene.id === "review" || scene.id === "close") {
    return `<div class="classroom-callout"><span>${escapeHtml(scene.calloutLabel)}</span><p>${escapeHtml(scene.callout)}</p></div>${scene.guardrail ? `<p class="classroom-guardrail"><b>Recuerda:</b> ${escapeHtml(scene.guardrail)}</p>` : ""}`;
  }
  if (scene.id === "concept") {
    const concepts = scene.concepts.length
      ? `<ul class="classroom-concepts">${scene.concepts.map(([term, meaning]) => `<li><b>${escapeHtml(term)}</b><span>${escapeHtml(meaning)}</span></li>`).join("")}</ul>`
      : "";
    return `${concepts}<div class="classroom-example"><span>EJEMPLO SENCILLO</span><p>${escapeHtml(scene.example)}</p></div>`;
  }
  const steps = scene.steps.length
    ? `<ol class="classroom-steps">${scene.steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(step)}</li>`).join("")}</ol>`
    : `<p class="classroom-guardrail">${escapeHtml(module.focus)}</p>`;
  const demonstration = scene.before || scene.after
    ? `<div class="classroom-demonstration" data-testid="module-demo-${escapeHtml(module.id)}"><article><span>ANTES</span><p>${escapeHtml(scene.before || "—")}</p></article><article><span>PROPUESTA</span><p>${escapeHtml(scene.after || "—")}</p></article>${scene.why ? `<p class="classroom-demo-why"><b>Qué observar:</b> ${escapeHtml(scene.why)}</p>` : ""}</div>`
    : "";
  return `${steps}${demonstration}`;
}

function renderResources(module) {
  const context = module.context;
  const docs = context?.documents?.length
    ? `<div><b>Material de referencia</b><ul>${context.documents.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";
  const fields = context?.mustContain?.length
    ? `<div><b>Para preparar tu caso</b><ul>${context.mustContain.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";
  const tools = (module.toolkit ?? []).map((tool) => `<article class="classroom-tool"><div><a href="${escapeHtml(tool.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tool.name)} ↗</a><span>${escapeHtml(tool.role)}</span></div><p><b>Práctica:</b> ${escapeHtml(tool.activity)}</p><p><b>Límite:</b> ${escapeHtml(tool.guardrail)}</p></article>`).join("");
  const material = module.materialPath
    ? `<a class="classroom-material-link" href="${escapeHtml(module.materialPath)}" download>Descargar material de la clase <span aria-hidden="true">↓</span></a>`
    : `<p class="classroom-material-pending">El paquete didáctico detallado de esta clase está en preparación.</p>`;
  return `<details class="classroom-resources"><summary>Material y herramientas de apoyo <span aria-hidden="true">＋</span></summary><div class="classroom-resource-body">${docs || fields ? `<div class="classroom-resource-grid">${docs}${fields}</div>` : ""}${context?.format ? `<p><b>Formato sugerido:</b> ${escapeHtml(context.format)}</p>` : ""}${context?.protect ? `<p class="classroom-privacy"><b>Privacidad:</b> ${escapeHtml(context.protect)}</p>` : ""}${tools ? `<div class="classroom-tools"><b>Herramientas opcionales</b>${tools}</div>` : ""}${material}</div></details>`;
}

export function renderClassroom({ modules, exercises, state, onboarding = "", glossary = "", tutorPanel = "", assetPath = (file) => file, avatarLabel = "Nora está lista.", voiceSupported = false, anam = { status: "idle", error: "" } }) {
  const moduleIndex = Math.max(0, modules.findIndex(({ id }) => id === state.activeModuleId));
  const module = modules[moduleIndex] ?? modules[0];
  const scene = buildClassroomScene(module, state.coursePhaseIndex);
  const exercise = exercises.find(({ id }) => module.exerciseIds?.includes(id));
  const completedCount = state.completedModules.size;
  const percent = Math.round((completedCount / modules.length) * 100);
  const moduleButtons = modules.map((item, index) => {
    const selected = item.id === module.id;
    const completed = state.completedModules.has(item.id);
    return `<li><button type="button" class="classroom-module-button ${selected ? "is-active" : ""} ${completed ? "is-complete" : ""}" data-class-module="${escapeHtml(item.id)}" aria-current="${selected ? "step" : "false"}" aria-label="Clase ${String(index + 1).padStart(2, "0")}: ${escapeHtml(item.title)}${completed ? ", completada" : ""}"><span class="classroom-module-number">${String(index + 1).padStart(2, "0")}</span><span class="classroom-module-title">${escapeHtml(item.title)}</span><span class="classroom-module-mark" aria-hidden="true">${completed ? "✓" : ""}</span></button></li>`;
  }).join("");
  const phaseButtons = CLASSROOM_PHASES.map((phase, index) => `<button type="button" class="classroom-phase-button ${scene.phaseIndex === index ? "is-active" : ""} ${scene.phaseIndex > index ? "is-past" : ""}" data-class-phase="${index}" aria-current="${scene.phaseIndex === index ? "step" : "false"}"><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(phase.label)}</b></button>`).join("");
  const nextModule = modules[moduleIndex + 1];
  const phasePrevious = scene.phaseIndex > 0
    ? `<button type="button" class="classroom-step-control" data-class-phase="${scene.phaseIndex - 1}">← ${escapeHtml(CLASSROOM_PHASES[scene.phaseIndex - 1].short)}</button>`
    : `<span class="classroom-control-spacer"></span>`;
  const phaseNext = scene.phaseIndex < CLASSROOM_PHASES.length - 1
    ? `<button type="button" class="button button-primary" data-class-phase="${scene.phaseIndex + 1}">Siguiente fase <span aria-hidden="true">→</span></button>`
    : `<button type="button" class="button button-primary" data-action="classroom-complete" data-module-id="${escapeHtml(module.id)}">${state.completedModules.has(module.id) ? "Clase completada ✓" : "Marcar clase completada"}</button>`;
  const linkedExercise = exercise
    ? `<button type="button" class="classroom-practice-link" data-nav="${escapeHtml(exercise.id)}">Abrir práctica: ${escapeHtml(exercise.title)} <span aria-hidden="true">↗</span></button>`
    : "";
  const liveActive = anam.status === "live";
  const liveConnecting = anam.status === "connecting";
  const liveStatus = anam.error || (liveActive ? "En vivo · el micrófono está activo." : liveConnecting ? "Conectando con Nora…" : "Al conectar, Anam procesará el audio para transcribirlo.");
  const liveButtonLabel = liveActive ? "Desconectar avatar" : liveConnecting ? "Conectando…" : "Conectar avatar en vivo";
  const nextClass = nextModule && scene.phaseIndex === CLASSROOM_PHASES.length - 1
    ? `<button type="button" class="classroom-next-class" data-class-module="${escapeHtml(nextModule.id)}">Continuar a la clase ${String(moduleIndex + 2).padStart(2, "0")} <span aria-hidden="true">→</span></button>`
    : "";

  return `<main id="contenido" class="content classroom-content" tabindex="-1">
    <header class="classroom-heading"><div><p class="eyebrow">AULA GUIADA · CON NORA</p><h1>Aprender, practicar<br/><em>y verificar.</em></h1><p>Un recorrido por diez clases. Cambia de escena, pregunta a Nora y avanza a tu ritmo; conserva el criterio profesional en cada decisión.</p></div><div class="classroom-course-progress"><span>AVANCE DEL RECORRIDO</span><b>${completedCount}<small> / ${modules.length} clases</small></b><div class="progress-track" role="progressbar" aria-label="Clases completadas" aria-valuenow="${completedCount}" aria-valuemin="0" aria-valuemax="${modules.length}"><span style="width:${percent}%"></span></div><button type="button" class="classroom-portfolio-link" data-action="download-portfolio">Descargar portafolio ↓</button></div></header>
    <div class="classroom-layout">
      <aside class="classroom-rail" aria-label="Índice del curso"><div class="classroom-rail-heading"><p class="eyebrow">TU RECORRIDO</p><h2>Clases</h2><span>${String(moduleIndex + 1).padStart(2, "0")} / ${String(modules.length).padStart(2, "0")}</span></div><nav aria-label="Seleccionar clase"><ol class="classroom-module-list">${moduleButtons}</ol></nav><div class="classroom-rail-footer"><b>CASOS FICTICIOS</b><p>Usa ejemplos simulados. No compartas datos reales, personales o confidenciales.</p><button type="button" class="classroom-rail-link" data-section="lab">Ver prácticas simuladas ↗</button></div></aside>
      <section class="classroom-stage" data-testid="classroom-stage" aria-labelledby="classroom-module-title">
        <header class="classroom-stage-heading"><div><p class="eyebrow">CLASE ${String(module.week).padStart(2, "0")} · ESCENA ${String(scene.phaseIndex + 1).padStart(2, "0")}</p><h2 id="classroom-module-title">${escapeHtml(module.title)}</h2></div><span class="classroom-outcome">${state.completedModules.has(module.id) ? "COMPLETADA ✓" : "EN CURSO"}</span></header>
        <nav class="classroom-phase-nav" aria-label="Fases de la clase">${phaseButtons}</nav>
        <section class="classroom-scene" data-scene="${escapeHtml(scene.id)}" aria-live="polite"><div class="classroom-scene-copy"><p class="classroom-scene-kicker">${escapeHtml(scene.phase.label.toUpperCase())}</p><h3>${escapeHtml(scene.title)}</h3><p class="classroom-scene-lead">${escapeHtml(scene.lead)}</p>${renderSceneContent(scene, module)}</div><figure class="classroom-character ${state.tutor.avatarState === "explaining" && state.tutor.voiceEnabled ? "is-speaking" : ""} ${liveActive ? "is-live" : ""}" data-classroom-character role="img" aria-label="${escapeHtml(liveActive ? "Nora está impartiendo la clase en vivo." : avatarLabel)}"><div class="classroom-character-glow" aria-hidden="true"></div><img src="${escapeHtml(assetPath(`nora-${state.tutor.avatarState}.webp`))}" alt="" width="600" height="800" fetchpriority="low" ${liveActive ? "hidden" : ""}/><video id="nora-live-video" class="classroom-live-video" data-anam-video autoplay playsinline ${liveActive ? "" : "hidden"} aria-label="Video en vivo de Nora"></video><figcaption><span class="classroom-character-status" data-classroom-avatar-status>${escapeHtml(liveActive ? "Nora está en vivo." : avatarLabel)}</span><b>Nora · tutora de ContaIA</b></figcaption></figure></section>
        <div class="classroom-stage-controls"><button type="button" class="classroom-live-button" data-action="anam-toggle" data-testid="anam-toggle" aria-pressed="${liveActive}" ${liveConnecting ? "disabled" : ""}>${escapeHtml(liveButtonLabel)} <span aria-hidden="true">${liveActive ? "Ⅱ" : liveConnecting ? "…" : "◉"}</span></button><span class="classroom-live-status" data-anam-status role="status" aria-live="polite">${escapeHtml(liveStatus)}</span><button type="button" class="classroom-narrate-button" data-action="classroom-narrate" data-classroom-voice-button ${voiceSupported ? "" : "disabled"}><span data-classroom-voice-label>${state.tutor.voiceEnabled && state.tutor.avatarState === "explaining" ? "Detener narración" : "Escuchar esta escena"}</span> <span aria-hidden="true" data-classroom-voice-icon>${state.tutor.voiceEnabled && state.tutor.avatarState === "explaining" ? "Ⅱ" : "▶"}</span></button>${linkedExercise}</div>
        <p class="classroom-live-privacy">El audio se procesa en Anam para la transcripción y el video. Nora responde desde el backend de ContaIA; no se envían tu progreso, notas ni respuestas guardadas.</p>
        <div class="classroom-phase-controls">${phasePrevious}${phaseNext}${nextClass}</div>
        ${renderResources(module)}
        <p class="classroom-storage-note" role="status">${escapeHtml(state.storageWarning || "Tu progreso de clases y prácticas se guarda localmente; el chat y tus respuestas no se almacenan.")}</p>
      </section>
      ${tutorPanel}
    </div>
    ${onboarding}
    ${glossary}
    <p class="course-disclaimer"><strong>Alcance educativo.</strong> Los casos del laboratorio son ficticios. Los módulos fiscales no determinan obligaciones ni sustituyen la revisión de fuentes vigentes y de una persona profesional calificada.</p>
  </main>`;
}
