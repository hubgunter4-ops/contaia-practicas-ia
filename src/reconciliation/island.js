import { createCleanupScope } from "../app/cleanup-scope.js";
import {
  bindReconciliationWorkspace,
  reconciliationState,
  renderReconciliationWorkspace,
  resetReconciliationWorkspace,
} from "./workspace.js";
import { buildBankSourceSnapshot } from "../app/source-capabilities.js";

export async function mountIsland({ host, islandId = "reconciliation", session = {}, signal, capabilities = {} } = {}) {
  if (!host?.replaceChildren) throw new TypeError("La isla de Conciliación necesita un host DOM.");
  const scope = createCleanupScope({ islandId, sessionEpoch: session.epoch ?? 0 });
  const localAbort = scope.addAbortController();
  let destroyed = false;

  if (signal?.addEventListener) {
    const forwardAbort = () => localAbort.abort(signal.reason || "island-transition");
    signal.addEventListener("abort", forwardAbort, { once: true });
    scope.add(() => signal.removeEventListener("abort", forwardAbort));
  }

  const getAnalysis = typeof capabilities.getAnalysis === "function" ? capabilities.getAnalysis : () => null;
  const onHandoffSources = typeof capabilities.onHandoffSources === "function" ? capabilities.onHandoffSources : () => {};
  const render = () => {
    if (destroyed || localAbort.signal.aborted) return;
    host.innerHTML = renderReconciliationWorkspace({ analysis: getAnalysis() });
  };

  bindReconciliationWorkspace(host, {
    getAnalysis,
    onUpdate: render,
    onHandoffSources,
    cleanupScope: scope,
  });
  const unregisterSourceProvider = typeof capabilities.registerSourceProvider === "function"
    ? capabilities.registerSourceProvider("reconciliation", ({ target, sourceIds }) => buildBankSourceSnapshot(reconciliationState.movements, target, { sourceIds }))
    : null;
  if (unregisterSourceProvider) scope.add(unregisterSourceProvider);
  scope.add(() => resetReconciliationWorkspace());
  scope.add(() => host.replaceChildren());
  render();

  return {
    update(nextProps = {}) {
      if (destroyed || localAbort.signal.aborted) return;
      if (typeof nextProps.getAnalysis === "function") nextProps.getAnalysis();
      render();
    },
    async destroy(reason = "navigation") {
      if (destroyed) return [];
      destroyed = true;
      const errors = await scope.run(reason);
      // `resetReconciliationWorkspace` is also registered in the scope; this call
      // guarantees cancellation if a future disposer exits early.
      resetReconciliationWorkspace();
      host.replaceChildren();
      return errors;
    },
    get sessionEpoch() { return session.epoch ?? 0; },
    get fileCount() { return Array.isArray(reconciliationState.rawRows) ? reconciliationState.rawRows.length : 0; },
  };
}
