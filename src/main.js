import { categories, exercises } from "./exercises.js";
import { calculateDifference, evaluateChoice, getGuidedStage, scoreRubric } from "./logic.js";
import { COURSE, courseModules } from "./course.js";
import { createPortfolioMarkdown, loadProgress, saveProgress } from "./progress.js";
import { toTutorContext } from "./tutor/context.js";
import { detectLocalIntent, getLocalTutorReply } from "./tutor/local.js";
import { createSpeechSpeaker } from "./tutor/speech.js";
import { GLOSSARY, findGlossaryEntry } from "./glossary.js";
import { openStudyDatabase, searchStudyItems } from "./study-db.js";
import { DIAGNOSTIC_QUESTIONS, PROJECT_STAGES, REMOTE_AI_GATE, getAdaptiveRoute, scoreDiagnostic } from "./phase5.js";

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
  onboardingLevel: "",
  onboardingDraft: "",
  demoModuleId: null,
  glossary: null,
  glossaryOpen: false,
  studyDb: null,
  studyItems: [],
  studyNotes: [],
  studyQuery: "",
  studyKind: "all",
  studySelectedId: "",
  studyDraftNote: "",
  studyDbWarning: "",
  openCourseModuleId: null,
  phase5: { initialAnswers: {}, initialResult: null, finalAnswers: {}, finalResult: null, finalOpen: false, projectCompleted: new Set() },
};

let progressStorage = null;
try { progressStorage = window.localStorage; } catch { /* El navegador puede bloquear el almacenamiento local. */ }
const restoredProgress = loadProgress(progressStorage);
state.completedModules = new Set(restoredProgress.completedModules);
state.completed = new Set(restoredProgress.completedExercises);
state.storageWarning = progressStorage ? "" : "El navegador no permite guardar el progreso; esta sesión seguirá en memoria.";
try {
  state.onboardingLevel = progressStorage?.getItem("contaia.onboarding.v1") || "";
  state.onboardingDraft = state.onboardingLevel;
} catch { /* El diagnóstico se puede repetir sin almacenamiento. */ }
try {
  const phase5Saved = JSON.parse(progressStorage?.getItem("contaia.phase5.v1") || "null");
  if (phase5Saved && typeof phase5Saved === "object") {
    state.phase5.initialResult = Number.isFinite(phase5Saved.initialScore) ? { score: phase5Saved.initialScore, total: DIAGNOSTIC_QUESTIONS.length, percentage: Math.round((phase5Saved.initialScore / DIAGNOSTIC_QUESTIONS.length) * 100) } : null;
    state.phase5.finalResult = Number.isFinite(phase5Saved.finalScore) ? { score: phase5Saved.finalScore, total: DIAGNOSTIC_QUESTIONS.length, percentage: Math.round((phase5Saved.finalScore / DIAGNOSTIC_QUESTIONS.length) * 100) } : null;
    state.phase5.projectCompleted = new Set(Array.isArray(phase5Saved.completedStages) ? phase5Saved.completedStages.filter((id) => PROJECT_STAGES.some((stage) => stage.id === id)) : []);
  }
} catch { /* Los resultados de Fase 5 se pueden repetir sin almacenamiento. */ }

function persistProgress() {
  const saved = saveProgress({
    completedModules: [...state.completedModules],
    completedExercises: [...state.completed],
  }, progressStorage);
  state.storageWarning = saved ? "" : "No se pudo guardar el progreso local; podrás continuar en memoria durante esta sesión.";
  return saved;
}

function persistOnboarding() {
  state.onboardingLevel = state.onboardingDraft;
  try { progressStorage?.setItem("contaia.onboarding.v1", state.onboardingLevel); } catch { /* El diagnóstico se puede repetir sin almacenamiento. */ }
}

async function initializeStudyDatabase() {
  try {
    state.studyDb = await openStudyDatabase({ modules: courseModules, exercises, glossary: GLOSSARY });
    state.studyItems = await state.studyDb.listItems();
    state.studyNotes = await state.studyDb.listNotes();
    state.studyDbWarning = state.studyDb.persistent
      ? ""
      : "Este navegador no ofrece IndexedDB; la base seguirá disponible solo durante esta sesión.";
  } catch {
    state.studyDbWarning = "No se pudo abrir la base de estudio. Puedes seguir usando el curso y el laboratorio.";
  }
  if (state.section === "study") render();
}

function selectedStudyNote(itemId) {
  return state.studyNotes.find((note) => note.itemId === itemId) ?? null;
}

async function downloadStudyDatabase() {
  if (!state.studyDb) return;
  const data = await state.studyDb.exportData();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `base-estudio-contaia-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function persistPhase5Summary() {
  try {
    progressStorage?.setItem("contaia.phase5.v1", JSON.stringify({
      initialScore: state.phase5.initialResult?.score,
      finalScore: state.phase5.finalResult?.score,
      completedStages: [...state.phase5.projectCompleted],
    }));
  } catch { /* El diagnóstico sigue funcionando solo en memoria. */ }
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
    <button class="nav-item ${state.section === "study" ? "is-active" : ""}" type="button" data-section="study" aria-current="${state.section === "study" ? "page" : "false"}">
      <span class="home-glyph" aria-hidden="true">⌕</span><span>Base de estudio</span>
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
  const pageLabel = state.section === "course" ? "Plan del curso" : state.section === "study" ? "Base de estudio" : state.current === "home" ? "Resumen" : "Ejercicio";
  return `<header class="topbar"><div class="breadcrumb"><span>LABORATORIO CONTAIA</span><i aria-hidden="true">/</i><strong>${pageLabel}</strong></div>
    <nav class="section-tabs" aria-label="Secciones principales">
      <button class="section-tab ${state.section === "course" ? "is-active" : ""}" type="button" data-section="course" aria-current="${state.section === "course" ? "page" : "false"}"><b>01</b><span>Curso completo</span></button>
      <button class="section-tab ${state.section === "lab" ? "is-active" : ""}" type="button" data-section="lab" aria-current="${state.section === "lab" ? "page" : "false"}"><b>02</b><span>Laboratorio práctico</span></button>
      <button class="section-tab ${state.section === "study" ? "is-active" : ""}" type="button" data-section="study" aria-current="${state.section === "study" ? "page" : "false"}"><b>03</b><span>Base de estudio</span></button>
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
  const concepts = foundation?.concepts?.map(([term, meaning]) => `<li><button type="button" class="glossary-term" data-glossary-module="${escapeHtml(module.id)}" data-glossary-term="${escapeHtml(term)}">${escapeHtml(term)} <span aria-hidden="true">?</span></button><span>${escapeHtml(meaning)}</span></li>`).join("") || "";
  const tools = module.toolkit?.map((tool) => `<article class="module-tool-card"><div class="module-tool-top"><a href="${escapeHtml(tool.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tool.name)} ↗</a><span>${escapeHtml(tool.role)}</span></div><p><b>Actividad:</b> ${escapeHtml(tool.activity)}</p><p class="module-tool-guardrail"><b>Límite:</b> ${escapeHtml(tool.guardrail)}</p></article>`).join("") || "";
  const demo = module.demonstration;
  const isDemoOpen = state.demoModuleId === module.id;
  const activeDefinition = state.glossary?.moduleId === module.id ? findGlossaryEntry(state.glossary.term) : null;
  const context = module.context;
  const contextDocuments = context?.documents?.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "";
  const contextFields = context?.mustContain?.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "";
  return `<aside class="module-nora-guide" data-testid="module-nora-${escapeHtml(module.id)}" aria-label="Guía de Nora para ${escapeHtml(module.title)}">
    <div class="module-nora-heading"><div class="module-nora-avatar" aria-hidden="true">N</div><div><p class="module-nora-kicker">NORA · GUÍA DEL MÓDULO</p><strong>Te acompaño a verificar, no a adivinar.</strong></div></div>
    ${foundation ? `<div class="module-nora-foundation"><div><b>Aprende primero</b><p>${escapeHtml(foundation.why)}</p></div><ul>${concepts}</ul>${activeDefinition ? `<div class="glossary-definition" role="status"><b>Glosario · ${escapeHtml(activeDefinition.term)}</b><span>${escapeHtml(activeDefinition.definition)}</span><em><strong>Ejemplo:</strong> ${escapeHtml(activeDefinition.example)}</em><em><strong>Comprueba:</strong> ${escapeHtml(activeDefinition.check)}</em></div>` : ""}<p class="module-nora-example"><strong>Ejemplo sencillo:</strong> ${escapeHtml(foundation.example)}</p></div>` : ""}
    ${demo ? `<div class="module-demo-wrap"><button type="button" class="module-demo-button" data-action="module-demo" data-module-demo="${escapeHtml(module.id)}" aria-expanded="${isDemoOpen}">${isDemoOpen ? "Ocultar demostración" : "Nora demuestra: antes y después"} <span aria-hidden="true">${isDemoOpen ? "↑" : "→"}</span></button>${isDemoOpen ? `<div class="module-demo" data-testid="module-demo-${escapeHtml(module.id)}"><div><b>Antes</b><p>${escapeHtml(demo.before)}</p></div><div><b>Después</b><p>${escapeHtml(demo.after)}</p></div><p><strong>Qué observar:</strong> ${escapeHtml(demo.why)}</p></div>` : ""}</div>` : ""}
    ${context ? `<div class="module-context" data-testid="module-context-${escapeHtml(module.id)}"><div class="module-context-heading"><b>Contexto que puedes aportar</b><span>No se sube a ContaIA</span></div><div class="module-context-grid"><div><b>Documento o material</b><ul>${contextDocuments}</ul></div><div><b>Debe contener</b><ul>${contextFields}</ul></div></div><p><b>Formato sugerido:</b> ${escapeHtml(context.format)}</p><p class="module-context-protect"><b>Antes de usarlo:</b> ${escapeHtml(context.protect)}</p></div>` : ""}
    ${tools ? `<div class="module-toolkit" data-testid="module-toolkit-${escapeHtml(module.id)}"><div class="module-toolkit-heading"><b>Herramientas para practicar</b><span>Opcionales · siempre con datos ficticios</span></div><div class="module-tool-grid">${tools}</div></div>` : ""}
    <p class="module-nora-opening">${escapeHtml(moduleGuide.opening)}</p>
    <div class="module-nora-grid"><div><b>Ruta en 3 pasos</b><ol>${steps}</ol></div><div class="module-nora-check"><b>Pregunta de control</b><p>${escapeHtml(moduleGuide.checkpoint)}</p><b>Evidencia de salida</b><p>${escapeHtml(moduleGuide.deliverable)}</p></div></div>
  </aside>`;
}

function renderOnboarding() {
  if (state.onboardingLevel) return `<section class="onboarding-complete" data-testid="onboarding-complete"><span class="onboarding-check">✓</span><p><b>Ruta inicial seleccionada:</b> ${escapeHtml({ new: "Voy empezando", some: "Ya conozco algo", experienced: "Quiero ir más rápido" }[state.onboardingLevel] || "Ruta personalizada")}</p><button type="button" class="text-link" data-action="reset-onboarding">Cambiar</button></section>`;
  return `<section class="onboarding-card" data-testid="onboarding"><div><p class="eyebrow">NORA · PRIMER PASO</p><h2>Antes de empezar, dime cómo te acompaño.</h2><p>No es un examen. Solo ajusta el ritmo inicial para explicar los conceptos antes de pedirte una práctica.</p></div><fieldset><legend>¿Qué frase te describe mejor?</legend><label><input type="radio" name="onboarding-level" value="new" ${state.onboardingDraft === "new" ? "checked" : ""}/> Voy empezando: no conozco IA ni prompts.</label><label><input type="radio" name="onboarding-level" value="some" ${state.onboardingDraft === "some" ? "checked" : ""}/> Ya conozco algo, pero necesito ejemplos contables.</label><label><input type="radio" name="onboarding-level" value="experienced" ${state.onboardingDraft === "experienced" ? "checked" : ""}/> Ya he usado IA y quiero ir más rápido.</label><button type="button" class="button button-primary" data-action="complete-onboarding" ${state.onboardingDraft ? "" : "disabled"}>Elegir mi ruta <span aria-hidden="true">→</span></button></fieldset></section>`;
}

function renderGlossaryIndex() {
  const entries = GLOSSARY.map((entry) => `<article class="glossary-index-entry"><button type="button" data-glossary-module="global" data-glossary-term="${escapeHtml(entry.term)}">${escapeHtml(entry.term)}</button><p>${escapeHtml(entry.definition)}</p><small><b>Ejemplo:</b> ${escapeHtml(entry.example)}</small></article>`).join("");
  const selected = state.glossary?.moduleId === "global" ? findGlossaryEntry(state.glossary.term) : null;
  return `<section class="course-glossary" data-testid="glossary-index"><button type="button" class="course-glossary-toggle" data-action="toggle-glossary" aria-expanded="${state.glossaryOpen}"><span><b>GLOSARIO CONTEXTUAL</b><strong>Consulta los términos del recorrido con ejemplos contables.</strong></span><span aria-hidden="true">${state.glossaryOpen ? "−" : "+"}</span></button>${state.glossaryOpen ? `<div class="glossary-index-grid">${entries}</div>${selected ? `<div class="glossary-index-selected" role="status"><b>${escapeHtml(selected.term)}</b><p>${escapeHtml(selected.definition)}</p><span><strong>Ejemplo:</strong> ${escapeHtml(selected.example)}</span><span><strong>Comprueba:</strong> ${escapeHtml(selected.check)}</span></div>` : ""}` : ""}</section>`;
}

const studyKindLabels = { module: "Módulo", practice: "Práctica", concept: "Concepto" };

function renderStudyResults() {
  if (!state.studyItems.length) {
    return `<div class="study-empty"><strong>Preparando la base de estudio…</strong><span>El catálogo se inicializa en este navegador, sin enviar contenido a un servicio externo.</span></div>`;
  }
  const results = searchStudyItems(state.studyItems, state.studyQuery, state.studyKind);
  if (!results.length) {
    return `<div class="study-empty"><strong>No encontramos coincidencias.</strong><span>Prueba con otra palabra o cambia el tipo de contenido.</span></div>`;
  }
  return `<div class="study-results-list">${results.map((item) => {
    const note = selectedStudyNote(item.id);
    return `<article class="study-result-card ${state.studySelectedId === item.id ? "is-selected" : ""}">
      <div class="study-result-meta"><span>${escapeHtml(studyKindLabels[item.kind] ?? item.kind)}</span>${note ? "<b>Nota guardada</b>" : ""}</div>
      <button type="button" class="study-result-title" data-study-open="${escapeHtml(item.id)}">${escapeHtml(item.title)} <span aria-hidden="true">↗</span></button>
      <p>${escapeHtml(item.summary)}</p>
      <div class="study-result-footer"><span>${escapeHtml((item.tags ?? []).slice(0, 3).join(" · "))}</span><button type="button" class="study-note-link" data-study-open="${escapeHtml(item.id)}">${note ? "Editar nota" : "Tomar nota"}</button></div>
    </article>`;
  }).join("")}</div>`;
}

function renderStudy() {
  const selected = state.studyItems.find((item) => item.id === state.studySelectedId);
  const note = selected ? selectedStudyNote(selected.id) : null;
  const detail = selected ? `<aside class="study-detail" aria-label="Detalle de estudio">
    <div class="study-detail-kicker">${escapeHtml(studyKindLabels[selected.kind] ?? "Registro")}</div>
    <h2>${escapeHtml(selected.title)}</h2>
    <p>${escapeHtml(selected.body)}</p>
    <div class="study-detail-actions">${selected.kind === "module" ? `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Ver módulo ↗</button>` : selected.kind === "practice" ? `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Abrir práctica ↗</button>` : `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Ver concepto ↗</button>`}<button type="button" class="button button-quiet" data-action="study-close">Cerrar</button></div>
    <form class="study-note-form" data-study-note-form>
      <label for="study-note">Nota privada de estudio</label>
      <textarea id="study-note" data-study-note rows="6" maxlength="2000" placeholder="Escribe una idea, duda o ejemplo para repasar…">${escapeHtml(note?.content ?? state.studyDraftNote)}</textarea>
      <div class="study-note-form-footer"><span>Se guarda únicamente en esta base local.</span><button type="submit" class="button button-primary">Guardar nota</button></div>
    </form>
    ${note ? `<button type="button" class="study-delete-note" data-action="study-delete-note" data-note-id="${escapeHtml(note.id)}">Eliminar esta nota</button>` : ""}
  </aside>` : `<aside class="study-detail study-detail-empty" aria-label="Ayuda de la base de estudio"><span class="study-detail-mark">+</span><h2>Selecciona una ficha</h2><p>Abre un módulo, práctica o concepto para guardarlo como referencia de repaso.</p></aside>`;
  return `<main id="contenido" class="content study-content" tabindex="-1">
    <div class="hero-kicker"><span class="kicker-rule"></span><span>SECCIÓN 03 · BASE LOCAL DE ESTUDIO</span></div>
    <section class="study-hero"><div><p class="eyebrow">CATÁLOGO PRIVADO · INDEXEDDB</p><h1>Estudia con el contenido<br/><em>en un solo expediente.</em></h1><p>Busca módulos, prácticas y conceptos del curso. Añade notas de repaso sin crear una cuenta y sin subir información a internet.</p></div><div class="study-hero-stamp"><strong>${state.studyItems.length || "—"}</strong><span>FICHAS<br/>DISPONIBLES</span></div></section>
    <div class="study-notice"><span class="notice-icon" aria-hidden="true">i</span><p><strong>Privacidad primero.</strong> La base se guarda en este navegador. No escribas datos reales, personales o confidenciales en tus notas.</p><button type="button" class="text-link" data-action="study-export">Descargar copia JSON <span>↓</span></button></div>
    <section class="study-layout"><div class="study-browser"><div class="section-heading"><div><p class="eyebrow">BÚSQUEDA</p><h2>Biblioteca del recorrido</h2></div><span class="count-pill">${searchStudyItems(state.studyItems, state.studyQuery, state.studyKind).length} resultados</span></div><div class="study-search-row"><label class="sr-only" for="study-search">Buscar en la base de estudio</label><input id="study-search" data-study-search type="search" value="${escapeHtml(state.studyQuery)}" placeholder="Busca por tema, práctica o concepto…" autocomplete="off"/><select data-study-filter aria-label="Filtrar por tipo"><option value="all" ${state.studyKind === "all" ? "selected" : ""}>Todo el catálogo</option><option value="module" ${state.studyKind === "module" ? "selected" : ""}>Módulos</option><option value="practice" ${state.studyKind === "practice" ? "selected" : ""}>Prácticas</option><option value="concept" ${state.studyKind === "concept" ? "selected" : ""}>Conceptos</option></select></div><div data-study-results>${renderStudyResults()}</div></div>${detail}</section>
    <p class="progress-storage-note" role="status">${escapeHtml(state.studyDbWarning || "La base incluye el catálogo del curso y tus notas privadas locales; no sincroniza con cuentas ni servicios externos.")}</p>
  </main>`;
}
function renderDiagnosticForm(kind, result) {
  const isInitial = kind === "initial";
  if (result) {
    const route = isInitial ? getAdaptiveRoute(result) : null;
    const delta = !isInitial && state.phase5.initialResult ? result.score - state.phase5.initialResult.score : null;
    return `<div class="phase5-result" data-testid="${kind}-diagnostic-result"><div><b>${isInitial ? "Resultado inicial" : "Resultado final"}</b><strong>${result.score}/${result.total} · ${result.percentage}%</strong></div><p>${isInitial ? route.message : "Compara este resultado con tu diagnóstico inicial y revisa qué conceptos puedes seguir practicando."}</p>${delta !== null ? `<p class="diagnostic-delta"><b>Variación respecto al inicio:</b> ${delta > 0 ? "+" : ""}${delta} aciertos.</p>` : ""}${route ? `<div class="adaptive-route"><b>${escapeHtml(route.title)}</b><p>${escapeHtml(route.message)}</p><ul>${route.modules.map((id) => { const module = courseModules.find((item) => item.id === id); return module ? `<li>${escapeHtml(module.title)}</li>` : ""; }).join("")}</ul></div>` : ""}<button type="button" class="text-link" data-action="phase5-reset-diagnostic" data-diagnostic-kind="${kind}">Repetir diagnóstico</button></div>`;
  }
  const answers = isInitial ? state.phase5.initialAnswers : state.phase5.finalAnswers;
  return `<form class="phase5-diagnostic-form" data-phase5-form="${kind}" data-testid="${kind}-diagnostic-form"><p>${isInitial ? "Responde para que Nora sugiera un punto de partida. No es una calificación." : "Responde de nuevo al cerrar el recorrido. Solo se conserva el resultado agregado, no tus selecciones."}</p>${DIAGNOSTIC_QUESTIONS.map((question, index) => `<fieldset><legend>${String(index + 1).padStart(2, "0")} · ${escapeHtml(question.question)}</legend>${question.options.map((option) => `<label><input type="radio" name="${kind}-${question.id}" value="${option.id}" ${answers[question.id] === option.id ? "checked" : ""}/> ${escapeHtml(option.label)}</label>`).join("")}</fieldset>`).join("")}<button type="submit" class="button button-primary">${isInitial ? "Calcular mi ruta" : "Calcular resultado final"} <span aria-hidden="true">→</span></button></form>`;
}

function renderPhase5() {
  const completed = state.phase5.projectCompleted.size;
  const finalBlock = state.phase5.finalOpen || state.phase5.finalResult ? renderDiagnosticForm("final", state.phase5.finalResult) : `<div class="phase5-locked"><p>Disponible cuando quieras cerrar el recorrido. No necesitas enviar documentos ni respuestas fuera de este navegador.</p><button type="button" class="button button-secondary" data-action="phase5-open-final">Abrir diagnóstico final</button></div>`;
  return `<section class="phase5" data-testid="phase5"><div class="phase5-heading"><div><p class="eyebrow">FASE 5 · CIERRE Y TRANSFERENCIA</p><h2>Convierte la práctica en criterio propio.</h2><p>Esta fase compara tu punto de partida con tu avance, te propone una ruta y reúne un proyecto integrador ficticio.</p></div><span class="phase5-badge">LOCAL-FIRST<br/>SIN ENVÍO DE RESPUESTAS</span></div><div class="phase5-grid"><article class="phase5-card"><div class="phase5-card-kicker">01 · DIAGNÓSTICO</div><h3>Tu punto de partida</h3>${renderDiagnosticForm("initial", state.phase5.initialResult)}</article><article class="phase5-card"><div class="phase5-card-kicker">02 · CIERRE</div><h3>Diagnóstico final</h3>${finalBlock}</article></div><article class="phase5-project" data-testid="integrator-project"><div class="phase5-project-top"><div><div class="phase5-card-kicker">03 · PROYECTO INTEGRADOR</div><h3>Del documento ficticio a un flujo verificable</h3><p>Completa las etapas en orden. Cada una produce una evidencia que puedes revisar o descargar por separado.</p></div><strong>${completed}/${PROJECT_STAGES.length}</strong></div><div class="project-stage-list">${PROJECT_STAGES.map((stage) => { const done = state.phase5.projectCompleted.has(stage.id); return `<article class="project-stage ${done ? "is-complete" : ""}"><div class="project-stage-number">${stage.number}</div><div><h4>${escapeHtml(stage.title)}</h4><p>${escapeHtml(stage.task)}</p><small><b>Evidencia:</b> ${escapeHtml(stage.evidence)}</small></div><button type="button" class="project-stage-toggle" data-project-stage="${stage.id}" aria-pressed="${done}">${done ? "Completada ✓" : "Marcar lista"}</button></article>`; }).join("")}</div></article><details class="remote-ai-gate" data-testid="remote-ai-gate"><summary><span><b>PUERTA DE DECISIÓN</b><strong>Antes de conectar una IA remota</strong></span><span aria-hidden="true">＋</span></summary><div><p>ContaIA permanece local. Esta puerta explica qué tendría que entenderse y aprobarse antes de enviar cualquier texto a un proveedor externo. No activa ninguna conexión.</p><ol>${REMOTE_AI_GATE.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><p class="remote-ai-gate-status"><b>Estado actual:</b> desactivada. Nora local continúa siendo la única asistencia disponible.</p></div></details></section>`;
}

function renderCourse() {
  const moduleMarkup = courseModules.map((module, index) => {
    const linkedExercises = module.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter(Boolean);
    const moduleCompleted = state.completedModules.has(module.id);
    const practiceLinks = linkedExercises.map((exercise) => `<button type="button" class="course-practice-link" data-nav="${escapeHtml(exercise.id)}">${escapeHtml(exercise.title)} <span aria-hidden="true">↗</span></button>`).join("");
    const material = module.materialPath
      ? `<a class="course-material-link" href="${escapeHtml(module.materialPath)}" download>Descargar materiales del módulo <span aria-hidden="true">↓</span></a>`
      : `<span class="course-material-pending">Paquete didáctico detallado: pendiente</span>`;
    const isOpen = state.openCourseModuleId ? state.openCourseModuleId === module.id : index === 0;
    return `<details class="course-module-card" ${isOpen ? "open" : ""}>
      <summary><span class="course-module-number">${String(module.week).padStart(2, "0")}</span><span class="course-module-heading"><small>SEMANA ${module.week} · ${module.hours} HORAS</small><strong>${escapeHtml(module.title)}</strong></span><span class="course-module-toggle" aria-hidden="true">＋</span></summary>
      <div class="course-module-body"><p><b>Enfoque:</b> ${escapeHtml(module.focus)}</p><p><b>Resultado de aprendizaje:</b> ${escapeHtml(module.outcome)}</p>${renderModuleGuide(module)}<div class="course-links-block"><b>Práctica vinculada</b><div class="course-practice-links">${practiceLinks}</div></div><div class="course-resource-row">${material}<button type="button" class="module-progress-toggle" data-module-toggle="${escapeHtml(module.id)}" aria-pressed="${moduleCompleted}">${moduleCompleted ? "Módulo completado ✓" : "Marcar módulo completado"}</button></div></div>
    </details>`;
  }).join("");

  return `<main id="contenido" class="content course-content" tabindex="-1">
    <div class="hero-kicker"><span class="kicker-rule"></span><span>SECCIÓN 01 · RUTA DE APRENDIZAJE</span></div>
    ${renderOnboarding()}
    ${renderGlossaryIndex()}
    ${renderPhase5()}
    <section class="course-hero"><div class="course-hero-copy"><p class="eyebrow">${COURSE.hours} HORAS · ${COURSE.weeks} SEMANAS · MÉXICO</p><h1>IA para contaduría,<br/><em>con criterio verificable.</em></h1><p>Un recorrido desde los fundamentos y los prompts hasta la integración de flujos contables. Cada módulo se conecta con una práctica ficticia del laboratorio.</p><div class="course-hero-actions"><a class="button button-primary" href="/docs/curso/plan-trabajo-curso-ia-contaduria.md" download>Descargar plan de trabajo <span aria-hidden="true">↓</span></a><button class="button course-secondary-button" type="button" data-action="download-portfolio">Descargar portafolio <span aria-hidden="true">↓</span></button><button class="button course-secondary-button" type="button" data-section="lab">Ir al laboratorio <span aria-hidden="true">→</span></button></div></div><div class="course-hero-stamp" aria-label="40 horas en 10 módulos"><span>RECORRIDO</span><strong>01—10</strong><i>3 h guiadas<br/>+ 1 h independiente</i></div></section>
    <div class="course-stat-row"><div><b>${COURSE.hours}</b><span>horas de trabajo</span></div><div><b>${state.completedModules.size}/${courseModules.length}</b><span>módulos completados</span></div><div><b>${state.completed.size}/${exercises.length}</b><span>prácticas completadas</span></div></div>
    <p class="progress-storage-note" role="status">${escapeHtml(state.storageWarning || "Solo se guardan en este navegador módulos, prácticas, etapas y resultados agregados; nunca tus respuestas, selecciones ni documentos.")}</p>
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
  const content = state.section === "course" ? renderCourse() : state.section === "study" ? renderStudy() : exercise ? renderExercise(exercise) : renderHome();
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
    state.section = ["course", "lab", "study"].includes(section.dataset.section) ? section.dataset.section : "course";
    resetTutor(state.section === "lab" ? "home" : null);
    if (state.section === "lab") state.current = "home";
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const glossaryTerm = event.target.closest("[data-glossary-term]");
  if (glossaryTerm) {
    state.glossary = { moduleId: glossaryTerm.dataset.glossaryModule, term: glossaryTerm.dataset.glossaryTerm };
    render();
    return;
  }
  const demo = event.target.closest("[data-module-demo]");
  if (demo) {
    state.demoModuleId = state.demoModuleId === demo.dataset.moduleDemo ? null : demo.dataset.moduleDemo;
    render();
    return;
  }
  const projectStage = event.target.closest("[data-project-stage]");
  if (projectStage) {
    const stageId = projectStage.dataset.projectStage;
    if (state.phase5.projectCompleted.has(stageId)) state.phase5.projectCompleted.delete(stageId);
    else state.phase5.projectCompleted.add(stageId);
    persistPhase5Summary();
    render();
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
  const studyOpen = event.target.closest("[data-study-open]");
  if (studyOpen) {
    state.studySelectedId = studyOpen.dataset.studyOpen;
    state.studyDraftNote = selectedStudyNote(state.studySelectedId)?.content ?? "";
    render();
    document.querySelector("#study-note")?.focus({ preventScroll: true });
    return;
  }
  const studyNavigate = event.target.closest("[data-study-navigate]");
  if (studyNavigate) {
    const item = state.studyItems.find((entry) => entry.id === studyNavigate.dataset.studyNavigate);
    if (!item) return;
    const destination = item.destination ?? {};
    if (destination.section === "lab") {
      resetTutor(destination.exerciseId);
      state.section = "lab";
      state.current = destination.exerciseId;
    } else {
      state.section = "course";
      state.openCourseModuleId = destination.moduleId ?? null;
      if (destination.glossaryTerm) {
        state.glossaryOpen = true;
        state.glossary = { moduleId: "global", term: destination.glossaryTerm };
      }
    }
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
  if (action.dataset.action === "toggle-glossary") {
    state.glossaryOpen = !state.glossaryOpen;
    render();
    return;
  }
  if (action.dataset.action === "study-close") {
    state.studySelectedId = "";
    state.studyDraftNote = "";
    render();
    return;
  }
  if (action.dataset.action === "study-export") {
    downloadStudyDatabase();
    return;
  }
  if (action.dataset.action === "study-delete-note") {
    if (!state.studyDb || !action.dataset.noteId) return;
    state.studyDb.deleteNote(action.dataset.noteId).then(async () => {
      state.studyNotes = await state.studyDb.listNotes();
      state.studyDraftNote = "";
      render();
    }).catch(() => { state.studyDbWarning = "No se pudo eliminar la nota local."; render(); });
    return;
  }
  if (action.dataset.action === "phase5-open-final") {
    state.phase5.finalOpen = true;
    render();
    document.querySelector("[data-testid='final-diagnostic-form']")?.querySelector("input")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "phase5-reset-diagnostic") {
    const kind = action.dataset.diagnosticKind === "final" ? "final" : "initial";
    state.phase5[`${kind}Result`] = null;
    state.phase5[`${kind}Answers`] = {};
    if (kind === "final") state.phase5.finalOpen = true;
    persistPhase5Summary();
    render();
    return;
  }
  if (action.dataset.action === "complete-onboarding") {
    if (!state.onboardingDraft) return;
    persistOnboarding();
    render();
    document.querySelector("[data-testid='onboarding-complete']")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "reset-onboarding") {
    state.onboardingLevel = "";
    state.onboardingDraft = "";
    try { progressStorage?.removeItem("contaia.onboarding.v1"); } catch { /* Se mantiene en memoria. */ }
    render();
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
  const studyForm = event.target.closest("[data-study-note-form]");
  if (studyForm) {
    event.preventDefault();
    if (!state.studyDb || !state.studySelectedId) return;
    state.studyDb.saveNote({ id: `note:${state.studySelectedId}`, itemId: state.studySelectedId, content: state.studyDraftNote, updatedAt: Date.now() }).then(async () => {
      state.studyNotes = await state.studyDb.listNotes();
      render();
      document.querySelector("#study-note")?.focus({ preventScroll: true });
    }).catch(() => { state.studyDbWarning = "Escribe una nota breve para guardarla en la base local."; render(); });
    return;
  }
  const phase5Form = event.target.closest("[data-phase5-form]");
  if (phase5Form) {
    event.preventDefault();
    const kind = phase5Form.dataset.phase5Form === "final" ? "final" : "initial";
    const answers = Object.fromEntries(DIAGNOSTIC_QUESTIONS.map((question) => [question.id, phase5Form.querySelector(`input[name='${kind}-${question.id}']:checked`)?.value || ""]));
    state.phase5[`${kind}Answers`] = answers;
    state.phase5[`${kind}Result`] = scoreDiagnostic(answers);
    if (kind === "final") state.phase5.finalOpen = false;
    persistPhase5Summary();
    render();
    document.querySelector(`[data-testid='${kind}-diagnostic-result']`)?.focus({ preventScroll: true });
    return;
  }
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
  if (event.target.matches("[data-study-search]")) {
    state.studyQuery = event.target.value;
    const results = document.querySelector("[data-study-results]");
    if (results) results.innerHTML = renderStudyResults();
    const count = document.querySelector(".study-browser .count-pill");
    if (count) count.textContent = `${searchStudyItems(state.studyItems, state.studyQuery, state.studyKind).length} resultados`;
    return;
  }
  if (event.target.matches("[data-study-note]")) {
    state.studyDraftNote = event.target.value;
    return;
  }
  if (event.target.matches("[data-answer]")) {
    state.answers.set(event.target.dataset.answer, event.target.value);
    const counter = event.target.closest(".writing-prompt")?.querySelector(".field-meta span:last-child");
    if (counter) counter.textContent = `${event.target.value.length} / 1600`;
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-study-filter]")) {
    state.studyKind = event.target.value;
    const results = document.querySelector("[data-study-results]");
    if (results) results.innerHTML = renderStudyResults();
    const count = document.querySelector(".study-browser .count-pill");
    if (count) count.textContent = `${searchStudyItems(state.studyItems, state.studyQuery, state.studyKind).length} resultados`;
    return;
  }
  if (event.target.matches("[name='onboarding-level']")) {
    state.onboardingDraft = event.target.value;
    const button = document.querySelector("[data-action='complete-onboarding']");
    if (button) button.disabled = false;
    return;
  }
  if (event.target.matches("[data-choice]")) {
    state.selections.set(event.target.dataset.choice, event.target.value);
    const exercise = exercises.find((item) => item.id === event.target.dataset.choice);
    if (exercise) state.feedback.delete(exercise.id);
    render();
  }
});

render();
initializeStudyDatabase();
