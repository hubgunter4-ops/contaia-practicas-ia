import { createCleanupScope } from "../app/cleanup-scope.js";
import {
  acceptBankHandoff,
  acceptCfdiHandoff,
  bindJournalWorkspace,
  journalState,
  renderJournalWorkspace,
  resetJournalWorkspace,
} from "./workspace.js";

function abortError(reason = "island-transition") {
  if (reason instanceof Error) return reason;
  return typeof DOMException === "function" ? new DOMException(String(reason), "AbortError") : new Error(String(reason));
}

export async function mountIsland({ host, islandId = "journal", session = {}, signal, capabilities = {} } = {}) {
  if (!host?.replaceChildren) throw new TypeError("La isla de Pólizas necesita un host DOM.");
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
    host.innerHTML = renderJournalWorkspace();
  };

  try {
    const handoff = typeof capabilities.consumeSourceHandoff === "function" ? capabilities.consumeSourceHandoff() : null;
    if (handoff && !acceptCfdiHandoff(handoff)) {
      journalState.error = "La entrega CFDI no es válida para Pólizas; selecciona las fuentes desde CFDI otra vez.";
    }
    const bankHandoff = typeof capabilities.consumeBankHandoff === "function" ? capabilities.consumeBankHandoff() : null;
    if (bankHandoff && !acceptBankHandoff(bankHandoff)) {
      journalState.error = "La selección bancaria no es válida para Pólizas; vuelve a solicitarla desde Conciliación.";
    }
  } catch (error) {
    journalState.error = error instanceof Error ? error.message : "La capacidad CFDI expiró antes de montar Pólizas.";
  }

  bindJournalWorkspace(host, {
    onUpdate: render,
    onAssistantSend,
    onAssistantCancel,
    cleanupScope: scope,
  });
  scope.add(() => resetJournalWorkspace());
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
      resetJournalWorkspace();
      host.replaceChildren();
      return errors;
    },
  };
}
