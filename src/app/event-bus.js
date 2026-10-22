const EVENT_PREFIX = "contaia:";
const MAX_DEPTH = 4;
const MAX_KEYS = 64;
const MAX_STRING_LENGTH = 2000;
const BLOCKED_KEYS = new Set([
  "xml", "rawxml", "rawXml", "file", "blob", "arraybuffer", "arrayBuffer", "documenttext", "documentText",
  "cfdicontext", "cfdiContext", "analysis", "sources", "rows", "movements", "bankrows", "bankRows", "drafts", "findings",
  "rfc", "amount", "amounts", "importe", "importes", "taxdetails", "taxDetails", "token", "accessToken", "refreshToken",
  "secret", "password", "credentials", "session", "supabaseSession", "fileName", "filename",
]);

function defaultTarget() {
  if (typeof document !== "undefined" && document?.addEventListener) return document;
  return new EventTarget();
}

function randomId(prefix = "event") {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}:${uuid}`;
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeName(name) {
  const value = String(name || "").trim();
  if (!value) throw new TypeError("El nombre del evento es obligatorio.");
  const normalized = value.startsWith(EVENT_PREFIX) ? value : `${EVENT_PREFIX}${value}`;
  if (!/^contaia:[a-z][a-z0-9]*(?::[a-z][a-z0-9-]*)+$/.test(normalized)) throw new TypeError(`Nombre de evento inválido: ${value}`);
  return normalized;
}

function blockedKey(key) {
  const normalized = String(key || "");
  return BLOCKED_KEYS.has(normalized) || /(?:xml|token|secret|password|credential|documenttext|cfdicontext|bankrow|movement|amount|importe|rfc|taxdetail)/i.test(normalized);
}

function inspectValue(value, depth, state, path) {
  if (depth > MAX_DEPTH) throw new EventPayloadError("El payload del evento excede la profundidad permitida.", path);
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new EventPayloadError("El payload contiene un número no finito.", path);
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) throw new EventPayloadError("El payload contiene una cadena demasiado larga.", path);
    return;
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new EventPayloadError("El payload contiene un tipo no permitido.", path);
  if (typeof File !== "undefined" && value instanceof File) throw new EventPayloadError("Los archivos no pueden viajar en eventos.", path);
  if (typeof Blob !== "undefined" && value instanceof Blob) throw new EventPayloadError("Los blobs no pueden viajar en eventos.", path);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) throw new EventPayloadError("Los buffers no pueden viajar en eventos.", path);
  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) throw new EventPayloadError("El payload contiene demasiados elementos.", path);
    value.forEach((entry, index) => inspectValue(entry, depth + 1, state, `${path}[${index}]`));
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new EventPayloadError("El payload debe contener objetos planos.", path);
  for (const [key, entry] of Object.entries(value)) {
    if (blockedKey(key)) throw new EventPayloadError(`La propiedad ${key} no puede viajar en eventos.`, `${path}.${key}`);
    state.keys += 1;
    if (state.keys > MAX_KEYS) throw new EventPayloadError("El payload contiene demasiadas propiedades.", path);
    inspectValue(entry, depth + 1, state, `${path}.${key}`);
  }
}

export class EventPayloadError extends Error {
  constructor(message, path = "detail") {
    super(message);
    this.name = "EventPayloadError";
    this.path = path;
  }
}

export function validateEventDetail(detail = {}) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) throw new EventPayloadError("El detalle del evento debe ser un objeto plano.");
  inspectValue(detail, 0, { keys: 0 }, "detail");
  return detail;
}

export function createEventBus(target = defaultTarget()) {
  if (!target?.addEventListener || !target?.dispatchEvent) throw new TypeError("El destino del bus debe implementar EventTarget.");
  const subscriptions = new Set();
  let closed = false;

  const emit = (name, detail = {}) => {
    if (closed) return "";
    const eventName = normalizeName(name);
    validateEventDetail(detail);
    const payload = Object.freeze({
      eventVersion: 1,
      eventId: randomId("event"),
      emittedAt: new Date().toISOString(),
      ...detail,
    });
    target.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
    return payload.eventId;
  };

  const on = (name, handler, { signal } = {}) => {
    if (closed) return () => {};
    if (typeof handler !== "function") throw new TypeError("El listener del bus debe ser una función.");
    const eventName = normalizeName(name);
    const listener = (event) => handler(event.detail, event);
    target.addEventListener(eventName, listener, signal ? { signal } : undefined);
    const unsubscribe = () => {
      target.removeEventListener(eventName, listener);
      subscriptions.delete(unsubscribe);
    };
    subscriptions.add(unsubscribe);
    if (signal) {
      if (signal.aborted) unsubscribe();
      else signal.addEventListener("abort", unsubscribe, { once: true });
    }
    return unsubscribe;
  };

  const once = (name, handler, options = {}) => {
    let unsubscribe = () => {};
    unsubscribe = on(name, (detail, event) => { unsubscribe(); handler(detail, event); }, options);
    return unsubscribe;
  };

  return {
    emit,
    on,
    once,
    get closed() { return closed; },
    close() { if (closed) return; closed = true; for (const unsubscribe of [...subscriptions]) unsubscribe(); subscriptions.clear(); },
  };
}

export const __test = { normalizeName, blockedKey, randomId };
