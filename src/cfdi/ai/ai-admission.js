import { AI_GOVERNANCE_CONTRACT_VERSION, getAiCapability } from "./ai-governance-contract.js";

export const AI_ADMISSION_CONTRACT_VERSION = "ai-admission-v1";
export const AI_ADMISSION_PLAN_VERSION = 1;

const PLAN_IDS = new Set(["free", "premium"]);
const PLAN_STATUSES = new Set(["active", "grace", "expired", "unknown"]);
const ACTIVE_PREMIUM_STATUSES = new Set(["active", "grace"]);
const IDEMPOTENCY_KEY = /^ai_[A-Za-z0-9._:-]{8,127}$/;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{3,160}$/;

export class AiAdmissionError extends Error {
  constructor(message, { code = "ai_capability_blocked", status = 403, retryAfter = 0 } = {}) {
    super(message);
    this.name = "AiAdmissionError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function freeze(value) { return Object.freeze(value); }

function assertAccountId(accountId) {
  if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId)) {
    throw new AiAdmissionError("No pudimos identificar una cuenta válida para esta solicitud.", { code: "ai_auth_required", status: 401 });
  }
  return accountId;
}

export function assertAiIdempotencyKey(value) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw new AiAdmissionError("La solicitud de IA necesita una clave de idempotencia válida.", { code: "ai_capability_blocked", status: 400 });
  }
  return value;
}

export function utcMonthPeriod(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("La fecha de admisión no es válida.");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizedEntitlement(raw = {}) {
  const requestedPlan = PLAN_IDS.has(raw?.plan) ? raw.plan : "free";
  const requestedStatus = PLAN_STATUSES.has(raw?.status) ? raw.status : "unknown";
  const premiumEnabled = requestedPlan === "premium" && ACTIVE_PREMIUM_STATUSES.has(requestedStatus);
  const fallback = !premiumEnabled && (requestedPlan !== "free" || requestedStatus === "unknown");
  return freeze({
    plan: premiumEnabled ? "premium" : "free",
    status: requestedStatus,
    contractVersion: Number.isInteger(raw?.contractVersion) && raw.contractVersion > 0 ? raw.contractVersion : AI_ADMISSION_PLAN_VERSION,
    source: typeof raw?.source === "string" && raw.source.length <= 64 ? raw.source : "server_default",
    decision: fallback ? "fallback_free" : "allowed",
  });
}

export function resolveServerEntitlement({ accountId, env = process.env } = {}) {
  assertAccountId(accountId);
  const premiumIds = new Set(String(env.AI_PREMIUM_ACCOUNT_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => ACCOUNT_ID.test(item)));
  return normalizedEntitlement(premiumIds.has(accountId)
    ? { plan: "premium", status: "active", contractVersion: AI_ADMISSION_PLAN_VERSION, source: "server_allowlist" }
    : { plan: "free", status: "active", contractVersion: AI_ADMISSION_PLAN_VERSION, source: "server_default" });
}

function resolveLimit(capability, entitlement) {
  const descriptor = getAiCapability(capability);
  if (!descriptor) throw new AiAdmissionError("La capacidad de IA solicitada no está permitida.", { code: "ai_capability_blocked", status: 403 });
  const limit = entitlement.plan === "premium" ? descriptor.premium : descriptor.free;
  if (limit === "unavailable" || limit === false || limit === 0) {
    throw new AiAdmissionError("Esta capacidad requiere un plan compatible. El resultado local sigue disponible.", { code: "ai_capability_blocked", status: 403 });
  }
  if (!Number.isInteger(limit) || limit < 1) throw new AiAdmissionError("El límite de IA configurado no es válido.", { code: "ai_entitlement_unknown", status: 503 });
  return { descriptor, limit };
}

function usageKey({ accountId, capability, period }) { return `${accountId}|${capability}|${period}`; }
function operationKey({ accountId, capability, period, idempotencyKey }) { return `${usageKey({ accountId, capability, period })}|${idempotencyKey}`; }
function safeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  return JSON.parse(JSON.stringify(result));
}

export function createMemoryAiUsageStore({ now = () => Date.now() } = {}) {
  const usage = new Map();
  const operations = new Map();

  function prune(reference = now()) {
    const cutoff = reference - 62 * 24 * 60 * 60 * 1000;
    for (const [key, item] of operations) if (item.updatedAt < cutoff) operations.delete(key);
    for (const [key, item] of usage) if (item.updatedAt < cutoff) usage.delete(key);
  }

  function reserve({ accountId, capability, period, idempotencyKey, limit }) {
    prune();
    const key = operationKey({ accountId, capability, period, idempotencyKey });
    const existing = operations.get(key);
    if (existing) {
      if (existing.state === "completed") return freeze({ decision: "replay_completed", reservation: freeze({ ...existing }), result: safeResult(existing.result) });
      return freeze({ decision: existing.state === "reserved" ? "replay_pending" : "replay_released", reservation: freeze({ ...existing }), result: null });
    }
    const usageRecordKey = usageKey({ accountId, capability, period });
    const current = usage.get(usageRecordKey) || { count: 0, updatedAt: now() };
    if (current.count >= limit) return freeze({ decision: "blocked", currentUsage: current.count, remaining: 0 });
    const updatedAt = now();
    const reservation = {
      id: `res_${crypto.randomUUID()}`,
      key,
      usageRecordKey,
      accountId,
      capability,
      period,
      idempotencyKey,
      state: "reserved",
      createdAt: updatedAt,
      updatedAt,
      result: null,
    };
    usage.set(usageRecordKey, { count: current.count + 1, updatedAt });
    operations.set(key, reservation);
    return freeze({ decision: "reserved", reservation: freeze({ ...reservation }), currentUsage: current.count + 1, remaining: Math.max(0, limit - current.count - 1) });
  }

  function complete(reservation, result) {
    const current = operations.get(reservation?.key);
    if (!current || current.id !== reservation.id) throw new AiAdmissionError("La reserva de IA ya no es válida.", { code: "ai_entitlement_unknown", status: 409 });
    if (current.state === "completed") return freeze({ ...current });
    if (current.state !== "reserved") throw new AiAdmissionError("La reserva de IA no puede cerrarse.", { code: "ai_entitlement_unknown", status: 409 });
    current.state = "completed";
    current.result = safeResult(result);
    current.updatedAt = now();
    return freeze({ ...current });
  }

  function release(reservation) {
    const current = operations.get(reservation?.key);
    if (!current || current.id !== reservation.id) return false;
    if (current.state !== "reserved") return false;
    const currentUsage = usage.get(current.usageRecordKey);
    if (currentUsage) usage.set(current.usageRecordKey, { count: Math.max(0, currentUsage.count - 1), updatedAt: now() });
    current.state = "released";
    current.updatedAt = now();
    return true;
  }

  return freeze({
    reserve,
    complete,
    release,
    getUsage({ accountId, capability, period }) { return usage.get(usageKey({ accountId, capability, period }))?.count || 0; },
    getOperation({ accountId, capability, period, idempotencyKey }) {
      const item = operations.get(operationKey({ accountId, capability, period, idempotencyKey }));
      return item ? freeze({ ...item, result: safeResult(item.result) }) : null;
    },
  });
}

export function createAiAdmissionService({ entitlementResolver = resolveServerEntitlement, usageStore = createMemoryAiUsageStore(), now = () => new Date() } = {}) {
  if (typeof entitlementResolver !== "function" || !usageStore?.reserve || !usageStore?.complete || !usageStore?.release) throw new TypeError("AiAdmissionService necesita resolver y store válidos.");

  function admit({ accountId, capability, idempotencyKey, env = process.env } = {}) {
    assertAccountId(accountId);
    assertAiIdempotencyKey(idempotencyKey);
    const entitlement = normalizedEntitlement(entitlementResolver({ accountId, capability, env }));
    const { descriptor, limit } = resolveLimit(capability, entitlement);
    const period = utcMonthPeriod(now());
    const reservation = usageStore.reserve({ accountId, capability, period, idempotencyKey, limit });
    if (reservation.decision === "blocked") {
      throw new AiAdmissionError("Alcanzaste el límite mensual de consultas remotas para este plan. Puedes continuar con las herramientas locales.", { code: "ai_capability_blocked", status: 429, retryAfter: 60 });
    }
    if (reservation.decision === "replay_pending") {
      throw new AiAdmissionError("Esta solicitud de IA ya está en proceso. Espera su resultado antes de volver a intentarlo.", { code: "ai_capability_blocked", status: 409 });
    }
    if (reservation.decision === "replay_released") {
      throw new AiAdmissionError("Esta acción anterior no se completó. Inicia una nueva consulta explícita para volver a intentarlo.", { code: "ai_capability_blocked", status: 409 });
    }
    return freeze({
      contractVersion: AI_ADMISSION_CONTRACT_VERSION,
      accountId,
      capability,
      descriptor: freeze({ id: descriptor.id, unit: descriptor.unit, scope: descriptor.scope }),
      entitlement,
      period,
      limit,
      reservation: reservation.reservation,
      currentUsage: reservation.currentUsage ?? usageStore.getUsage({ accountId, capability, period }),
      remaining: reservation.remaining ?? null,
      replay: reservation.decision === "replay_completed",
      cachedResult: reservation.result || null,
    });
  }

  function complete(admission, result) {
    if (!admission?.reservation) throw new TypeError("La admisión no contiene una reserva.");
    return usageStore.complete(admission.reservation, result);
  }

  function release(admission) {
    return admission?.reservation ? usageStore.release(admission.reservation) : false;
  }

  return freeze({ admit, complete, release, usageStore });
}

export const __test = { normalizedEntitlement, resolveLimit, usageKey, operationKey, IDEMPOTENCY_KEY, ACCOUNT_ID };
