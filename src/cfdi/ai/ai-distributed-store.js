import { AiAdmissionError } from "./ai-admission.js";
import { createRedisRestCommandExecutor } from "./ai-resilience.js";

export const AI_DISTRIBUTED_STORE_CONTRACT_VERSION = "ai-rate-store-v1";
export const AI_RESERVATION_TTL_MS = 30_000;
export const AI_OPERATION_RETENTION_MS = 62 * 24 * 60 * 60 * 1000;

const RESERVE_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
local now = tonumber(ARGV[1])
local reservationTtl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local retention = tonumber(ARGV[6])
if existing then
  local record = cjson.decode(existing)
  if record.state == "reserved" and tonumber(record.expiresAt) <= now then
    local usage = tonumber(redis.call("GET", KEYS[2]) or "0")
    redis.call("SET", KEYS[2], tostring(math.max(0, usage - 1)), "EX", retention)
    record.state = "expired"
    record.updatedAt = now
    redis.call("SET", KEYS[1], cjson.encode(record), "EX", retention)
  end
  local decision = record.state == "completed" and "replay_completed" or record.state == "reserved" and "replay_pending" or record.state == "expired" and "replay_expired" or "replay_released"
  return cjson.encode({ decision = decision, reservation = record, result = record.result })
end
local usage = tonumber(redis.call("GET", KEYS[2]) or "0")
if usage >= limit then return cjson.encode({ decision = "blocked", currentUsage = usage, remaining = 0 }) end
local record = cjson.decode(ARGV[5])
record.createdAt = now
record.updatedAt = now
record.expiresAt = now + reservationTtl
redis.call("INCR", KEYS[2])
redis.call("EXPIRE", KEYS[2], retention)
redis.call("SET", KEYS[1], cjson.encode(record), "EX", retention)
return cjson.encode({ decision = "reserved", reservation = record, currentUsage = usage + 1, remaining = math.max(0, limit - usage - 1) })
`;

const COMPLETE_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
if not existing then return cjson.encode({ decision = "missing" }) end
local record = cjson.decode(existing)
local now = tonumber(ARGV[1])
local retention = tonumber(ARGV[3])
if record.state == "completed" then return cjson.encode({ decision = "completed", reservation = record, result = record.result }) end
if record.state ~= "reserved" then return cjson.encode({ decision = record.state, reservation = record, result = record.result }) end
if tonumber(record.expiresAt) <= now then
  local usage = tonumber(redis.call("GET", KEYS[2]) or "0")
  redis.call("SET", KEYS[2], tostring(math.max(0, usage - 1)), "EX", retention)
  record.state = "expired"
  record.updatedAt = now
  redis.call("SET", KEYS[1], cjson.encode(record), "EX", retention)
  return cjson.encode({ decision = "expired", reservation = record })
end
record.state = "completed"
record.result = cjson.decode(ARGV[2])
record.updatedAt = now
redis.call("SET", KEYS[1], cjson.encode(record), "EX", retention)
return cjson.encode({ decision = "completed", reservation = record, result = record.result })
`;

const RELEASE_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
if not existing then return cjson.encode({ decision = "missing" }) end
local record = cjson.decode(existing)
if record.state ~= "reserved" then return cjson.encode({ decision = record.state, reservation = record }) end
local usage = tonumber(redis.call("GET", KEYS[2]) or "0")
local retention = tonumber(ARGV[2])
redis.call("SET", KEYS[2], tostring(math.max(0, usage - 1)), "EX", retention)
record.state = "released"
record.updatedAt = tonumber(ARGV[1])
redis.call("SET", KEYS[1], cjson.encode(record), "EX", retention)
return cjson.encode({ decision = "released", reservation = record })
`;

function storeError(message, code = "ai_rate_store_unavailable", status = 503) {
  return new AiAdmissionError(message, { code, status, retryAfter: 2 });
}

function parseResult(result) {
  if (typeof result === "string") {
    try { return JSON.parse(result); } catch { throw storeError("El almacén distribuido devolvió un resultado inválido."); }
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw storeError("El almacén distribuido devolvió un resultado inválido.");
  return result;
}

function keyPart(value, name) {
  if (typeof value !== "string" || !value || value.length > 180 || /[^A-Za-z0-9._:|@-]/.test(value)) throw storeError(`La clave ${name} no es válida.`, "ai_rate_store_unavailable", 500);
  return value;
}

function operationKey({ accountId, capability, period, idempotencyKey }) {
  return `contaia:ai:v1:operation:${keyPart(accountId, "account")}:${keyPart(capability, "capability")}:${keyPart(period, "period")}:${keyPart(idempotencyKey, "idempotency")}`;
}

function usageKey({ accountId, capability, period }) {
  return `contaia:ai:v1:usage:${keyPart(accountId, "account")}:${keyPart(capability, "capability")}:${keyPart(period, "period")}`;
}

function safeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  return JSON.parse(JSON.stringify(result));
}

function normalizeReservation(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.key !== "string") throw storeError("La reserva distribuida no tiene un formato válido.");
  return Object.freeze({ ...value, result: safeResult(value.result) });
}

export function createRedisRestAiUsageStore({ execute, now = () => Date.now(), reservationTtlMs = AI_RESERVATION_TTL_MS, retentionMs = AI_OPERATION_RETENTION_MS } = {}) {
  if (typeof execute !== "function") throw new TypeError("El store distribuido necesita un ejecutor Redis.");
  const ttlMs = Math.max(5_000, Math.min(120_000, Number(reservationTtlMs) || AI_RESERVATION_TTL_MS));
  const retentionSeconds = Math.max(86_400, Math.ceil((Number(retentionMs) || AI_OPERATION_RETENTION_MS) / 1000));

  async function reserve({ accountId, capability, period, idempotencyKey, limit }) {
    const key = operationKey({ accountId, capability, period, idempotencyKey });
    const usage = usageKey({ accountId, capability, period });
    const id = `res_${globalThis.crypto?.randomUUID?.() || `${now()}_${Math.random().toString(36).slice(2)}`}`;
    const record = { id, key, usageRecordKey: usage, accountId, capability, period, idempotencyKey, state: "reserved", createdAt: now(), updatedAt: now(), expiresAt: now() + ttlMs, result: null };
    const raw = await execute(["EVAL", RESERVE_SCRIPT, "2", key, usage, String(now()), String(Math.ceil(ttlMs / 1000)), String(limit), id, JSON.stringify(record), String(retentionSeconds)]);
    const result = parseResult(raw);
    if (result.reservation) result.reservation = normalizeReservation(result.reservation);
    if (result.result) result.result = safeResult(result.result);
    return result;
  }

  async function complete(reservation, result) {
    const safe = safeResult(result);
    if (!safe) throw storeError("El resultado de la reserva no es válido.", "ai_entitlement_unknown", 409);
    const raw = await execute(["EVAL", COMPLETE_SCRIPT, "2", keyPart(reservation?.key, "operation"), keyPart(reservation?.usageRecordKey, "usage"), String(now()), JSON.stringify(safe), String(retentionSeconds)]);
    const payload = parseResult(raw);
    if (payload.reservation) payload.reservation = normalizeReservation(payload.reservation);
    if (payload.result) payload.result = safeResult(payload.result);
    if (["missing", "expired", "released"].includes(payload.decision)) throw storeError("La reserva distribuida ya no puede cerrarse.", "ai_capability_blocked", 409);
    return payload.reservation;
  }

  async function release(reservation) {
    if (!reservation?.key || !reservation?.usageRecordKey) return false;
    const raw = await execute(["EVAL", RELEASE_SCRIPT, "2", keyPart(reservation.key, "operation"), keyPart(reservation.usageRecordKey, "usage"), String(now()), String(retentionSeconds)]);
    const payload = parseResult(raw);
    return payload.decision === "released";
  }

  async function getUsage({ accountId, capability, period }) {
    const raw = await execute(["GET", usageKey({ accountId, capability, period })]);
    const count = Number(raw);
    return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
  }

  return Object.freeze({ reserve, complete, release, getUsage, reservationTtlMs: ttlMs, retentionMs: retentionSeconds * 1000, contractVersion: AI_DISTRIBUTED_STORE_CONTRACT_VERSION });
}

export function createConfiguredRedisRestAiUsageStore({ env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const url = String(env.AI_RATE_LIMIT_KV_REST_URL || "").trim();
  const token = String(env.AI_RATE_LIMIT_KV_REST_TOKEN || "").trim();
  if (!url || !token) return null;
  const execute = createRedisRestCommandExecutor({ url, token, fetchImpl, timeoutMs: env.AI_RATE_LIMIT_KV_TIMEOUT_MS || 2_000 });
  return createRedisRestAiUsageStore({ execute, now });
}

export const __test = { RESERVE_SCRIPT, COMPLETE_SCRIPT, RELEASE_SCRIPT, operationKey, usageKey, parseResult };
