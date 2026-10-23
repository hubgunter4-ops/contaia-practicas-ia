const APPROVAL_VERSION = "ai-model-approval-v1";
const ALLOWED_PROVIDERS = new Set(["openai", "anthropic"]);
const ALLOWED_STATUSES = new Set(["approved", "candidate", "rejected", "deprecated", "superseded"]);
const REQUIRED_CAPABILITIES = ["json_schema_strict", "structured_output", "abort_signal"];
const REQUIRED_CONTROLS = ["no_prompt_logging_by_default", "configured_retention_policy", "bounded_output"];
const TOP_LEVEL_KEYS = new Set(["version", "entries"]);
const ENTRY_KEYS = new Set(["provider", "model", "status", "capabilities", "controls", "retention", "approval"]);
const APPROVAL_KEYS = new Set(["reviewedBy", "reviewedAt", "expiresAt", "evidenceRef"]);
const RETENTION_KEYS = new Set(["promptLogging", "training", "maxDays"]);

export const AI_MODEL_APPROVAL_CONTRACT_VERSION = APPROVAL_VERSION;

export class ModelApprovalError extends Error {
  constructor(message = "El modelo de IA no está aprobado para uso remoto.", options = {}) {
    super(message);
    this.name = "ModelApprovalError";
    this.code = options.code || "ai_provider_unapproved";
    this.status = options.status || 503;
    this.reason = options.reason || "unapproved";
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw new ModelApprovalError(`La matriz ${label} no tiene un formato válido.`, { reason: "invalid_matrix" });
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ModelApprovalError(`La matriz ${label} contiene un campo no permitido.`, { reason: "invalid_matrix" });
    }
  }
}

function safeText(value, label, { pattern = /^[a-z0-9._:/-]+$/i, max = 160 } = {}) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !pattern.test(value)) {
    throw new ModelApprovalError(`La matriz ${label} no tiene un valor seguro.`, { reason: "invalid_matrix" });
  }
  return value;
}

function isoDate(value, label, now, { future = false } = {}) {
  const text = safeText(value, label, { pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, max: 30 });
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || (future && timestamp <= now)) {
    throw new ModelApprovalError(`La matriz ${label} no contiene una fecha válida.`, { reason: "invalid_matrix" });
  }
  return text;
}

function booleanMap(value, keys, label) {
  assertKeys(value, new Set(keys), label);
  return Object.freeze(Object.fromEntries(keys.map((key) => {
    if (value[key] !== true) throw new ModelApprovalError(`La matriz requiere ${label}.${key}.`, { reason: "insufficient_capability" });
    return [key, true];
  })));
}

function validateEntry(raw, now) {
  assertKeys(raw, ENTRY_KEYS, "la entrada");
  const provider = safeText(raw.provider, "provider", { pattern: /^(openai|anthropic)$/ });
  if (!ALLOWED_PROVIDERS.has(provider)) throw new ModelApprovalError("El proveedor no pertenece a la allowlist E5.", { reason: "provider_not_allowed" });
  const model = safeText(raw.model, "model", { pattern: new RegExp(`^${provider.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^\\s]+$`) });
  const status = safeText(raw.status, "status", { pattern: /^(approved|candidate|rejected|deprecated|superseded)$/ });
  if (!ALLOWED_STATUSES.has(status)) throw new ModelApprovalError("El estado del modelo no es válido.", { reason: "invalid_status" });
  const capabilities = booleanMap(raw.capabilities, REQUIRED_CAPABILITIES, "capabilities");
  const controls = booleanMap(raw.controls, REQUIRED_CONTROLS, "controls");
  assertKeys(raw.retention, RETENTION_KEYS, "retention");
  if (raw.retention.promptLogging !== "none" || raw.retention.training !== "not_permitted" || raw.retention.maxDays !== 0) {
    throw new ModelApprovalError("La política de retención no cumple el mínimo E5.", { reason: "retention_not_approved" });
  }
  const retention = Object.freeze({ promptLogging: "none", training: "not_permitted", maxDays: 0 });
  assertKeys(raw.approval, APPROVAL_KEYS, "approval");
  const approval = Object.freeze({
    reviewedBy: safeText(raw.approval.reviewedBy, "approval.reviewedBy", { pattern: /^[a-z0-9._:-]{3,80}$/i, max: 80 }),
    reviewedAt: isoDate(raw.approval.reviewedAt, "approval.reviewedAt", now),
    expiresAt: isoDate(raw.approval.expiresAt, "approval.expiresAt", now, { future: true }),
    evidenceRef: safeText(raw.approval.evidenceRef, "approval.evidenceRef", { pattern: /^[a-z0-9._:/-]{3,160}$/i }),
  });
  return Object.freeze({ provider, model, status, capabilities, controls, retention, approval });
}

export function parseModelApprovalMatrix(raw, { now = Date.now() } = {}) {
  const matrix = typeof raw === "string" ? (() => {
    if (raw.length > 64 * 1024) throw new ModelApprovalError("La matriz de modelos supera el límite.", { reason: "invalid_matrix" });
    try { return JSON.parse(raw); } catch { throw new ModelApprovalError("La matriz de modelos no es JSON válido.", { reason: "invalid_matrix" }); }
  })() : raw;
  assertKeys(matrix, TOP_LEVEL_KEYS, "principal");
  if (matrix.version !== APPROVAL_VERSION || !Array.isArray(matrix.entries) || matrix.entries.length > 32) {
    throw new ModelApprovalError("La versión o las entradas de la matriz no son válidas.", { reason: "invalid_matrix" });
  }
  const entries = matrix.entries.map((entry) => validateEntry(entry, now));
  const identities = new Set();
  for (const entry of entries) {
    const identity = `${entry.provider}:${entry.model}`;
    if (identities.has(identity)) throw new ModelApprovalError("La matriz contiene modelos duplicados.", { reason: "invalid_matrix" });
    identities.add(identity);
  }
  return Object.freeze({ version: APPROVAL_VERSION, entries: Object.freeze(entries) });
}

export function createModelApprovalRegistry({ matrix, now = () => Date.now(), configurationError = "" } = {}) {
  const entries = Array.isArray(matrix?.entries) ? matrix.entries : [];
  const byModel = new Map(entries.map((entry) => [`${entry.provider}:${entry.model}`, entry]));
  const registry = {
    version: APPROVAL_VERSION,
    configurationError,
    size: entries.length,
    status(provider, model) {
      const entry = byModel.get(`${provider}:${model}`);
      if (!entry) return "unapproved";
      if (entry.status !== "approved") return entry.status;
      if (Date.parse(entry.approval.expiresAt) <= now()) return "expired";
      return "approved";
    },
    get(provider, model) {
      const entry = byModel.get(`${provider}:${model}`);
      return entry && registry.status(provider, model) === "approved" ? entry : null;
    },
    assertApproved(provider, model) {
      const entry = registry.get(provider, model);
      if (!entry) throw new ModelApprovalError(undefined, { reason: registry.configurationError ? "invalid_matrix" : registry.status(provider, model) });
      return entry;
    },
    publicStatus(provider, model) {
      return { provider, model, status: registry.status(provider, model) };
    },
    listPublic() {
      return entries.map(({ provider, model }) => registry.publicStatus(provider, model));
    },
  };
  return Object.freeze(registry);
}

export function loadModelApprovalRegistry(raw, { now = () => Date.now() } = {}) {
  if (!String(raw || "").trim()) return createModelApprovalRegistry({ now });
  try {
    const matrix = parseModelApprovalMatrix(String(raw), { now: now() });
    return createModelApprovalRegistry({ matrix, now });
  } catch (error) {
    return createModelApprovalRegistry({ now, configurationError: error?.reason || "invalid_matrix" });
  }
}
