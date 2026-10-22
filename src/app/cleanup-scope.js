function safeCall(disposer, errors) {
  try {
    const result = disposer();
    return result && typeof result.then === "function" ? result.catch((error) => { errors.push(error); }) : undefined;
  } catch (error) {
    errors.push(error);
    return undefined;
  }
}

function clearContainer(value) {
  if (!value) return;
  if (Array.isArray(value)) { value.length = 0; return; }
  if (value instanceof Map || value instanceof Set) { value.clear(); return; }
  if (typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = null;
  }
}

export class CleanupScope {
  constructor({ islandId = "unknown", sessionEpoch = 0, onError = () => {} } = {}) {
    this.islandId = islandId;
    this.sessionEpoch = sessionEpoch;
    this.onError = onError;
    this.disposers = new Set();
    this.controllers = new Set();
    this.finished = false;
    this.running = null;
  }

  add(disposer) {
    if (typeof disposer !== "function") throw new TypeError("El disposer debe ser una función.");
    if (this.finished) {
      safeCall(disposer, []);
      return disposer;
    }
    this.disposers.add(disposer);
    return disposer;
  }

  addAbortController(controller = new AbortController()) {
    if (!controller?.abort) throw new TypeError("Se esperaba un AbortController.");
    this.controllers.add(controller);
    this.add(() => {
      if (!controller.signal.aborted) controller.abort(`island-destroyed:${this.islandId}`);
      this.controllers.delete(controller);
    });
    return controller;
  }

  addEventListener(target, type, handler, options = {}) {
    if (!target?.addEventListener) throw new TypeError("El destino no implementa addEventListener.");
    const controller = options.signal ? null : this.addAbortController();
    const effectiveOptions = controller ? { ...options, signal: controller.signal } : options;
    target.addEventListener(type, handler, effectiveOptions);
    return this.add(() => target.removeEventListener(type, handler, effectiveOptions));
  }

  addTimeout(callback, delay = 0) {
    const timer = setTimeout(callback, delay);
    return this.add(() => clearTimeout(timer));
  }

  addInterval(callback, delay = 0) {
    const timer = setInterval(callback, delay);
    return this.add(() => clearInterval(timer));
  }

  addAnimationFrame(callback) {
    if (typeof requestAnimationFrame !== "function") return this.add(() => {});
    const frame = requestAnimationFrame(callback);
    return this.add(() => cancelAnimationFrame(frame));
  }

  addObserver(observer) {
    if (!observer?.disconnect) throw new TypeError("El observer debe implementar disconnect().");
    return this.add(() => observer.disconnect());
  }

  addObjectUrl(url) {
    if (!url) return () => {};
    return this.add(() => {
      if (typeof URL?.revokeObjectURL === "function") URL.revokeObjectURL(url);
    });
  }

  addWorker(worker) {
    if (!worker?.terminate) throw new TypeError("El worker debe implementar terminate().");
    return this.add(() => worker.terminate());
  }

  addMediaStream(stream) {
    return this.add(() => {
      for (const track of stream?.getTracks?.() || []) track.stop();
    });
  }

  addSensitiveState(state, keys = Object.keys(state || {})) {
    return this.add(() => {
      for (const key of keys) {
        const value = state?.[key];
        clearContainer(value);
        if (state && Object.hasOwn(state, key)) state[key] = Array.isArray(value) ? [] : value instanceof Map ? new Map() : value instanceof Set ? new Set() : null;
      }
    });
  }

  async run(reason = "destroy") {
    if (this.running) return this.running;
    if (this.finished) return [];
    this.finished = true;
    this.running = (async () => {
      const errors = [];
      for (const controller of [...this.controllers]) {
        try { if (!controller.signal.aborted) controller.abort(`destroy:${reason}`); } catch (error) { errors.push(error); }
      }
      const disposers = [...this.disposers].reverse();
      for (const disposer of disposers) {
        const result = safeCall(disposer, errors);
        if (result) await result;
      }
      this.disposers.clear();
      this.controllers.clear();
      for (const error of errors) {
        try { this.onError(error, { islandId: this.islandId, reason }); } catch { /* El error de diagnóstico no interrumpe la limpieza. */ }
      }
      return errors;
    })();
    return this.running;
  }
}

export function createCleanupScope(options = {}) {
  return new CleanupScope(options);
}

export function clearSensitiveState(state, keys = Object.keys(state || {})) {
  const scope = new CleanupScope();
  scope.addSensitiveState(state, keys);
  return scope.run("manual-clear");
}
