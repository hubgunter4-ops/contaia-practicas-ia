import { categories, exercises } from "./exercises.js";
import { calculateDifference, evaluateChoice, getGuidedStage, scoreRubric } from "./logic.js";
import { courseModules, courseSessionFlow } from "./course.js";
import { buildClassroomScene, CLASSROOM_PHASES, renderClassroom } from "./classroom.js";
import { createPortfolioMarkdown, loadProgress, saveProgress } from "./progress.js";
import { buildVideoBrief, NOTEBOOKLM_URL, resolveCourseVideo, SYNTHESIA_URL } from "./course-videos.js";
import { loadTutorConfig, requestTutorReply } from "./tutor/api.js";
import { createSpeechSpeaker } from "./tutor/speech.js";
import { GLOSSARY, findGlossaryEntry } from "./glossary.js";
import { openStudyDatabase, searchStudyItems } from "./study-db.js";
import { KNOWLEDGE_ITEMS } from "./knowledge-data.js";

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
  tutor: {
    messages: [{ role: "assistant", text: "Hola, soy Nora. Te acompañaré desde los primeros conceptos hasta el proyecto final. ¿Qué te gustaría entender hoy?" }],
    collapsed: true, voiceEnabled: false, avatarState: "idle", providers: [], defaultProvider: "", provider: "",
    configState: "loading", configError: "", pending: false, abortController: null,
  },
  anam: { status: "idle", error: "", activity: "", client: null, abortController: null, lastUserMessageId: "", pendingTranscript: "" },
  activeModuleId: "modulo-01",
  coursePhaseIndex: 0,
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
const restoredProgress = loadProgress(progressStorage);
state.completedModules = new Set(restoredProgress.completedModules);
state.completed = new Set(restoredProgress.completedExercises);
state.storageWarning = progressStorage ? "" : "El navegador no permite guardar el progreso; esta sesión seguirá en memoria.";
try {
  state.onboardingLevel = progressStorage?.getItem("contaia.onboarding.v1") || "";
  state.onboardingDraft = state.onboardingLevel;
} catch { /* El diagnóstico se puede repetir sin almacenamiento. */ }

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

function resetTutor() {
  state.tutor.abortController?.abort();
  tutorSpeaker.stop();
  state.tutor.pending = false;
  state.tutor.avatarState = "idle";
}

function tutorAvatarLabel() {
  return { thinking: "Nora está pensando.", explaining: "Nora está explicando.", celebrating: "Nora celebra el avance." }[state.tutor.avatarState] || "Nora está lista para ayudarte.";
}

function getTutorContext() {
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
    return { section: "course", moduleId: module.id, coursePhase: CLASSROOM_PHASES[state.coursePhaseIndex]?.id ?? CLASSROOM_PHASES[0].id };
  }
  return { section: "study", moduleId: module.id };
}

function assetPath(filename) {
  return new URL(`../assets/nora/${filename}`, import.meta.url).href;
}

function refreshTutorPanel() {
  const panel = app.querySelector('[data-testid="nora-panel"]');
  if (panel) {
    const template = document.createElement("template");
    template.innerHTML = renderTutorPanel(getTutorContext(), { embedded: state.section === "course" }).trim();
    panel.replaceWith(template.content.firstElementChild);
  }
  refreshClassroomVisual();
}

function refreshClassroomVisual() {
  const character = app.querySelector("[data-classroom-character]");
  if (!character) return;
  const live = state.anam.status === "live";
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
  const status = character.querySelector("[data-classroom-avatar-status]");
  if (status) status.textContent = label;
  const liveStatus = app.querySelector("[data-anam-status]");
  if (liveStatus) liveStatus.textContent = state.anam.error || state.anam.activity || (live ? "En vivo · el micrófono está activo." : state.anam.status === "connecting" ? "Conectando con Nora…" : "Al conectar, Anam procesará el audio para la transcripción.");
  const liveButton = app.querySelector("[data-action='anam-toggle']");
  if (liveButton) {
    liveButton.disabled = state.anam.status === "connecting";
    liveButton.setAttribute("aria-pressed", String(live));
    liveButton.innerHTML = `${live ? "Desconectar avatar" : state.anam.status === "connecting" ? "Conectando…" : "Conectar avatar en vivo"} <span aria-hidden="true">${live ? "Ⅱ" : state.anam.status === "connecting" ? "…" : "◉"}</span>`;
  }
  const voiceLabel = app.querySelector("[data-classroom-voice-label]");
  const voiceIcon = app.querySelector("[data-classroom-voice-icon]");
  const isSpeaking = state.tutor.avatarState === "explaining" && state.tutor.voiceEnabled;
  if (voiceLabel) voiceLabel.textContent = isSpeaking ? "Detener narración" : "Escuchar esta escena";
  if (voiceIcon) voiceIcon.textContent = isSpeaking ? "Ⅱ" : "▶";
}

const tutorSpeaker = createSpeechSpeaker({
  onStateChange: (voiceState) => {
    if (voiceState === "speaking") state.tutor.avatarState = "explaining";
    else if (state.tutor.avatarState === "explaining") state.tutor.avatarState = "idle";
    refreshTutorPanel();
  },
});

function renderTutorPanel(context, { embedded = false } = {}) {
  const provider = state.tutor.providers.find(({ id }) => id === state.tutor.provider);
  const status = state.tutor.pending ? "Nora está pensando…"
    : state.tutor.configState === "loading" ? "Conectando con la tutora…"
      : state.tutor.configError ? "Revisa la conexión de Nora"
        : provider ? `Tutora IA activa · ${provider.label}` : "IA sin configurar en el servidor";
  const messages = state.tutor.messages.map((message) => `<div class="tutor-message tutor-message-${message.role}" data-testid="nora-message"><span class="tutor-message-label">${message.role === "assistant" ? "NORA · TUTORA IA" : "TÚ"}</span><p ${message.streaming ? 'data-tutor-stream="true"' : ""}>${escapeHtml(message.text || (message.streaming ? "Nora está pensando…" : ""))}</p></div>`).join("");
  const bodyId = "tutor-panel-body";
  const providerPicker = state.tutor.providers.length > 1 ? `<label class="tutor-provider-label" for="tutor-provider">Modelo <select id="tutor-provider" data-tutor-provider>${state.tutor.providers.map((item) => `<option value="${escapeHtml(item.id)}" ${state.tutor.provider === item.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label>` : "";
  const phaseLabel = CLASSROOM_PHASES.find(({ id }) => id === context.coursePhase)?.label;
  const collapsed = !embedded && state.tutor.collapsed;
  return `<section class="tutor-panel ${embedded ? "tutor-panel-embedded is-open" : collapsed ? "is-collapsed" : "is-open"}" data-testid="nora-panel" aria-labelledby="tutor-heading" data-tutor-context="${escapeHtml(context.section)}">
    <header class="tutor-header">
      <div class="tutor-identity"><div class="tutor-avatar tutor-avatar-${escapeHtml(state.tutor.avatarState)}" role="img" aria-label="${escapeHtml(tutorAvatarLabel())}"><img src="${escapeHtml(assetPath(`nora-${state.tutor.avatarState}.webp`))}" alt="" width="600" height="800" fetchpriority="low"/></div><div><p class="tutor-kicker">TUTORA DEL RECORRIDO</p><h2 id="tutor-heading">Nora</h2><span class="tutor-status" data-testid="nora-status"><i aria-hidden="true"></i>${escapeHtml(status)}</span></div></div>
      <div class="tutor-controls">${providerPicker}<button class="tutor-control tutor-voice" data-testid="nora-voice" type="button" data-action="tutor-voice" aria-label="${state.tutor.voiceEnabled ? "Desactivar voz de Nora" : "Activar voz de Nora"}" aria-pressed="${state.tutor.voiceEnabled}" ${tutorSpeaker.supported ? "" : "disabled"}>${state.tutor.voiceEnabled ? "Voz activa" : "Voz"}</button>${embedded ? "" : `<button class="tutor-control tutor-toggle" data-testid="nora-toggle" type="button" data-action="tutor-toggle" aria-label="${state.tutor.collapsed ? "Abrir conversación con Nora" : "Cerrar conversación con Nora"}" aria-expanded="${!state.tutor.collapsed}" aria-controls="${bodyId}">${state.tutor.collapsed ? "Hablar con Nora" : "Cerrar"}</button>`}</div>
    </header>
    <div id="${bodyId}" class="tutor-body" ${collapsed ? "hidden" : ""}>
      <div class="tutor-context-note">${context.section === "lab" ? "Práctica activa" : context.section === "study" ? "Base de estudio · tus notas no se comparten" : `Aula · ${escapeHtml(phaseLabel || "aprendizaje paso a paso")}`}</div>
      <div class="tutor-log" data-testid="nora-log" role="log" aria-live="polite" aria-relevant="additions text">${messages}</div>
      ${state.tutor.configError ? `<p class="tutor-error" role="status">${escapeHtml(state.tutor.configError)}</p>` : ""}
      <form class="tutor-form" data-testid="nora-form" data-tutor-form>
        <label class="sr-only" for="tutor-input">Pregunta a Nora, tu tutora IA</label><input id="tutor-input" data-testid="nora-input" data-tutor-input maxlength="2000" autocomplete="off" placeholder="Escribe una pregunta sobre el curso…" ${state.tutor.pending || !provider ? "disabled" : ""}/><button class="button button-primary" type="submit" ${state.tutor.pending || !provider ? "disabled" : ""}>Enviar <span aria-hidden="true">→</span></button>
      </form>
      ${state.tutor.pending ? '<button type="button" class="tutor-stop" data-action="tutor-cancel">Detener respuesta</button>' : ""}
      <p class="tutor-disclaimer">Las preguntas se procesan por el proveedor de IA configurado. No compartas datos reales, personales ni confidenciales. El progreso, tus notas y el portafolio no se envían; este chat no se guarda.</p>
    </div>
  </section>`;
}

async function sendTutorMessage(text) {
  const question = text.trim();
  if (!question || state.tutor.pending) return;
  if (!state.tutor.providers.length) {
    state.tutor.configError = "Configura un proveedor y su modelo en el servidor Vercel para habilitar las respuestas de Nora.";
    state.tutor.collapsed = false;
    refreshTutorPanel();
    return;
  }
  const history = state.tutor.messages.slice(-8).map(({ role, text: content }) => ({ role, content }));
  const assistantMessage = { role: "assistant", text: "", streaming: true };
  state.tutor.messages.push({ role: "user", text: question }, assistantMessage);
  state.tutor.messages = state.tutor.messages.slice(-20);
  state.tutor.pending = true;
  state.tutor.collapsed = false;
  state.tutor.avatarState = "thinking";
  state.tutor.abortController = new AbortController();
  const liveClient = state.anam.status === "live" ? state.anam.client : null;
  const talkStream = liveClient?.createTalkMessageStream?.() ?? null;
  let talkQueue = Promise.resolve();
  let talkStreamFailed = false;
  refreshTutorPanel();
  try {
    const reply = await requestTutorReply({
      message: question,
      context: getTutorContext(),
      history,
      provider: state.tutor.provider || state.tutor.defaultProvider,
      signal: state.tutor.abortController.signal,
      onToken: (token) => {
        assistantMessage.text += token;
        const streamed = app.querySelector("[data-tutor-stream]");
        if (streamed) streamed.textContent = assistantMessage.text;
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
    state.tutor.messages.pop();
    assistantMessage.streaming = false;
    assistantMessage.text = error.name === "AbortError" ? "Respuesta detenida. Puedes continuar cuando quieras." : "No pude obtener respuesta de la tutora. Revisa la conexión o vuelve a intentarlo.";
    state.tutor.configError = error.name === "AbortError" ? "" : error.message;
    state.tutor.avatarState = "idle";
  } finally {
    state.tutor.pending = false;
    state.tutor.abortController = null;
    if (state.anam.status === "live" && !state.anam.pendingTranscript) state.anam.activity = "En vivo · puedes hablar cuando quieras.";
    refreshTutorPanel();
    app.querySelector("[data-tutor-input]")?.focus({ preventScroll: true });
    const pendingTranscript = state.anam.pendingTranscript;
    state.anam.pendingTranscript = "";
    if (pendingTranscript && state.anam.status === "live") queueMicrotask(() => void sendTutorMessage(pendingTranscript));
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
      state.anam.activity = "Nora está abriendo la escena.";
      refreshClassroomVisual();
      const module = courseModules.find(({ id }) => id === state.activeModuleId) ?? courseModules[0];
      const opening = buildClassroomScene(module, state.coursePhaseIndex).narration;
      const openingStream = client.createTalkMessageStream();
      void openingStream.streamMessageChunk(opening, true).catch(() => {
        state.anam.activity = "En vivo · puedes hablar cuando quieras.";
        refreshClassroomVisual();
      });
    });
    client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
      if (state.anam.client !== client || state.section !== "course" || !Array.isArray(messages)) return;
      if (messages.at(-1)?.role === "persona" && !state.tutor.pending) {
        state.anam.activity = "En vivo · puedes hablar cuando quieras.";
        refreshClassroomVisual();
      }
      const latestUser = [...messages].reverse().find((message) => message?.role === "user" && typeof message.content === "string");
      if (!latestUser || !latestUser.content.trim() || latestUser.id === state.anam.lastUserMessageId) return;
      state.anam.lastUserMessageId = latestUser.id;
      const transcript = latestUser.content.trim().slice(0, 2000);
      state.anam.activity = "Consulta recibida · Nora está preparando una respuesta.";
      if (state.tutor.pending) {
        state.anam.pendingTranscript = transcript;
        state.tutor.abortController?.abort();
      } else {
        void sendTutorMessage(transcript);
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
    client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => state.tutor.abortController?.abort());
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
  const pageLabel = state.section === "course" ? "Aula con Nora" : state.section === "study" ? "Base de estudio" : state.current === "home" ? "Resumen" : "Ejercicio";
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
    tutorPanel: renderTutorPanel(getTutorContext(), { embedded: true }),
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
      <button type="button" class="button button-quiet" data-action="hint" data-id="${exercise.id}" ${stage === "hint" ? "" : "disabled"}>${stage === "hint" ? "Pedir una pista" : showHint ? "Pista consultada" : "Pista después del intento"}</button>
      <button type="button" class="button button-quiet" data-action="solution" data-id="${exercise.id}" ${stage === "example" ? "" : "disabled"}>${stage === "example" ? "Ver ejemplo y comparar" : showSolution ? "Comparación visible" : "Ejemplo después de la pista"}</button>
    </div></section><aside class="work-feedback" aria-label="Retroalimentación">${feedback}${hint}${solution}</aside></div>
    <footer class="exercise-footer"><span>${state.completed.has(exercise.id) ? '<b class="completed-mark">✓</b> Práctica completada en esta sesión' : "Tu respuesta se queda en este navegador durante la sesión"}</span>${nextExercise ? `<button type="button" class="next-link" data-nav="${nextExercise.id}">Siguiente práctica <span>→</span></button>` : `<button type="button" class="next-link" data-nav="home">Terminar recorrido <span>→</span></button>`}</footer>
    <p class="progress-storage-note" role="status">${escapeHtml(state.storageWarning || "Solo se conserva el estado de finalización; la respuesta escrita o seleccionada no se guarda.")}</p>
    <p class="disclaimer-inline">Material educativo con datos ficticios. No constituye asesoría profesional, contable o fiscal.</p>
  </main>`;
}

function render() {
  const persistentVideo = state.section === "course" && state.anam.status === "live"
    ? app.querySelector("[data-anam-video]")
    : null;
  if (persistentVideo) persistentVideo.remove();
  else if (state.anam.client || state.anam.status === "connecting") void stopAnamSession({ silent: true });
  const exercise = state.section === "lab" ? exercises.find((item) => item.id === state.current) : null;
  const content = state.section === "course" ? renderCourse() : state.section === "study" ? renderStudy() : exercise ? renderExercise(exercise) : renderHome();
  app.innerHTML = `<div class="app-shell">${sidebar()}<div class="main-shell">${topbar()}${content}</div>${state.section === "course" ? "" : renderTutorPanel(getTutorContext())}</div>`;
  if (persistentVideo) {
    const placeholder = app.querySelector("[data-anam-video]");
    if (placeholder) placeholder.replaceWith(persistentVideo);
    persistentVideo.hidden = false;
  }
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
  state.tutor.avatarState = state.completed.has(exercise.id) ? "celebrating" : "explaining";
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
  const classroomModule = event.target.closest("[data-class-module]");
  if (classroomModule) {
    const moduleId = classroomModule.dataset.classModule;
    if (!courseModules.some(({ id }) => id === moduleId)) return;
    resetTutor();
    state.activeModuleId = moduleId;
    state.coursePhaseIndex = 0;
    render();
    return;
  }
  const classroomPhase = event.target.closest("[data-class-phase]");
  if (classroomPhase) {
    const phaseIndex = Number(classroomPhase.dataset.classPhase);
    if (!Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex >= CLASSROOM_PHASES.length) return;
    resetTutor();
    state.coursePhaseIndex = phaseIndex;
    render();
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
  if (action.dataset.action === "tutor-cancel") {
    state.tutor.abortController?.abort();
    return;
  }
    if (action.dataset.action === "tutor-voice") {
    state.tutor.voiceEnabled = tutorSpeaker.setEnabled(!state.tutor.voiceEnabled);
    render();
    return;
  }
  if (action.dataset.action === "classroom-narrate") {
    if (tutorSpeaker.enabled && state.tutor.avatarState === "explaining") {
      tutorSpeaker.stop();
      state.tutor.avatarState = "idle";
    } else {
      const module = courseModules.find(({ id }) => id === state.activeModuleId) ?? courseModules[0];
      const narration = buildClassroomScene(module, state.coursePhaseIndex).narration;
      if (state.anam.status === "live" && state.anam.client) {
        const talkStream = state.anam.client.createTalkMessageStream();
        state.anam.activity = "Nora está narrando esta escena.";
        void talkStream.streamMessageChunk(narration, true).catch(() => {
          state.anam.activity = "No se pudo enviar la narración al avatar; puedes seguir con el texto y el chat.";
          refreshClassroomVisual();
        });
      } else {
        state.tutor.voiceEnabled = tutorSpeaker.setEnabled(true);
        tutorSpeaker.say(narration);
      }
    }
    refreshTutorPanel();
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
  const form = event.target.closest("[data-tutor-form]");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("[data-tutor-input]");
  const text = input?.value ?? "";
  if (!text.trim()) return;
  input.value = "";
  sendTutorMessage(text);
});

app.addEventListener("toggle", (event) => {
  const moduleCard = event.target.closest?.("details[data-course-module]");
  if (!moduleCard) return;
  state.activeModuleId = moduleCard.dataset.courseModule;
  state.openCourseModuleId = moduleCard.open ? moduleCard.dataset.courseModule : "__none__";
  refreshTutorPanel();
}, true);

app.addEventListener("input", (event) => {
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
initializeTutorConfig();
initializeStudyDatabase();
window.addEventListener("pagehide", () => { void stopAnamSession({ silent: true }); }, { once: true });
