const freeze = (value) => Object.freeze(value);
const freezeList = (items) => freeze(items.map((item) => (item && typeof item === "object" ? freeze({ ...item }) : item)));

export const AI_GOVERNANCE_CONTRACT_VERSION = "ai-governance-v1";

export const AI_DATA_CLASSES_V1 = freeze({
  local_sensitive: freeze({
    id: "local_sensitive",
    transport: "local_only",
    examples: freezeList(["cfdi_source", "bank_statement", "raw_file", "worker_buffer"]),
    allowedDestinations: freezeList(["browser", "worker", "local_tool"]),
    remote: false,
    telemetry: "never",
  }),
  local_derived: freeze({
    id: "local_derived",
    transport: "local_only",
    examples: freezeList(["analysis", "audit_result", "journal_draft", "diot_review"]),
    allowedDestinations: freezeList(["browser", "local_tool", "local_export"]),
    remote: false,
    telemetry: "aggregate_only",
  }),
  safe_summary: freeze({
    id: "safe_summary",
    transport: "explicit_remote_only",
    examples: freezeList(["cfdi-summary-v1"]),
    allowedDestinations: freezeList(["nora_existing_adapter"]),
    remote: true,
    telemetry: "schema_only",
    requiresExplicitUserAction: true,
  }),
  planner_text: freeze({
    id: "planner_text",
    transport: "filtered_remote_only",
    examples: freezeList(["normalized_user_question"]),
    allowedDestinations: freezeList(["cfdi_planner_endpoint"]),
    remote: true,
    telemetry: "decision_only",
    requiresExplicitUserAction: true,
  }),
  telemetry_aggregate: freeze({
    id: "telemetry_aggregate",
    transport: "redacted_observability_only",
    examples: freezeList(["latency", "status_code", "error_code", "quota_decision"]),
    allowedDestinations: freezeList(["server_log", "metrics_backend"]),
    remote: true,
    telemetry: "self_describing",
  }),
  entitlement_aggregate: freeze({
    id: "entitlement_aggregate",
    transport: "server_control_only",
    examples: freezeList(["opaque_account_ref", "plan_status", "aggregate_usage"]),
    allowedDestinations: freezeList(["entitlement_service", "server_admission"]),
    remote: true,
    telemetry: "decision_only",
  }),
});

export const AI_ENDPOINT_DATA_POLICY_V1 = freeze({
  cfdi_planner: freeze({
    id: "cfdi_planner",
    route: "/api/cfdi/planner",
    requestClasses: freezeList(["planner_text"]),
    permittedFields: freezeList(["message"]),
    prohibitedFields: freezeList(["analysisRef", "xml", "file", "blob", "arrayBuffer", "rfc", "uuid", "folio", "documentText", "history"]),
    responseClasses: freezeList(["telemetry_aggregate"]),
    explicitAction: "submit_query",
    persistence: "none_by_default",
  }),
  nora_cfdi_summary: freeze({
    id: "nora_cfdi_summary",
    route: "/api/tutor/stream",
    requestClasses: freezeList(["safe_summary", "planner_text"]),
    permittedFields: freezeList(["schemaVersion", "status", "counts", "checks", "totalsByCurrency", "samplePayments", "message"]),
    prohibitedFields: freezeList(["xml", "file", "blob", "arrayBuffer", "rfc", "uuid", "folio", "filename", "bankStatement", "rawSource"]),
    responseClasses: freezeList(["telemetry_aggregate"]),
    explicitAction: "double_confirmation",
    persistence: "conversation_policy",
  }),
  ai_entitlement: freeze({
    id: "ai_entitlement",
    route: "future_server_admission",
    requestClasses: freezeList(["entitlement_aggregate"]),
    permittedFields: freezeList(["accountRef", "plan", "status", "contractVersion", "period", "capability", "aggregateUsage"]),
    prohibitedFields: freezeList(["xml", "file", "bankRows", "rfc", "uuid", "folio", "amounts", "prompt", "noraText"]),
    responseClasses: freezeList(["entitlement_aggregate"]),
    explicitAction: "server_admission",
    persistence: "versioned_entitlement_only",
  }),
  ai_observability: freeze({
    id: "ai_observability",
    route: "server_log_or_metrics",
    requestClasses: freezeList(["telemetry_aggregate"]),
    permittedFields: freezeList(["requestId", "accountRef", "route", "capability", "plan", "provider", "modelFamily", "outcome", "errorCode", "latencyMs", "statusCode", "toolId", "intentSource", "dlpDecision", "quotaDecision", "schemaVersion", "environment", "attempt"]),
    prohibitedFields: freezeList(["message", "prompt", "body", "content", "history", "document", "xml", "rfc", "uuid", "folio", "amount", "importe", "cfdiContext", "safeContext", "authorization", "cookie", "apiKey", "token", "email", "phone"]),
    responseClasses: freezeList([]),
    explicitAction: "none",
    persistence: "redacted_retention_policy",
  }),
});

const capability = (id, unit, scope, free, premium, extra = {}) => freeze({
  id,
  product: "tools",
  unit,
  scope,
  free,
  premium,
  countBeforeStart: true,
  sensitiveInput: false,
  remote: true,
  ...extra,
});

export const AI_CAPABILITIES_V1 = freezeList([
  capability("tools.ai.planner.requests", "request", "account_month", 20, 200, { upgradeMessageKey: "upgrade.ai.planner" }),
  capability("tools.ai.explanation.requests", "request", "account_month", 10, 100, { upgradeMessageKey: "upgrade.ai.explanation" }),
  capability("tools.nora.snapshot.explicit", "snapshot", "account_month", "unavailable", 50, { upgradeMessageKey: "upgrade.nora.snapshot", sensitiveInput: true }),
  capability("tools.ai.concurrent.requests", "request", "account_account", 1, 2, { upgradeMessageKey: "upgrade.ai.concurrent", countBeforeStart: false }),
  capability("tools.ai.planner.input_chars", "character", "request", 2000, 2000, { upgradeMessageKey: "none", countBeforeStart: false, sensitiveInput: true }),
]);

export const AI_PLAN_LIMITS_V1 = freeze({
  version: 1,
  contractVersion: AI_GOVERNANCE_CONTRACT_VERSION,
  free: freeze({ plannerRequestsMonth: 20, explanationRequestsMonth: 10, noraSnapshotsMonth: 0, concurrentRemoteRequests: 1, plannerInputChars: 2000 }),
  premium: freeze({ plannerRequestsMonth: 200, explanationRequestsMonth: 100, noraSnapshotsMonth: 50, concurrentRemoteRequests: 2, plannerInputChars: 2000 }),
});

export const AI_MODEL_CAPABILITIES_V1 = freeze({
  version: 1,
  contractVersion: AI_GOVERNANCE_CONTRACT_VERSION,
  defaultStatus: "unapproved",
  allowedProviders: freezeList(["openai", "anthropic"]),
  requiredFeatures: freezeList(["json_schema_strict", "structured_output", "abort_signal"]),
  requiredControls: freezeList(["no_prompt_logging_by_default", "configured_retention_policy", "bounded_output"]),
  entries: freezeList([]),
});

export const AI_ERROR_CODES_V1 = freezeList([
  "ai_auth_required",
  "ai_entitlement_unknown",
  "ai_capability_blocked",
  "ai_dlp_blocked",
  "ai_dlp_confirmation_required",
  "ai_rate_limited",
  "ai_concurrency_limited",
  "ai_provider_unapproved",
  "ai_provider_unavailable",
  "ai_schema_invalid",
  "ai_plan_rejected",
  "ai_request_cancelled",
  "ai_session_expired",
  "ai_budget_exhausted",
]);

export const AI_THREAT_CATALOG_V1 = freezeList([
  { id: "E-01", severity: "P0", category: "dlp", status: "open", controlPhase: "E1" },
  { id: "E-02", severity: "P0", category: "identity", status: "open", controlPhase: "E2" },
  { id: "E-03", severity: "P0", category: "rate_limit", status: "open", controlPhase: "E3" },
  { id: "E-04", severity: "P0", category: "observability", status: "open", controlPhase: "E4" },
  { id: "E-05", severity: "P0", category: "model_compatibility", status: "open", controlPhase: "E5" },
  { id: "E-06", severity: "P0", category: "entitlement", status: "open", controlPhase: "E2" },
  { id: "E-07", severity: "P1", category: "vendor_retention", status: "open", controlPhase: "E5" },
  { id: "E-08", severity: "P1", category: "idempotency", status: "open", controlPhase: "E3" },
  { id: "E-09", severity: "P1", category: "log_leakage", status: "open", controlPhase: "E4" },
  { id: "E-10", severity: "P1", category: "semantic_trust", status: "open", controlPhase: "E6" },
  { id: "E-11", severity: "P1", category: "lifecycle", status: "open", controlPhase: "E6" },
  { id: "E-12", severity: "P2", category: "upgrade_ux", status: "open", controlPhase: "E6" },
]);

const TELEMETRY_DEFINITIONS = {
  "ai.admission.allowed": { required: ["requestId", "capability", "quotaDecision", "plan", "environment"] },
  "ai.admission.blocked": { required: ["requestId", "capability", "errorCode", "quotaDecision", "environment"] },
  "ai.planner.requested": { required: ["requestId", "route", "capability", "provider", "modelFamily", "environment"] },
  "ai.planner.completed": { required: ["requestId", "route", "outcome", "latencyMs", "toolId", "environment"] },
  "ai.planner.invalid_output": { required: ["requestId", "errorCode", "outcome", "environment"] },
  "ai.planner.fallback_local": { required: ["requestId", "errorCode", "outcome", "environment"] },
  "ai.planner.rate_limited": { required: ["requestId", "capability", "errorCode", "environment"] },
  "ai.explanation.confirmed": { required: ["requestId", "schemaVersion", "environment"] },
  "ai.explanation.sanitized": { required: ["requestId", "schemaVersion", "environment"] },
  "ai.explanation.failed": { required: ["requestId", "errorCode", "outcome", "environment"] },
  "ai.lifecycle.cancelled": { required: ["requestId", "errorCode", "environment"] },
};

const TELEMETRY_ALLOWED_KEYS = new Set([
  "requestId", "accountRef", "route", "capability", "plan", "provider", "modelFamily", "outcome", "errorCode", "latencyMs", "statusCode", "toolId", "intentSource", "dlpDecision", "quotaDecision", "schemaVersion", "environment", "attempt",
]);
const TELEMETRY_FORBIDDEN_KEYS = new Set(AI_ENDPOINT_DATA_POLICY_V1.ai_observability.prohibitedFields.map((key) => key.toLowerCase()));
const TELEMETRY_ENUMS = Object.freeze({
  route: new Set(["cfdi_planner", "tutor_stream", "ai_admission", "metrics"]),
  capability: new Set(AI_CAPABILITIES_V1.map(({ id }) => id)),
  plan: new Set(["free", "premium", "grace", "expired", "unknown"]),
  provider: new Set(["openai", "anthropic", "local", "unknown"]),
  modelFamily: new Set(["configured", "approved", "unapproved", "unknown"]),
  outcome: new Set(["allowed", "blocked", "completed", "executed_local_tool", "invalid_output", "fallback_local", "rate_limited", "confirmed", "sanitized", "failed", "cancelled", "reserved", "released"]),
  errorCode: new Set(AI_ERROR_CODES_V1),
  toolId: new Set(["cfdi.summary", "cfdi.alerts", "cfdi.payment_links", "cfdi.next_step"]),
  intentSource: new Set(["deterministic_router", "planner_json", "user_action"]),
  dlpDecision: new Set(["allow", "block", "confirm", "not_evaluated"]),
  quotaDecision: new Set(["allowed", "blocked", "fallback_free", "reserved", "released", "unknown"]),
  schemaVersion: new Set(["cfdi-summary-v1", "cfdi-planner-request-v1", AI_GOVERNANCE_CONTRACT_VERSION]),
  environment: new Set(["development", "test", "preview", "production"]),
});

function normalizedKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertTelemetryScalar(value, key) {
  if (typeof value === "string") {
    if (!value.trim() || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`El campo de telemetría ${key} no es seguro.`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new Error(`El número de telemetría ${key} no es seguro.`);
    return;
  }
  if (typeof value === "boolean") return;
  throw new Error(`El campo de telemetría ${key} debe ser escalar.`);
}

function assertTelemetryEnum(value, key) {
  const allowed = TELEMETRY_ENUMS[key];
  if (allowed && !allowed.has(value)) throw new Error(`El valor de telemetría ${key} no está permitido.`);
}

export function getAiCapability(id) {
  const descriptor = AI_CAPABILITIES_V1.find((item) => item.id === id);
  return descriptor ? descriptor : null;
}

export function getAiTelemetryDefinition(eventName) {
  const definition = TELEMETRY_DEFINITIONS[eventName];
  return definition ? freeze({ eventName, required: freeze([...definition.required]) }) : null;
}

export function createAiTelemetryEvent(eventName, payload = {}) {
  const definition = TELEMETRY_DEFINITIONS[eventName];
  if (!definition) throw new Error("El evento de telemetría no está en el contrato E0.");
  if (!isPlainObject(payload)) throw new Error("El payload de telemetría debe ser un objeto plano.");
  for (const key of Object.keys(payload)) {
    if (!TELEMETRY_ALLOWED_KEYS.has(key) || TELEMETRY_FORBIDDEN_KEYS.has(normalizedKey(key))) {
      throw new Error(`El campo de telemetría ${key} no está permitido.`);
    }
    assertTelemetryScalar(payload[key], key);
    assertTelemetryEnum(payload[key], key);
  }
  for (const key of definition.required) if (!Object.hasOwn(payload, key)) throw new Error(`Falta el campo de telemetría ${key}.`);
  if (payload.requestId !== undefined && !/^ai:[a-z0-9:_-]{3,120}$/i.test(payload.requestId)) throw new Error("El requestId de telemetría no es opaco.");
  if (payload.accountRef !== undefined && !/^(?:acct|anon|hmac)_[a-z0-9:_-]{3,120}$/i.test(payload.accountRef)) throw new Error("El accountRef de telemetría no es opaco.");
  if (payload.latencyMs !== undefined && (payload.latencyMs < 0 || payload.latencyMs > 300_000)) throw new Error("La latencia de telemetría está fuera de rango.");
  if (payload.statusCode !== undefined && (!Number.isInteger(payload.statusCode) || payload.statusCode < 100 || payload.statusCode > 599)) throw new Error("El statusCode de telemetría no es válido.");
  if (payload.attempt !== undefined && (!Number.isInteger(payload.attempt) || payload.attempt < 0 || payload.attempt > 5)) throw new Error("El intento de telemetría está fuera de rango.");
  return freeze({ eventName, contractVersion: AI_GOVERNANCE_CONTRACT_VERSION, ...payload });
}

export const __test = { TELEMETRY_DEFINITIONS, TELEMETRY_ALLOWED_KEYS, TELEMETRY_FORBIDDEN_KEYS, TELEMETRY_ENUMS, isPlainObject, normalizedKey };
