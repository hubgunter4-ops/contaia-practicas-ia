import { categories, exercises } from "./exercises.js";
import { buildChoiceFeedback, buildWrittenFeedback, calculateDifference, evaluateChoice, getGuidedStage } from "./logic.js";
import { courseModules, courseSessionFlow } from "./course.js";
import { buildClassroomScene, CLASSROOM_PHASES, renderClassroom } from "./classroom.js";
import { createPortfolioMarkdown, loadProgress, saveProgress } from "./progress.js";
import { buildVideoBrief, NOTEBOOKLM_URL, resolveCourseVideo, SYNTHESIA_URL } from "./course-videos.js";
import { loadTutorConfig, requestTutorReply } from "./tutor/api.js";
import { createSpeechSpeaker } from "./tutor/speech.js";
import { GLOSSARY, findGlossaryEntry } from "./glossary.js";
import { openStudyDatabase, searchStudyItems } from "./study-db.js";
import { KNOWLEDGE_ITEMS } from "./knowledge-data.js";
import { bindCfdiWorkspace, cfdiState, initializeCfdiWorkspace, renderCfdiWorkspace } from "./cfdi/workspace.js";
import { renderToolsPanel } from "./tools/panel.js";
import { downloadDocumentArtifact, processDocumentFile } from "./documents/client.js";
import { authState, currentUser, renderAuthControls, renderAuthGate, renderRegistrationGate, renderAuthPanel, signIn, signUp, signInWithGoogle, signOut } from "./auth/client.js";

const app = document.querySelector("#app");
const state = {
  section: "course",
  current: "home",
  toolsNotice: "",
  attempted: new Set(),
  completed: new Set(),
  revealed: new Set(),
  hints: new Set(),
  answers: new Map(),
  selections: new Map(),
  feedback: new Map(),
  tutor: {
    messages: [{ role: "assistant", text: "Hola, soy Nora. Te acompañaré desde los primeros conceptos hasta el proyecto final. ¿Qué te gustaría entender hoy?" }],
    collapsed: true, voiceEnabled: false, avatarState: "idle", providers: [], defaultProvider: "", provider: "",
    configState: "loading", configError: "", pending: false, abortController: null,
    panelWidth: 430, panelHeight: 610, documentText: "", documentName: "", documentFile: null, documentTruncated: false,
    documentPageCount: null, documentError: "", documentLoading: false,
  },
  openAssistant: {
    messages: [{ role: "assistant", text: "Hola, soy Nora. Podemos repasar conceptos, explorar un procedimiento o razonar sobre una situación de tu entorno. Cuéntame qué necesitas; mi base es México y, si la duda es fiscal o normativa, dime el ejercicio o periodo." }],
    pending: false, abortController: null, documentText: "", documentName: "", documentFile: null, documentTruncated: false,
    documentPageCount: null, documentError: "", documentLoading: false, cfdiContext: null, draft: "",
  },
  anam: { status: "idle", error: "", activity: "", client: null, abortController: null, lastUserMessageId: "", pendingTranscript: "" },
  activeModuleId: "modulo-01",
  coursePhaseIndex: 0,
  highestUnlockedPhase: 0,
  practiceStepIndex: 0,
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
  studyVisibleCount: 60,
  studySelectedId: "",
  studyDraftNote: "",
  studyDbWarning: "",
  openCourseModuleId: null,
};

let progressStorage = null;
try { progressStorage = window.localStorage; } catch { /* El navegador puede bloquear el almacenamiento local. */ }
let activeStorageScope = "anonymous";
const scopedStorage = {
  getItem(key) { return progressStorage?.getItem(`contaia.session.${activeStorageScope}.${key}`) ?? null; },
  setItem(key, value) { progressStorage?.setItem(`contaia.session.${activeStorageScope}.${key}`, value); },
};
const restoredProgress = loadProgress(scopedStorage);
state.completedModules = new Set(restoredProgress.completedModules);
state.completed = new Set(restoredProgress.completedExercises);
const nextIncompleteModule = courseModules.find(({ id }) => !state.completedModules.has(id));
state.activeModuleId = nextIncompleteModule?.id ?? courseModules.at(-1)?.id ?? state.activeModuleId;
state.storageWarning = progressStorage ? "" : "El navegador no permite guardar el progreso; esta sesión seguirá en memoria.";
try {
  state.onboardingLevel = scopedStorage.getItem("contaia.onboarding.v1") || "";
  state.onboardingDraft = state.onboardingLevel;
} catch { /* El diagnóstico se puede repetir sin almacenamiento. */ }

function persistProgress() {
  const saved = saveProgress({
    completedModules: [...state.completedModules],
    completedExercises: [...state.completed],
  }, scopedStorage);
  state.storageWarning = saved ? "" : "No se pudo guardar el progreso local; podrás continuar en memoria durante esta sesión.";
  return saved;
}

function persistOnboarding() {
  state.onboardingLevel = state.onboardingDraft;
  try { scopedStorage.setItem("contaia.onboarding.v1", state.onboardingLevel); } catch { /* El diagnóstico se puede repetir sin almacenamiento. */ }
}

async function initializeStudyDatabase() {
  try {
    state.studyDb = await openStudyDatabase({ modules: courseModules, exercises, glossary: GLOSSARY, knowledge: KNOWLEDGE_ITEMS });
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
const UI_ICON_PATHS = Object.freeze({
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-6h6v6"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 4.5v17M8 6h8M8 10h8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  nora: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M8 3l-2-2M16 3l2-2"/>',
  chevron: '<path d="m7 9 5 5 5-5"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2M20 19v-4h-4"/>',
  send: '<path d="m21 3-7.5 18-3.5-7-7-3.5zM21 3 10 14"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
});
function uiIcon(name, label = "") {
  const path = UI_ICON_PATHS[name] || UI_ICON_PATHS.grid;
  return `<svg class="ui-icon ui-icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${label ? "false" : "true"}"${label ? ` role="img" aria-label="${escapeHtml(label)}"` : ""}>${path}</svg>`;
}

function resetTutor() {
  state.tutor.abortController?.abort();
  tutorSpeaker.stop();
  state.tutor.pending = false;
  state.tutor.avatarState = "idle";
}

function narrateClassroomInstruction({ browserFallback = false } = {}) {
  const module = courseModules.find(({ id }) => id === state.activeModuleId) ?? courseModules[0];
  const narration = buildClassroomScene(module, state.coursePhaseIndex, state.practiceStepIndex).narration;
  const liveClient = state.anam.status === "live" ? state.anam.client : null;
  if (liveClient) {
    state.anam.activity = "Nora dicta la consigna. Tú realizas la acción y confirmas cuando termines.";
    refreshClassroomVisual();
    const stream = liveClient.createTalkMessageStream();
    void stream.streamMessageChunk(narration, true).catch(() => {
      state.anam.activity = "No se pudo reproducir la consigna. Puedes leerla o usar el chat.";
      refreshClassroomVisual();
    });
    return true;
  }
  if (browserFallback && tutorSpeaker.supported) {
    state.tutor.voiceEnabled = tutorSpeaker.setEnabled(true);
    tutorSpeaker.say(narration);
    return true;
  }
  return false;
}

function advanceClassroomPhase() {
  if (state.section !== "course" || state.coursePhaseIndex >= CLASSROOM_PHASES.length - 1 || state.coursePhaseIndex === 2) return;
  const nextPhase = state.coursePhaseIndex + 1;
  state.highestUnlockedPhase = Math.max(state.highestUnlockedPhase, nextPhase);
  state.coursePhaseIndex = nextPhase;
  if (nextPhase === 2) state.practiceStepIndex = 0;
  resetTutor();
  render();
  narrateClassroomInstruction();
}

function completePracticeInstruction() {
  if (state.section !== "course" || state.coursePhaseIndex !== 2) return;
  const module = courseModules.find(({ id }) => id === state.activeModuleId) ?? courseModules[0];
  const steps = Array.isArray(module.guide?.steps) ? module.guide.steps : [];
  if (state.practiceStepIndex + 1 < steps.length) {
    state.practiceStepIndex += 1;
  } else {
    state.highestUnlockedPhase = Math.max(state.highestUnlockedPhase, 3);
    state.coursePhaseIndex = 3;
  }
  resetTutor();
  render();
  narrateClassroomInstruction();
}

function handleAnamTranscript(transcript) {
  const command = transcript.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const confirmation = /^(?:listo|hecho|ya termine|termine|lo hice|ya lo hice|siguiente paso)[.!?,\s]*$/i.test(command);
  if (state.section === "course" && state.coursePhaseIndex === 2 && confirmation) {
    completePracticeInstruction();
    return;
  }
  void sendTutorMessage(transcript);
}

function tutorAvatarLabel() {
  return { thinking: "Nora está pensando.", explaining: "Nora está explicando.", celebrating: "Nora celebra el avance." }[state.tutor.avatarState] || "Nora está lista para ayudarte.";
}

function getTutorContext() {
  if (state.section === "advisor") return { section: "advisor" };
  const moduleId = state.activeModuleId || courseModules[0].id;
  const module = courseModules.find((item) => item.id === moduleId) ?? courseModules[0];
  if (state.section === "lab" && state.current !== "home") {
    const exercise = exercises.find((item) => item.id === state.current);
    if (exercise) {
      const linkedModule = courseModules.find((item) => item.exerciseIds.includes(exercise.id));
      return {
        section: "lab", exerciseId: exercise.id, moduleId: linkedModule?.id,
        stage: getGuidedStage({ attempted: state.attempted.has(exercise.id), hintSeen: state.hints.has(exercise.id), solutionSeen: state.revealed.has(exercise.id) }),
      };
    }
  }
  if (state.section === "course") {
    const coursePhase = CLASSROOM_PHASES[state.coursePhaseIndex]?.id ?? CLASSROOM_PHASES[0].id;
    return {
      section: "course",
      moduleId: module.id,
      coursePhase,
      ...(coursePhase === "practice" ? { courseInstruction: buildClassroomScene(module, state.coursePhaseIndex, state.practiceStepIndex).activeStep } : {}),
    };
  }
  return { section: "study", moduleId: module.id };
}
function assetPath(filename) {
  return new URL(`../assets/nora/${filename}`, import.meta.url).href;
}

function tutorBusy() {
  return state.tutor.pending || state.openAssistant.pending;
}

function activeTutorConversation(openMode = state.section === "advisor") {
  return openMode ? state.openAssistant : state.tutor;
}

function refreshTutorPanel() {
  const panel = app.querySelector('[data-testid="nora-panel"]');
  if (panel) {
    const template = document.createElement("template");
    template.innerHTML = renderTutorPanel(getTutorContext()).trim();
    panel.replaceWith(template.content.firstElementChild);
  }
  refreshOpenAssistant();
  refreshClassroomVisual();
}

function refreshClassroomVisual() {
  const live = state.anam.status === "live";
  const statusText = state.anam.error || state.anam.activity || (live ? "En vivo · el micrófono está activo." : state.anam.status === "connecting" ? "Conectando con Nora…" : "Conecta a Nora cuando quieras iniciar voz y video.");
  const openPanel = app.querySelector("[data-open-anam-panel]");
  if (openPanel) {
    openPanel.classList.toggle("is-live", live);
    const video = openPanel.querySelector("[data-anam-video]");
    if (video) video.hidden = !live;
    const placeholder = openPanel.querySelector("[data-anam-placeholder]");
    if (placeholder) placeholder.hidden = live;
  }
  const liveStatus = app.querySelector("[data-anam-status]");
  if (liveStatus) liveStatus.textContent = statusText;
  const liveButton = app.querySelector("[data-action='anam-toggle']");
  if (liveButton) {
    liveButton.disabled = state.anam.status === "connecting";
    liveButton.setAttribute("aria-pressed", String(live));
    liveButton.innerHTML = `${live ? "Desconectar avatar" : state.anam.status === "connecting" ? "Conectando…" : "Conectar avatar Anam"} <span aria-hidden="true">${live ? "Ⅱ" : state.anam.status === "connecting" ? "…" : "◉"}</span>`;
  }
  const character = app.querySelector("[data-classroom-character]");
  if (!character) return;
  const label = live ? "Nora está impartiendo la clase en vivo." : tutorAvatarLabel();
  const image = character.querySelector("img");
  if (image) {
    image.src = assetPath(`nora-${state.tutor.avatarState}.webp`);
    image.hidden = live;
  }
  const video = character.querySelector("[data-anam-video]");
  if (video) video.hidden = !live;
  character.classList.toggle("is-live", live);
  character.setAttribute("aria-label", label);
  character.classList.toggle("is-speaking", state.tutor.avatarState === "explaining" && state.tutor.voiceEnabled);
  const characterStatus = character.querySelector("[data-classroom-avatar-status]");
  if (characterStatus) characterStatus.textContent = live ? "Nora está en vivo." : label;
  const voiceLabel = app.querySelector("[data-classroom-voice-label]");
  const voiceIcon = app.querySelector("[data-classroom-voice-icon]");
  const classroomVoiceButton = app.querySelector("[data-classroom-voice-button]");
  const isSpeaking = state.tutor.avatarState === "explaining" && state.tutor.voiceEnabled;
  if (voiceLabel) voiceLabel.textContent = isSpeaking ? "Detener narración" : "Repetir consigna";
  if (voiceIcon) voiceIcon.textContent = isSpeaking ? "Ⅱ" : "▶";
  if (classroomVoiceButton) classroomVoiceButton.disabled = !tutorSpeaker.supported && !live;
}

const tutorSpeaker = createSpeechSpeaker({
  onStateChange: (voiceState) => {
    if (voiceState === "speaking") state.tutor.avatarState = "explaining";
    else if (state.tutor.avatarState === "explaining") state.tutor.avatarState = "idle";
    refreshTutorPanel();
  },
});

function renderTutorPanel(context) {
  const provider = state.tutor.providers.find(({ id }) => id === state.tutor.provider);
  const status = state.tutor.pending ? "Nora está pensando…"
    : state.tutor.configState === "loading" ? "Conectando con la tutora…"
      : state.tutor.configError ? "Revisa la conexión de Nora"
        : provider ? `Tutora IA activa · ${provider.label}` : "IA sin configurar en el servidor";
  const messages = state.tutor.messages.map((message) => `<div class="tutor-message tutor-message-${message.role}" data-testid="nora-message"><span class="tutor-message-label">${message.role === "assistant" ? "NORA · TUTORA IA" : "TÚ"}</span><p ${message.streaming ? 'data-tutor-stream="true"' : ""}>${escapeHtml(message.text || (message.streaming ? "Nora está pensando…" : ""))}</p></div>`).join("");
  const bodyId = "tutor-panel-body";
  const providerPicker = state.tutor.providers.length > 1 ? `<label class="tutor-provider-label" for="tutor-provider">Modelo <select id="tutor-provider" data-tutor-provider>${state.tutor.providers.map((item) => `<option value="${escapeHtml(item.id)}" ${state.tutor.provider === item.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label>` : "";
  const phaseLabel = CLASSROOM_PHASES.find(({ id }) => id === context.coursePhase)?.label;
  const collapsed = state.tutor.collapsed;
  const width = Math.max(340, Math.min(state.tutor.panelWidth, window.innerWidth - 24));
  const height = Math.max(420, Math.min(state.tutor.panelHeight, window.innerHeight - 28));
  const panelStyle = collapsed ? "" : `style="width:${width}px;height:${height}px"`;
  const contextNote = context.section === "lab" ? "Práctica activa · tú haces cada acción"
    : context.section === "study" ? "Base de estudio · tus notas no se comparten"
      : `Aula · ${phaseLabel || "aprendizaje paso a paso"}${context.coursePhase === "practice" ? " · tú ejecutas la práctica" : ""}`;
  const documentSummary = state.tutor.documentText
    ? `<div class="tutor-document-ready"><span><b>${escapeHtml(state.tutor.documentName)}</b> · ${state.tutor.documentText.length.toLocaleString("es-MX")} caracteres${state.tutor.documentPageCount ? ` · ${state.tutor.documentPageCount} páginas` : ""}${state.tutor.documentTruncated ? " · extracto limitado" : ""}</span><button type="button" class="tutor-document-remove" data-action="tutor-document-remove" ${state.tutor.pending ? "disabled" : ""}>Quitar</button></div>`
    : "";
  return `<section class="tutor-panel ${collapsed ? "is-collapsed" : "is-open"}" ${panelStyle} data-testid="nora-panel" aria-labelledby="tutor-heading" data-tutor-context="${escapeHtml(context.section)}">
    <header class="tutor-header">
      <div class="tutor-identity"><div class="tutor-avatar tutor-avatar-${escapeHtml(state.tutor.avatarState)}" role="img" aria-label="${escapeHtml(tutorAvatarLabel())}"><img src="${escapeHtml(assetPath(`nora-${state.tutor.avatarState}.webp`))}" alt="" width="600" height="800" fetchpriority="low"/></div><div><p class="tutor-kicker">TUTORA DEL RECORRIDO</p><h2 id="tutor-heading">Nora</h2><span class="tutor-status" data-testid="nora-status"><i aria-hidden="true"></i>${escapeHtml(status)}</span></div></div>
      <div class="tutor-controls">${providerPicker}<button class="tutor-control tutor-voice" data-testid="nora-voice" type="button" data-action="tutor-voice" aria-label="${state.tutor.voiceEnabled ? "Desactivar voz de Nora" : "Activar voz de Nora"}" aria-pressed="${state.tutor.voiceEnabled}" ${tutorSpeaker.supported ? "" : "disabled"}>${state.tutor.voiceEnabled ? "Voz activa" : "Voz"}</button>${collapsed ? "" : `<button class="tutor-control tutor-resize-control" type="button" data-action="tutor-resize" data-size="smaller" aria-label="Reducir tamaño del panel">−</button><button class="tutor-control tutor-resize-control" type="button" data-action="tutor-resize" data-size="larger" aria-label="Ampliar tamaño del panel">＋</button>`}<button class="tutor-control tutor-toggle" data-testid="nora-toggle" type="button" data-action="tutor-toggle" aria-label="${collapsed ? "Abrir asesoría de Nora" : "Cerrar asesoría de Nora"}" aria-expanded="${!collapsed}" aria-controls="${bodyId}">${collapsed ? "Asesoría" : "Cerrar"}</button></div>
    </header>
    <div id="${bodyId}" class="tutor-body" ${collapsed ? "hidden" : ""}>
      <div class="tutor-context-note">${escapeHtml(contextNote)}</div>
      <div class="tutor-log" data-testid="nora-log" role="log" aria-live="polite" aria-relevant="additions text">${messages}</div>
      ${state.tutor.configError ? `<p class="tutor-error" role="status">${escapeHtml(state.tutor.configError)}</p>` : ""}
      <section class="tutor-document" aria-label="Consulta de documento"><div class="tutor-document-heading"><b>APOYO CON DOCUMENTO</b><span>PDF · TXT · CSV</span></div><label class="tutor-document-select" for="tutor-document">${state.tutor.documentLoading ? "Leyendo en este navegador…" : state.tutor.documentText ? "Cambiar documento" : "Adjuntar documento"}<input id="tutor-document" type="file" data-tutor-document accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv" ${state.tutor.pending || state.tutor.documentLoading ? "disabled" : ""}/></label>${documentSummary}<p class="tutor-document-note">El archivo se procesa localmente. Su texto solo se envía al backend y al proveedor IA cuando envías una pregunta escrita desde aquí; el nombre no se comparte.</p>${state.tutor.documentError ? `<p class="tutor-error tutor-document-error" role="status">${escapeHtml(state.tutor.documentError)}</p>` : ""}</section>
      <form class="tutor-form" data-testid="nora-form" data-tutor-form>
        <label class="sr-only" for="tutor-input">Pregunta a Nora, tu tutora IA</label><input id="tutor-input" data-testid="nora-input" data-tutor-input maxlength="2000" autocomplete="off" placeholder="Pregunta sobre el paso o documento…" ${state.tutor.pending || !provider || state.tutor.documentLoading ? "disabled" : ""}/><button class="button button-primary" type="submit" ${state.tutor.pending || !provider || state.tutor.documentLoading ? "disabled" : ""}>Enviar <span aria-hidden="true">→</span></button>
      </form>
      ${state.tutor.pending ? '<button type="button" class="tutor-stop" data-action="tutor-cancel">Detener respuesta</button>' : ""}
      <p class="tutor-disclaimer">No compartas datos reales, personales ni confidenciales. Tus notas y el progreso guardado no se envían. Las conversaciones y el texto del documento no se guardan en ContaIA.</p>
    </div>
  </section>`;
}

function renderOpenAssistantMessages() {
  return state.openAssistant.messages.map((message, index) => `<article class="open-message open-message-${message.role}" data-testid="open-assistant-message"><span class="open-message-label">${message.role === "assistant" ? "NORA" : "TÚ"}</span><p ${message.streaming ? 'data-open-stream="true"' : ""}>${escapeHtml(message.text || (message.streaming ? "Nora está pensando…" : ""))}</p>${message.artifact ? `<button type="button" class="open-document-download" data-open-artifact="${index}">Descargar ${escapeHtml(message.artifact.name)}</button>` : ""}</article>`).join("");
}

function openAssistantDocumentSummary() {
  const doc = state.openAssistant;
  if (!doc.documentFile) return "";
  const details = doc.documentText ? ` · ${doc.documentText.length.toLocaleString("es-MX")} caracteres${doc.documentPageCount ? ` · ${doc.documentPageCount} páginas` : ""}${doc.documentTruncated ? " · extracto limitado" : ""}` : " · listo para leer, reparar o generar";
  return `<div class="open-document-ready"><span><b>${escapeHtml(doc.documentName)}</b>${details}</span><button type="button" data-action="open-document-remove" ${tutorBusy() ? "disabled" : ""}>Quitar</button></div>`;
}

function renderOpenAssistant() {
  const provider = state.tutor.providers.find(({ id }) => id === state.tutor.provider);
  const busy = tutorBusy();
  const connectionStatus = busy ? "Nora está respondiendo…"
    : state.tutor.configState === "loading" ? "Conectando con Nora…"
      : state.tutor.configError ? "Revisa la conexión de Nora"
        : provider ? `Disponible · ${provider.label}` : "IA sin configurar en el servidor";
  const providerPicker = state.tutor.providers.length > 1 ? `<label class="open-provider-label" for="open-tutor-provider">Modelo<select id="open-tutor-provider" data-tutor-provider>${state.tutor.providers.map((item) => `<option value="${escapeHtml(item.id)}" ${state.tutor.provider === item.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label>` : "";
  const live = state.anam.status === "live";
  const connecting = state.anam.status === "connecting";
  const liveButtonLabel = live ? "Desconectar avatar" : connecting ? "Conectando…" : "Conectar avatar Anam";
  const liveStatus = state.anam.error || state.anam.activity || (live ? "En vivo · puedes hablar o escribir." : connecting ? "Conectando con Nora…" : "El micrófono solo se solicita al conectar.");
  const voiceLabel = state.tutor.voiceEnabled ? "Voz activada" : "Activar voz";
  const cfdiContextNotice = state.openAssistant.cfdiContext ? `<aside class="open-cfdi-context" role="status"><span>RESUMEN CFDI PREPARADO · AÚN NO ENVIADO</span><p>Nora recibirá solo conteos, importes y alertas sin identificadores cuando envíes tu pregunta.</p><button type="button" data-action="cfdi-context-clear">Quitar resumen</button></aside>` : "";
  return `<main id="contenido" class="content open-assistant-content" data-open-assistant tabindex="-1">
    <header class="open-assistant-heading"><div><p class="eyebrow">CONVERSACIÓN ABIERTA · MÉXICO</p><h1>Resuelve tu duda<br/><em>con Nora.</em></h1><p>Repasa un concepto, explora un procedimiento o encuentra pasos concretos para una situación de tu entorno contable.</p></div><aside class="open-jurisdiction-card"><span>JURISDICCIÓN BASE</span><strong><i aria-hidden="true">MX</i> México</strong><small>Si tu consulta corresponde a otro país, indícalo.</small></aside></header>
    <section class="open-assistant-layout" aria-label="Chat abierto y avatar de Nora">
      <section class="open-chat-panel" aria-labelledby="open-chat-title">
        <header class="open-chat-header"><div><p class="eyebrow">CONTABILIDAD · ASESORÍA ABIERTA</p><h2 id="open-chat-title">Conversación con Nora</h2><span class="open-chat-status" data-open-status role="status" aria-live="polite">${escapeHtml(connectionStatus)}</span></div><div class="open-chat-controls">${providerPicker}<button class="tutor-control tutor-voice" type="button" data-action="tutor-voice" aria-label="${state.tutor.voiceEnabled ? "Desactivar voz de Nora" : "Activar voz de Nora"}" aria-pressed="${state.tutor.voiceEnabled}" ${tutorSpeaker.supported ? "" : "disabled"}>${voiceLabel}</button></div></header>
        <div class="open-chat-log" data-open-log data-testid="open-assistant-log" role="log" aria-live="polite" aria-relevant="additions text">${renderOpenAssistantMessages()}</div>
        ${cfdiContextNotice}
        <div class="open-starters" aria-label="Ideas para iniciar"><button type="button" data-open-prompt="Explícame cómo revisar una conciliación bancaria y qué diferencias conviene investigar primero.">Revisar una conciliación</button><button type="button" data-open-prompt="Ayúdame a plantear un procedimiento contable para este proceso; primero pregúntame qué información necesitas.">Diseñar un procedimiento</button><button type="button" data-open-prompt="Tengo un descuadre entre estos totales. Ayúdame a calcular la diferencia y proponer verificaciones: ">Analizar un descuadre</button><button type="button" data-section="cfdi">Abrir Analizador CFDI</button></div>
        <form class="open-chat-form" data-tutor-form data-open-form><label class="sr-only" for="open-assistant-input">Pregunta abierta a Nora</label><input id="open-assistant-input" data-tutor-input data-open-input data-testid="open-assistant-input" maxlength="2000" autocomplete="off" value="${escapeHtml(state.openAssistant.draft || "")}" placeholder="Escribe tu pregunta contable…" ${busy || !provider || state.openAssistant.documentLoading ? "disabled" : ""}/><button class="button button-primary" type="submit" ${busy || !provider || state.openAssistant.documentLoading ? "disabled" : ""}>Enviar <span aria-hidden="true">→</span></button></form>
        <section class="open-document-box" aria-label="Asesoría documental"><div class="open-document-heading"><div><b>LEER · REPARAR · GENERAR</b><span>XML · CSV · XLSX · PDF · DOCX</span></div><label class="open-document-select" for="open-assistant-document">${state.openAssistant.documentLoading ? "Leyendo localmente…" : state.openAssistant.documentFile ? "Cambiar archivo" : "Adjuntar archivo"}<input id="open-assistant-document" type="file" data-open-document accept=".xml,.csv,.xlsx,.pdf,.docx,.txt,application/xml,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" ${busy || state.openAssistant.documentLoading ? "disabled" : ""}/></label></div><div data-open-document-summary>${openAssistantDocumentSummary()}</div><p>Adjunta un archivo y escribe una instrucción como “lee”, “repara” o “genera un XLSX”. El archivo solo se envía a la ruta de documentos cuando la instrucción pide una operación.</p><p data-open-document-error class="open-error" role="status" hidden></p></section>
        <p class="open-config-error" data-open-config-error role="status" ${state.tutor.configError ? "" : "hidden"}>${escapeHtml(state.tutor.configError)}</p>
        <button type="button" class="tutor-stop open-stop" data-action="tutor-cancel" ${busy ? "" : "hidden"}>Detener respuesta</button>
        <p class="open-chat-privacy">El chat y los documentos no se guardan en ContaIA. No compartas claves, identificadores personales ni datos confidenciales; puedes describir el proceso sin incluirlos. Tus notas y progreso del curso no se envían.</p>
      </section>
      <aside class="open-nora-panel" aria-labelledby="open-nora-title"><header><div><p class="eyebrow">AVATAR EN VIVO · ANAM</p><h2 id="open-nora-title">Nora</h2><span>Tu asistente contable</span></div><span class="open-live-dot" aria-hidden="true"></span></header>
        <figure class="open-anam-screen" data-open-anam-panel aria-label="Panel del avatar de Nora"><div class="open-anam-placeholder" data-anam-placeholder ${live ? "hidden" : ""}><div class="open-anam-mark" aria-hidden="true"><span>ANAM</span><b>N</b></div><strong>Avatar Anam de Nora</strong><p>Conecta cuando quieras conversar con voz y video.</p></div><video id="nora-live-video" class="open-anam-video" data-anam-video autoplay playsinline ${live ? "" : "hidden"} aria-label="Video en vivo de Nora"></video></figure>
        <button type="button" class="open-anam-button" data-action="anam-toggle" data-testid="open-anam-toggle" aria-pressed="${live}" ${connecting ? "disabled" : ""}>${escapeHtml(liveButtonLabel)} <span aria-hidden="true">${live ? "Ⅱ" : connecting ? "…" : "◉"}</span></button><p class="open-anam-status" data-anam-status role="status" aria-live="polite">${escapeHtml(liveStatus)}</p>
        <p class="open-anam-privacy">El video y el micrófono se activan únicamente al pulsar el botón. Puedes usar el chat sin conectarlos.</p>
        <details class="open-sources"><summary>Fuentes oficiales de México</summary><nav aria-label="Fuentes normativas oficiales"><a href="https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/normatividad_rmf_rgce2026.html" target="_blank" rel="noopener noreferrer">SAT · RMF y RGCE 2026 ↗</a><a href="https://www.dof.gob.mx/" target="_blank" rel="noopener noreferrer">Diario Oficial de la Federación ↗</a><a href="https://www.diputados.gob.mx/LeyesBiblio/ref/cff.htm" target="_blank" rel="noopener noreferrer">Cámara de Diputados · CFF ↗</a><a href="https://www.diputados.gob.mx/LeyesBiblio/ref/lisr.htm" target="_blank" rel="noopener noreferrer">Cámara de Diputados · LISR ↗</a><a href="https://www.diputados.gob.mx/LeyesBiblio/ref/liva.htm" target="_blank" rel="noopener noreferrer">Cámara de Diputados · LIVA ↗</a><a href="https://www.cinif.org.mx/normatividad_NIF2026.php" target="_blank" rel="noopener noreferrer">CINIF · NIF 2026 ↗</a></nav><p>Consulta la publicación y el periodo aplicable. Nora no verifica cambios normativos en tiempo real; puedes adjuntar una fuente oficial para analizarla.</p></details>
      </aside>
    </section>
  </main>`;
}

function refreshOpenAssistant() {
  const panel = app.querySelector("[data-open-assistant]");
  if (!panel) return;
  const log = panel.querySelector("[data-open-log]");
  if (log) {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    log.innerHTML = renderOpenAssistantMessages();
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }
  const busy = tutorBusy();
  const provider = state.tutor.providers.find(({ id }) => id === state.tutor.provider);
  const status = panel.querySelector("[data-open-status]");
  if (status) status.textContent = busy ? "Nora está respondiendo…" : state.tutor.configState === "loading" ? "Conectando con Nora…" : state.tutor.configError ? "Revisa la conexión de Nora" : provider ? `Disponible · ${provider.label}` : "IA sin configurar en el servidor";
  const input = panel.querySelector("[data-open-input]");
  if (input) input.disabled = busy || !provider || state.openAssistant.documentLoading;
  const submit = panel.querySelector("[data-open-form] button[type=submit]");
  if (submit) submit.disabled = busy || !provider || state.openAssistant.documentLoading;
  const fileInput = panel.querySelector("[data-open-document]");
  if (fileInput) fileInput.disabled = busy || state.openAssistant.documentLoading;
  const documentLabel = panel.querySelector(".open-document-select");
  if (documentLabel) documentLabel.firstChild.textContent = state.openAssistant.documentLoading ? "Leyendo localmente…" : state.openAssistant.documentFile ? "Cambiar archivo" : "Adjuntar archivo";
  const documentSummary = panel.querySelector("[data-open-document-summary]");
  if (documentSummary) documentSummary.innerHTML = openAssistantDocumentSummary();
  const documentError = panel.querySelector("[data-open-document-error]");
  if (documentError) {
    documentError.textContent = state.openAssistant.documentError;
    documentError.hidden = !state.openAssistant.documentError;
  }
  const configError = panel.querySelector("[data-open-config-error]");
  if (configError) {
    configError.textContent = state.tutor.configError;
    configError.hidden = !state.tutor.configError;
  }
  const stop = panel.querySelector(".open-stop");
  if (stop) stop.hidden = !busy;
  const voice = panel.querySelector(".tutor-voice");
  if (voice) {
    voice.textContent = state.tutor.voiceEnabled ? "Voz activada" : "Activar voz";
    voice.setAttribute("aria-pressed", String(state.tutor.voiceEnabled));
    voice.setAttribute("aria-label", state.tutor.voiceEnabled ? "Desactivar voz de Nora" : "Activar voz de Nora");
  }
}

async function loadTutorDocument(file, { openMode = false } = {}) {
  if (!file) return;
  const conversation = openMode ? state.openAssistant : state.tutor;
  conversation.documentText = "";
  conversation.documentName = "";
  conversation.documentFile = file;
  conversation.documentTruncated = false;
  conversation.documentPageCount = null;
  conversation.documentError = "";
  conversation.documentLoading = true;
  refreshTutorPanel();
  try {
    conversation.documentName = String(file.name).slice(0, 160);
    if (["pdf", "txt", "csv"].includes(String(file.name).toLowerCase().split(".").pop())) {
      const { extractDocumentText } = await import("/vendor/document-reader.js");
      const extracted = await extractDocumentText(file);
      conversation.documentText = extracted.text;
      conversation.documentTruncated = extracted.truncated;
      conversation.documentPageCount = extracted.pageCount;
    }
  } catch (error) {
    conversation.documentError = error instanceof Error ? error.message : "No se pudo leer el archivo.";
  } finally {
    conversation.documentLoading = false;
    refreshTutorPanel();
  }
}

function documentOperationRequested(question) {
  return /\b(?:lee|leer|extrae|resume|resumir|analiza|analizar|repara|reparar|corrige|corregir|arregla|arreglar|limpia|normaliza|genera|generar|crea|crear|elabora|exporta|exportar|convierte|convertir)\b/i.test(question);
}

async function processOpenAssistantDocument(question) {
  const conversation = state.openAssistant;
  const file = conversation.documentFile;
  if (!file || !documentOperationRequested(question) || tutorBusy()) return false;
  const assistantMessage = { role: "assistant", text: "Procesando el documento…", processingDocument: true };
  conversation.messages.push({ role: "user", text: question }, assistantMessage);
  conversation.messages = conversation.messages.slice(-20);
  conversation.pending = true;
  refreshTutorPanel();
  try {
    const payload = await processDocumentFile(file, question);
    if (payload.result?.kind === "file") {
      assistantMessage.text = `${payload.action === "repair" ? "Reparé" : "Generé"} ${payload.result.name}. Puedes descargarlo desde este mensaje.`;
      assistantMessage.artifact = payload.result;
    } else {
      assistantMessage.text = `Lectura completada de ${payload.input?.name || file.name}:\n\n${payload.result?.text || "No se obtuvo texto legible."}${payload.result?.truncated ? "\n\n[El extracto fue limitado por seguridad.]" : ""}`;
    }
  } catch (error) {
    assistantMessage.text = error instanceof Error ? error.message : "No se pudo procesar el documento.";
  } finally {
    assistantMessage.processingDocument = false;
    conversation.pending = false;
    refreshTutorPanel();
  }
  return true;
}

function rememberTutorPanelSize() {
  const panel = app.querySelector(".tutor-panel.is-open");
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  if (rect.width >= 320 && rect.height >= 380) {
    state.tutor.panelWidth = Math.round(rect.width);
    state.tutor.panelHeight = Math.round(rect.height);
  }
}

async function sendTutorMessage(text, { includeDocument = false, openMode = state.section === "advisor" } = {}) {
  const question = text.trim();
  const conversation = activeTutorConversation(openMode);
  if (!question || tutorBusy()) return;
  const asksForCfdiAnalysis = openMode && !state.openAssistant.cfdiContext
    && /\b(?:cfdi|xml|complemento(?:s)? de pago|comprobante(?:s)?)\b/i.test(question)
    && /\b(?:analiz\w*|concili\w*|valid\w*|proces\w*|relacion\w*|cruz\w*|carg\w*|sub\w*)\b/i.test(question);
  if (asksForCfdiAnalysis) {
    state.openAssistant.messages.push(
      { role: "user", text: question },
      { role: "assistant", text: "Esta solicitud requiere leer comprobantes. Abrí el Analizador CFDI: los XML se procesan en tu navegador y no se envían al chat. Cuando termine, podrás elegir si compartes con Nora un resumen numérico sin identificadores." },
    );
    state.openAssistant.messages = state.openAssistant.messages.slice(-20);
    cfdiState.pendingRequest = question;
    state.section = "cfdi";
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    return;
  }
  if (openMode && await processOpenAssistantDocument(question)) return;
  if (!state.tutor.providers.length) {
    state.tutor.configError = "Configura un proveedor y su modelo en el servidor Vercel para habilitar las respuestas de Nora.";
    if (!openMode) state.tutor.collapsed = false;
    refreshTutorPanel();
    return;
  }
  const history = conversation.messages.slice(-8).map(({ role, text: content }) => ({ role, content }));
  const assistantMessage = { role: "assistant", text: "", streaming: true };
  conversation.messages.push({ role: "user", text: question }, assistantMessage);
  conversation.messages = conversation.messages.slice(-20);
  conversation.pending = true;
  if (!openMode) state.tutor.collapsed = false;
  state.tutor.avatarState = "thinking";
  const requestSection = openMode ? "advisor" : state.section;
  const controller = new AbortController();
  conversation.abortController = controller;
  const liveClient = state.anam.status === "live" ? state.anam.client : null;
  const talkStream = liveClient?.createTalkMessageStream?.() ?? null;
  let talkQueue = Promise.resolve();
  let talkStreamFailed = false;
  refreshTutorPanel();
  try {
    const reply = await requestTutorReply({
      message: question,
      context: openMode ? { section: "advisor" } : getTutorContext(),
      history,
      documentText: includeDocument ? conversation.documentText : "",
      cfdiContext: openMode ? state.openAssistant.cfdiContext : undefined,
      provider: state.tutor.provider || state.tutor.defaultProvider,
      signal: controller.signal,
      onToken: (token) => {
        assistantMessage.text += token;
        if (state.section === requestSection) {
          const streamed = app.querySelector(openMode ? "[data-open-stream]" : "[data-tutor-stream]");
          if (streamed) streamed.textContent = assistantMessage.text;
        }
        if (talkStream && !talkStreamFailed) {
          talkQueue = talkQueue.then(() => talkStream.streamMessageChunk(token, false)).catch(() => { talkStreamFailed = true; });
        }
      },
    });
    await talkQueue;
    if (talkStream?.isActive()) await talkStream.endMessage();
    assistantMessage.streaming = false;
    state.tutor.avatarState = talkStream || /\b(listo|completaste|correcto|muy bien)\b/i.test(reply) ? (talkStream ? "explaining" : "celebrating") : "explaining";
    if (talkStreamFailed) state.anam.error = "La respuesta está en el chat, pero se interrumpió el audio en vivo.";
    if (state.tutor.voiceEnabled && !talkStream) tutorSpeaker.say(reply);
  } catch (error) {
    await talkQueue;
    if (talkStream?.isActive()) await talkStream.endMessage().catch(() => {});
    conversation.messages.pop();
    assistantMessage.streaming = false;
    assistantMessage.text = error.name === "AbortError" ? "Respuesta detenida. Puedes continuar cuando quieras." : "No pude obtener respuesta de la tutora. Revisa la conexión o vuelve a intentarlo.";
    state.tutor.configError = error.name === "AbortError" ? "" : error.message;
    state.tutor.avatarState = "idle";
  } finally {
    conversation.pending = false;
    conversation.abortController = null;
    if (state.anam.status === "live" && !state.anam.pendingTranscript) state.anam.activity = "En vivo · puedes hablar cuando quieras.";
    refreshTutorPanel();
    if (state.section === requestSection) app.querySelector(openMode ? "[data-open-input]" : "[data-tutor-input]")?.focus({ preventScroll: true });
    const pendingTranscript = state.anam.pendingTranscript;
    state.anam.pendingTranscript = "";
    if (pendingTranscript && state.anam.status === "live") queueMicrotask(() => handleAnamTranscript(pendingTranscript));
  }
}
async function stopAnamSession({ silent = false } = {}) {
  const controller = state.anam.abortController;
  state.anam.abortController = null;
  controller?.abort();
  const client = state.anam.client;
  state.anam.client = null;
  state.anam.status = "idle";
  state.anam.error = "";
  state.anam.activity = "";
  state.anam.lastUserMessageId = "";
  state.anam.pendingTranscript = "";
  state.tutor.abortController?.abort();
  state.openAssistant.abortController?.abort();
  try { await client?.stopStreaming?.(); } catch { /* El cliente pudo cerrarse por pérdida de red. */ }
  if (!silent) refreshClassroomVisual();
}

async function startAnamSession() {
  if (state.anam.status === "connecting" || state.anam.status === "live") return;
  state.anam.status = "connecting";
  state.anam.error = "";
  state.anam.activity = "";
  const controller = new AbortController();
  state.anam.abortController = controller;
  tutorSpeaker.stop();
  refreshClassroomVisual();
  try {
    const response = await fetch("/api/tutor/anam-session", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.sessionToken !== "string") throw new Error(payload.error || "No se pudo iniciar la sesión de Nora en vivo.");
    if (controller.signal.aborted) return;
    const { createClient, AnamEvent } = await import("/vendor/anam-sdk.js");
    const client = createClient(payload.sessionToken);
    state.anam.client = client;
    client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
      if (state.anam.client !== client) return;
      state.anam.status = "live";
      state.anam.activity = state.section === "course" ? "Nora está preparando la primera consigna." : "En vivo · puedes hablar o escribir a Nora.";
      refreshClassroomVisual();
      if (state.section === "course") narrateClassroomInstruction();
    });
    client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
      if (state.anam.client !== client || !["course", "advisor"].includes(state.section) || !Array.isArray(messages)) return;
      if (messages.at(-1)?.role === "persona" && !tutorBusy()) {
        state.anam.activity = "En vivo · puedes hablar cuando quieras.";
        refreshClassroomVisual();
      }
      const latestUser = [...messages].reverse().find((message) => message?.role === "user" && typeof message.content === "string");
      if (!latestUser || !latestUser.content.trim() || latestUser.id === state.anam.lastUserMessageId) return;
      state.anam.lastUserMessageId = latestUser.id;
      const transcript = latestUser.content.trim().slice(0, 2000);
      state.anam.activity = "Consulta recibida · Nora está preparando una respuesta.";
      if (tutorBusy()) {
        state.anam.pendingTranscript = transcript;
        const pendingConversation = state.tutor.pending ? state.tutor : state.openAssistant;
        pendingConversation.abortController?.abort();
      } else {
        handleAnamTranscript(transcript);
      }
    });
    client.addListener(AnamEvent.USER_SPEECH_STARTED, () => {
      if (state.anam.client !== client) return;
      state.anam.activity = "Te escucho. No compartas datos reales, personales o confidenciales.";
      refreshClassroomVisual();
    });
    client.addListener(AnamEvent.USER_SPEECH_ENDED, () => {
      if (state.anam.client !== client) return;
      state.anam.activity = "Procesando tu pregunta…";
      refreshClassroomVisual();
    });
    client.addListener(AnamEvent.MIC_PERMISSION_DENIED, () => {
      if (state.anam.client !== client) return;
      state.anam.client = null;
      state.anam.error = "No se concedió el micrófono. Puedes continuar por el chat o permitirlo en la configuración del navegador.";
      state.anam.status = "error";
      void client.stopStreaming().catch(() => {});
      refreshClassroomVisual();
    });
    client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => activeTutorConversation().abortController?.abort());
    client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
      if (state.anam.client !== client) return;
      state.anam.client = null;
      state.anam.status = "idle";
      state.anam.activity = "La conexión en vivo terminó. Puedes volver a conectarte o seguir por chat.";
      refreshClassroomVisual();
    });
    await client.streamToVideoElement("nora-live-video");
    if (state.anam.client === client && state.anam.status === "connecting") {
      state.anam.status = "live";
      state.anam.activity = "En vivo · el micrófono está activo.";
      refreshClassroomVisual();
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    const client = state.anam.client;
    state.anam.client = null;
    try { await client?.stopStreaming?.(); } catch { /* Limpieza tras error de conexión. */ }
    state.anam.status = "error";
    state.anam.error = error?.name === "NotAllowedError"
      ? "No se concedió el micrófono. Puedes continuar por el chat o permitirlo en la configuración del navegador."
      : error?.message?.startsWith("La sesión en vivo") || error?.message?.startsWith("Anam ") || error?.message?.startsWith("No se pudo conectar")
        ? error.message
        : "No se pudo conectar el avatar en vivo. Puedes continuar con el chat de Nora.";
    refreshClassroomVisual();
  } finally {
    if (state.anam.abortController === controller) state.anam.abortController = null;
  }
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
      <span class="home-glyph">${uiIcon("home")}</span><span>Panel de práctica</span>
    </button>
    <button class="nav-item ${state.section === "study" ? "is-active" : ""}" type="button" data-section="study" aria-current="${state.section === "study" ? "page" : "false"}">
      <span class="home-glyph">${uiIcon("book")}</span><span>Base de estudio</span>
    </button>
    ${groupMarkup}
    <div class="sidebar-bottom">
      <div class="folio-stamp"><span class="stamp-dot"></span><div><b>CASOS FICTICIOS</b><small>Sin datos de clientes</small></div></div>
      <a class="data-link" href="/data/transacciones-ficticias.csv" download>↓ Descargar datos de ejemplo</a>
    </div>
  </aside>`;
}

function mobileNavigation() {
  return `<nav class="mobile-bottom-nav" aria-label="Navegación móvil">
    <button type="button" class="mobile-nav-item ${state.section === "lab" ? "is-active" : ""}" data-nav="home">${uiIcon("home")}<small>Recorrido</small></button>
    <button type="button" class="mobile-nav-item ${state.section === "course" ? "is-active" : ""}" data-section="course">${uiIcon("book")}<small>Aula</small></button>
    <button type="button" class="mobile-nav-item ${["tools", "cfdi", "study"].includes(state.section) ? "is-active" : ""}" data-section="tools">${uiIcon("grid")}<small>Herramientas</small></button>
    <button type="button" class="mobile-nav-item ${state.section === "advisor" ? "is-active" : ""}" data-section="advisor">${uiIcon("nora")}<small>Nora</small></button>
    <button type="button" class="mobile-primary-action" data-section="course" aria-label="Continuar con el aula">Continuar ${uiIcon("arrow")}</button>
  </nav>`;
}

function topbar() {
  const done = state.completed.size;
  const pageLabel = state.section === "course" ? "Aula en vivo" : state.section === "advisor" ? "Asistente abierto" : state.section === "cfdi" ? "Analizador CFDI" : state.section === "tools" ? "Centro de herramientas" : state.section === "study" ? "Base de estudio" : state.current === "home" ? "Resumen" : "Ejercicio";
  const activeClassIndex = Math.max(0, courseModules.findIndex(({ id }) => id === state.activeModuleId));
  const activeClassComplete = state.completedModules.has(courseModules[activeClassIndex]?.id);
  const nextClassIndex = activeClassComplete
    ? courseModules.findIndex(({ id }) => !state.completedModules.has(id))
    : courseModules.findIndex(({ id }, index) => index > activeClassIndex && !state.completedModules.has(id));
  const classOptions = courseModules.map((module, index) => {
    const isComplete = state.completedModules.has(module.id);
    const isActive = module.id === state.activeModuleId;
    const status = isComplete ? "Completada" : isActive ? "En curso" : index === nextClassIndex ? "Siguiente" : "Por empezar";
    const actionLabel = isActive ? isComplete ? "Revisar clase" : "Continuar clase" : "Abrir";
    return `<button type="button" class="class-menu-item ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""} ${index === nextClassIndex ? "is-next" : ""}" data-class-module="${escapeHtml(module.id)}" aria-current="${isActive ? "step" : "false"}"><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(module.title)}</b><small class="class-menu-status">${status}</small><small class="class-menu-action">${actionLabel}</small><i aria-hidden="true">${isComplete ? "✓" : index === nextClassIndex ? "→" : ""}</i></button>`;
  }).join("");
  const toolsActive = ["tools", "advisor", "cfdi", "lab", "study"].includes(state.section);
  const tools = [
    ["tools", "Centro de herramientas", "grid"],
    ["advisor", "Asistente abierto", "nora"],
    ["cfdi", "Analizador CFDI", "file"],
    ["lab", "Laboratorio práctico", "check"],
    ["study", "Base de estudio", "book"],
  ].map(([section, label, icon]) => `<button class="section-tab ${state.section === section ? "is-active" : ""}" type="button" data-section="${section}" aria-current="${state.section === section ? "page" : "false"}">${uiIcon(icon)}<span>${label}</span></button>`).join("");
  return `<header class="topbar"><div class="breadcrumb"><img class="topbar-brand-logo" src="/brand/contaia-logo-64.png" alt="" aria-hidden="true" /><span>LABORATORIO CONTAIA</span><i aria-hidden="true">/</i><strong>${pageLabel}</strong></div>
    <nav class="section-tabs" aria-label="Secciones principales">
      <button class="section-tab ${state.section === "course" ? "is-active" : ""}" type="button" data-section="course" aria-current="${state.section === "course" ? "page" : "false"}"><b>01</b>${uiIcon("book")}<span>Aula en vivo</span></button>
      <details class="class-menu"><summary class="section-tab ${state.section === "course" ? "is-active" : ""}" aria-label="Abrir lista de clases"><b>02</b>${uiIcon("menu")}<span>Clases</span>${uiIcon("chevron")}</summary><div class="class-menu-popover" role="group" aria-label="Ruta de las ${courseModules.length} clases">${classOptions}<p>${state.completedModules.size} de ${courseModules.length} clases completadas · clase actual ${String(activeClassIndex + 1).padStart(2, "0")} · avance guardado localmente</p></div></details>
      <details class="tools-menu"><summary class="section-tab ${toolsActive ? "is-active" : ""}" aria-label="${toolsActive ? `Abrir herramientas; sección actual: ${pageLabel}` : "Abrir herramientas"}" aria-controls="section-tools"><b>03</b>${uiIcon("grid")}<span>Herramientas</span>${uiIcon("chevron")}</summary><div class="tools-menu-popover" id="section-tools" role="group" aria-label="Otras herramientas">${tools}${state.section === "advisor" ? "" : `<button class="section-tab advisor-tab" type="button" data-action="tutor-toggle" aria-expanded="${!state.tutor.collapsed}" aria-controls="tutor-panel-body">${uiIcon("nora")}<span>Asesoría</span></button>`}</div></details>
    </nav>
    <div class="topbar-right"><span class="edition"><span class="edition-dot"></span>Edición educativa</span>${state.section === "lab" ? `<span class="progress-mini"><b>${done}</b> / ${exercises.length} prácticas</span>` : ""}<span class="auth-controls">${renderAuthControls()}</span></div>
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
        <span class="module-number">${String(index + 1).padStart(2, "0")}</span><span class="module-info"><small>${escapeHtml(exercise.category)} · práctica ficticia</small><strong>${escapeHtml(exercise.title)}</strong></span>
        <span class="module-status ${state.completed.has(exercise.id) ? "is-complete" : ""}">${state.completed.has(exercise.id) ? "Completada ✓" : "Abrir práctica →"}</span></button>`).join("")}</div>
    </section>
    <section class="method-note"><div class="method-label">MÉTODO DE TRABAJO <span>02 / 03</span></div><div><h2>La IA propone.<br/>Tu criterio dispone.</h2><p>Usa las respuestas de una herramienta como borrador. Confirma cálculos, evidencia y reglas aplicables antes de tomar decisiones o compartir conclusiones.</p></div><a href="/data/transacciones-ficticias.csv" download class="text-link">Explorar el conjunto de datos <span>↗</span></a></section>
    <p class="home-footnote">${escapeHtml(state.storageWarning || "Las respuestas y selecciones no se guardan; solo los módulos y prácticas completados permanecen en este navegador.")}</p>
  </main>`;
}

function renderModuleSessionFlow(module) {
  const guide = module.guide;
  const descriptions = [
    escapeHtml(guide.opening),
    escapeHtml(`${module.teachFirst?.why || "Presenta el concepto central."} ${module.demonstration?.why || "Observa qué cambia entre el antes y el después."}`),
    `<strong>Ruta en 3 pasos</strong><ol class="module-session-checklist">${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`,
    `<strong>Pregunta de control</strong><p>${escapeHtml(guide.checkpoint)}</p>`,
    `<strong>Evidencia de salida</strong><p>${escapeHtml(guide.deliverable)}</p>`,
  ];
  const sessions = courseSessionFlow.map((stage, index) => `<li class="module-session-step"><div class="module-session-meta"><span>FASE ${String(index + 1).padStart(2, "0")}</span></div><h4>${escapeHtml(stage.title)}</h4><div class="module-session-description">${descriptions[index]}</div></li>`).join("");
  const documents = module.context?.documents?.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>Repasa las notas y materiales del módulo.</li>";
  return `<section class="module-session-flow" data-testid="module-session-flow-${escapeHtml(module.id)}" aria-label="Secuencia de la clase ${escapeHtml(module.title)}"><div class="module-session-flow-heading"><div><p class="eyebrow">SESIÓN GUIADA</p><h3>Así trabajaremos esta clase</h3></div><span class="count-pill">En este orden</span></div><ol class="module-session-steps">${sessions}</ol><aside class="module-independent-work"><span>PARA PROFUNDIZAR</span><div><b>Práctica independiente</b><p>Continúa con el producto de la semana usando un caso simulado. Material recomendado:</p><ul>${documents}</ul></div></aside></section>`;
}

function renderVideoCard({ kind, id, module, exercise = null }) {
  const video = resolveCourseVideo(kind, id);
  const cardId = `${kind}-${id}`;
  const title = kind === "module" ? `Explicación del módulo: ${module.title}` : `Apoyo para la práctica: ${exercise?.title || "actividad"}`;
  const player = video
    ? `<div class="course-video-player"><iframe src="${escapeHtml(video.embedUrl)}" title="${escapeHtml(video.title)}" loading="lazy" allow="encrypted-media; fullscreen" allowfullscreen></iframe></div><p class="course-video-reviewed">Video publicado y revisado${video.duration ? ` · ${escapeHtml(video.duration)}` : ""}. El reproductor y la reproducción se cargan desde Synthesia.</p>`
    : `<div class="course-video-pending"><span aria-hidden="true">▶</span><div><b>Video en preparación</b><p>NotebookLM puede preparar el guion desde las fuentes del módulo; Synthesia produce el video narrado. La explicación aparecerá aquí después de revisarla y publicarla.</p></div></div>`;
  return `<section class="course-video-card" data-testid="course-video-${escapeHtml(cardId)}" aria-label="${escapeHtml(title)}">
    <div class="course-video-heading"><div><p class="eyebrow">VIDEO EXPLICATIVO</p><h4>${escapeHtml(title)}</h4></div><span class="course-video-pipeline">NOTEBOOKLM → SYNTHESIA</span></div>
    ${player}
    <div class="course-video-actions"><button type="button" class="button button-quiet" data-action="copy-video-brief" data-video-kind="${escapeHtml(kind)}" data-video-id="${escapeHtml(id)}">Copiar briefing para NotebookLM</button><a class="course-video-service-link" href="${NOTEBOOKLM_URL}" target="_blank" rel="noopener noreferrer">Abrir NotebookLM ↗</a><a class="course-video-service-link" href="${SYNTHESIA_URL}" target="_blank" rel="noopener noreferrer">Abrir Synthesia ↗</a></div>
    <p class="course-video-brief-status" data-video-brief-status="${escapeHtml(cardId)}" role="status" aria-live="polite"></p>
  </section>`;
}

async function copyVideoBrief(kind, id) {
  const module = kind === "module"
    ? courseModules.find((item) => item.id === id)
    : courseModules.find((item) => item.exerciseIds.includes(id));
  const exercise = kind === "exercise" ? exercises.find((item) => item.id === id) : null;
  if (!module || (kind === "exercise" && !exercise)) return;
  const statusKey = `${kind}-${id}`;
  const status = [...app.querySelectorAll("[data-video-brief-status]")].find((item) => item.dataset.videoBriefStatus === statusKey);
  try {
    const brief = buildVideoBrief({ module, exercise });
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(brief);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = brief;
      textarea.setAttribute("aria-hidden", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      let copied = false;
      try {
        textarea.select();
        copied = document.execCommand("copy");
      } finally {
        textarea.remove();
      }
      if (!copied) throw new Error("Clipboard no disponible");
    }
    if (status) status.textContent = "Briefing copiado. Revísalo con las fuentes del módulo antes de producir el video.";
  } catch {
    if (status) status.textContent = "No se pudo copiar. Abre NotebookLM y vuelve a intentarlo desde un navegador con permiso para usar el portapapeles.";
  }
}

function renderModuleGuide(module) {
  const moduleGuide = module.guide;
  if (!moduleGuide) return "";
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
    <p class="module-nora-opening">${escapeHtml(moduleGuide.opening)}</p>
    ${renderModuleSessionFlow(module)}
    ${foundation ? `<div class="module-nora-foundation"><div><b>Aprende primero</b><p>${escapeHtml(foundation.why)}</p></div><ul>${concepts}</ul>${activeDefinition ? `<div class="glossary-definition" role="status"><b>Glosario · ${escapeHtml(activeDefinition.term)}</b><span>${escapeHtml(activeDefinition.definition)}</span><em><strong>Ejemplo:</strong> ${escapeHtml(activeDefinition.example)}</em><em><strong>Comprueba:</strong> ${escapeHtml(activeDefinition.check)}</em></div>` : ""}<p class="module-nora-example"><strong>Ejemplo sencillo:</strong> ${escapeHtml(foundation.example)}</p></div>` : ""}
    ${demo ? `<div class="module-demo-wrap"><button type="button" class="module-demo-button" data-action="module-demo" data-module-demo="${escapeHtml(module.id)}" aria-expanded="${isDemoOpen}">${isDemoOpen ? "Ocultar demostración" : "Nora demuestra: antes y después"} <span aria-hidden="true">${isDemoOpen ? "↑" : "→"}</span></button>${isDemoOpen ? `<div class="module-demo" data-testid="module-demo-${escapeHtml(module.id)}"><div><b>Antes</b><p>${escapeHtml(demo.before)}</p></div><div><b>Después</b><p>${escapeHtml(demo.after)}</p></div><p><strong>Qué observar:</strong> ${escapeHtml(demo.why)}</p></div>` : ""}</div>` : ""}
    ${context ? `<div class="module-context" data-testid="module-context-${escapeHtml(module.id)}"><div class="module-context-heading"><b>Contexto que puedes aportar</b><span>Solo usa datos ficticios; la IA no recibe tus notas locales</span></div><div class="module-context-grid"><div><b>Documento o material</b><ul>${contextDocuments}</ul></div><div><b>Debe contener</b><ul>${contextFields}</ul></div></div><p><b>Formato sugerido:</b> ${escapeHtml(context.format)}</p><p class="module-context-protect"><b>Antes de usarlo:</b> ${escapeHtml(context.protect)}</p></div>` : ""}
    ${tools ? `<div class="module-toolkit" data-testid="module-toolkit-${escapeHtml(module.id)}"><div class="module-toolkit-heading"><b>Herramientas para practicar</b><span>Opcionales · siempre con datos ficticios</span></div><div class="module-tool-grid">${tools}</div></div>` : ""}
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

const studyKindLabels = { module: "Módulo", practice: "Práctica", concept: "Concepto", knowledge: "Conocimiento externo" };

function renderStudyResults() {
  if (!state.studyItems.length) {
    return `<div class="study-empty"><strong>Preparando la base de estudio…</strong><span>El catálogo se inicializa en este navegador, sin enviar contenido a un servicio externo.</span></div>`;
  }
  const results = searchStudyItems(state.studyItems, state.studyQuery, state.studyKind);
  if (!results.length) {
    return `<div class="study-empty"><strong>No encontramos coincidencias.</strong><span>Prueba con otra palabra o cambia el tipo de contenido.</span></div>`;
  }
  const visibleResults = results.slice(0, state.studyVisibleCount);
  return `<div class="study-results-list">${visibleResults.map((item) => {
    const note = selectedStudyNote(item.id);
    return `<article class="study-result-card ${state.studySelectedId === item.id ? "is-selected" : ""}">
      <div class="study-result-meta"><span>${escapeHtml(studyKindLabels[item.kind] ?? item.kind)}</span>${note ? "<b>Nota guardada</b>" : ""}</div>
      <button type="button" class="study-result-title" data-study-open="${escapeHtml(item.id)}">${escapeHtml(item.title)} <span aria-hidden="true">↗</span></button>
      <p>${escapeHtml(item.summary)}</p>
      <div class="study-result-footer"><span>${escapeHtml((item.tags ?? []).slice(0, 3).join(" · "))}</span><button type="button" class="study-note-link" data-study-open="${escapeHtml(item.id)}">${note ? "Editar nota" : "Tomar nota"}</button></div>
    </article>`;
  }).join("")}</div>${visibleResults.length < results.length ? `<button type="button" class="study-load-more" data-action="study-more">Mostrar más (${results.length - visibleResults.length} restantes)</button>` : ""}`;
}

function renderStudy() {
  const selected = state.studyItems.find((item) => item.id === state.studySelectedId);
  const note = selected ? selectedStudyNote(selected.id) : null;
  const detail = selected ? `<aside class="study-detail" aria-label="Detalle de estudio">
    <div class="study-detail-kicker">${escapeHtml(studyKindLabels[selected.kind] ?? "Registro")}</div>
    <h2>${escapeHtml(selected.title)}</h2>
    <p>${escapeHtml(selected.body)}</p>
    <div class="study-detail-actions">${selected.kind === "module" ? `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Ver módulo ↗</button>` : selected.kind === "practice" ? `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Abrir práctica ↗</button>` : selected.kind === "knowledge" ? `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Abrir fuente ↗</button>` : `<button type="button" class="button button-primary" data-study-navigate="${escapeHtml(selected.id)}">Ver concepto ↗</button>`}<button type="button" class="button button-quiet" data-action="study-close">Cerrar</button></div>
    ${selected.source ? `<div class="study-source"><b>Procedencia</b><span>${escapeHtml(selected.source.name)} · ${escapeHtml(selected.source.license)}</span><small>${escapeHtml(selected.source.jurisdiction)}${selected.source.synthetic ? " · datos sintéticos" : ""}</small></div>` : ""}
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
    <section class="study-layout"><div class="study-browser"><div class="section-heading"><div><p class="eyebrow">BÚSQUEDA</p><h2>Biblioteca del recorrido</h2></div><span class="count-pill">${searchStudyItems(state.studyItems, state.studyQuery, state.studyKind).length} resultados</span></div><div class="study-search-row"><label class="sr-only" for="study-search">Buscar en la base de estudio</label><input id="study-search" data-study-search type="search" value="${escapeHtml(state.studyQuery)}" placeholder="Busca por tema, práctica, concepto o fuente…" autocomplete="off"/><select data-study-filter aria-label="Filtrar por tipo"><option value="all" ${state.studyKind === "all" ? "selected" : ""}>Todo el catálogo</option><option value="module" ${state.studyKind === "module" ? "selected" : ""}>Módulos</option><option value="practice" ${state.studyKind === "practice" ? "selected" : ""}>Prácticas</option><option value="concept" ${state.studyKind === "concept" ? "selected" : ""}>Conceptos</option><option value="knowledge" ${state.studyKind === "knowledge" ? "selected" : ""}>Fuentes externas</option></select></div><div data-study-results>${renderStudyResults()}</div></div>${detail}</section>
    <p class="progress-storage-note" role="status">${escapeHtml(state.studyDbWarning || "La base incluye el catálogo del curso y tus notas privadas locales; no sincroniza con cuentas ni servicios externos.")}</p>
  </main>`;
}

function renderCourse() {
  return renderClassroom({
    modules: courseModules,
    exercises,
    state,
    onboarding: renderOnboarding(),
    glossary: renderGlossaryIndex(),
    assetPath,
    avatarLabel: tutorAvatarLabel(),
    voiceSupported: tutorSpeaker.supported,
    anam: state.anam,
  });
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
  const style = feedback.status === "logrado" ? "feedback-good" : feedback.status === "incompleto" ? "feedback-neutral" : "feedback-revise";
  const checklist = feedback.checklist ? `<ul class="feedback-checklist">${feedback.checklist.map((item) => `<li class="${item.met ? "met" : "unmet"}"><span>${item.met ? "✓" : "○"}</span>${escapeHtml(item.label)}</li>`).join("")}</ul>` : "";
  const strengths = feedback.strengths?.length ? `<section class="feedback-section"><h3>Puntos fuertes</h3><ul>${feedback.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : "";
  const nextStep = feedback.nextStep ? `<section class="feedback-section feedback-next-step"><h3>Siguiente paso</h3><p>${escapeHtml(feedback.nextStep)}</p></section>` : "";
  const statusLabel = { logrado: "Logrado en este caso", revisar: "Para revisar", incompleto: "Intento incompleto" }[feedback.status] ?? "Retroalimentación";
  return `<div class="feedback-box ${style}" role="status" aria-live="polite"><div class="feedback-title"><span aria-hidden="true">${feedback.status === "logrado" ? "✓" : feedback.status === "incompleto" ? "i" : "↻"}</span><strong>${escapeHtml(feedback.title)}</strong></div><p class="feedback-status-label">Estado: ${statusLabel}</p><p>${escapeHtml(feedback.message)}</p>${strengths}${nextStep}${checklist}${feedback.explanation ? `<div class="explanation"><b>Por qué</b><p>${escapeHtml(feedback.explanation)}</p></div>` : ""}</div>`;
}

function renderGuidedProgress(stage) {
  const steps = ["Intento", "Pista", "Ejemplo", "Comparación"];
  const index = ["attempt", "hint", "example", "compare"].indexOf(stage);
  return `<ol class="guided-progress" aria-label="Etapas de esta práctica">${steps.map((label, stepIndex) => `<li class="guided-progress-step ${stepIndex < index ? "is-complete" : ""} ${stepIndex === index ? "is-current" : ""}" ${stepIndex === index ? 'aria-current="step"' : ""}><span>${stepIndex + 1}</span>${label}</li>`).join("")}</ol>`;
}

function renderExercise(exercise) {
  const isWritten = exercise.kind === "prompt" || exercise.kind === "written";
  const linkedModule = courseModules.find((module) => module.exerciseIds.includes(exercise.id)) ?? courseModules[0];
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
    <div class="exercise-heading"><div class="exercise-number">${String(previousIndex + 1).padStart(2, "0")}</div><div><p class="eyebrow">${escapeHtml(exercise.category)} · caso ficticio</p><h1>${escapeHtml(exercise.title)}</h1><p class="exercise-intro">${escapeHtml(exercise.intro)}</p></div><span class="case-tag">PRÁCTICA</span></div>
    ${scenario}${tables}${stageProgress}${renderVideoCard({ kind: "exercise", id: exercise.id, module: linkedModule, exercise })}
    <div class="workbench"><section class="work-main" aria-label="Área de práctica">${form}<div class="exercise-actions">
      <button type="button" class="button button-primary" data-action="check" data-id="${exercise.id}">Comprobar mi respuesta <span aria-hidden="true">→</span></button>
      ${isWritten && state.attempted.has(exercise.id) && state.feedback.get(exercise.id)?.status !== "incompleto" && !state.completed.has(exercise.id) ? `<button type="button" class="button button-quiet" data-action="mark-reviewed" data-id="${exercise.id}">Terminé de revisar esta práctica</button>` : ""}
      <button type="button" class="button button-quiet" data-action="hint" data-id="${exercise.id}" ${stage === "hint" ? "" : "disabled"}>${stage === "hint" ? "Pedir una pista" : showHint ? "Pista consultada" : "Pista después del intento"}</button>
      <button type="button" class="button button-quiet" data-action="solution" data-id="${exercise.id}" ${stage === "example" ? "" : "disabled"}>${stage === "example" ? "Ver ejemplo y comparar" : showSolution ? "Comparación visible" : "Ejemplo después de la pista"}</button>
      <button type="button" class="button button-quiet advisor-practice-button" data-action="tutor-open">Preguntar a Nora · tú haces el ejercicio</button>
    </div></section><aside class="work-feedback" aria-label="Retroalimentación">${feedback}${hint}${solution}</aside></div>
    <footer class="exercise-footer"><span>${state.completed.has(exercise.id) ? '<b class="completed-mark">✓</b> Práctica completada en esta sesión' : "Tu respuesta se queda en este navegador durante la sesión"}</span>${nextExercise ? `<button type="button" class="next-link" data-nav="${nextExercise.id}">Siguiente práctica <span>→</span></button>` : `<button type="button" class="next-link" data-nav="home">Terminar recorrido <span>→</span></button>`}</footer>
    <p class="progress-storage-note" role="status">${escapeHtml(state.storageWarning || "Solo se conserva el estado de finalización; la respuesta escrita o seleccionada no se guarda.")}</p>
    <p class="disclaimer-inline">Material educativo con datos ficticios. No constituye asesoría profesional, contable o fiscal.</p>
  </main>`;
}

function render() {
  const keepAnamVideo = ["course", "advisor"].includes(state.section) && ["live", "connecting"].includes(state.anam.status);
  const persistentVideo = keepAnamVideo ? app.querySelector("[data-anam-video]") : null;
  if (persistentVideo) persistentVideo.remove();
  else if (state.anam.client || state.anam.status === "connecting") void stopAnamSession({ silent: true });
  if (!currentUser()) {
    app.innerHTML = location.pathname === "/registro" ? renderRegistrationGate() : renderAuthGate();
    return;
  }
  const exercise = state.section === "lab" ? exercises.find((item) => item.id === state.current) : null;
  const content = state.section === "course" ? renderCourse()
    : state.section === "advisor" ? renderOpenAssistant()
      : state.section === "cfdi" ? renderCfdiWorkspace()
      : state.section === "tools" ? renderToolsPanel({ notice: state.toolsNotice })
      : state.section === "study" ? renderStudy()
        : exercise ? renderExercise(exercise) : renderHome();
  const showSidebar = ["lab", "study"].includes(state.section);
  const tutorPanel = ["advisor", "cfdi", "tools"].includes(state.section) ? "" : renderTutorPanel(getTutorContext());
  app.innerHTML = `<div class="app-shell">${showSidebar ? sidebar() : ""}<div class="main-shell ${showSidebar ? "" : "main-shell-live"}">${topbar()}${content}</div>${tutorPanel}${renderAuthPanel()}${mobileNavigation()}</div>`;
  if (persistentVideo) {
    const placeholder = app.querySelector("[data-anam-video]");
    if (placeholder) placeholder.replaceWith(persistentVideo);
    persistentVideo.hidden = state.anam.status !== "live";
  }
  refreshClassroomVisual();
  refreshOpenAssistant();
}
async function initializeTutorConfig() {
  try {
    const config = await loadTutorConfig();
    state.tutor.providers = config.providers;
    state.tutor.defaultProvider = config.defaultProvider;
    state.tutor.provider = config.defaultProvider;
    state.tutor.configState = "ready";
    state.tutor.configError = config.providers.length ? "" : "El backend está conectado, pero falta configurar un proveedor y modelo IA en Vercel.";
  } catch {
    state.tutor.configState = "error";
    state.tutor.configError = "No se pudo conectar con el backend de Nora. Publica las funciones /api/tutor en Vercel o configura su URL en tutor-config.js.";
  }
  refreshTutorPanel();
}

function checkAnswer(exercise) {
  if (exercise.kind === "prompt" || exercise.kind === "written") {
    const answer = state.answers.get(exercise.id) ?? "";
    if (answer.trim()) state.attempted.add(exercise.id);
    state.feedback.set(exercise.id, buildWrittenFeedback(answer, exercise));
  } else {
    const selected = state.selections.get(exercise.id);
    const result = evaluateChoice(selected, exercise);
    if (selected) state.attempted.add(exercise.id);
    if (result.correct) state.completed.add(exercise.id);
    state.feedback.set(exercise.id, buildChoiceFeedback(result, exercise));
  }
  state.tutor.avatarState = state.completed.has(exercise.id) ? "celebrating" : "explaining";
  persistProgress();
  render();
}

app.addEventListener("click", (event) => {
  if (event.target.closest("[data-action='auth-close']") && !event.target.closest("[data-auth-panel]")) {
    authState.open = false;
    render();
    return;
  }
  const section = event.target.closest("[data-section]");
  if (section) {
    state.section = ["course", "lab", "study", "advisor", "cfdi", "tools"].includes(section.dataset.section) ? section.dataset.section : "course";
    resetTutor(state.section === "lab" ? "home" : null);
    if (state.section === "lab") state.current = "home";
    if (state.section !== "tools") state.toolsNotice = "";
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const toolAction = event.target.closest("[data-tool-action]");
  if (toolAction) {
    const tool = toolAction.dataset.toolAction;
    if (tool === "cfdi") {
      state.section = "cfdi";
      state.toolsNotice = "";
    } else {
      state.section = "tools";
      state.toolsNotice = tool === "fiscal-profile"
        ? "El perfil fiscal será el punto de entrada para RFC, régimen, domicilio y conexiones por empresa. La base de datos ya está preparada; falta activar el proyecto Supabase."
        : "Esta herramienta está contemplada en la arquitectura, pero todavía requiere su conexión y reglas operativas antes de ejecutar acciones fiscales.";
    }
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const starterPrompt = event.target.closest("[data-open-prompt]");
  if (starterPrompt) {
    const input = app.querySelector("[data-open-input]");
    if (input) {
      input.value = starterPrompt.dataset.openPrompt || "";
      input.focus({ preventScroll: true });
    }
    return;
  }
  const artifactButton = event.target.closest("[data-open-artifact]");
  if (artifactButton) {
    const message = state.openAssistant.messages[Number(artifactButton.dataset.openArtifact)];
    if (message?.artifact) {
      try { downloadDocumentArtifact(message.artifact); }
      catch { state.openAssistant.documentError = "No se pudo preparar la descarga."; refreshTutorPanel(); }
    }
    return;
  }
  if (event.target.closest('[data-action="cfdi-context-clear"]')) {
    state.openAssistant.cfdiContext = null;
    state.openAssistant.draft = "";
    render();
    return;
  }
  const classroomModule = event.target.closest("[data-class-module]");
  if (classroomModule) {
    const moduleId = classroomModule.dataset.classModule;
    if (!courseModules.some(({ id }) => id === moduleId)) return;
    const continuingCurrentClass = moduleId === state.activeModuleId;
    state.section = "course";
    if (!continuingCurrentClass) {
      resetTutor();
      state.activeModuleId = moduleId;
      state.coursePhaseIndex = 0;
      state.highestUnlockedPhase = 0;
      state.practiceStepIndex = 0;
    }
    render();
    if (!continuingCurrentClass) narrateClassroomInstruction();
    document.querySelector("#classroom-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const classroomPhase = event.target.closest("[data-class-phase]");
  if (classroomPhase) {
    const phaseIndex = Number(classroomPhase.dataset.classPhase);
    if (!Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex >= CLASSROOM_PHASES.length || phaseIndex > state.highestUnlockedPhase) return;
    resetTutor();
    state.coursePhaseIndex = phaseIndex;
    render();
    narrateClassroomInstruction();
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
  const moduleToggle = event.target.closest("[data-module-toggle]");
  if (moduleToggle) {
    const moduleId = moduleToggle.dataset.moduleToggle;
    if (!courseModules.some((module) => module.id === moduleId)) return;
    if (state.completedModules.has(moduleId)) state.completedModules.delete(moduleId);
    else {
      state.completedModules.add(moduleId);
      state.activeModuleId = moduleId;
      state.tutor.avatarState = "celebrating";
    }
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
    state.tutor.collapsed = true;
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
    if (destination.section === "external") {
      try {
        const url = new URL(destination.url);
        if (url.protocol !== "https:") return;
        window.open(url.href, "_blank", "noopener,noreferrer");
      } catch { /* Nunca abrir URLs no válidas o con protocolos activos. */ }
      return;
    }
    if (destination.section === "lab") {
      resetTutor(destination.exerciseId);
      state.section = "lab";
      state.current = destination.exerciseId;
      state.tutor.collapsed = true;
    } else {
      state.section = "course";
      state.openCourseModuleId = destination.moduleId ?? null;
      if (destination.moduleId) state.activeModuleId = destination.moduleId;
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
  if (action.dataset.action === "auth-toggle") {
    authState.open = true;
    authState.message = "";
    authState.error = false;
    render();
    document.querySelector("#auth-identifier")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "auth-password-toggle") {
    const input = document.querySelector("#auth-password");
    if (!input) return;
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    action.setAttribute("aria-pressed", String(visible));
    action.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
    return;
  }
  if (action.dataset.action === "auth-google") {
    void signInWithGoogle();
    return;
  }
  if (action.dataset.action === "auth-signout") {
    void signOut();
    return;
  }
  if (action.dataset.action === "copy-video-brief") {
    const { videoKind, videoId } = action.dataset;
    if (["module", "exercise"].includes(videoKind) && videoId) copyVideoBrief(videoKind, videoId);
    return;
  }
  if (action.dataset.action === "tutor-open") {
    state.tutor.collapsed = false;
    render();
    document.querySelector("[data-tutor-input]")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "tutor-toggle") {
    state.tutor.collapsed = !state.tutor.collapsed;
    render();
    if (!state.tutor.collapsed) document.querySelector("[data-tutor-input]")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "tutor-resize") {
    const direction = action.dataset.size === "larger" ? 1 : -1;
    state.tutor.panelWidth = Math.max(340, Math.min(760, state.tutor.panelWidth + direction * 56));
    state.tutor.panelHeight = Math.max(420, Math.min(820, state.tutor.panelHeight + direction * 64));
    render();
    return;
  }
  if (action.dataset.action === "open-document-remove") {
    if (tutorBusy()) return;
    state.openAssistant.documentText = "";
    state.openAssistant.documentName = "";
    state.openAssistant.documentFile = null;
    state.openAssistant.documentTruncated = false;
    state.openAssistant.documentPageCount = null;
    state.openAssistant.documentError = "";
    refreshTutorPanel();
    return;
  }
  if (action.dataset.action === "tutor-document-remove") {
    if (state.tutor.pending) return;
    state.tutor.documentText = "";
    state.tutor.documentName = "";
    state.tutor.documentFile = null;
    state.tutor.documentTruncated = false;
    state.tutor.documentPageCount = null;
    state.tutor.documentError = "";
    refreshTutorPanel();
    return;
  }
  if (action.dataset.action === "tutor-cancel") {
    const pendingConversation = state.tutor.pending ? state.tutor : state.openAssistant;
    pendingConversation.abortController?.abort();
    return;
  }
  if (action.dataset.action === "tutor-voice") {
    state.tutor.voiceEnabled = tutorSpeaker.setEnabled(!state.tutor.voiceEnabled);
    render();
    return;
  }
  if (action.dataset.action === "classroom-narrate") {
    if (state.anam.status === "live" && state.anam.client) {
      narrateClassroomInstruction();
    } else if (tutorSpeaker.enabled && state.tutor.avatarState === "explaining") {
      tutorSpeaker.stop();
      state.tutor.avatarState = "idle";
    } else {
      narrateClassroomInstruction({ browserFallback: true });
    }
    refreshTutorPanel();
    return;
  }
  if (action.dataset.action === "classroom-next-phase") {
    advanceClassroomPhase();
    return;
  }
  if (action.dataset.action === "classroom-practice-step-done") {
    completePracticeInstruction();
    return;
  }
  if (action.dataset.action === "anam-toggle") {
    if (state.anam.status === "live" || state.anam.status === "connecting") void stopAnamSession();
    else void startAnamSession();
    return;
  }
  if (action.dataset.action === "classroom-complete") {
    const moduleId = action.dataset.moduleId;
    if (!courseModules.some(({ id }) => id === moduleId)) return;
    state.completedModules.add(moduleId);
    state.activeModuleId = moduleId;
    state.tutor.avatarState = "celebrating";
    persistProgress();
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
  if (action.dataset.action === "study-more") {
    state.studyVisibleCount += 60;
    const results = document.querySelector("[data-study-results]");
    if (results) results.innerHTML = renderStudyResults();
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
  if (action.dataset.action === "mark-reviewed") {
    const feedback = state.feedback.get(exercise.id);
    if (!["prompt", "written"].includes(exercise.kind) || !state.attempted.has(exercise.id) || feedback?.status === "incompleto") return;
    state.completed.add(exercise.id);
    persistProgress();
    render();
    return;
  }
  if (action.dataset.action === "hint" && stage !== "hint") return;
  if (action.dataset.action === "solution" && stage !== "example") return;
  if (action.dataset.action === "check") checkAnswer(exercise);
  if (action.dataset.action === "hint") state.hints.add(exercise.id);
  if (action.dataset.action === "solution") state.revealed.add(exercise.id);
  if (action.dataset.action === "hint" || action.dataset.action === "solution") render();
});

app.addEventListener("submit", (event) => {
  const registerForm = event.target.closest("[data-register-form]");
  if (registerForm) {
    event.preventDefault();
    const formData = new FormData(registerForm);
    authState.identifier = String(formData.get("identifier") || "").trim();
    authState.password = String(formData.get("password") || "");
    void signUp();
    return;
  }
  const authForm = event.target.closest("[data-auth-form]");
  if (authForm) {
    event.preventDefault();
    const formData = new FormData(authForm);
    authState.identifier = String(formData.get("identifier") || "").trim();
    authState.password = String(formData.get("password") || "");
    void signIn();
    return;
  }
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
  const form = event.target.closest("[data-tutor-form]");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("[data-tutor-input]");
  const text = input?.value ?? "";
  if (!text.trim()) return;
  input.value = "";
  if (form.hasAttribute("data-open-form")) state.openAssistant.draft = "";
  sendTutorMessage(text, { includeDocument: true, openMode: form.hasAttribute("data-open-form") });
});

app.addEventListener("toggle", (event) => {
  const moduleCard = event.target.closest?.("details[data-course-module]");
  if (!moduleCard) return;
  state.activeModuleId = moduleCard.dataset.courseModule;
  state.openCourseModuleId = moduleCard.open ? moduleCard.dataset.courseModule : "__none__";
  refreshTutorPanel();
}, true);

app.addEventListener("input", (event) => {
  if (event.target.matches("#auth-identifier")) {
    authState.identifier = event.target.value;
    return;
  }
  if (event.target.matches("[data-study-search]")) {
    state.studyQuery = event.target.value;
    state.studyVisibleCount = 60;
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
  if (event.target.matches("[data-open-document]")) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void loadTutorDocument(file, { openMode: true });
    return;
  }
  if (event.target.matches("[data-tutor-document]")) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void loadTutorDocument(file);
    return;
  }
  if (event.target.matches("[data-tutor-provider]")) {
    state.tutor.provider = state.tutor.providers.some(({ id }) => id === event.target.value) ? event.target.value : state.tutor.defaultProvider;
    refreshTutorPanel();
    return;
  }
  if (event.target.matches("[data-study-filter]")) {
    state.studyKind = event.target.value;
    state.studyVisibleCount = 60;
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
app.addEventListener("pointerup", rememberTutorPanelSize, { passive: true });
app.addEventListener("mouseup", rememberTutorPanelSize, { passive: true });
bindCfdiWorkspace(app, {
  onUpdate: () => { if (state.section === "cfdi") render(); },
  onAskNora: (context, prompt) => {
    state.openAssistant.cfdiContext = context;
    state.openAssistant.draft = prompt;
    state.openAssistant.messages.push({ role: "assistant", text: "Preparé un resumen CFDI para esta consulta. No se ha enviado; revisa la pregunta y pulsa Enviar cuando decidas compartirlo con Nora." });
    state.openAssistant.messages = state.openAssistant.messages.slice(-20);
    state.section = "advisor";
    render();
    app.querySelector("[data-open-input]")?.focus({ preventScroll: true });
  },
});
initializeTutorConfig();
initializeStudyDatabase();
void initializeCfdiWorkspace();
function syncMobileKeyboardOffset() {
  if (!window.visualViewport) return;
  const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  document.documentElement.style.setProperty("--keyboard-offset", `${Math.round(keyboardHeight)}px`);
}
if (window.visualViewport) {
  syncMobileKeyboardOffset();
  window.visualViewport.addEventListener("resize", syncMobileKeyboardOffset, { passive: true });
  window.visualViewport.addEventListener("scroll", syncMobileKeyboardOffset, { passive: true });
  window.addEventListener("resize", syncMobileKeyboardOffset, { passive: true });
}
document.addEventListener("contaia:auth-updated", (event) => {
  const userId = event.detail?.user?.id;
  activeStorageScope = userId && /^[0-9a-f-]{20,}$/i.test(userId) ? userId : "anonymous";
  const restored = loadProgress(scopedStorage);
  state.completedModules = new Set(restored.completedModules);
  state.completed = new Set(restored.completedExercises);
  state.activeModuleId = courseModules.find(({ id }) => !state.completedModules.has(id))?.id ?? courseModules.at(-1)?.id ?? state.activeModuleId;
  try { state.onboardingLevel = scopedStorage.getItem("contaia.onboarding.v1") || ""; state.onboardingDraft = state.onboardingLevel; } catch { /* El almacenamiento puede estar bloqueado. */ }
  if (event.detail?.user && authState.status === "success") {
    authState.status = "success-visible";
    window.setTimeout(() => {
      authState.status = "idle";
      render();
    }, 700);
    return;
  }
  if (authState.status === "success-visible") return;
  render();
});
window.addEventListener("pagehide", () => { void stopAnamSession({ silent: true }); }, { once: true });
