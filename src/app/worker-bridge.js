const WORKER_URLS = Object.freeze({
  cfdi: new URL("../workers/cfdi-parser.worker.js", import.meta.url),
  reconciliation: new URL("../workers/reconciliation-parser.worker.js", import.meta.url),
});

function randomId(prefix = "job") {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}:${uuid}` : `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function abortError(reason = "Operación cancelada.") {
  const error = new Error(String(reason));
  error.name = "AbortError";
  return error;
}

export class WorkerBridgeError extends Error {
  constructor(message, code = "worker_error") {
    super(message);
    this.name = "WorkerBridgeError";
    this.code = code;
  }
}

export class SessionExpiredError extends WorkerBridgeError {
  constructor() { super("La sesión local cambió antes de terminar el análisis.", "session_expired"); }
}

function isPlainObject(value) {
  const prototype = value && typeof value === "object" ? Object.getPrototypeOf(value) : null;
  return prototype === Object.prototype || prototype === null;
}

function assertWorkerPayload(value, path = "payload", depth = 0) {
  if (depth > 5) throw new WorkerBridgeError("El payload del Worker es demasiado profundo.", "payload_invalid");
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (value instanceof ArrayBuffer) return;
  if (typeof File !== "undefined" && value instanceof File) throw new WorkerBridgeError("No se envían objetos File al Worker; se transfieren buffers.", "payload_file");
  if (typeof Blob !== "undefined" && value instanceof Blob) throw new WorkerBridgeError("No se envían objetos Blob al Worker.", "payload_blob");
  if (Array.isArray(value)) { value.forEach((item, index) => assertWorkerPayload(item, `${path}[${index}]`, depth + 1)); return; }
  if (!isPlainObject(value)) throw new WorkerBridgeError(`Tipo no permitido en ${path}.`, "payload_invalid");
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:xml|rawXml|documentText|cfdiContext|token|secret|password|rfc|supabaseSession)$/i.test(key)) throw new WorkerBridgeError(`El campo ${key} no se envía al WorkerBridge.`, "payload_sensitive");
    assertWorkerPayload(item, `${path}.${key}`, depth + 1);
  }
}

function assertTransferables(transfer = []) {
  for (const item of transfer) if (!(item instanceof ArrayBuffer)) throw new WorkerBridgeError("Solo se pueden transferir ArrayBuffer al Worker.", "transfer_invalid");
  return transfer;
}

function defaultWorkerFactory(url, options) {
  if (typeof Worker !== "function") throw new WorkerBridgeError("Este navegador no admite Web Workers para el análisis local.", "worker_unavailable");
  return new Worker(url, options);
}

function safeWorkerMessage(message) {
  const text = String(message || "El Worker no pudo analizar el archivo.").replace(/[\u0000-\u001f]/g, " ").trim();
  return text.slice(0, 300) || "El Worker no pudo analizar el archivo.";
}

export function createWorkerBridge({
  workerFactory = defaultWorkerFactory,
  workerUrls = WORKER_URLS,
  epochProvider = () => 0,
} = {}) {
  const pending = new Map();
  let closed = false;

  function run(kind, payload, { signal, sessionEpoch = epochProvider(), transfer = [], onProgress = () => {} } = {}) {
    if (closed) return Promise.reject(new WorkerBridgeError("El WorkerBridge ya fue cerrado.", "bridge_closed"));
    if (!workerUrls[kind]) return Promise.reject(new WorkerBridgeError(`No existe un Worker local para ${kind}.`, "worker_unknown"));
    if (signal?.aborted) return Promise.reject(abortError(signal.reason || "Operación cancelada."));
    let transferables;
    try {
      assertWorkerPayload(payload);
      transferables = assertTransferables(transfer);
    } catch (error) {
      return Promise.reject(error);
    }
    const requestId = randomId("parse");
    let worker;
    try { worker = workerFactory(workerUrls[kind], { type: "module", name: `contaia-${kind}-parser` }); }
    catch (error) { return Promise.reject(error instanceof Error ? error : new WorkerBridgeError("No se pudo iniciar el Worker local.")); }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        pending.delete(requestId);
        signal?.removeEventListener("abort", abort);
        try { worker.terminate?.(); } catch { /* La terminación es best effort. */ }
        callback(value);
      };
      const abort = () => finish(reject, abortError(signal.reason || "Operación cancelada."));
      const onMessage = (event) => {
        const message = event?.data || {};
        if (message.requestId !== requestId) return;
        if (message.type === "progress") {
          if (message.progress && Number.isFinite(message.progress.processed) && Number.isFinite(message.progress.total)) {
            onProgress({ processed: message.progress.processed, total: message.progress.total });
          }
          return;
        }
        if (message.type === "error") {
          finish(reject, new WorkerBridgeError(safeWorkerMessage(message.errorMessage), message.errorCode || "parse_error"));
          return;
        }
        if (message.type !== "result") return;
        if (Number(epochProvider()) !== Number(sessionEpoch)) { finish(reject, new SessionExpiredError()); return; }
        finish(resolve, message.result);
      };
      const onError = () => finish(reject, new WorkerBridgeError("El análisis local se interrumpió. El archivo no salió del navegador.", "worker_runtime"));
      const onMessageError = () => finish(reject, new WorkerBridgeError("El resultado local no pudo transferirse de forma segura.", "worker_message"));
      worker.onmessage = onMessage;
      worker.onerror = onError;
      worker.onmessageerror = onMessageError;
      pending.set(requestId, { abort, worker });
      if (signal) {
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) { abort(); return; }
      }
      try {
        worker.postMessage({ type: "parse", requestId, sessionEpoch, payload }, transferables);
      } catch (error) {
        finish(reject, error instanceof Error ? error : new WorkerBridgeError("No se pudo entregar el buffer al Worker."));
      }
    });
  }

  function cancelAll(reason = "workspace-reset") {
    for (const job of [...pending.values()]) job.abort(reason);
  }

  return {
    run,
    cancelAll,
    dispose() { if (closed) return; closed = true; cancelAll("bridge-disposed"); },
    get pendingCount() { return pending.size; },
  };
}

export const __test = { assertWorkerPayload, assertTransferables, safeWorkerMessage, WORKER_URLS };
