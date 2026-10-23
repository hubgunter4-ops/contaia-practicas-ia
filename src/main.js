import { categories, exercises } from "./exercises.js";
import { buildChoiceFeedback, buildWrittenFeedback, calculateDifference, evaluateChoice, getGuidedStage } from "./logic.js";
import { courseModules, courseSessionFlow } from "./course.js";
import { buildClassroomScene, CLASSROOM_PHASES, renderClassroom } from "./classroom.js";
import { createPortfolioMarkdown, loadProgress, saveProgress } from "./progress.js";
import { loadTutorConfig, requestTutorReply } from "./tutor/api.js";
import { createSpeechSpeaker } from "./tutor/speech.js";
import { GLOSSARY, findGlossaryEntry } from "./glossary.js";
import { openStudyDatabase, searchStudyItems } from "./study-db.js";
import { KNOWLEDGE_ITEMS } from "./knowledge-data.js";
import { cfdiState, resetCfdiWorkspace } from "./cfdi/workspace.js";
import { requestCfdiPlanner } from "./cfdi/ai/planner-api.js";
import { resetReconciliationWorkspace } from "./reconciliation/workspace.js";
import { journalState, resetJournalWorkspace } from "./journal/workspace.js";
import { diotState, resetDiotWorkspace } from "./diot/workspace.js";
import { resetWorkpapersWorkspace } from "./workpapers/workspace.js";
import { renderToolsPanel } from "./tools/panel.js";
import { closeToolsForms, loadProfileConnections, loadToolsWorkspace, openFiscalProfileForm, openToolConnectionForm, resetToolsWorkspace, saveFiscalProfile, saveToolConnection, toolsWorkspace } from "./tools/workspace.js";
import { downloadDocumentArtifact, processDocumentFile } from "./documents/client.js";
import { authState, currentUser, getAuthDestinationTarget, initializeAuthClient, renderAuthControls, renderRegistrationGate, renderEmailConfirmationGate, renderAuthPanel, resetPassword, updatePassword, signIn, signUp, signInWithGoogle, signOut } from "./auth/client.js";
import { createIslandManager } from "./app/island-manager.js";
import { createIslandRegistry } from "./app/island-registry.js";
import { CapabilityExpiredError, createSourceCapabilityBroker } from "./app/source-capabilities.js";

const app = document.querySelector("#app");
let lastPageTransitionKey = "";
const sourceCapabilityBroker = createSourceCapabilityBroker();
const reconciliationIslandRegistry = createIslandRegistry({ reconciliation: () => import("./reconciliation/island.js") });
let reconciliationIslandManager = null;
let reconciliationIslandHost = null;
let reconciliationIslandSyncId = 0;
const cfdiIslandRegistry = createIslandRegistry({ cfdi: () => import("./cfdi/island.js") });
let cfdiIslandManager = null;
let cfdiIslandHost = null;
let cfdiIslandSyncId = 0;
const journalIslandRegistry = createIslandRegistry({ journal: () => import("./journal/island.js") });
let journalIslandManager = null;
let journalIslandHost = null;
let journalIslandSyncId = 0;
const diotIslandRegistry = createIslandRegistry({ diot: () => import("./diot/island.js") });
let diotIslandManager = null;
let diotIslandHost = null;
let diotIslandSyncId = 0;
const workpapersIslandRegistry = createIslandRegistry({ workpapers: () => import("./workpapers/island.js") });
let workpapersIslandManager = null;
let workpapersIslandHost = null;
let workpapersIslandSyncId = 0;
const learningIslandRegistry = createIslandRegistry({
  course: () => import("./learn/island.js"),
  lab: () => import("./learn/island.js"),
  study: () => import("./learn/island.js"),
});
let learningIslandManager = null;
let learningIslandHost = null;
let learningIslandSyncId = 0;
let pendingJournalHandoff = null;
let pendingJournalBankHandoff = null;
let pendingDiotHandoff = null;

async function syncReconciliationIsland() {
  const syncId = ++reconciliationIslandSyncId;
  const host = app.querySelector("[data-reconciliation-island-host]");
  if (!host) {
    const previousManager = reconciliationIslandManager;
    reconciliationIslandManager = null;
    reconciliationIslandHost = null;
    if (previousManager) {
      await previousManager.clearSession("route-change");
      previousManager.dispose();
    }
    return;
  }
  if (reconciliationIslandManager && reconciliationIslandHost === host) return;
  const previousManager = reconciliationIslandManager;
  reconciliationIslandManager = null;
  reconciliationIslandHost = null;
  if (previousManager) {
    await previousManager.clearSession("host-replaced");
    previousManager.dispose();
  }
  if (syncId !== reconciliationIslandSyncId || !app.contains(host)) return;
  const manager = createIslandManager({
    host,
    registry: reconciliationIslandRegistry,
    initialSessionEpoch: 0,
    capabilitiesFor: () => ({
      getAnalysis: () => cfdiState.analysis,
      onHandoffSources: handleReconciliationSourceHandoff,
      registerSourceProvider: (owner, provider) => sourceCapabilityBroker.registerSourceProvider(owner, provider),
    }),
  });
  reconciliationIslandManager = manager;
  reconciliationIslandHost = host;
  try {
    await manager.navigate("reconciliation", { reason: "navigation" });
  } catch (error) {
    if (reconciliationIslandManager === manager) {
      reconciliationIslandManager = null;
      reconciliationIslandHost = null;
      host.innerHTML = `<p class="recon-error" role="alert">No se pudo montar la isla de Conciliación: ${escapeHtml(error?.message || "error de montaje")}</p>`;
      manager.dispose();
    }
  }
}

function handleCfdiAskNora(context, prompt) {
  state.openAssistant.cfdiContext = context;
  state.openAssistant.draft = prompt;
  state.openAssistant.messages.push({ role: "assistant", text: "Preparé un resumen CFDI para esta consulta. No se ha enviado; revisa la pregunta y pulsa Enviar cuando decidas compartirlo con Nora." });
  state.openAssistant.messages = state.openAssistant.messages.slice(-20);
  state.section = "advisor";
  render();
  app.querySelector("[data-open-input]")?.focus({ preventScroll: true });
}

function createAiIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid) return `ai_${uuid}`;
  return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

async function getAiRemoteCredentials() {
  const client = window.__contaiaAuth?.client;
  if (!client?.auth?.getSession) return { accessToken: "", idempotencyKey: createAiIdempotencyKey() };
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return {
    accessToken: typeof data?.session?.access_token === "string" ? data.session.access_token : "",
    idempotencyKey: createAiIdempotencyKey(),
  };
}

async function requestAuthenticatedCfdiPlanner(request, context) {
  const credentials = await getAiRemoteCredentials();
  return requestCfdiPlanner({ message: request.untrustedMessage, signal: context.signal, ...credentials });
}

function handleCfdiSourceHandoff(target) {
  if (!["diot", "journal"].includes(target)) return;
  try {
    sourceCapabilityBroker.clear();
    pendingJournalHandoff = null;
    pendingJournalBankHandoff = null;
    pendingDiotHandoff = null;
    const lease = sourceCapabilityBroker.request({ owner: "cfdi", target, explicitUserAction: true, selection: "current-analysis" });
    if (target === "journal") {
      pendingJournalHandoff = lease;
    } else {
      pendingDiotHandoff = lease;
    }
    state.section = target;
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
  } catch (error) {
    cfdiState.operationError = true;
    cfdiState.operationMessage = error instanceof CapabilityExpiredError
      ? "La capacidad de fuentes expiró. Mantén abierto este análisis y vuelve a pulsar la acción."
      : (error?.message || "No se pudo entregar el análisis a la herramienta destino.");
    if (state.section === "cfdi") render();
  }
}

function handleReconciliationSourceHandoff(sourceIds = null) {
  try {
    sourceCapabilityBroker.clear();
    pendingJournalHandoff = null;
    const lease = sourceCapabilityBroker.request({ owner: "reconciliation", target: "journal", sourceIds, explicitUserAction: true, selection: "analyzed-movements" });
    pendingJournalBankHandoff = lease;
    state.section = "journal";
    render();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
  } catch (error) {
    const host = app.querySelector("[data-reconciliation-page]");
    const message = error instanceof CapabilityExpiredError ? "La selección bancaria expiró; vuelve a generar y entregar los movimientos." : (error?.message || "No se pudo entregar la selección bancaria.");
    if (host) {
      const notice = document.createElement("p");
      notice.className = "recon-error";
      notice.setAttribute("role", "alert");
      notice.textContent = message;
      host.prepend(notice);
    }
  }
}

async function syncCfdiIsland() {
  const syncId = ++cfdiIslandSyncId;
  const host = app.querySelector("[data-cfdi-island-host]");
  if (!host) {
    const previousManager = cfdiIslandManager;
    cfdiIslandManager = null;
    cfdiIslandHost = null;
    if (previousManager) {
      await previousManager.clearSession("route-change");
      previousManager.dispose();
    }
    return;
  }
  if (cfdiIslandManager && cfdiIslandHost === host) return;
  const previousManager = cfdiIslandManager;
  cfdiIslandManager = null;
  cfdiIslandHost = null;
  if (previousManager) {
    await previousManager.clearSession("host-replaced");
    previousManager.dispose();
  }
  if (syncId !== cfdiIslandSyncId || !app.contains(host)) return;
  const manager = createIslandManager({
    host,
    registry: cfdiIslandRegistry,
    initialSessionEpoch: 0,
    capabilitiesFor: () => ({
      onAskNora: handleCfdiAskNora,
      onHandoffSources: handleCfdiSourceHandoff,
      getAnalysis: () => cfdiState.analysis,
      onCfdiPlanner: requestAuthenticatedCfdiPlanner,
      registerSourceProvider: (owner, provider) => sourceCapabilityBroker.registerSourceProvider(owner, provider),
    }),
  });
  cfdiIslandManager = manager;
  cfdiIslandHost = host;
  try {
    await manager.navigate("cfdi", { reason: "navigation" });
  } catch (error) {
    if (cfdiIslandManager === manager) {
      cfdiIslandManager = null;
      cfdiIslandHost = null;
      host.innerHTML = `<p class="cfdi-error" role="alert">No se pudo montar la isla CFDI: ${escapeHtml(error?.message || "error de montaje")}</p>`;
      manager.dispose();
    }
  }
}

async function syncJournalIsland() {
  const syncId = ++journalIslandSyncId;
  const host = app.querySelector("[data-journal-island-host]");
  if (!host) {
    const previousManager = journalIslandManager;
    journalIslandManager = null;
    journalIslandHost = null;
    if (pendingJournalHandoff) {
      sourceCapabilityBroker.clear();
      pendingJournalHandoff = null;
    }
    if (pendingJournalBankHandoff) {
      sourceCapabilityBroker.clear();
      pendingJournalBankHandoff = null;
    }
    if (previousManager) {
      await previousManager.clearSession("route-change");
      previousManager.dispose();
    }
    return;
  }
  if (journalIslandManager && journalIslandHost === host) return;
  const previousManager = journalIslandManager;
  journalIslandManager = null;
  journalIslandHost = null;
  if (previousManager) {
    await previousManager.clearSession("host-replaced");
    previousManager.dispose();
  }
  if (syncId !== journalIslandSyncId || !app.contains(host)) return;
  const manager = createIslandManager({
    host,
    registry: journalIslandRegistry,
    initialSessionEpoch: 0,
    capabilitiesFor: () => ({
      onAssistantSend: (message) => { void sendJournalAssistantMessage(message); },
      onAssistantCancel: cancelJournalAssistant,
      consumeSourceHandoff: () => {
        const lease = pendingJournalHandoff;
        pendingJournalHandoff = null;
        if (!lease) return null;
        return sourceCapabilityBroker.consume(lease.token, { target: "journal", sessionEpoch: lease.sessionEpoch });
      },
      consumeBankHandoff: () => {
        const lease = pendingJournalBankHandoff;
        pendingJournalBankHandoff = null;
        if (!lease) return null;
        return sourceCapabilityBroker.consume(lease.token, { target: "journal", sessionEpoch: lease.sessionEpoch });
      },
    }),
  });
  journalIslandManager = manager;
  journalIslandHost = host;
  try {
    await manager.navigate("journal", { reason: "navigation" });
  } catch (error) {
    if (journalIslandManager === manager) {
      journalIslandManager = null;
      journalIslandHost = null;
      host.innerHTML = `<p class="journal-inline-error" role="alert">No se pudo montar la isla de Pólizas: ${escapeHtml(error?.message || "error de montaje")}</p>`;
      manager.dispose();
    }
  }
}

async function syncDiotIsland() {
  const syncId = ++diotIslandSyncId;
  const host = app.querySelector("[data-diot-island-host]");
  if (!host) {
    const previousManager = diotIslandManager;
    diotIslandManager = null;
    diotIslandHost = null;
    if (pendingDiotHandoff) {
      sourceCapabilityBroker.clear();
      pendingDiotHandoff = null;
    }
    if (previousManager) {
      await previousManager.clearSession("route-change");
      previousManager.dispose();
    }
    return;
  }
  if (diotIslandManager && diotIslandHost === host) return;
  const previousManager = diotIslandManager;
  diotIslandManager = null;
  diotIslandHost = null;
  if (previousManager) {
    await previousManager.clearSession("host-replaced");
    previousManager.dispose();
  }
  if (syncId !== diotIslandSyncId || !app.contains(host)) return;
  const manager = createIslandManager({
    host,
    registry: diotIslandRegistry,
    initialSessionEpoch: 0,
    capabilitiesFor: () => ({
      onAssistantSend: (message) => { void sendDiotAssistantMessage(message); },
      onAssistantCancel: cancelDiotAssistant,
      consumeCfdiHandoff: () => {
        const lease = pendingDiotHandoff;
        pendingDiotHandoff = null;
        if (!lease) return null;
        return sourceCapabilityBroker.consume(lease.token, { target: "diot", sessionEpoch: lease.sessionEpoch });
      },
    }),
  });
  diotIslandManager = manager;
  diotIslandHost = host;
  try {
    await manager.navigate("diot", { reason: "navigation" });
  } catch (error) {
    if (diotIslandManager === manager) {
      diotIslandManager = null;
      diotIslandHost = null;
      host.innerHTML = `<p class="diot-issue is-error" role="alert">No se pudo montar la isla DIOT: ${escapeHtml(error?.message || "error de montaje")}</p>`;
      manager.dispose();
    }
  }
}

async function syncWorkpapersIsland() {
  const syncId = ++workpapersIslandSyncId;
  const host = app.querySelector("[data-workpapers-island-host]");
  if (!host) {
    const previousManager = workpapersIslandManager;
    workpapersIslandManager = null;
    workpapersIslandHost = null;
    if (previousManager) {
      await previousManager.clearSession("route-change");
      previousManager.dispose();
    }
    return;
  }
  if (workpapersIslandManager && workpapersIslandHost === host) return;
  const previousManager = workpapersIslandManager;
  workpapersIslandManager = null;
  workpapersIslandHost = null;
  if (previousManager) {
    await previousManager.clearSession("host-replaced");
    previousManager.dispose();
  }
  if (syncId !== workpapersIslandSyncId || !app.contains(host)) return;
  const manager = createIslandManager({ host, registry: workpapersIslandRegistry, initialSessionEpoch: 0, capabilitiesFor: () => ({}) });
  workpapersIslandManager = manager;
  workpapersIslandHost = host;
  try {
    await manager.navigate("workpapers", { reason: "navigation" });
  } catch (error) {
    if (workpapersIslandManager === manager) {
      workpapersIslandManager = null;
      workpapersIslandHost = null;
      host.innerHTML = `<p class="workpapers-notice" role="alert">No se pudo montar la demo de Papeles de trabajo: ${escapeHtml(error?.message || "error de montaje")}</p>`;
      manager.dispose();
    }
  }
}

function isLearningSection(section = state.section) {
  return ["course", "lab", "study"].includes(section);
}

function renderLearningIslandContent() {
  if (state.section === "course") return renderCourse();
  if (state.section === "study") return renderStudy();
  const exercise = exercises.find((item) => item.id === state.current);
  return exercise ? renderExercise(exercise) : renderHome();
}

function resetLearningEphemeral() {
  state.glossary = null;
  state.glossaryOpen = false;
  state.demoModuleId = null;
  state.openCourseModuleId = null;
  state.studyQuery = "";
  state.studyKind = "all";
  state.studyVisibleCount = 60;
  state.studySelectedId = "";
  state.studyDraftNote = "";
}

async function syncLearningIsland() {
  const syncId = ++learningIslandSyncId;
  const host = app.querySelector("[data-learning-island-host]");
  if (!host) {
    const previousManager = learningIslandManager;
    learningIslandManager = null;
    learningIslandHost = null;
    if (previousManager) {
      await previousManager.clearSession("route-change");
      previousManager.dispose();
    }
    return;
  }
  if (learningIslandManager && learningIslandHost === host) return;
  const previousManager = learningIslandManager;
  learningIslandManager = null;
  learningIslandHost = null;
  if (previousManager) {
    await previousManager.clearSession("host-replaced");
    previousManager.dispose();
  }
  if (syncId !== learningIslandSyncId || !app.contains(host) || !isLearningSection()) return;
  const manager = createIslandManager({
    host,
    registry: learningIslandRegistry,
    initialSessionEpoch: 0,
    capabilitiesFor: () => ({
      renderContent: renderLearningIslandContent,
      onEvent: (type, event) => handleLearningEvent(type, event),
      onDestroy: resetLearningEphemeral,
    }),
  });
  learningIslandManager = manager;
  learningIslandHost = host;
  try {
    await manager.navigate(state.section, { reason: "navigation" });
  } catch (error) {
    if (learningIslandManager === manager) {
      learningIslandManager = null;
      learningIslandHost = null;
      host.innerHTML = `<p class="progress-storage-note" role="alert">No se pudo montar la isla educativa: ${escapeHtml(error?.message || "error de montaje")}</p>`;
      manager.dispose();
    }
  }
}
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
  if (state.section === "study") refreshLearningIsland();
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
  refreshLearningIsland();
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
  refreshLearningIsland();
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
    const cfdiContext = openMode ? state.openAssistant.cfdiContext : undefined;
    const remoteCredentials = cfdiContext ? await getAiRemoteCredentials() : {};
    const reply = await requestTutorReply({
      message: question,
      context: openMode ? { section: "advisor" } : getTutorContext(),
      history,
      documentText: includeDocument ? conversation.documentText : "",
      cfdiContext,
      provider: state.tutor.provider || state.tutor.defaultProvider,
      signal: controller.signal,
      ...remoteCredentials,
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

function refreshJournalIsland() {
  if (state.section === "journal" && journalIslandManager) {
    journalIslandManager.update();
    return;
  }
  render();
}

async function sendJournalAssistantMessage(text) {
  const question = String(text || "").trim();
  const assistant = journalState.assistant;
  if (!question || assistant.pending) return;
  if (!state.tutor.providers.length) {
    assistant.error = "Nora no está configurada en este momento. Puedes revisar el catálogo y las validaciones localmente.";
    refreshJournalIsland();
    return;
  }
  const requestId = (assistant.requestId || 0) + 1;
  const controller = new AbortController();
  assistant.requestId = requestId;
  assistant.abortController = controller;
  assistant.error = "";
  assistant.open = true;
  assistant.messages.push({ role: "user", text: question }, { role: "assistant", text: "", streaming: true });
  assistant.messages = assistant.messages.slice(-20);
  assistant.pending = true;
  refreshJournalIsland();
  const responseMessage = assistant.messages.at(-1);
  const history = assistant.messages.slice(-10, -1).map(({ role, text: content }) => ({ role, content }));
  try {
    await requestTutorReply({
      message: question,
      context: { section: "advisor" },
      history,
      provider: state.tutor.provider || state.tutor.defaultProvider,
      signal: controller.signal,
      onToken: (token) => {
        if (journalState.assistant.requestId !== requestId) return;
        responseMessage.text += token;
        const streamed = app.querySelector("[data-journal-assistant-stream]");
        if (streamed) streamed.textContent = responseMessage.text;
      },
    });
    if (journalState.assistant.requestId === requestId) responseMessage.streaming = false;
  } catch (error) {
    if (journalState.assistant.requestId !== requestId) return;
    responseMessage.streaming = false;
    responseMessage.text = error?.name === "AbortError" ? "Respuesta detenida. Puedes continuar cuando quieras." : "No pude obtener respuesta de Nora. Revisa la conexión o vuelve a intentarlo.";
    assistant.error = error?.name === "AbortError" ? "" : (error?.message || "No se pudo consultar a Nora.");
  } finally {
    if (journalState.assistant.requestId === requestId) {
      assistant.pending = false;
      assistant.abortController = null;
      refreshJournalIsland();
      app.querySelector("[data-journal-assistant-form] textarea")?.focus({ preventScroll: true });
    }
  }
}

function cancelJournalAssistant() {
  journalState.assistant.requestId += 1;
  journalState.assistant.abortController?.abort();
  journalState.assistant.abortController = null;
  journalState.assistant.pending = false;
  journalState.assistant.error = "";
  refreshJournalIsland();
}

function refreshLearningIsland() {
  if (isLearningSection() && learningIslandManager) {
    learningIslandManager.update();
    return;
  }
  render();
}

function refreshDiotIsland() {
  if (state.section === "diot" && diotIslandManager) {
    diotIslandManager.update();
    return;
  }
  render();
}

async function sendDiotAssistantMessage(text) {
  const question = String(text || "").trim();
  const assistant = diotState.assistant;
  if (!question || assistant.pending) return;
  if (!state.tutor.providers.length) {
    assistant.error = "Nora no está configurada en este momento. Puedes revisar el flujo y las incidencias localmente.";
    refreshDiotIsland();
    return;
  }
  const requestId = (assistant.requestId || 0) + 1;
  const controller = new AbortController();
  assistant.requestId = requestId;
  assistant.abortController = controller;
  assistant.error = "";
  assistant.open = true;
  assistant.messages.push({ role: "user", text: question }, { role: "assistant", text: "", streaming: true });
  assistant.messages = assistant.messages.slice(-20);
  assistant.pending = true;
  refreshDiotIsland();
  const responseMessage = assistant.messages.at(-1);
  const history = assistant.messages.slice(-10, -1).map(({ role, text: content }) => ({ role, content }));
  try {
    await requestTutorReply({
      message: question,
      context: { section: "advisor" },
      history,
      provider: state.tutor.provider || state.tutor.defaultProvider,
      signal: controller.signal,
      onToken: (token) => {
        if (diotState.assistant.requestId !== requestId) return;
        responseMessage.text += token;
        const streamed = app.querySelector("[data-diot-assistant-stream]");
        if (streamed) streamed.textContent = responseMessage.text;
      },
    });
    if (diotState.assistant.requestId === requestId) responseMessage.streaming = false;
  } catch (error) {
    if (diotState.assistant.requestId !== requestId) return;
    responseMessage.streaming = false;
    responseMessage.text = error?.name === "AbortError" ? "Respuesta detenida. Puedes continuar cuando quieras." : "No pude obtener respuesta de Nora. Revisa la conexión o vuelve a intentarlo.";
    assistant.error = error?.name === "AbortError" ? "" : (error?.message || "No se pudo consultar a Nora.");
  } finally {
    if (diotState.assistant.requestId === requestId) {
      assistant.pending = false;
      assistant.abortController = null;
      refreshDiotIsland();
      app.querySelector("[data-diot-assistant-form] textarea")?.focus({ preventScroll: true });
    }
  }
}

function cancelDiotAssistant() {
  diotState.assistant.requestId += 1;
  diotState.assistant.abortController?.abort();
  diotState.assistant.abortController = null;
  diotState.assistant.pending = false;
  diotState.assistant.error = "";
  refreshDiotIsland();
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
      ${logoMark()}<span class="brand-copy"><strong>ContaIA</strong><b>Aprende</b></span>
    </button>
    <div class="sidebar-divider"></div>
    <p class="nav-label sidebar-section-label">SECCIÓN 02 · CONTAIA APRENDE</p>
    <button class="nav-item nav-home ${state.section === "lab" && state.current === "home" ? "is-active" : ""}" type="button" data-nav="home" aria-current="${state.section === "lab" && state.current === "home" ? "page" : "false"}">
      <span class="home-glyph">${uiIcon("home")}</span><span>Inicio · Aprende</span>
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
    <button type="button" class="mobile-nav-item ${state.section === "lab" ? "is-active" : ""}" data-nav="home" aria-current="${state.section === "lab" ? "page" : "false"}">${uiIcon("home")}<small>Inicio</small></button>
    <button type="button" class="mobile-nav-item ${state.section === "course" ? "is-active" : ""}" data-section="course" aria-current="${state.section === "course" ? "page" : "false"}">${uiIcon("book")}<small>Aprende</small></button>
    <button type="button" class="mobile-nav-item ${state.section === "study" ? "is-active" : ""}" data-section="study" aria-current="${state.section === "study" ? "page" : "false"}">${uiIcon("book")}<small>Estudio</small></button>
    <button type="button" class="mobile-nav-item ${["tools", "cfdi", "reconciliation", "journal", "diot", "workpapers"].includes(state.section) ? "is-active" : ""}" data-section="tools" aria-current="${["tools", "cfdi", "reconciliation", "journal", "diot", "workpapers"].includes(state.section) ? "page" : "false"}">${uiIcon("grid")}<small>Herramientas</small></button>
    <button type="button" class="mobile-nav-item ${state.section === "advisor" ? "is-active" : ""}" data-section="advisor" aria-current="${state.section === "advisor" ? "page" : "false"}">${uiIcon("nora")}<small>Nora</small></button>
  </nav>`;
}

function topbar() {
  const done = state.completed.size;
  const pageLabel = state.section === "course" ? "ContaIA Aprende · Aula" : state.section === "advisor" ? "Nora · Asistente abierto" : state.section === "cfdi" ? "ContaIA Herramientas · CFDI" : state.section === "reconciliation" ? "ContaIA Herramientas · Conciliación" : state.section === "journal" ? "ContaIA Herramientas · Pólizas sugeridas" : state.section === "diot" ? "ContaIA Herramientas · DIOT asistida" : state.section === "workpapers" ? "ContaIA Herramientas · Papeles de trabajo IA" : state.section === "tools" ? "ContaIA Herramientas" : state.section === "study" ? "Aprende · Base de estudio" : state.current === "home" ? "Aprende · Inicio" : "Aprende · Ejercicio";
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
  const toolsActive = ["tools", "advisor", "cfdi", "reconciliation", "journal", "diot", "workpapers", "lab", "study"].includes(state.section);
  const isToolsProduct = ["tools", "cfdi", "reconciliation", "journal", "diot", "workpapers"].includes(state.section);
  const tools = [
    ["tools", "ContaIA Herramientas", "grid"],
    ["advisor", "Asistente abierto", "nora"],
    ["cfdi", "Analizador CFDI", "file"],
    ["reconciliation", "Conciliación bancaria", "grid"],
    ["journal", "Pólizas sugeridas", "check"],
    ["diot", "DIOT asistida", "file"],
    ["workpapers", "Papeles de trabajo IA", "file"],
    ["lab", "Laboratorio práctico", "check"],
    ["study", "Base de estudio", "book"],
  ].map(([section, label, icon]) => `<button class="section-tab ${state.section === section ? "is-active" : ""}" type="button" data-section="${section}" aria-current="${state.section === section ? "page" : "false"}">${uiIcon(icon)}<span>${label}</span></button>`);
  const advisorToggle = state.section === "advisor" ? "" : `<button class="section-tab advisor-tab" type="button" data-action="tutor-toggle" aria-expanded="${!state.tutor.collapsed}" aria-controls="tutor-panel-body">${uiIcon("nora")}<span>Asesoría</span></button>`;
  return `<header class="topbar"><div class="breadcrumb"><img class="topbar-brand-logo" src="/brand/contaia-logo-64.png" alt="" aria-hidden="true" /><span>CONTAIA</span><i aria-hidden="true">/</i><strong>${pageLabel}</strong></div>
    <nav class="section-tabs" aria-label="Secciones principales">
      <button class="section-tab ${state.section === "course" ? "is-active" : ""}" type="button" data-section="course" aria-current="${state.section === "course" ? "page" : "false"}"><b>01</b>${uiIcon("book")}<span>ContaIA Aprende</span></button>
      <details class="class-menu"><summary class="section-tab ${state.section === "course" ? "is-active" : ""}" aria-label="Abrir lista de clases"><b>02</b>${uiIcon("menu")}<span>Clases</span>${uiIcon("chevron")}</summary><div class="class-menu-popover" role="group" aria-label="Ruta de las ${courseModules.length} clases">${classOptions}<p>${state.completedModules.size} de ${courseModules.length} clases completadas · clase actual ${String(activeClassIndex + 1).padStart(2, "0")} · avance guardado localmente</p></div></details>
      <details class="tools-menu"><summary class="section-tab ${toolsActive ? "is-active" : ""}" aria-label="${toolsActive ? `Abrir herramientas; sección actual: ${pageLabel}` : "Abrir herramientas"}" aria-controls="section-tools"><b>03</b>${uiIcon("grid")}<span>Herramientas</span>${uiIcon("chevron")}</summary><div class="tools-menu-popover" id="section-tools" aria-label="Secciones de ContaIA"><section class="tools-menu-group" role="group" aria-label="Herramientas de ContaIA"><p class="tools-menu-label">HERRAMIENTAS DE CONTAIA</p>${tools.slice(0, 7).join("")}</section><section class="tools-menu-group" role="group" aria-label="Práctica y estudio"><p class="tools-menu-label">PRÁCTICA Y ESTUDIO</p>${tools.slice(7).join("")}${advisorToggle}</section></div></details>
    </nav>
    <div class="topbar-right"><span class="edition"><span class="edition-dot"></span>${isToolsProduct ? "ContaIA Herramientas" : state.section === "advisor" ? "Nora · apoyo transversal" : "ContaIA Aprende"}</span>${state.section === "lab" ? `<span class="progress-mini"><b>${done}</b> / ${exercises.length} prácticas</span>` : ""}<span class="auth-controls">${renderAuthControls()}</span></div>
  </header>`;
}

function renderHomeLearningDashboard() {
  const completedCount = courseModules.filter(({ id }) => state.completedModules.has(id)).length;
  const totalCount = courseModules.length;
  const percent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentModule = courseModules.find(({ id }) => id === state.activeModuleId && !state.completedModules.has(id));
  const nextModule = currentModule || courseModules.find(({ id }) => !state.completedModules.has(id)) || courseModules.at(-1);
  const route = courseModules.map((module, index) => {
    const complete = state.completedModules.has(module.id);
    const current = module.id === nextModule?.id && !complete;
    const status = complete ? "Completado" : current ? "En curso" : "Pendiente";
    return `<li class="home-route-step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""}"><button type="button" data-class-module="${escapeHtml(module.id)}" aria-label="Abrir módulo ${index + 1}: ${escapeHtml(module.title)} · ${status}"><span>${complete ? "✓" : String(index + 1).padStart(2, "0")}</span><small>${escapeHtml(module.title)}</small></button></li>`;
  }).join("");
  const homeNoraAvatar = completedCount === totalCount ? "celebrating" : "idle";
  return `<section class="home-learning-dashboard" aria-label="Progreso de aprendizaje"><div class="home-learning-top"><div class="home-learning-progress"><div class="home-learning-heading"><div><p class="eyebrow">TU CURSO · AVANCE LOCAL</p><h2>Continúa donde lo dejaste</h2></div><span class="home-learning-count">${completedCount} / ${totalCount}</span></div><div class="home-course-progress-track" role="progressbar" aria-label="Módulos del curso completados" aria-valuenow="${completedCount}" aria-valuemin="0" aria-valuemax="${totalCount}"><span style="width:${percent}%"></span></div><p class="home-course-progress-copy">${completedCount === totalCount ? "Has completado los módulos disponibles; puedes volver a cualquiera para repasar." : `${completedCount} de ${totalCount} módulos completados · este avance permanece en este navegador.`}</p>${nextModule ? `<div class="home-next-module"><div><span>${completedCount === totalCount ? "REPASO RECOMENDADO" : "SIGUIENTE EN TU RUTA"}</span><b>${escapeHtml(nextModule.title)}</b></div><button type="button" class="button button-primary" data-class-module="${escapeHtml(nextModule.id)}">${completedCount === totalCount ? "Repasar módulo" : "Continuar módulo"} <span aria-hidden="true">→</span></button></div>` : `<p class="home-course-progress-copy">No hay módulos disponibles en esta vista.</p>`}</div><aside class="home-nora-card"><img class="home-nora-avatar" src="/assets/nora/nora-${homeNoraAvatar}.webp" alt="" aria-hidden="true" loading="lazy"/><div><p class="eyebrow">NORA · GUÍA DE APRENDIZAJE</p><h3>¿Quieres aclarar el siguiente paso?</h3><p>Pregunta sobre un concepto o procedimiento; comparte información solo cuando tú quieras y evita datos fiscales identificables.</p><button type="button" class="home-nora-link" data-section="advisor">Consultar a Nora <span aria-hidden="true">↗</span></button></div></aside></div><ol class="home-course-route" aria-label="Ruta visual de módulos">${route}</ol></section>`;
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
      <div class="hero-art hero-brand-art">
        <div class="hero-logo-card"><img src="/brand/contaia-logo-home.jpg" alt="ContaIA Herramientas fiscales" width="622" height="549" fetchpriority="high" decoding="async" /></div>
        <div class="hero-orbit hero-orbit-one" aria-hidden="true"></div><div class="hero-orbit hero-orbit-two" aria-hidden="true"></div><div class="hero-index" aria-hidden="true">01—09</div>
      </div>
      <div class="hero-footer"><span><i>01</i> Prueba con casos ficticios</span><span><i>02</i> Recibe pistas y retroalimentación</span><span><i>03</i> Revisa una solución modelo</span></div>
    </section>
    ${renderHomeLearningDashboard()}
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

function renderPublicLanding() {
  return `<div class="public-landing">
    <header class="public-header">
      <a class="public-brand public-brand-wordmark" href="/" aria-label="ContaIA, inicio"><img src="/brand/contaia-logo-home.jpg" alt="ContaIA Herramientas fiscales" width="622" height="549" fetchpriority="high" decoding="async" /></a>
      <nav class="public-nav" aria-label="Productos de ContaIA"><a href="#aprende">Aprende</a><a href="#herramientas">Herramientas</a><a href="#nora">Nora</a></nav>
      <button class="public-login" type="button" data-action="auth-toggle">Iniciar sesión</button>
    </header>
    <main id="contenido" class="public-main" tabindex="-1">
      <section class="public-hero" aria-labelledby="public-title">
        <p class="public-kicker"><i aria-hidden="true"></i> CONTAIA · APRENDIZAJE Y HERRAMIENTAS FISCALES</p>
        <h1 id="public-title">Dos maneras de avanzar con ContaIA.</h1>
        <p class="public-lede">Aprende con una ruta guiada o entra a herramientas para trabajar con CFDI. Cada producto tiene un propósito claro; Nora acompaña la experiencia donde necesites orientación.</p>
        <a class="public-primary-cta" href="#productos">Conoce los productos <span aria-hidden="true">↓</span></a>
      </section>
      <section id="productos" class="public-card-grid public-product-grid" aria-label="Los dos productos de ContaIA">
        <article id="herramientas" class="public-card public-card-cfdi public-product-card">
          <div class="public-card-top"><span class="public-card-icon" aria-hidden="true">${uiIcon("file")}</span><span class="public-card-label">PRODUCTO 01 · OPERACIÓN</span></div>
          <p class="public-product-name">ContaIA</p><h2>Herramientas</h2>
          <p class="public-card-copy">Analiza CFDI XML y ZIP en tu navegador, revisa relaciones de pagos y consulta hallazgos para decidir qué verificar.</p>
          <p class="public-card-note"><span aria-hidden="true">◈</span> CFDI y su Asistente IA local-first están disponibles después del análisis; Contabilidad requiere conexión y Nómina, DIOT y Monitor fiscal siguen en preparación.</p>
          <a class="public-card-cta" href="/descripcion/cfdi">Explorar ContaIA Herramientas <span aria-hidden="true">→</span></a>
        </article>
        <article id="aprende" class="public-card public-card-course public-product-card">
          <div class="public-card-top"><span class="public-card-icon" aria-hidden="true">${uiIcon("book")}</span><span class="public-card-label">PRODUCTO 02 · FORMACIÓN</span></div>
          <p class="public-product-name">ContaIA</p><h2>Aprende</h2>
          <p class="public-card-copy">Desarrolla criterio con diez módulos semanales, práctica guiada con casos ficticios y una ruta de 40 horas acompañada por Nora.</p>
          <p class="public-card-note"><span aria-hidden="true">✦</span> Retoma el recorrido y consulta el avance guardado localmente en este navegador.</p>
          <a class="public-card-cta" href="/descripcion/curso">Explorar ContaIA Aprende <span aria-hidden="true">→</span></a>
        </article>
      </section>
      <p class="public-product-support" id="nora">Nora acompaña el aprendizaje y también puede responder preguntas abiertas. <a href="/descripcion/asistente">Conoce el Asistente abierto <span aria-hidden="true">↗</span></a></p>
      <p class="public-privacy-note">Aprende y prueba con responsabilidad. Usa ejemplos ficticios y revisa los resultados antes de aplicarlos a tu trabajo.</p>
      <section class="public-lead-section" aria-labelledby="public-lead-title">
        <div class="public-lead-copy"><p class="public-lead-eyebrow">TU SIGUIENTE PASO</p><h2 id="public-lead-title">¿Qué ruta te interesa?</h2><p>Déjanos tu correo y elige por dónde empezar. Te llevamos al registro con esa ruta seleccionada.</p></div>
        <form class="public-lead-form" data-interest-form>
          <label class="public-lead-email-label" for="public-lead-email">Tu correo electrónico</label>
          <input id="public-lead-email" name="email" type="email" autocomplete="email" placeholder="tu@correo.com" required />
          <fieldset><legend>Me interesa:</legend>
            <label class="public-interest-option"><input type="radio" name="destino" value="cfdi" required /><span>ContaIA Herramientas</span></label>
            <label class="public-interest-option"><input type="radio" name="destino" value="asistente" /><span>Nora · Asistente abierto</span></label>
            <label class="public-interest-option"><input type="radio" name="destino" value="curso" /><span>ContaIA Aprende</span></label>
          </fieldset>
          <button class="public-lead-submit" type="submit">Continuar con mi correo <span aria-hidden="true">→</span></button>
          <p class="public-lead-disclosure">El correo se usa para prellenar el registro; no se agrega a una lista de marketing.</p>
          <div class="public-lead-toast" data-lead-toast role="status" aria-live="polite" hidden>
            <span class="public-lead-toast-check" aria-hidden="true">✓</span>
            <span class="public-lead-toast-copy"><b>Ruta seleccionada</b><small data-lead-toast-message>Abriendo el registro…</small></span>
          </div>
        </form>
      </section>
      <section class="public-faq" aria-labelledby="public-faq-title">
        <div class="public-faq-heading"><p class="public-lead-eyebrow">CONOCE CONTAIA</p><h2 id="public-faq-title">Preguntas frecuentes</h2><p>Qué puedes hacer y cómo empezar.</p></div>
        <div class="public-faq-list">
          <details class="public-faq-item"><summary>¿Qué incluye ContaIA Herramientas?</summary><div class="public-faq-answer"><p>El analizador CFDI lee archivos XML o ZIP, organiza facturas, pagos y conceptos, relaciona complementos de pago con facturas y señala diferencias o alertas aritméticas para revisar. El procesamiento del XML ocurre localmente en tu navegador. No es una validación ante el SAT ni un dictamen profesional.</p></div></details>
          <details class="public-faq-item"><summary>¿Cómo se integra Anam en el aprendizaje?</summary><div class="public-faq-answer"><p>Anam es un acompañamiento opcional con voz y video para apoyar la experiencia formativa junto a Nora. Se activa solo cuando tú lo decides y concedas los permisos necesarios; no sustituye las prácticas ni el criterio profesional.</p></div></details>
          <details class="public-faq-item"><summary>¿Qué incluye ContaIA Aprende?</summary><div class="public-faq-answer"><p>El curso tiene diez módulos semanales y 40 horas. Cada clase alterna activación, explicación, práctica guiada con casos ficticios, revisión y cierre. Nora acompaña el recorrido; Anam puede integrarse de forma opcional. Avanza paso a paso y revisa tu progreso en este navegador.</p></div></details>
          <details class="public-faq-item"><summary>¿Qué módulos están disponibles hoy?</summary><div class="public-faq-answer"><p>CFDI está disponible para análisis local. Contabilidad requiere una conexión; Nómina, DIOT y Monitor fiscal están en preparación. El Centro de herramientas indica la disponibilidad funcional y el estado de conexión por separado.</p></div></details>
          <details class="public-faq-item"><summary>¿Dónde puedo consultar a Nora?</summary><div class="public-faq-answer"><p>Nora acompaña el aprendizaje y también está disponible en el Asistente abierto para preguntas fuera de una clase. Comparte solo casos ficticios o información anonimizada; no es asesoría profesional.</p></div></details>
        </div>
      </section>
    </main>
    <footer class="public-footer"><span>© 2026 ContaIA</span><a href="/privacidad">Privacidad</a><a href="/registro">Crear una cuenta</a></footer>
    ${renderAuthPanel()}
  </div>`;
}

const PUBLIC_FEATURES = Object.freeze({
  cfdi: {
    eyebrow: "CONTAIA HERRAMIENTAS · CFDI",
    title: "Revisa tus comprobantes con más claridad y control.",
    summary: "Lee archivos XML o ZIP, relaciona complementos de pago con facturas y localiza diferencias para revisar. El análisis se realiza localmente en tu navegador.",
    icon: "file",
    bullets: ["Analiza uno o varios XML, o un archivo ZIP, localmente en el navegador.", "Consulta resúmenes de facturas, pagos y conceptos.", "Usa el Asistente IA CFDI después del análisis para revisar alertas y siguientes pasos; otros módulos se habilitarán cuando estén listos."],
    note: "No es una validación ante el SAT ni un dictamen profesional. El XML no se envía al servidor; si eliges guardar un resultado, algunos datos identificatorios pueden quedar en tu cuenta privada.",
    cta: "Crear cuenta y explorar Herramientas",
  },
  asistente: {
    eyebrow: "ASISTENTE ABIERTO · NORA",
    title: "Conversa con Nora sobre tus dudas contables.",
    summary: "Usa el espacio abierto para explorar preguntas de contabilidad y temas fiscales con México como contexto, sin seguir una práctica predeterminada.",
    icon: "nora",
    bullets: ["Plantea preguntas abiertas de contabilidad y fiscalidad.", "Pide explicaciones, ejemplos y puntos que conviene verificar.", "Usa respuestas como orientación; conserva tu propio criterio profesional."],
    note: "Las preguntas se procesan mediante el proveedor de IA configurado. No incluyas información personal, fiscal ni confidencial.",
    cta: "Crear cuenta y explorar el asistente",
  },
  curso: {
    eyebrow: "CONTAIA APRENDE · RUTA GUIADA",
    title: "Aprende IA aplicada a la práctica contable.",
    summary: "Recorre diez módulos semanales —40 horas en total— con conceptos, prácticas guiadas, revisión y cierre. Anam puede integrarse como acompañamiento opcional durante el aprendizaje.",
    icon: "book",
    bullets: ["Diez módulos organizados en una ruta de diez semanas.", "Prácticas contables guiadas con apoyo de Nora.", "Integra Anam de forma opcional y consulta tu avance en este navegador."],
    note: "Es un curso educativo, no asesoría profesional, contable, fiscal, laboral ni legal. Anam es opcional y requiere que concedas los permisos de audio o video que decidas usar.",
    cta: "Crear cuenta y empezar Aprende",
  },
});

function renderPublicFeaturePage(featureId) {
  const feature = PUBLIC_FEATURES[featureId];
  if (!feature) return "";
  const bullets = feature.bullets.map((item) => `<li><span aria-hidden="true">✓</span>${escapeHtml(item)}</li>`).join("");
  const destination = encodeURIComponent(featureId);
  return `<div class="public-landing public-feature-page">
    <header class="public-header">
      <a class="public-brand" href="/" aria-label="ContaIA, inicio"><img src="/brand/contaia-logo.png" alt=""/><span>Conta<span>IA</span></span></a>
      <nav class="public-nav" aria-label="Productos de ContaIA"><a href="/#aprende">Aprende</a><a href="/#herramientas">Herramientas</a><a href="/#nora">Nora</a></nav>
      <button class="public-login" type="button" data-action="auth-toggle">Iniciar sesión</button>
    </header>
    <main id="contenido" class="public-main public-description-main" tabindex="-1">
      <a class="public-back-link" href="/">← Volver a ContaIA</a>
      <section class="public-description-hero" aria-labelledby="feature-title">
        <span class="public-description-icon" aria-hidden="true">${uiIcon(feature.icon)}</span>
        <p class="public-kicker">${escapeHtml(feature.eyebrow)}</p>
        <h1 id="feature-title">${escapeHtml(feature.title)}</h1>
        <p class="public-lede">${escapeHtml(feature.summary)}</p>
        <a class="public-primary-cta" href="/registro?destino=${destination}">${escapeHtml(feature.cta)} <span aria-hidden="true">→</span></a>
      </section>
      <section class="public-description-grid" aria-label="Detalles de la ruta">
        <div class="public-description-list"><p class="public-description-label">QUÉ ENCONTRARÁS</p><h2>Una ruta clara para empezar.</h2><ul>${bullets}</ul></div>
        <aside class="public-description-note"><span class="public-note-shield" aria-hidden="true">◈</span><b>Privacidad y alcance</b><p>${escapeHtml(feature.note)}</p></aside>
      </section>
      <p class="public-description-bottom"><a href="/">Explora ambos productos de ContaIA</a></p>
    </main>
    <footer class="public-footer"><span>© 2026 ContaIA</span><a href="/privacidad">Privacidad</a><a href="/registro?destino=${destination}">Crear una cuenta</a></footer>
    ${renderAuthPanel()}
  </div>`;
}

const PUBLIC_INFO_PAGES = Object.freeze({
  privacidad: {
    eyebrow: "CONFIANZA · CONTAIA", title: "Aprende con claridad sobre tus datos.",
    summary: "ContaIA separa los casos educativos, el procesamiento local y el historial privado para que sepas qué ocurre antes de cada acción.", icon: "check",
    cards: [["Procesamiento local", "El analizador CFDI lee XML y ZIP en tu navegador. El archivo original no se sube por el solo hecho de analizarlo."], ["Historial privado", "Si eliges guardar un resultado, se conserva en tu cuenta y puede incluir datos normalizados del análisis."], ["Tu criterio primero", "La plataforma ofrece apoyo educativo y no sustituye una validación ante el SAT ni una asesoría profesional."]],
    primary: ["Crear una cuenta", "/registro"], secondary: ["Volver al inicio", "/"],
  },
  ayuda: {
    eyebrow: "CENTRO DE AYUDA · CONTAIA", title: "Una ruta clara cuando algo no sale como esperabas.",
    summary: "Encuentra el siguiente paso para entrar, practicar, analizar CFDI o entender el alcance de Nora y Anam.", icon: "nora",
    cards: [["No puedes entrar", "Comprueba tu correo o alias, revisa que la contraseña tenga al menos 8 caracteres y usa la recuperación si la olvidaste."], ["Tu CFDI no aparece", "Usa XML o ZIP válidos, revisa el estado del análisis y confirma que los complementos de pago estén dentro de la selección."], ["Necesitas orientación", "Abre a Nora desde el Asistente abierto. Comparte solo casos ficticios o información previamente anonimizada."]],
    primary: ["Recuperar contraseña", "/recuperar-contrasena"], secondary: ["Explorar el CFDI", "/descripcion/cfdi"],
  },
  "recuperar-contrasena": {
    eyebrow: "ACCESO SEGURO · CONTAIA", title: "Recupera tu acceso sin perder tu recorrido.",
    summary: "Escribe el correo con el que creaste tu cuenta y te enviaremos un enlace para restablecer la contraseña.", icon: "refresh", recovery: true,
    cards: [["01 · Escribe tu correo", "Usa la misma dirección con la que te registraste en ContaIA."], ["02 · Revisa tu bandeja", "El enlace llega por correo. Si no lo ves, revisa spam y espera unos minutos."], ["03 · Vuelve a practicar", "Después de confirmar la nueva contraseña podrás continuar con tus módulos y tu historial privado."]],
    primary: ["Volver a iniciar sesión", "/"], secondary: ["Abrir ayuda", "/ayuda"],
  },
});

function renderPublicInfoPage(pageId) {
  const page = PUBLIC_INFO_PAGES[pageId];
  if (!page) return "";
  const cards = page.cards.map(([title, text], index) => `<article class="public-info-card"><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></article>`).join("");
  const recoveryTarget = getAuthDestinationTarget();
  const recoveryDisabled = authState.busy || !authState.ready || !window.__contaiaAuth?.client;
  const recoveryMessage = authState.message ? `<p class="public-recovery-message ${authState.error ? "is-error" : "is-success"}" role="status">${escapeHtml(authState.message)}</p>` : "";
  const recovery = page.recovery
    ? authState.recoveryComplete
      ? `<div class="public-recovery-complete">${recoveryMessage}<a class="public-primary-cta" href="${recoveryTarget}">Continuar a ContaIA <span aria-hidden="true">→</span></a></div>`
      : authState.recoveryMode
        ? `<form class="public-recovery-form" data-recovery-update-form><p class="public-recovery-kicker">ENLACE VERIFICADO</p><label for="recovery-new-password">Nueva contraseña</label><div><input id="recovery-new-password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" ${recoveryDisabled ? "disabled" : ""}/><span aria-hidden="true"></span></div><label for="recovery-confirm-password">Confirma tu nueva contraseña</label><div><input id="recovery-confirm-password" name="passwordConfirmation" type="password" autocomplete="new-password" required minlength="8" maxlength="128" ${recoveryDisabled ? "disabled" : ""}/><button class="public-primary-cta" type="submit" ${recoveryDisabled ? "disabled" : ""}>${authState.busy ? "Guardando…" : "Actualizar contraseña"}<span aria-hidden="true">→</span></button></div><small>Usa al menos 8 caracteres. Esta contraseña reemplazará la anterior.</small>${recoveryMessage}</form>`
        : `<form class="public-recovery-form" data-recovery-form><label for="recovery-email">Correo electrónico</label><div><input id="recovery-email" name="email" type="email" autocomplete="email" placeholder="tu@correo.com" required maxlength="254" value="${escapeHtml(authState.identifier)}" ${recoveryDisabled ? "disabled" : ""}/><button class="public-primary-cta" type="submit" ${recoveryDisabled ? "disabled" : ""}>${authState.busy ? "Enviando…" : "Enviar enlace"}<span aria-hidden="true">→</span></button></div>${recoveryMessage}</form>`
    : "";
  return `<div class="public-landing public-info-page public-info-${escapeHtml(pageId)}"><header class="public-header"><a class="public-brand" href="/" aria-label="ContaIA, inicio"><img src="/brand/contaia-logo.png" alt=""/><span>Conta<span>IA</span></span></a><nav class="public-nav" aria-label="Productos de ContaIA"><a href="/descripcion/curso">Aprende</a><a href="/descripcion/cfdi">Herramientas</a><a href="/descripcion/asistente">Nora</a></nav><button class="public-login" type="button" data-action="auth-toggle">Iniciar sesión</button></header><main id="contenido" class="public-main public-info-main" tabindex="-1"><a class="public-back-link" href="/">← Volver a ContaIA</a><section class="public-info-hero"><div class="public-info-icon" aria-hidden="true">${uiIcon(page.icon)}</div><p class="public-kicker">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.title)}</h1><p class="public-lede">${escapeHtml(page.summary)}</p>${recovery}<div class="public-info-actions"><a class="public-primary-cta" href="${page.primary[1]}">${escapeHtml(page.primary[0])}<span aria-hidden="true">→</span></a><a class="public-secondary-cta" href="${page.secondary[1]}">${escapeHtml(page.secondary[0])}</a></div></section><section class="public-info-grid" aria-label="Información de ContaIA">${cards}</section></main><footer class="public-footer"><span>© 2026 ContaIA</span><a href="/privacidad">Privacidad</a><a href="/ayuda">Ayuda</a></footer>${renderAuthPanel()}</div>`;
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
    ${scenario}${tables}${stageProgress}
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
  const pageKey = `${location.pathname}${location.search}|${currentUser()?.id ?? "anonymous"}|${state.section}|${state.current}`;
  const pageChanged = Boolean(lastPageTransitionKey && pageKey !== lastPageTransitionKey);
  lastPageTransitionKey = pageKey;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  renderView();
  void syncLearningIsland();
  void syncJournalIsland();
  void syncDiotIsland();
  void syncCfdiIsland();
  void syncReconciliationIsland();
  void syncWorkpapersIsland();
  if (pageChanged && !reduceMotion) {
    const page = app.querySelector("#contenido, .auth-gate") || app.firstElementChild;
    if (page) {
      page.classList.add("contaia-page-enter");
      const clearPageAnimation = (event) => {
        if (event.target !== page) return;
        page.classList.remove("contaia-page-enter");
        page.removeEventListener("animationend", clearPageAnimation);
      };
      page.addEventListener("animationend", clearPageAnimation);
    }
  }
}

function renderView() {
  const keepAnamVideo = ["course", "advisor"].includes(state.section) && ["live", "connecting"].includes(state.anam.status);
  const persistentVideo = keepAnamVideo ? app.querySelector("[data-anam-video]") : null;
  if (persistentVideo) persistentVideo.remove();
  else if (state.anam.client || state.anam.status === "connecting") void stopAnamSession({ silent: true });
  const publicInfoRoute = location.pathname.replace(/^\/+|\/+$/g, "");
  if (Object.prototype.hasOwnProperty.call(PUBLIC_INFO_PAGES, publicInfoRoute)) {
    app.innerHTML = renderPublicInfoPage(publicInfoRoute);
    return;
  }
  if (publicInfoRoute === "confirmar-correo") {
    app.innerHTML = renderEmailConfirmationGate();
    return;
  }
  if (!currentUser()) {
    if (location.pathname === "/registro" && !authState.identifier) {
      try {
        authState.identifier = sessionStorage.getItem("contaia.signup.prefill-email") || "";
        sessionStorage.removeItem("contaia.signup.prefill-email");
      } catch { /* El formulario seguirá disponible si el almacenamiento está bloqueado. */ }
    }
    const featureRoute = location.pathname.match(/^\/descripcion\/(cfdi|asistente|anam|curso)\/?$/);
    const featureId = featureRoute?.[1] === "anam" ? "asistente" : featureRoute?.[1];
    app.innerHTML = location.pathname === "/registro" ? renderRegistrationGate() : featureRoute ? renderPublicFeaturePage(featureId) : renderPublicLanding();
    return;
  }
  if (!state.publicDestinationApplied) {
    const routeSlug = location.pathname.match(/^\/descripcion\/(cfdi|asistente|anam|curso)\/?$/)?.[1];
    const requestedDestination = new URLSearchParams(location.search).get("destino");
    const routeDestination = routeSlug === "anam" ? "asistente" : routeSlug;
    const queryDestination = requestedDestination === "anam" ? "asistente" : requestedDestination;
    const destination = routeDestination || (Object.prototype.hasOwnProperty.call(PUBLIC_FEATURES, queryDestination) ? queryDestination : "");
    if (destination) state.section = destination === "cfdi" ? "cfdi" : destination === "asistente" ? "advisor" : "course";
    if (destination || location.pathname === "/registro") window.history.replaceState(null, "", "/");
    state.publicDestinationApplied = true;
  }
  const exercise = state.section === "lab" ? exercises.find((item) => item.id === state.current) : null;
  const content = isLearningSection() ? '<div data-learning-island-host aria-live="polite"></div>'
    : state.section === "advisor" ? renderOpenAssistant()
      : state.section === "cfdi" ? '<div data-cfdi-island-host aria-live="polite"></div>'
      : state.section === "reconciliation" ? '<div data-reconciliation-island-host aria-live="polite"></div>'
      : state.section === "journal" ? '<div data-journal-island-host aria-live="polite"></div>'
      : state.section === "diot" ? '<div data-diot-island-host aria-live="polite"></div>'
      : state.section === "workpapers" ? '<div data-workpapers-island-host aria-live="polite"></div>'
      : state.section === "tools" ? renderToolsPanel({ notice: state.toolsNotice, workspace: toolsWorkspace })
      : state.section === "study" ? renderStudy()
        : exercise ? renderExercise(exercise) : renderHome();
  const showSidebar = ["lab", "study"].includes(state.section);
  const tutorPanel = ["advisor", "cfdi", "reconciliation", "journal", "diot", "workpapers", "tools"].includes(state.section) ? "" : renderTutorPanel(getTutorContext());
  const fiscalTheme = ["tools", "cfdi", "reconciliation", "journal", "diot", "workpapers"].includes(state.section) ? "app-shell--fiscal" : "";
  app.innerHTML = `<div class="app-shell ${fiscalTheme}">${showSidebar ? sidebar() : ""}<div class="main-shell ${showSidebar ? "" : "main-shell-live"}">${topbar()}${content}</div>${tutorPanel}${renderAuthPanel()}${mobileNavigation()}</div>`;
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
  refreshLearningIsland();
}

function handleLearningClick(event) {
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
    refreshLearningIsland();
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
    refreshLearningIsland();
    narrateClassroomInstruction();
    return;
  }
  const glossaryTerm = event.target.closest("[data-glossary-term]");
  if (glossaryTerm) {
    state.glossary = { moduleId: glossaryTerm.dataset.glossaryModule, term: glossaryTerm.dataset.glossaryTerm };
    refreshLearningIsland();
    return;
  }
  const demo = event.target.closest("[data-module-demo]");
  if (demo) {
    state.demoModuleId = state.demoModuleId === demo.dataset.moduleDemo ? null : demo.dataset.moduleDemo;
    refreshLearningIsland();
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
    refreshLearningIsland();
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
    refreshLearningIsland();
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
  if (action.dataset.action === "tutor-open") {
    state.tutor.collapsed = false;
    render();
    document.querySelector("[data-tutor-input]")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "classroom-narrate") {
    if (state.anam.status === "live" && state.anam.client) narrateClassroomInstruction();
    else if (tutorSpeaker.enabled && state.tutor.avatarState === "explaining") {
      tutorSpeaker.stop();
      state.tutor.avatarState = "idle";
    } else narrateClassroomInstruction({ browserFallback: true });
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
  if (action.dataset.action === "classroom-complete") {
    const moduleId = action.dataset.moduleId;
    if (!courseModules.some(({ id }) => id === moduleId)) return;
    state.completedModules.add(moduleId);
    state.activeModuleId = moduleId;
    state.tutor.avatarState = "celebrating";
    persistProgress();
    refreshLearningIsland();
    return;
  }
  if (action.dataset.action === "download-portfolio") {
    downloadPortfolio();
    return;
  }
  if (action.dataset.action === "toggle-glossary") {
    state.glossaryOpen = !state.glossaryOpen;
    refreshLearningIsland();
    return;
  }
  if (action.dataset.action === "study-close") {
    state.studySelectedId = "";
    state.studyDraftNote = "";
    refreshLearningIsland();
    return;
  }
  if (action.dataset.action === "study-more") {
    state.studyVisibleCount += 60;
    const root = action.closest("[data-learning-island]") || app;
    const results = root.querySelector("[data-study-results]");
    if (results) results.innerHTML = renderStudyResults();
    return;
  }
  if (action.dataset.action === "study-export") {
    void downloadStudyDatabase();
    return;
  }
  if (action.dataset.action === "study-delete-note") {
    if (!state.studyDb || !action.dataset.noteId) return;
    const db = state.studyDb;
    void db.deleteNote(action.dataset.noteId).then(async () => {
      if (state.studyDb !== db) return;
      state.studyNotes = await db.listNotes();
      state.studyDraftNote = "";
      refreshLearningIsland();
    }).catch(() => { state.studyDbWarning = "No se pudo eliminar la nota local."; refreshLearningIsland(); });
    return;
  }
  if (action.dataset.action === "complete-onboarding") {
    if (!state.onboardingDraft) return;
    persistOnboarding();
    refreshLearningIsland();
    document.querySelector("[data-testid='onboarding-complete']")?.focus({ preventScroll: true });
    return;
  }
  if (action.dataset.action === "reset-onboarding") {
    state.onboardingLevel = "";
    state.onboardingDraft = "";
    try { progressStorage?.removeItem("contaia.onboarding.v1"); } catch { /* Si el almacenamiento falla, queda en memoria. */ }
    refreshLearningIsland();
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
    refreshLearningIsland();
    return;
  }
  if (action.dataset.action === "hint" && stage !== "hint") return;
  if (action.dataset.action === "solution" && stage !== "example") return;
  if (action.dataset.action === "check") checkAnswer(exercise);
  if (action.dataset.action === "hint") state.hints.add(exercise.id);
  if (action.dataset.action === "solution") state.revealed.add(exercise.id);
  if (action.dataset.action === "hint" || action.dataset.action === "solution") refreshLearningIsland();
}

function handleLearningSubmit(event) {
  const studyForm = event.target.closest("[data-study-note-form]");
  if (!studyForm) return;
  event.preventDefault();
  if (!state.studyDb || !state.studySelectedId) return;
  state.studyDraftNote = studyForm.querySelector("[data-study-note]")?.value ?? state.studyDraftNote;
  const db = state.studyDb;
  void db.saveNote({ id: `note:${state.studySelectedId}`, itemId: state.studySelectedId, content: state.studyDraftNote, updatedAt: Date.now() }).then(async () => {
    if (state.studyDb !== db) return;
    state.studyNotes = await db.listNotes();
    refreshLearningIsland();
    document.querySelector("#study-note")?.focus({ preventScroll: true });
  }).catch(() => { state.studyDbWarning = "Escribe una nota breve para guardarla en la base local."; refreshLearningIsland(); });
}

function handleLearningToggle(event) {
  const moduleCard = event.target.closest?.("details[data-course-module]");
  if (!moduleCard) return;
  state.activeModuleId = moduleCard.dataset.courseModule;
  state.openCourseModuleId = moduleCard.open ? moduleCard.dataset.courseModule : "__none__";
  refreshTutorPanel();
}

function handleLearningInput(event) {
  if (event.target.matches("[data-study-search]")) {
    state.studyQuery = event.target.value;
    state.studyVisibleCount = 60;
    const root = event.target.closest("[data-learning-island]") || app;
    const results = root.querySelector("[data-study-results]");
    if (results) results.innerHTML = renderStudyResults();
    const count = root.querySelector(".study-browser .count-pill");
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
}

function handleLearningChange(event) {
  if (event.target.matches("[data-study-filter]")) {
    state.studyKind = event.target.value;
    state.studyVisibleCount = 60;
    const root = event.target.closest("[data-learning-island]") || app;
    const results = root.querySelector("[data-study-results]");
    if (results) results.innerHTML = renderStudyResults();
    const count = root.querySelector(".study-browser .count-pill");
    if (count) count.textContent = `${searchStudyItems(state.studyItems, state.studyQuery, state.studyKind).length} resultados`;
    return;
  }
  if (event.target.matches("[name='onboarding-level']")) {
    state.onboardingDraft = event.target.value;
    const button = event.target.closest("[data-learning-island]")?.querySelector("[data-action='complete-onboarding']");
    if (button) button.disabled = false;
    return;
  }
  if (event.target.matches("[data-choice]")) {
    state.selections.set(event.target.dataset.choice, event.target.value);
    const exercise = exercises.find((item) => item.id === event.target.dataset.choice);
    if (exercise) state.feedback.delete(exercise.id);
    refreshLearningIsland();
  }
}

function handleLearningEvent(type, event) {
  if (type === "click") handleLearningClick(event);
  else if (type === "submit") handleLearningSubmit(event);
  else if (type === "toggle") handleLearningToggle(event);
  else if (type === "input") handleLearningInput(event);
  else if (type === "change") handleLearningChange(event);
}

app.addEventListener("click", (event) => {
  if (event.target.closest?.("[data-learning-island]")) return;
  if (event.target.closest("[data-action='auth-close']") && !event.target.closest("[data-auth-panel]")) {
    authState.open = false;
    render();
    return;
  }
  const section = event.target.closest("[data-section]");
  if (section) {
    state.section = ["course", "lab", "study", "advisor", "cfdi", "reconciliation", "journal", "diot", "workpapers", "tools"].includes(section.dataset.section) ? section.dataset.section : "course";
    resetTutor(state.section === "lab" ? "home" : null);
    if (state.section === "lab") state.current = "home";
    if (state.section !== "tools") state.toolsNotice = "";
    render();
    if (state.section === "tools") void loadToolsWorkspace();
    document.querySelector("#contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const toolsUi = event.target.closest("[data-tools-ui]");
  if (toolsUi) {
    const action = toolsUi.dataset.toolsUi;
    if (action === "profile-new") openFiscalProfileForm();
    else if (action === "profile-edit") openFiscalProfileForm(toolsWorkspace.profiles.find((profile) => profile.id === toolsWorkspace.selectedProfileId) || null);
    else if (action === "connection-open") openToolConnectionForm(toolsUi.dataset.toolKey, toolsUi.dataset.toolEnvironment);
    else if (action === "cancel") closeToolsForms();
    else if (action === "refresh") void loadToolsWorkspace();
    else if (action === "premium-info") state.toolsNotice = "Premium aún está en preparación. No se activa ningún cobro ni entitlement desde esta vista; las capacidades efectivas se decidirán server-side.";
    else if (action === "premium-dismiss") state.toolsNotice = "Continúas con el plan Free. Tus archivos y resultados locales no cambian.";
    render();
    if (action === "profile-new" || action === "profile-edit") app.querySelector("[data-tools-profile-form] [name='legal_name']")?.focus({ preventScroll: true });
    if (action === "connection-open") app.querySelector("[data-tools-connection-form] [name='environment']")?.focus({ preventScroll: true });
    return;
  }
  const toolAction = event.target.closest("[data-tool-action]");
  if (toolAction) {
    const tool = toolAction.dataset.toolAction;
    if (tool === "cfdi") {
      state.section = "cfdi";
      state.toolsNotice = "";
    } else if (tool === "cfdi-ai") {
      state.section = "cfdi";
      state.toolsNotice = "El Asistente IA CFDI se habilita después de analizar un lote local.";
    } else if (tool === "reconciliation") {
      state.section = "reconciliation";
      state.toolsNotice = "";
    } else if (tool === "accounting") {
      state.section = "journal";
      state.toolsNotice = "";
    } else if (tool === "diot") {
      state.section = "diot";
      state.toolsNotice = "";
    } else if (tool === "workpapers") {
      state.section = "workpapers";
      state.toolsNotice = "";
    } else if (tool === "fiscal-profile") {
      state.section = "tools";
      state.toolsNotice = "";
      openFiscalProfileForm();
    } else {
      state.section = "tools";
      state.toolsNotice = "";
      openToolConnectionForm(tool);
    }
    render();
    if (state.section === "tools") (app.querySelector("[data-tools-profile-form] [name='legal_name']") || app.querySelector("[data-tools-connection-form] [name='environment']"))?.focus({ preventScroll: true });
    if (state.section === "tools" && !toolsWorkspace.loaded) void loadToolsWorkspace();
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
});

app.addEventListener("submit", (event) => {
  if (event.target.closest?.("[data-learning-island]")) return;
  const recoveryUpdateForm = event.target.closest("[data-recovery-update-form]");
  if (recoveryUpdateForm) {
    event.preventDefault();
    const formData = new FormData(recoveryUpdateForm);
    authState.recoveryPassword = String(formData.get("password") || "");
    authState.recoveryPasswordConfirmation = String(formData.get("passwordConfirmation") || "");
    void updatePassword();
    return;
  }
  const recoveryForm = event.target.closest("[data-recovery-form]");
  if (recoveryForm) {
    event.preventDefault();
    authState.identifier = String(new FormData(recoveryForm).get("email") || "").trim();
    void resetPassword();
    return;
  }
  const interestForm = event.target.closest("[data-interest-form]");
  if (interestForm) {
    event.preventDefault();
    const formData = new FormData(interestForm);
    const email = String(formData.get("email") || "").trim();
    const destination = String(formData.get("destino") || "");
    if (!email || !["cfdi", "asistente", "curso"].includes(destination)) return;
    try { sessionStorage.setItem("contaia.signup.prefill-email", email); } catch { /* Si el almacenamiento falla, el registro permite escribirlo manualmente. */ }
    const destinationLabels = { cfdi: "ContaIA Herramientas", asistente: "Nora · Asistente abierto", curso: "ContaIA Aprende" };
    const toast = interestForm.querySelector("[data-lead-toast]");
    const toastMessage = interestForm.querySelector("[data-lead-toast-message]");
    const submitButton = interestForm.querySelector(".public-lead-submit");
    if (toast && toastMessage && submitButton) {
      toastMessage.textContent = `Abriendo el registro para ${destinationLabels[destination]}…`;
      toast.hidden = false;
      toast.classList.remove("is-visible");
      requestAnimationFrame(() => toast.classList.add("is-visible"));
      submitButton.disabled = true;
      submitButton.innerHTML = 'Preparando tu ruta… <span aria-hidden="true">✓</span>';
    }
    window.setTimeout(() => window.location.assign(`/registro?destino=${encodeURIComponent(destination)}`), 1100);
    return;
  }
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
  const toolsProfileForm = event.target.closest("[data-tools-profile-form]");
  if (toolsProfileForm) {
    event.preventDefault();
    const formData = new FormData(toolsProfileForm);
    void saveFiscalProfile({
      legal_name: formData.get("legal_name"), rfc: formData.get("rfc"),
      tax_regime: formData.get("tax_regime"), fiscal_zip: formData.get("fiscal_zip"),
      fiscal_email: formData.get("fiscal_email"), phone: formData.get("phone"),
      active: formData.getAll("active").includes("true"),
    });
    return;
  }
  const toolsConnectionForm = event.target.closest("[data-tools-connection-form]");
  if (toolsConnectionForm) {
    event.preventDefault();
    const formData = new FormData(toolsConnectionForm);
    void saveToolConnection({ tool_key: formData.get("tool_key"), environment: formData.get("environment") });
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

app.addEventListener("input", (event) => {
  if (event.target.closest?.("[data-learning-island]")) return;
  if (event.target.matches("#auth-identifier")) {
    authState.identifier = event.target.value;
    return;
  }
});

app.addEventListener("change", (event) => {
  if (event.target.closest?.("[data-learning-island]")) return;
  if (event.target.matches("[data-tools-profile-select]")) {
    state.toolsNotice = "";
    void loadProfileConnections(event.target.value);
    return;
  }
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
});

render();
app.addEventListener("pointerup", rememberTutorPanelSize, { passive: true });
app.addEventListener("mouseup", rememberTutorPanelSize, { passive: true });
void initializeAuthClient().catch(() => {});
initializeTutorConfig();
initializeStudyDatabase();
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
document.addEventListener("contaia:tools-updated", () => {
  if (state.section === "tools") render();
});
document.addEventListener("contaia:auth-updated", (event) => {
  const userId = event.detail?.user?.id;
  const nextStorageScope = userId && /^[0-9a-f-]{20,}$/i.test(userId) ? userId : "anonymous";
  sourceCapabilityBroker.advanceSessionEpoch("auth-updated");
  pendingJournalHandoff = null;
  pendingJournalBankHandoff = null;
  pendingDiotHandoff = null;
  if (!userId || nextStorageScope !== activeStorageScope) {
    resetCfdiWorkspace();
    resetReconciliationWorkspace();
    resetJournalWorkspace();
    resetDiotWorkspace();
    resetWorkpapersWorkspace();
  }
  activeStorageScope = nextStorageScope;
  if (!userId) resetToolsWorkspace();
  else if (state.section === "tools") void loadToolsWorkspace();
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
