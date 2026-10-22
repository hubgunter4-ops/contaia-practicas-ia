import { createEventBus } from "./event-bus.js";

function safeErrorCode(error) {
  return error?.name || "IslandError";
}

function validTarget(target) {
  return /^[a-z][a-z0-9-]*$/.test(String(target || ""));
}

export function createIslandManager({ host, registry, bus = createEventBus(), initialSessionEpoch = 0, capabilitiesFor = () => ({}) } = {}) {
  if (!host?.replaceChildren) throw new TypeError("IslandManager necesita un host DOM o EventTarget compatible.");
  if (!registry?.load || !registry?.has) throw new TypeError("IslandManager necesita un IslandRegistry.");

  let active = null;
  let sessionEpoch = Number.isInteger(initialSessionEpoch) ? initialSessionEpoch : 0;
  let transitionId = 0;
  let transition = null;
  let clearPromise = null;
  let destroyAllPromise = null;

  const emit = (name, detail = {}) => bus.emit(name, { sourceIsland: "shell", sessionEpoch, ...detail });

  async function destroyActive(reason = "navigation") {
    const previous = active;
    if (!previous) {
      host.replaceChildren();
      return [];
    }
    active = null;
    emit("island:before-unmount", { islandId: previous.islandId, mountId: previous.mountId, reason, hardClear: reason !== "navigation" });
    let errors = [];
    try {
      const result = await previous.instance?.destroy?.(reason);
      if (Array.isArray(result)) errors = result;
    } catch (error) {
      errors = [error];
    }
    host.replaceChildren();
    emit("island:destroyed", { islandId: previous.islandId, mountId: previous.mountId, reason, cleanupErrorCount: errors.length });
    return errors;
  }

  async function navigate(target, meta = {}) {
    const islandId = String(target || "").trim();
    if (!validTarget(islandId) || !registry.has(islandId)) throw new Error(`Ruta de isla no válida: ${islandId}`);
    if (active?.islandId === islandId && !meta.force) return active.instance;

    transition?.controller.abort("superseded-navigation");
    const controller = new AbortController();
    const currentTransitionId = ++transitionId;
    transition = { controller, target: islandId, transitionId: currentTransitionId };

    await destroyActive(meta.reason || "navigation");
    if (controller.signal.aborted || currentTransitionId !== transitionId) return null;

    let islandModule;
    try {
      islandModule = await registry.load(islandId);
    } catch (error) {
      host.replaceChildren();
      emit("island:mount-failed", { islandId, reason: "load", errorCode: safeErrorCode(error) });
      throw error;
    }
    if (controller.signal.aborted || currentTransitionId !== transitionId) return null;

    const mountId = globalThis.crypto?.randomUUID?.() || `mount:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    let instance;
    try {
      instance = await islandModule.mountIsland({
        host,
        islandId,
        mountId,
        session: { epoch: sessionEpoch },
        bus,
        capabilities: capabilitiesFor(islandId, { sessionEpoch }),
        signal: controller.signal,
      });
    } catch (error) {
      host.replaceChildren();
      emit("island:mount-failed", { islandId, reason: "mount", errorCode: safeErrorCode(error) });
      throw error;
    }
    if (controller.signal.aborted || currentTransitionId !== transitionId) {
      await instance?.destroy?.("superseded-navigation");
      host.replaceChildren();
      return null;
    }
    if (!instance || typeof instance.destroy !== "function") throw new TypeError(`La isla ${islandId} debe devolver destroy().`);
    active = { islandId, mountId, instance, transitionId: currentTransitionId };
    emit("island:mounted", { islandId, mountId, reason: meta.reason || "navigation" });
    return instance;
  }

  function destroyAll({ reason = "session-change", hardClear = true } = {}) {
    if (destroyAllPromise) return destroyAllPromise;
    destroyAllPromise = (async () => {
      transition?.controller.abort(`destroy-all:${reason}`);
      transition = null;
      transitionId += 1;
      const previous = active;
      if (previous) {
        active = null;
        emit("island:before-unmount", { islandId: previous.islandId, mountId: previous.mountId, reason, hardClear });
        try { await previous.instance?.destroy?.(reason); } catch { /* Se continúa con la limpieza del host. */ }
        host.replaceChildren();
        emit("island:destroyed", { islandId: previous.islandId, mountId: previous.mountId, reason, hardClear, cleanupErrorCount: 0 });
      } else {
        host.replaceChildren();
      }
    })().finally(() => { destroyAllPromise = null; });
    return destroyAllPromise;
  }

  function advanceSessionEpoch(reason = "session-change") {
    const previousSessionEpoch = sessionEpoch;
    sessionEpoch += 1;
    emit("session:epoch-changed", { previousSessionEpoch, sessionEpoch, reason });
    return sessionEpoch;
  }

  async function clearSession(reason = "auth-signout") {
    if (clearPromise) return clearPromise;
    const previousSessionEpoch = sessionEpoch;
    sessionEpoch += 1;
    emit("session:will-clear", { previousSessionEpoch, sessionEpoch, reason, hardClear: true });
    clearPromise = destroyAll({ reason, hardClear: true }).finally(() => {
      emit("session:cleared", { previousSessionEpoch, sessionEpoch, reason, hardClear: true });
      clearPromise = null;
    });
    return clearPromise;
  }

  const unsubscribeNavigation = bus.on("navigation:request", (detail) => {
    if (!detail?.target) return;
    void navigate(detail.target, detail);
  });
  const unsubscribeSession = bus.on("session:will-clear", (detail) => {
    void destroyAll({ reason: detail?.reason || "session-change", hardClear: true });
  });

  return {
    get active() { return active ? { islandId: active.islandId, mountId: active.mountId } : null; },
    get sessionEpoch() { return sessionEpoch; },
    get transitionId() { return transitionId; },
    update(nextProps = {}) {
      if (!active?.instance?.update) return false;
      active.instance.update(nextProps);
      return true;
    },
    navigate,
    destroyActive,
    destroyAll,
    advanceSessionEpoch,
    clearSession,
    dispose() {
      unsubscribeNavigation();
      unsubscribeSession();
      transition?.controller.abort("manager-disposed");
      transition = null;
    },
  };
}
