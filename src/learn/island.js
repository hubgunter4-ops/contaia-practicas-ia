import { createCleanupScope } from "../app/cleanup-scope.js";

function abortError(reason = "island-transition") {
  if (reason instanceof Error) return reason;
  return typeof DOMException === "function" ? new DOMException(String(reason), "AbortError") : new Error(String(reason));
}

export async function mountIsland({ host, islandId = "course", session = {}, signal, capabilities = {} } = {}) {
  if (!host?.replaceChildren) throw new TypeError("La isla educativa necesita un host DOM.");
  const scope = createCleanupScope({ islandId, sessionEpoch: session.epoch ?? 0 });
  const localAbort = scope.addAbortController();
  let destroyed = false;
  const renderContent = typeof capabilities.renderContent === "function" ? capabilities.renderContent : () => "";
  const onEvent = typeof capabilities.onEvent === "function" ? capabilities.onEvent : () => {};
  const onDestroy = typeof capabilities.onDestroy === "function" ? capabilities.onDestroy : () => {};

  if (signal?.addEventListener) {
    const forwardAbort = () => localAbort.abort(signal.reason || "island-transition");
    signal.addEventListener("abort", forwardAbort, { once: true });
    scope.add(() => signal.removeEventListener("abort", forwardAbort));
  }

  const render = () => {
    if (destroyed || localAbort.signal.aborted) return;
    host.innerHTML = `<div data-learning-island>${renderContent()}</div>`;
  };
  const delegate = (type, event) => {
    if (destroyed || localAbort.signal.aborted) return;
    event.stopPropagation();
    onEvent(type, event);
  };

  scope.addEventListener(host, "click", (event) => delegate("click", event));
  scope.addEventListener(host, "submit", (event) => delegate("submit", event));
  scope.addEventListener(host, "toggle", (event) => delegate("toggle", event), { capture: true });
  scope.addEventListener(host, "input", (event) => delegate("input", event));
  scope.addEventListener(host, "change", (event) => delegate("change", event));
  scope.add(() => onDestroy("island-destroyed"));
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
      host.replaceChildren();
      return errors;
    },
  };
}
