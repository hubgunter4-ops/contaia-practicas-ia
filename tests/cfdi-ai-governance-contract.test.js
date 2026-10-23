import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CAPABILITIES_V1,
  AI_DATA_CLASSES_V1,
  AI_ENDPOINT_DATA_POLICY_V1,
  AI_ERROR_CODES_V1,
  AI_GOVERNANCE_CONTRACT_VERSION,
  AI_MODEL_CAPABILITIES_V1,
  AI_PLAN_LIMITS_V1,
  AI_THREAT_CATALOG_V1,
  createAiTelemetryEvent,
  getAiCapability,
  getAiTelemetryDefinition,
} from "../src/cfdi/ai/ai-governance-contract.js";

test("E0 versiona las clases de datos y separa fuentes locales de salidas remotas", () => {
  assert.equal(AI_GOVERNANCE_CONTRACT_VERSION, "ai-governance-v1");
  assert.equal(AI_DATA_CLASSES_V1.local_sensitive.remote, false);
  assert.deepEqual(AI_DATA_CLASSES_V1.local_sensitive.allowedDestinations, ["browser", "worker", "local_tool"]);
  assert.equal(AI_DATA_CLASSES_V1.safe_summary.requiresExplicitUserAction, true);
  assert.equal(AI_DATA_CLASSES_V1.planner_text.requiresExplicitUserAction, true);
  assert.equal(AI_DATA_CLASSES_V1.telemetry_aggregate.telemetry, "self_describing");
});

test("E0 declara fronteras por endpoint sin permitir fuentes CFDI en planner o telemetría", () => {
  const planner = AI_ENDPOINT_DATA_POLICY_V1.cfdi_planner;
  assert.deepEqual(planner.permittedFields, ["message"]);
  assert.ok(planner.prohibitedFields.includes("analysisRef"));
  assert.ok(planner.prohibitedFields.includes("xml"));
  assert.ok(planner.prohibitedFields.includes("history"));
  assert.ok(AI_ENDPOINT_DATA_POLICY_V1.ai_observability.prohibitedFields.includes("prompt"));
  assert.ok(AI_ENDPOINT_DATA_POLICY_V1.ai_observability.prohibitedFields.includes("cfdiContext"));
  assert.equal(AI_ENDPOINT_DATA_POLICY_V1.nora_cfdi_summary.explicitAction, "double_confirmation");
});

test("E0 fija cuotas iniciales separadas para planner, explicación y snapshot", () => {
  assert.deepEqual(AI_PLAN_LIMITS_V1.free, { plannerRequestsMonth: 20, explanationRequestsMonth: 10, noraSnapshotsMonth: 0, concurrentRemoteRequests: 1, plannerInputChars: 2000 });
  assert.deepEqual(AI_PLAN_LIMITS_V1.premium, { plannerRequestsMonth: 200, explanationRequestsMonth: 100, noraSnapshotsMonth: 50, concurrentRemoteRequests: 2, plannerInputChars: 2000 });
  assert.equal(getAiCapability("tools.nora.snapshot.explicit").free, "unavailable");
  assert.equal(getAiCapability("tools.ai.planner.requests").countBeforeStart, true);
  assert.equal(getAiCapability("tools.ai.unknown"), null);
});

test("E0 exige aprobación explícita de modelo y capacidades estructuradas", () => {
  assert.equal(AI_MODEL_CAPABILITIES_V1.defaultStatus, "unapproved");
  assert.deepEqual(AI_MODEL_CAPABILITIES_V1.allowedProviders, ["openai", "anthropic"]);
  assert.ok(AI_MODEL_CAPABILITIES_V1.requiredFeatures.includes("json_schema_strict"));
  assert.deepEqual(AI_MODEL_CAPABILITIES_V1.entries, []);
});

test("E0 mantiene un catálogo completo de amenazas y códigos de degradación", () => {
  assert.equal(AI_THREAT_CATALOG_V1.length, 12);
  assert.deepEqual(AI_THREAT_CATALOG_V1.map(({ id }) => id), Array.from({ length: 12 }, (_, index) => `E-${String(index + 1).padStart(2, "0")}`));
  assert.ok(AI_THREAT_CATALOG_V1.every(({ status }) => status === "open"));
  assert.ok(AI_ERROR_CODES_V1.includes("ai_dlp_blocked"));
  assert.ok(AI_ERROR_CODES_V1.includes("ai_budget_exhausted"));
  assert.ok(AI_ERROR_CODES_V1.includes("ai_request_cancelled"));
});

test("E0 crea un evento de observabilidad con escalares y contrato versionado", () => {
  const event = createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test",
    route: "cfdi_planner",
    outcome: "executed_local_tool",
    latencyMs: 245,
    toolId: "cfdi.alerts",
    environment: "test",
    dlpDecision: "allow",
  });
  assert.deepEqual(event, {
    eventName: "ai.planner.completed",
    contractVersion: "ai-governance-v1",
    requestId: "ai:e0-test",
    route: "cfdi_planner",
    outcome: "executed_local_tool",
    latencyMs: 245,
    toolId: "cfdi.alerts",
    environment: "test",
    dlpDecision: "allow",
  });
  assert.equal(Object.isFrozen(event), true);
  assert.equal(getAiTelemetryDefinition("ai.planner.completed").eventName, "ai.planner.completed");
});

test("E0 rechaza payloads de telemetría que podrían filtrar prompts, cuerpos o datos fiscales", () => {
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: "completed", latencyMs: 10, toolId: "cfdi.alerts", environment: "test", message: "RFC AAA010101AAA",
  }), /no está permitido/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: "completed", latencyMs: 10, toolId: "cfdi.alerts", environment: "test", content: "<cfdi:Comprobante>/>",
  }), /no está permitido/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: "completed", latencyMs: 10, toolId: "cfdi.alerts", environment: "test", extra: "not-in-contract",
  }), /no está permitido/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: { value: true }, latencyMs: 10, toolId: "cfdi.alerts", environment: "test",
  }), /debe ser escalar/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: "RFC AAA010101AAA", latencyMs: 10, toolId: "cfdi.alerts", environment: "test",
  }), /valor.*no está permitido/);
});

test("E0 exige campos mínimos y referencias opacas en telemetría", () => {
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", { requestId: "ai:e0-test" }), /Falta el campo/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "correo@example.com", route: "cfdi_planner", outcome: "completed", latencyMs: 10, toolId: "cfdi.alerts", environment: "test",
  }), /requestId.*opaco/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: "completed", latencyMs: 300001, toolId: "cfdi.alerts", environment: "test",
  }), /latencia/);
  assert.throws(() => createAiTelemetryEvent("ai.planner.completed", {
    requestId: "ai:e0-test", route: "cfdi_planner", outcome: "completed", latencyMs: 10, toolId: "cfdi.alerts", environment: "test", statusCode: 99,
  }), /statusCode/);
  assert.throws(() => createAiTelemetryEvent("ai.evento_inventado", {}), /no está en el contrato/);
});
