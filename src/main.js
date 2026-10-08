import { categories, exercises } from "./exercises.js";
import { calculateDifference, evaluateChoice, getGuidedStage, scoreRubric } from "./logic.js";
import { COURSE, courseModules } from "./course.js";
import { createPortfolioMarkdown, loadProgress, saveProgress } from "./progress.js";
import { toTutorContext } from "./tutor/context.js";
import { detectLocalIntent, getLocalTutorReply } from "./tutor/local.js";
import { createSpeechSpeaker } from "./tutor/speech.js";

const app = document.querySelector("#app");
const state = {
  section: "course",
  current: "home",
  attempted: new Set(),
  completed: new Set(),
  revealed: new Set(),
  hints: new Set(),
  answers: new Map(),
  selections: new Map(),
  feedback: new Map(),
  tutor: { exerciseId: null, messages: [], collapsed: true, voiceEnabled: false, avatarState: "idle" },
};

let progressStorage = null;
try { progressStorage = window.localStorage; } catch { /* El navegador puede bloquear el almacenamiento local. */ }
const restoredProgress = loadProgress(progressStorage);
state.completedModules = new Set(restoredProgress.completedModules);
state.completed = new Set(restoredProgress.completedExercises);
state.storageWarning = progressStorage ? "" : "El navegador no permite guardar el progreso; esta sesión seguirá en memoria.";

function persistProgress() {
  const saved = saveProgress({
    completedModules: [...state.completedModules],
    completedExercises: [...state.completed],
  }, progressStorage);
  state.storageWarning = saved ? "" : "No se pudo guardar el progreso local; podrás continuar en memoria durante esta sesión.";
  return saved;
}

function downloadPortfolio() {
  const markdown = createPortfolioMarkdown({
    completedModules: [...state.completedModules],
    completedExercises: [...state.completed],
  }, courseModules, exercises, new Date());
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `portafolio-contaia-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function resetTutor(exerciseId = null) {
  tutorSpeaker.stop();
  state.tutor = { exerciseId, messages: [], collapsed: true, voiceEnabled: false, avatarState: "idle" };
}

function tutorAvatarLabel() {
  return { thinking: "Nora está pensando.", explaining: "Nora está explicando.", celebrating: "Nora celebra el avance." }[state.tutor.avatarState] || "Nora está lista para ayudarte.";
}

const tutorSpeaker = createSpeechSpeaker({
  onStateChange: (voiceState) => {
    if (voiceState === "speaking") state.tutor.avatarState = "explaining";
    else if (state.tutor.avatarState === "explaining") state.tutor.avatarState = "idle";
    if (state.section === "lab" && state.current === state.tutor.exerciseId) render();
  },
});

function renderTutorPanel(exercise) {
  const messages = state.tutor.messages.map((message) => `<div class="tutor-message tutor-message-${message.role}" data-testid="nora-message"><span class="tutor-message-label">${message.role === "assistant" ? "NORA · TUTOR LOCAL" : "TÚ"}</span><p>${escapeHtml(message.text)}</p></div>`).join("");
  const bodyId = `tutor-panel-${escapeHtml(exercise.id)}`;
  return `<section class="tutor-panel" data-testid="nora-panel" aria-labelledby="tutor-heading">
    <header class="tutor-header">
      <div class="tutor-identity"><div class="tutor-avatar tutor-avatar-${escapeHtml(state.tutor.avatarState)}" role="img" aria-label="${escapeHtml(tutorAvatarLabel())}"><span aria-hidden="true">N</span></div><div><p class="tutor-kicker">APOYO PEDAGÓGICO</p><h2 id="tutor-heading">Nora · Tutor local</h2><span class="tutor-status"><i aria-hidden="true"></i> Respuestas preparadas, sin conexión externa</span></div></div>
      <div class="tutor-controls"><button class="tutor-control" data-testid="nora-voice" type="button" data-action="tutor-voice" aria-pressed="${state.tutor.voiceEnabled}" ${tutorSpeaker.supported ? "" : "disabled"}>${state.tutor.voiceEnabled ? "Voz activa" : "Activar voz"}</button><button class="tutor-control" data-testid="nora-toggle" type="button" data-action="tutor-toggle" aria-expanded="${!state.tutor.collapsed}" aria-controls="${bodyId}">${state.tutor.collapsed ? "Abrir tutor" : "Cerrar tutor"}</button></div>
    </header>
    <div id="${bodyId}" class="tutor-body" ${state.tutor.collapsed ? "hidden" : ""}>
      <div class="tutor-log" data-testid="nora-log" role="log" aria-live="polite" aria-relevant="additions text">${messages || `<div class="tutor-empty"><b>Empieza con una pregunta breve.</b><span>Prueba “Dame una pista” o “¿Cuál es el siguiente paso?”.</span></div>`}</div>
      <form class="tutor-form" data-testid="nora-form" data-tutor-form>
        <label class="sr-only" for="tutor-input">Pregunta al tutor local</label><input id="tutor-input" data-testid="nora-input" data-tutor-input maxlength="500" autocomplete="off" placeholder="Escribe una duda sobre este ejercicio…"/><button class="button button-primary" type="submit">Enviar <span aria-hidden="true">→</span></button>
      </form>
      <p class="tutor-disclaimer">El tutor usa solo las ayudas del ejercicio ficticio. No compartas información real, personal o confidencial.</p>
    </div>
  </section>`;
}

function sendLocalTutorMessage(text) {
  const exercise = exercises.find((item) => item.id === state.current);
  if (!exercise || !text.trim() || state.tutor.exerciseId !== exercise.id) return;
  const stage = getGuidedStage({ attempted: state.attempted.has(exercise.id), hintSeen: state.hints.has(exercise.id), solutionSeen: state.revealed.has(exercise.id) });
  const context = toTutorContext(exercise, stage);
  const intent = detectLocalIntent(text);
  const reply = getLocalTutorReply({ intent, context });
  state.tutor.messages.push({ role: "user", text: text.trim() }, { role: "assistant", text: reply });
  state.tutor.collapsed = false;
  state.tutor.avatarState = intent === "hint" ? "thinking" : "explaining";
  render();
  if (state.tutor.voiceEnabled) tutorSpeaker.say(reply);
  document.querySelector("[data-tutor-input]")?.focus({ preventScroll: true });
}

function logoMark() {
  return `<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M7 15a3 3 0 0 1 3-3h10l4 4h14a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill="currentColor"/><path d="M15 23h18M15 28h18M15 33h9" stroke="#fffaf3" stroke-width="2" stroke-linecap="round"/><circle cx="35" cy="34" r="5" fill="#d8b26e"/><path d="M33 34h4" stroke="#7a2e3a" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function sidebar() {
  const groupMarkup = categories.map((category) => {
    const items = exercises.filter((exercise) => exercise.category === category);
    if (!items.length) return "";
    return `<section class="nav-group" aria-label="${escapeHtml(category)}"><p class="nav-label">${escapeHtml(category)}</p>${items.map((exercise, index) => `
      <button class="nav-item ${state.section === "lab" && state.current === exercise.id ? "is-active" : ""}" type="button" data-nav="${exercise.id}" aria-current="${state.section === "lab" && state.current === exercise.id ? "page" : "false"}">
        <span class="nav-index">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(exercise.title)}</span>${state.completed.has(exercise.id) ? '<span class="nav-done" aria-label="Completado">✓</span>' : ""}
      </button>`).join("")}</section>`;
  }).join("");

  return `<aside class="sidebar">
    <button class="brand-button" type="button" data-nav="home" aria-label="Ir al panel principal">
      ${logoMark()}<span class="brand-copy"><strong>Laboratorio</strong><b>Conta<span>IA</span></b></span>
    </button>
    <div class="sidebar-divider"></div>
    <p class="nav-label sidebar-section-label">SECCIÓN 02 · LABORATORIO</p>
    <button class="nav-item nav-home ${state.section === "lab" && state.current === "home" ? "is-active" : ""}" type="button" data-nav="home" aria-current="${state.section === "lab" && state.current === "home" ? "page" : "false"}">
      <span class="home-glyph" aria-hidden="true">⌂</span><span>Panel de práctica</span>
    </button>
    ${groupMarkup}
    <div class="sidebar-bottom">
      <div class="folio-stamp"><span class="stamp-dot"></span><div><b>CASOS FICTICIOS</b><small>Sin datos de clientes</small></div></div>
      <a class="data-link" href="/data/transacciones-ficticias.csv" download>↓ Descargar datos de ejemplo</a>
    </div>
  </aside>`;
}

function topbar() {
  const done = state.completed.size;
  const pageLabel = state.section === "course" ? "Plan del curso" : state.current === "home" ? "Resumen" : "Ejercicio";
  return `<header class="topbar"><div class="breadcrumb"><span>LABORATORIO CONTAIA</span><i aria-hidden="true">/</i><strong>${pageLabel}</strong></div>
    <nav class="section-tabs" aria-label="Secciones principales">
      <button class="section-tab ${state.section === "course" ? "is-active" : ""}" type="button" data-section="course" aria-current="${state.section === "course" ? "page" : "false"}"><b>01</b><span>Curso completo</span></button>
      <button class="section-tab ${state.section === "lab" ? "is-active" : ""}" type="button" data-section="lab" aria-current="${state.section === "lab" ? "page" : "false"}"><b>02</b><span>Laboratorio práctico</span></button>
    </nav>
    <div class="topbar-right"><span class="edition"><span class="edition-dot"></span>Edición educativa</span>${state.section === "lab" ? `<span class="progress-mini"><b>${done}</b> / ${exercises.length} prácticas</span>` : ""}</div>
  </header>`;
}

function renderHome() {
  const done = state.completed.size;
  const percent = Math.round((done / exercises.length) * 100);
  const first = exercises.find((exercise) => !state.completed.has(exercise.id)) ?? exercises[0];
  return `<main id="contenido" class="content home-content" tabindex="-1">
    <div class="hero-kicker"><span class="kicker-rule"></span><span>APRENDER · PRACTICAR · VERIFICAR</span></div>
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">IA aplicada a la contaduría · México</p>
        <h1>Primero intenta.<br><em>Luego verifica.</em></h1>
        <p class="hero-lede">Un laboratorio para practicar criterio contable con IA, usando ejercicios seguros y datos inventados. Sin atajos mágicos; con explicaciones que sí sirven.</p>
        <button class="button button-primary" type="button" data-nav="${first.id}">Empezar una práctica <span aria-hidden="true">↗</span></button>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="paper-sheet"><div class="paper-tab">EXP. 06 / 26</div><div class="paper-title">Conciliación<br/>bancaria</div><div class="paper-rule"></div><div class="paper-row"><span>LIBRO</span><b>$5,410</b><i>✓</i></div><div class="paper-row paper-marked"><span>BANCO</span><b>$5,323</b><i>!</i></div><div class="paper-note">¿Qué falta registrar?</div><div class="paper-stamp">SIMULADO</div></div>
        <div class="hero-orbit hero-orbit-one"></div><div class="hero-orbit hero-orbit-two"></div><div class="hero-index">01—09</div>
      </div>
      <div class="hero-footer"><span><i>01</i> Prueba con casos ficticios</span><span><i>02</i> Recibe pistas y retroalimentación</span><span><i>03</i> Revisa una solución modelo</span></div>
    </section>
    <section class="notice-strip" aria-label="Aviso de confidencialidad"><span class="notice-icon" aria-hidden="true">!</span><p><strong>Expediente seguro.</strong> No pegues información real, personal o confidencial. Los casos son educativos y no constituyen asesoría contable ni fiscal.</p><button type="button" data-nav="isr" class="notice-link">Ver el alcance <span aria-hidden="true">→</span></button></section>
    <section class="overview-row">
      <div class="section-heading"><div><p class="eyebrow">TU RECORRIDO</p><h2>Práctica en curso</h2></div><span class="count-pill">${done} de ${exercises.length} completadas</span></div>
      <div class="progress-track" role="progressbar" aria-label="Prácticas completadas" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${exercises.length}"><span style="width:${percent}%"></span></div>
      <div class="module-list">${exercises.map((exercise, index) => `<button class="module-row" type="button" data-nav="${exercise.id}">
        <span class="module-number">${String(index + 1).padStart(2, "0")}</span><span class="module-info"><small>${escapeHtml(exercise.category)} · ${exercise.time}</small><strong>${escapeHtml(exercise.title)}</strong></span>
        <span class="module-status ${state.completed.has(exercise.id) ? "is-complete" : ""}">${state.completed.has(exercise.id) ? "Completada ✓" : "Abrir práctica →"}</span></button>`).join("")}</div>
    </section>
    <section class="method-note"><div class="method-label">MÉTODO DE TRABAJO <span>02 / 03</span></div><div><h2>La IA propone.<br/>Tu criterio dispone.</h2><p>Usa las respuestas de una herramienta como borrador. Confirma cálculos, evidencia y reglas aplicables antes de tomar decisiones o compartir conclusiones.</p></div><a href="/data/transacciones-ficticias.csv" download class="text-link">Explorar el conjunto de datos <span>↗</span></a></section>
    <p class="home-footnote">${escapeHtml(state.storageWarning || "Las respuestas y selecciones no se guardan; solo los módulos y prácticas completados permanecen en este navegador.")}</p>
  </main>`;
}

function renderModuleGuide(module) {
  const moduleGuide = module.guide;
  if (!moduleGuide) return "";
  const steps = moduleGuide.steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(step)}</li>`).join("");
  const foundation = module.teachFirst;
  const concepts = foundation?.concepts?.map(([term, meaning]) => `<li><b>${escapeHtml(term)}</b><span>${escapeHtml(meaning)}</span></li>`).join("") || "";
  const tools = module.toolkit?.map((tool) => `<article class="module-tool-card"><div class="module-tool-top"><a href="${escapeHtml(tool.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tool.name)} ↗</a><span>${escapeHtml(tool.role)}</span></div><p><b>Actividad:</b> ${escapeHtml(tool.activity)}</p><p class="module-tool-guardrail"><b>Límite:</b> ${escapeHtml(tool.guardrail)}</p></article>`).join("") || "";
  return `<aside class="module-nora-guide" data-testid="module-nora-${escapeHtml(module.id)}" aria-label="Guía de Nora para ${escapeHtml(module.title)}">
    <div class="module-nora-heading"><div class="module-nora-avatar" aria-hidden="true">N</div><div><p class="module-nora-kicker">NORA · GUÍA DEL MÓDULO</p><strong>Te acompaño a verificar, no a adivinar.</strong></div></div>
    ${foundation ? `<div class="module-nora-foundation"><div><b>Aprende primero</b><p>${escapeHtml(foundation.why)}</p></div><ul>${concepts}</ul><p class="module-nora-example"><strong>Ejemplo sencillo:</strong> ${escapeHtml(foundation.example)}</p></div>` : ""}
    ${tools ? `<div class="module-toolkit" data-testid="module-toolkit-${escapeHtml(module.id)}"><div class="module-toolkit-heading"><b>Herramientas para practicar</b><span>Opcionales · siempre con datos ficticios</span></div><div class="module-tool-grid">${tools}</div></div>` : ""}
    <p class="module-nora-opening">${escapeHtml(moduleGuide.opening)}</p>
    <div class="module-nora-grid"><div><b>Ruta en 3 pasos</b><ol>${steps}</ol></div><div class="module-nora-check"><b>Pregunta de control</b><p>${escapeHtml(moduleGuide.checkpoint)}</p><b>Evidencia de salida</b><p>${escapeHtml(moduleGuide.deliverable)}</p></div></div>
  </aside>`;
}

function renderCourse() {
  const moduleMarkup = courseModules.map((module, index) => {
    const linkedExercises = module.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter(Boolean);
    const moduleCompleted = state.completedModules.has(module.id);
    const practiceLinks = linkedExercises.map((exercise) => `<button type="button" class="course-practice-link" data-nav="${escapeHtml(exercise.id)}">${escapeHtml(exercise.title)} <span aria-hidden="true">↗</span></button>`).join("");
    const material = module.materialPath
      ? `<a class="course-material-link" href="${escapeHtml(module.materialPath)}" download>Descargar materiales del módulo <span aria-hidden="true">↓</span></a>`
      : `<span class="course-material-pending">Paquete didáctico detallado: pendiente</span>`;
    return `<details class="course-module-card" ${index === 0 ? "open" : ""}>
      <summary><span class="course-module-number">${String(module.week).padStart(2, "0")}</span><span class="course-module-heading"><small>SEMANA ${module.week} · ${module.hours} HORAS</small><strong>${escapeHtml(module.title)}</strong></span><span class="course-module-toggle" aria-hidden="true">＋</span></summary>
      <div class="course-module-body"><p><b>Enfoque:</b> ${escapeHtml(module.focus)}</p><p><b>Resultado de aprendizaje:</b> ${escapeHtml(module.outcome)}</p>${renderModuleGuide(module)}<div class="course-links-block"><b>Práctica vinculada</b><div class="course-practice-links">${practiceLinks}</div></div><div class="course-resource-row">${material}<button type="button" class="module-progress-toggle" data-module-toggle="${escapeHtml(module.id)}" aria-pressed="${moduleCompleted}">${moduleCompleted ? "Módulo completado ✓" : "Marcar módulo completado"}</button></div></div>
    </details>`;
  }).join("");

  return `<main id="contenido" class="content course-content" tabindex="-1">
    <div class="hero-kicker"><span class="kicker-rule"></span><span>SECCIÓN 01 · RUTA DE APRENDIZAJE</span></div>
    <section class="course-hero"><div class="course-hero-copy"><p class="eyebrow">${COURSE.hours} HORAS · ${COURSE.weeks} SEMANAS · MÉXICO</p><h1>IA para contaduría,<br/><em>con criterio verificable.</em></h1><p>Un recorrido desde los fundamentos y los prompts hasta la integración de flujos contables. Cada módulo se conecta con una práctica ficticia del laboratorio.</p><div class="course-hero-actions"><a class="button button-primary" href="/docs/curso/plan-trabajo-curso-ia-contaduria.md" download>Descargar plan de trabajo <span aria-hidden="true">↓</span></a><button class="button course-secondary-button" type="button" data-action="download-portfolio">Descargar portafolio <span aria-hidden="true">↓</span></button><button class="button course-secondary-button" type="button" data-section="lab">Ir al laboratorio <span aria-hidden="true">→</span></button></div></div><div class="course-hero-stamp" aria-label="40 horas en 10 módulos"><span>RECORRIDO</span><strong>01—10</strong><i>3 h guiadas<br/>+ 1 h independiente</i></div></section>
    <div class="course-stat-row"><div><b>${COURSE.hours}</b><span>horas de trabajo</span></div><div><b>${state.completedModules.size}/${courseModules.length}</b><span>módulos completados</span></div><div><b>${state.completed.size}/${exercises.length}</b><span>prácticas completadas</span></div></div>
    <p class="progress-storage-note" role="status">${escapeHtml(state.storageWarning || "Solo se guardan en este navegador los módulos y prácticas completados; nunca tus respuestas ni selecciones.")}</p>
    <section class="course-outcomes"><div><p class="eyebrow">AL FINAL DEL RECORRIDO</p><h2>Aprender a proponer y, sobre todo, a verificar.</h2></div><ul><li>Redactar instrucciones claras, acotadas y verificables.</li><li>Usar IA como apoyo para clasificar, conciliar, analizar y comunicar.</li><li>Proteger datos y reconocer cuándo falta evidencia.</li><li>Tratar una anomalía como señal de revisión, no como conclusión.</li></ul></section>
    <section class="course-curriculum"><div class="section-heading"><div><p class="eyebrow">40 HORAS · 10 MÓDULOS</p><h2>El plan de trabajo</h2></div><span class="count-pill">3 h guiadas + 1 h independiente / semana</span></div><div class="course-module-list">${moduleMarkup}</div></section>
    <p class="course-disclaimer"><strong>Alcance educativo.</strong> Los casos del laboratorio son ficticios. Los módulos fiscales no determinan obligaciones ni sustituyen la revisión de fuentes vigentes y de una persona profesional calificada.</p>
  </main>`;
}

function renderTable(title, rows) {
  return `<div class="ledger-card"><div class="ledger-head"><span>${escapeHtml(title)}</span><span>MXN · SIMULADO</span></div><table><thead><tr><th>FECHA</th><th>CONCEPTO</th><th>IMPORTE</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index === 2 ? "amount-cell" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderChoices(exercise) {
  const selected = state.selections.get(exercise.id) ?? "";
  return `<fieldset class="answer-options"><legend>${escapeHtml(exercise.question)}</legend>${exercise.choices.map((choice, index) => `<label class="answer-option ${selected === choice.id ? "is-selected" : ""}"><input type="radio" name="choice" value="${escapeHtml(choice.id)}" data-choice="${exercise.id}" ${selected === choice.id ? "checked" : ""}/><span class="option-marker">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(choice.label)}</span></label>`).join("")}</fieldset>`;
}

function renderWritten(exercise) {
  const value = state.answers.get(exercise.id) ?? "";
  const rubric = exercise.rubric.map((criterion, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(criterion.label)}</li>`).join("");
  return `<div class="writing-prompt"><label for="written-answer">${exercise.kind === "prompt" ? "TU INSTRUCCIÓN PARA LA IA" : "TU BORRADOR DE REPORTE"}</label><textarea id="written-answer" data-answer="${exercise.id}" rows="7" maxlength="1600" placeholder="Escribe aquí tu propuesta. Trabaja solo con los datos ficticios del caso.">${escapeHtml(value)}</textarea><div class="field-meta"><span>No se envía ni se guarda fuera de esta sesión.</span><span>${value.length} / 1600</span></div></div>
    <div class="rubric-panel"><div class="rubric-heading"><span>RÚBRICA DE REVISIÓN</span><span>Al comprobar, verás qué elementos aparecen</span></div><ol>${rubric}</ol></div>`;
}

function renderFeedback(exercise) {
  const feedback = state.feedback.get(exercise.id);
  if (!feedback) return `<div class="feedback-placeholder" aria-hidden="true"><span>✳</span><p>Tu retroalimentación aparecerá aquí cuando compruebes la respuesta.</p></div>`;
  const style = feedback.correct ? "feedback-good" : feedback.status === "missing" ? "feedback-neutral" : "feedback-revise";
  const checklist = feedback.checklist ? `<ul class="feedback-checklist">${feedback.checklist.map((item) => `<li class="${item.met ? "met" : "unmet"}"><span>${item.met ? "✓" : "○"}</span>${escapeHtml(item.label)}</li>`).join("")}</ul>` : "";
  return `<div class="feedback-box ${style}" role="status" aria-live="polite"><div class="feedback-title"><span>${feedback.correct ? "✓" : feedback.status === "missing" ? "i" : "↻"}</span><strong>${escapeHtml(feedback.title)}</strong>${feedback.scoreText ? `<b>${escapeHtml(feedback.scoreText)}</b>` : ""}</div><p>${escapeHtml(feedback.message)}</p>${checklist}${feedback.explanation ? `<div class="explanation"><b>Por qué</b><p>${escapeHtml(feedback.explanation)}</p></div>` : ""}</div>`;
}

function renderGuidedProgress(stage) {
  const steps = ["Intento", "Pista", "Ejemplo", "Comparación"];
  const index = ["attempt", "hint", "example", "compare"].indexOf(stage);
  return `<ol class="guided-progress" aria-label="Etapas de esta práctica">${steps.map((label, stepIndex) => `<li class="guided-progress-step ${stepIndex < index ? "is-complete" : ""} ${stepIndex === index ? "is-current" : ""}" ${stepIndex === index ? 'aria-current="step"' : ""}><span>${stepIndex + 1}</span>${label}</li>`).join("")}</ol>`;
}

function renderExercise(exercise) {
  const isWritten = exercise.kind === "prompt" || exercise.kind === "written";
  const feedback = renderFeedback(exercise);
  const stage = getGuidedStage({ attempted: state.attempted.has(exercise.id), hintSeen: state.hints.has(exercise.id), solutionSeen: state.revealed.has(exercise.id) });
  const showHint = state.hints.has(exercise.id);
  const showSolution = state.revealed.has(exercise.id);
  const stageProgress = renderGuidedProgress(stage);
  const scenario = exercise.scenario ? `<div class="case-box"><span class="case-stamp">CASO FICTICIO</span><p>${escapeHtml(exercise.scenario)}</p></div>` : "";
  const tables = exercise.kind === "reconciliation" ? `<div class="ledger-grid">${renderTable("01 · EXTRACTO DE BANCO", exercise.bank)}${renderTable("02 · LIBRO AUXILIAR", exercise.ledger)}</div>` : "";
  const form = isWritten ? renderWritten(exercise) : renderChoices(exercise);
  const modelSolution = exercise.solution ?? exercise.explanation ?? "Revisa los datos del caso y contrasta tu razonamiento con la explicación del ejercicio.";
  const selectedChoice = exercise.choices?.find((choice) => choice.id === state.selections.get(exercise.id));
  const attemptText = isWritten ? (state.answers.get(exercise.id) ?? "").trim() : selectedChoice?.label ?? "";
  const solution = showSolution ? `<div class="comparison-panel" role="group" aria-label="Comparación entre tu intento y la respuesta modelo"><section class="comparison-column"><h3>Tu intento</h3><p class="comparison-answer">${escapeHtml(attemptText || "Sin respuesta escrita.")}</p></section><section class="comparison-column is-model"><h3>Modelo para contrastar</h3><p class="comparison-answer">${escapeHtml(modelSolution)}</p></section></div>` : "";
  const hint = showHint ? `<div class="hint-box"><span aria-hidden="true">↳</span><p><b>Pista:</b> ${escapeHtml(exercise.hint)}</p></div>` : "";
  const previousIndex = exercises.findIndex((item) => item.id === exercise.id);
  const nextExercise = exercises[previousIndex + 1];
  return `<main id="contenido" class="content exercise-content" tabindex="-1">
    <div class="exercise-topline"><button class="back-link" type="button" data-nav="home">← Volver al recorrido</button><span class="exercise-count">PRÁCTICA ${String(previousIndex + 1).padStart(2, "0")} <i>/</i> ${String(exercises.length).padStart(2, "0")}</span></div>
    <div class="exercise-heading"><div class="exercise-number">${String(previousIndex + 1).padStart(2, "0")}</div><div><p class="eyebrow">${escapeHtml(exercise.category)} · ${exercise.time}</p><h1>${escapeHtml(exercise.title)}</h1><p class="exercise-intro">${escapeHtml(exercise.intro)}</p></div><span class="case-tag">PRÁCTICA</span></div>
    ${scenario}${tables}${stageProgress}
    <div class="workbench"><section class="work-main" aria-label="Área de práctica">${form}<div class="exercise-actions">
      <button type="button" class="button button-primary" data-action="check" data-id="${exercise.id}">Comprobar mi respuesta <span aria-hidden="true">→</span></button>
      <button type="button" class="button button-quiet" data-action="hint" data-id="${exercise.id}" ${stage === "hint" ? "" : "disabled"}>${stage === "hint" ? "Pedir una pista" : showHint ? "Pista consultada" : "Pista después del intento"}</button>
      <button type="button" class="button button-quiet" data-action="solution" data-id="${exercise.id}" ${stage === "example" ? "" : "disabled"}>${stage === "example" ? "Ver ejemplo y comparar" : showSolution ? "Comparación visible" : "Ejemplo después de la pista"}</button>
    </div></section><aside class="work-feedback" aria-label="Retroalimentación">${feedback}${hint}${solution}</aside></div>
    ${renderTutorPanel(exercise)}
    <footer class="exercise-footer"><span>${state.completed.has(exercise.id) ? '<b class="completed-mark">✓</b> Práctica completada en esta sesión' : "Tu respuesta se queda en este navegador durante la sesión"}</span>${nextExercise ? `<button type="button" class="next-link" data-nav="${nextExercise.id}">Siguiente práctica <span>→</span></button>` : `<button type="button" class="next-link" data-nav="home">Terminar recorrido <span>→</span></button>`}</footer>
    <p class="progress-storage-note" role="status">${escapeHtml(state.storageWarning || "Solo se conserva el estado de finalización; la respuesta escrita o seleccionada no se guarda.")}</p>
    <p class="disclaimer-inline">Material educativo con datos ficticios. No constituye asesoría profesional, contable o fiscal.</p>
  </main>`;
}

function render() {
  const exercise = state.section === "lab" ? exercises.find((item) => item.id === state.current) : null;
  const content = state.section === "course" ? renderCourse() : exercise ? renderExercise(exercise) : renderHome();
  app.innerHTML = `<div class="app-shell">${sidebar()}<div class="main-shell">${topbar()}${content}</div></div>`;
}

function checkAnswer(exercise) {
  if (exercise.kind === "prompt" || exercise.kind === "written") {
    const answer = state.answers.get(exercise.id) ?? "";
    const result = scoreRubric(answer, exercise.rubric);
    if (!answer.trim()) {
      state.feedback.set(exercise.id, { status: "missing", title: "Aún no hay respuesta", message: "Escribe un borrador breve y después comprueba sus elementos." });
    } else {
      state.attempted.add(exercise.id);
      const threshold = Math.ceil(result.total * 0.6);
      const correct = result.score >= threshold;
      if (correct) state.completed.add(exercise.id);
      state.feedback.set(exercise.id, {
        status: correct ? "correct" : "revise", correct,
        title: correct ? "Buen borrador: ya tiene estructura" : "Hay elementos que puedes reforzar",
        message: correct ? "La rúbrica reconoce varios elementos clave. Revisa la solución modelo y valida los hechos antes de usar un texto real." : "Usa las pistas para completar el contexto, la tarea, el formato o las verificaciones que hagan falta.",
        scoreText: `${result.score} / ${result.total}`,
        checklist: result.checklist,
      });
    }
  } else {
    const selected = state.selections.get(exercise.id);
    const result = evaluateChoice(selected, exercise);
    if (selected) state.attempted.add(exercise.id);
    if (result.correct) state.completed.add(exercise.id);
    state.feedback.set(exercise.id, {
      status: result.status,
      correct: result.correct,
      title: result.status === "missing" ? "Selecciona una opción" : result.correct ? "Criterio bien aplicado" : "Revisa la pista y vuelve a intentar",
      message: result.status === "missing" ? result.message : result.correct ? "Correcto. Antes de llevar esta idea a un caso real, verifica la evidencia y las reglas aplicables." : "Esta elección no es la más prudente con los datos disponibles. La solución sigue oculta hasta que la consultes.",
      explanation: result.correct ? exercise.explanation : "",
    });
  }
  persistProgress();
  render();
}

app.addEventListener("click", (event) => {
  const section = event.target.closest("[data-section]");
  if (section) {
    state.section = section.dataset.section === "lab" ? "lab" : "course";
    resetTutor(state.section === "lab" ? "home" : null);
    if (state.section === "lab") state.current = "home";
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const moduleToggle = event.target.closest("[data-module-toggle]");
  if (moduleToggle) {
    const moduleId = moduleToggle.dataset.moduleToggle;
    if (!courseModules.some((module) => module.id === moduleId)) return;
    if (state.completedModules.has(moduleId)) state.completedModules.delete(moduleId);
    else state.completedModules.add(moduleId);
    persistProgress();
    render();
    return;
  }
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    const destination = nav.dataset.nav;
    if (state.section !== "lab" || state.current !== destination) resetTutor(destination);
    state.section = "lab";
    state.current = destination;
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "tutor-toggle") {
    state.tutor.collapsed = !state.tutor.collapsed;
    render();
    if (!state.tutor.collapsed) document.querySelector("[data-tutor-input]")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "tutor-voice") {
    state.tutor.voiceEnabled = tutorSpeaker.setEnabled(!state.tutor.voiceEnabled);
    render();
    return;
  }
  if (action.dataset.action === "download-portfolio") {
    downloadPortfolio();
    return;
  }
  const exercise = exercises.find((item) => item.id === action.dataset.id);
  if (!exercise) return;
  const stage = getGuidedStage({ attempted: state.attempted.has(exercise.id), hintSeen: state.hints.has(exercise.id), solutionSeen: state.revealed.has(exercise.id) });
  if (action.dataset.action === "hint" && stage !== "hint") return;
  if (action.dataset.action === "solution" && stage !== "example") return;
  if (action.dataset.action === "check") checkAnswer(exercise);
  if (action.dataset.action === "hint") state.hints.add(exercise.id);
  if (action.dataset.action === "solution") state.revealed.add(exercise.id);
  if (action.dataset.action === "hint" || action.dataset.action === "solution") render();
});

app.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-tutor-form]");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("[data-tutor-input]");
  const text = input?.value ?? "";
  if (!text.trim()) return;
  input.value = "";
  sendLocalTutorMessage(text);
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-answer]")) {
    state.answers.set(event.target.dataset.answer, event.target.value);
    const counter = event.target.closest(".writing-prompt")?.querySelector(".field-meta span:last-child");
    if (counter) counter.textContent = `${event.target.value.length} / 1600`;
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-choice]")) {
    state.selections.set(event.target.dataset.choice, event.target.value);
    const exercise = exercises.find((item) => item.id === event.target.dataset.choice);
    if (exercise) state.feedback.delete(exercise.id);
    render();
  }
});

render();
