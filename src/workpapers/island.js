import { createCleanupScope } from "../app/cleanup-scope.js";
import { bindWorkpapersWorkspace, renderWorkpapersWorkspace, resetWorkpapersWorkspace, workpapersState } from "./workspace.js";

export async function mountIsland({ host, islandId = "workpapers", session = {}, signal } = {}) {
  if (!host?.replaceChildren) throw new TypeError("La isla de Papeles de trabajo necesita un host DOM.");
  const scope = createCleanupScope({ islandId, sessionEpoch: session.epoch ?? 0 });
  const localAbort = scope.addAbortController();
  let destroyed = false;

  if (signal?.addEventListener) {
    const forwardAbort = () => localAbort.abort(signal.reason || "island-transition");
    signal.addEventListener("abort", forwardAbort, { once: true });
    scope.add(() => signal.removeEventListener("abort", forwardAbort));
  }

  const render = () => {
    if (destroyed || localAbort.signal.aborted) return;
    host.innerHTML = renderWorkpapersWorkspace();
  };

  bindWorkpapersWorkspace(host, { onUpdate: render, cleanupScope: scope });
  scope.add(() => resetWorkpapersWorkspace());
  scope.add(() => host.replaceChildren());
  render();

  return {
    update() {
      if (!destroyed && !localAbort.signal.aborted) render();
    },
    async destroy(reason = "navigation") {
      if (destroyed) return [];
      destroyed = true;
      const errors = await scope.run(reason);
      resetWorkpapersWorkspace();
      host.replaceChildren();
      return errors;
    },
    get sessionEpoch() { return session.epoch ?? 0; },
    get demoPeriod() { return workpapersState.periodId; },
  };
}
