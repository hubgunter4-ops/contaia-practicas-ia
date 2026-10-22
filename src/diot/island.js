import { createCleanupScope } from "../app/cleanup-scope.js";
import {
  acceptCfdiHandoff,
  bindDiotWorkspace,
  renderDiotWorkspace,
  resetDiotWorkspace,
  diotState,
} from "./workspace.js";

function abortError(reason = "island-transition") {
  if (reason instanceof Error) return reason;
  return typeof DOMException === "function" ? new DOMException(String(reason), "AbortError") : new Error(String(reason));
}

export async function mountIsland({ host, islandId = "diot", session = {}, signal, capabilities = {} } = {}) {
  if (!host?.replaceChildren) throw new TypeError("La isla DIOT necesita un host DOM.");
  const scope = createCleanupScope({ islandId, sessionEpoch: session.epoch ?? 0 });
  const localAbort = scope.addAbortController();
  let destroyed = false;

  if (signal?.addEventListener) {
    const forwardAbort = () => localAbort.abort(signal.reason || "island-transition");
    signal.addEventListener("abort", forwardAbort, { once: true });
    scope.add(() => signal.removeEventListener("abort", forwardAbort));
  }

  const onAssistantSend = typeof capabilities.onAssistantSend === "function" ? capabilities.onAssistantSend : () => {};
  const onAssistantCancel = typeof capabilities.onAssistantCancel === "function" ? capabilities.onAssistantCancel : () => {};
  const render = () => {
    if (destroyed || localAbort.signal.aborted) return;
    host.innerHTML = renderDiotWorkspace();
  };

  try {
    const handoff = typeof capabilities.consumeCfdiHandoff === "function" ? capabilities.consumeCfdiHandoff() : null;
    if (handoff && !acceptCfdiHandoff(handoff)) {
      diotState.error = "La entrega CFDI no es válida para DIOT; selecciona las fuentes desde CFDI otra vez.";
    }
  } catch (error) {
    diotState.error = error instanceof Error ? error.message : "La capacidad CFDI expiró antes de montar DIOT.";
  }

  bindDiotWorkspace(host, {
    onUpdate: render,
    onAssistantSend,
    onAssistantCancel,
    cleanupScope: scope,
  });
  scope.add(() => resetDiotWorkspace());
  scope.add(() => host.replaceChildren());
  render();

  if (signal?.aborted || localAbort.signal.aborted) {
    await scope.run("mount-aborted");
    throw abortError(signal?.reason || localAbort.signal.reason);
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
      resetDiotWorkspace();
      host.replaceChildren();
      return errors;
    },
  };
}
