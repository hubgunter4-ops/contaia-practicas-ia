import { createCleanupScope } from "../app/cleanup-scope.js";
import {
  activateCfdiIsland,
  bindCfdiWorkspace,
  disposeCfdiIsland,
  initializeCfdiWorkspace,
  renderCfdiWorkspace,
} from "./workspace.js";
import { buildCfdiSourceSnapshot } from "../app/source-capabilities.js";
import { createCfdiAiOrchestrator } from "./ai/cfdi-ai-orchestrator.js";
import { createCfdiToolRegistry } from "./ai/cfdi-tools.js";

function abortError(reason = "island-transition") {
  if (reason instanceof Error) return reason;
  return typeof DOMException === "function" ? new DOMException(String(reason), "AbortError") : new Error(String(reason));
}

export async function mountIsland({ host, islandId = "cfdi", session = {}, signal, capabilities = {} } = {}) {
  if (!host?.replaceChildren) throw new TypeError("La isla CFDI necesita un host DOM.");
  const scope = createCleanupScope({ islandId, sessionEpoch: session.epoch ?? 0 });
  const localAbort = scope.addAbortController();
  let destroyed = false;

  if (signal?.addEventListener) {
    const forwardAbort = () => localAbort.abort(signal.reason || "island-transition");
    signal.addEventListener("abort", forwardAbort, { once: true });
    scope.add(() => signal.removeEventListener("abort", forwardAbort));
  }

  const onAskNora = typeof capabilities.onAskNora === "function" ? capabilities.onAskNora : () => {};
  const onHandoffSources = typeof capabilities.onHandoffSources === "function" ? capabilities.onHandoffSources : () => {};
  const getAnalysis = typeof capabilities.getAnalysis === "function" ? capabilities.getAnalysis : () => null;
  const plannerAdapter = typeof capabilities.onCfdiPlanner === "function" ? capabilities.onCfdiPlanner : null;
  const toolRegistry = createCfdiToolRegistry({
    getAnalysis: (analysisRef) => analysisRef === "analysis:current" ? getAnalysis() : null,
  });
  const aiOrchestrator = createCfdiAiOrchestrator({
    toolRegistry,
    epochProvider: () => session.epoch ?? 0,
    cleanupScope: scope,
    explainAdapter: ({ safeContext, message }) => onAskNora(safeContext, message),
    plannerAdapter,
  });
  scope.add(() => toolRegistry.dispose());
  const render = () => {
    if (destroyed || localAbort.signal.aborted) return;
    host.innerHTML = renderCfdiWorkspace();
  };

  activateCfdiIsland();
  const unregisterSourceProvider = typeof capabilities.registerSourceProvider === "function"
    ? capabilities.registerSourceProvider("cfdi", ({ target, sourceIds }) => buildCfdiSourceSnapshot(getAnalysis(), target, { sourceIds }))
    : null;
  if (unregisterSourceProvider) scope.add(unregisterSourceProvider);
  bindCfdiWorkspace(host, {
    onUpdate: render,
    onAskNora,
    onHandoffSources,
    cleanupScope: scope,
    onRunLocalAi: (request) => aiOrchestrator.run({ ...request, sessionEpoch: session.epoch ?? 0 }),
    onExplainSafe: (request) => aiOrchestrator.explain({ ...request, sessionEpoch: session.epoch ?? 0 }),
  });
  scope.add(() => disposeCfdiIsland());
  scope.add(() => host.replaceChildren());
  render();

  try {
    await initializeCfdiWorkspace({ signal, hydrate: true });
    if (signal?.aborted || localAbort.signal.aborted) throw abortError(signal.reason || localAbort.signal.reason);
    render();
  } catch (error) {
    await scope.run("mount-failed");
    throw error;
  }

  return {
    update() {
      if (destroyed || localAbort.signal.aborted) return;
      render();
    },
    async destroy(reason = "navigation") {
      if (destroyed) return [];
      destroyed = true;
      const errors = await scope.run(reason);
      // The disposer clears parsed XML, queued Files and saved run snapshots.
      disposeCfdiIsland();
      host.replaceChildren();
      return errors;
    },
  };
}
