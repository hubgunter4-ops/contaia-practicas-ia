import {
  AI_ERROR_CODES_V1,
  AI_GOVERNANCE_CONTRACT_VERSION,
  createAiTelemetryEvent,
} from "./ai-governance-contract.js";

export const AI_OBSERVABILITY_CONTRACT_VERSION = "ai-observability-v1";

const ERROR_CODES = new Set(AI_ERROR_CODES_V1);
const LATENCY_BUCKETS = Object.freeze(["lt_100", "100_499", "500_999", "1s_2s", "2s_plus"]);
const ALLOWED_COUNTER_LABELS = Object.freeze(["route", "capability", "outcome", "errorCode", "toolId"]);

function normalizedEnvironment(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return ["development", "test", "preview", "production"].includes(candidate) ? candidate : "test";
}

function defaultRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `ai:${uuid}`;
  return `ai:obs:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

function latencyBucket(value) {
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0) return null;
  if (latency < 100) return "lt_100";
  if (latency < 500) return "100_499";
  if (latency < 1000) return "500_999";
  if (latency < 2000) return "1s_2s";
  return "2s_plus";
}

function hashAccount(accountId) {
  const text = String(accountId || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `acct_${(hash >>> 0).toString(36)}`;
}

function errorCodeFor(error) {
  if (error?.code && ERROR_CODES.has(error.code)) return error.code;
  if (error?.code === "planner_input_confirmation_required") return "ai_dlp_confirmation_required";
  if (error?.code === "planner_input_sensitive") return "ai_dlp_blocked";
  if (error?.code === "planner_input_invalid") return "ai_capability_blocked";
  if (Number(error?.status) === 401) return "ai_auth_required";
  if (Number(error?.status) === 402) return "ai_budget_exhausted";
  if (Number(error?.status) === 429) return "ai_rate_limited";
  if (Number(error?.status) === 503 || Number(error?.status) === 504) return "ai_provider_unavailable";
  if (error?.name === "AbortError") return "ai_request_cancelled";
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("xml") || message.includes("uuid") || message.includes("rfc") || message.includes("sensible")) return "ai_dlp_blocked";
  if (message.includes("schema") || message.includes("json")) return "ai_schema_invalid";
  if (message.includes("cuota") || message.includes("admitir") || message.includes("capacidad")) return "ai_capability_blocked";
  return "ai_provider_unavailable";
}

function providerFamily(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return candidate === "openai" || candidate.startsWith("openai/") ? "openai"
    : candidate === "anthropic" || candidate.startsWith("anthropic/") ? "anthropic"
      : candidate === "local" ? "local" : "unknown";
}

function counterKey(event) {
  return [event.eventName, ...ALLOWED_COUNTER_LABELS.map((label) => event[label] || "none")].join("|");
}

export function createAiObservability({
  environment = "test",
  sink = null,
  now = () => Date.now(),
  requestIdFactory = defaultRequestId,
  maxCounters = 500,
} = {}) {
  const counters = new Map();
  const latency = Object.fromEntries(LATENCY_BUCKETS.map((bucket) => [bucket, 0]));
  let droppedEvents = 0;
  let emittedEvents = 0;

  const emit = (eventName, payload = {}) => {
    let event;
    try {
      event = createAiTelemetryEvent(eventName, payload);
    } catch {
      droppedEvents += 1;
      return null;
    }

    emittedEvents += 1;
    const key = counterKey(event);
    if (counters.has(key) || counters.size < maxCounters) counters.set(key, (counters.get(key) || 0) + 1);
    else counters.set("ai.observability|overflow|none|none|none|none", (counters.get("ai.observability|overflow|none|none|none|none") || 0) + 1);
    const bucket = latencyBucket(event.latencyMs);
    if (bucket) latency[bucket] += 1;

    if (typeof sink === "function") {
      try { sink(Object.freeze({ ...event })); } catch { droppedEvents += 1; }
    }
    return event;
  };

  const startRequest = () => {
    const requestId = requestIdFactory();
    const startedAt = Number(now());
    return Object.freeze({
      requestId,
      elapsedMs() {
        const current = Number(now());
        return Number.isFinite(current) && Number.isFinite(startedAt) ? Math.max(0, Math.min(300_000, current - startedAt)) : 0;
      },
    });
  };

  return Object.freeze({
    contractVersion: AI_OBSERVABILITY_CONTRACT_VERSION,
    environment: normalizedEnvironment(environment),
    emit,
    startRequest,
    accountRef: hashAccount,
    errorCode: errorCodeFor,
    providerFamily,
    modelFamily: (value) => value ? "configured" : "unknown",
    snapshot() {
      return Object.freeze({
        contractVersion: AI_OBSERVABILITY_CONTRACT_VERSION,
        governanceVersion: AI_GOVERNANCE_CONTRACT_VERSION,
        counters: Object.freeze(Object.fromEntries(counters)),
        latencyBuckets: Object.freeze({ ...latency }),
        emittedEvents,
        droppedEvents,
      });
    },
    reset() {
      counters.clear();
      for (const bucket of LATENCY_BUCKETS) latency[bucket] = 0;
      emittedEvents = 0;
      droppedEvents = 0;
    },
  });
}

export function createConfiguredAiObservability({ env = process.env, now, requestIdFactory } = {}) {
  const sinkMode = String(env.AI_OBSERVABILITY_SINK || "").trim().toLowerCase();
  const sink = sinkMode === "console"
    ? (event) => console.info(`[ai-observability] ${JSON.stringify(event)}`)
    : null;
  return createAiObservability({
    environment: env.VERCEL_ENV || env.NODE_ENV || "test",
    sink,
    now,
    requestIdFactory,
  });
}

export const __test = Object.freeze({
  LATENCY_BUCKETS,
  normalizedEnvironment,
  latencyBucket,
  hashAccount,
  errorCodeFor,
  providerFamily,
});
