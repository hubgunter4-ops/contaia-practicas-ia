import test from "node:test";
import assert from "node:assert/strict";
import {
  AiAdmissionError,
  assertAiIdempotencyKey,
  createAiAdmissionService,
  createMemoryAiUsageStore,
  resolveServerEntitlement,
  utcMonthPeriod,
} from "../src/cfdi/ai/ai-admission.js";

const accountId = "0b907fb8-9f2f-4e50-8f8a-e8a54a1591c2";
const plannerCapability = "tools.ai.planner.requests";
const explanationCapability = "tools.ai.explanation.requests";
const key = (suffix) => `ai_${suffix}-12345678`;

function service({ plan = "free", status = "active", date = "2026-10-23T12:00:00.000Z" } = {}) {
  return createAiAdmissionService({
    now: () => new Date(date),
    entitlementResolver: () => ({ plan, status, contractVersion: 1, source: "test" }),
  });
}

test("deriva el periodo UTC y exige una idempotency key opaca", () => {
  assert.equal(utcMonthPeriod(new Date("2026-10-31T23:59:59.000Z")), "2026-10");
  assert.equal(utcMonthPeriod(new Date("2026-11-01T00:00:00.000Z")), "2026-11");
  assert.equal(assertAiIdempotencyKey(key("valid")), key("valid"));
  assert.throws(() => assertAiIdempotencyKey("abc"), AiAdmissionError);
  assert.throws(() => assertAiIdempotencyKey("RFC-AAA010101AAA"), AiAdmissionError);
});

test("usa Free como entitlement efectivo por defecto y Premium solo con allowlist server-side", () => {
  assert.deepEqual(resolveServerEntitlement({ accountId, env: {} }), {
    plan: "free", status: "active", contractVersion: 1, source: "server_default", decision: "allowed",
  });
  assert.equal(resolveServerEntitlement({ accountId, env: { AI_PREMIUM_ACCOUNT_IDS: accountId } }).plan, "premium");
  assert.equal(resolveServerEntitlement({ accountId, env: { AI_PREMIUM_ACCOUNT_IDS: "otro-id" } }).plan, "free");
});

test("admite planner Free hasta el límite mensual y bloquea la siguiente reserva sin modificar el límite", () => {
  const admission = service();
  for (let index = 0; index < 20; index += 1) {
    const result = admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key(`free-${index}`) });
    assert.equal(result.entitlement.plan, "free");
    assert.equal(result.limit, 20);
    admission.complete(result, { toolId: "cfdi.summary", sequence: index });
  }
  assert.throws(() => admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key("free-blocked") }), (error) => {
    assert.equal(error.code, "ai_rate_limited");
    assert.equal(error.status, 429);
    return true;
  });
});

test("una llave repetida devuelve el resultado completado sin consumir cuota otra vez", () => {
  const admission = service();
  const first = admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key("replay") });
  admission.complete(first, { intent: "cfdi.summary", toolId: "cfdi.summary", arguments: { scope: "all" } });
  const second = admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key("replay") });
  assert.equal(second.replay, true);
  assert.deepEqual(second.cachedResult, { intent: "cfdi.summary", toolId: "cfdi.summary", arguments: { scope: "all" } });
  assert.equal(second.currentUsage, 1);
});

test("libera una reserva fallida y no permite reutilizar silenciosamente la misma acción", () => {
  const admission = service();
  const first = admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key("released") });
  assert.equal(admission.release(first), true);
  assert.equal(admission.usageStore.getUsage({ accountId, capability: plannerCapability, period: "2026-10" }), 0);
  assert.throws(() => admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key("released") }), (error) => {
    assert.equal(error.status, 409);
    return true;
  });
  const retry = admission.admit({ accountId, capability: plannerCapability, idempotencyKey: key("released-new") });
  assert.equal(retry.currentUsage, 1);
});

test("un entitlement desconocido cae a Free y no concede Premium", () => {
  const admission = service({ plan: "premium", status: "unknown" });
  const result = admission.admit({ accountId, capability: explanationCapability, idempotencyKey: key("fallback") });
  assert.equal(result.entitlement.plan, "free");
  assert.equal(result.entitlement.status, "unknown");
  assert.equal(result.entitlement.decision, "fallback_free");
  assert.equal(result.limit, 10);
});

test("un snapshot seguro de Nora permanece bloqueado para Free incluso si el cliente declara Premium", () => {
  const usageStore = createMemoryAiUsageStore();
  const admission = createAiAdmissionService({
    usageStore,
    entitlementResolver: () => ({ plan: "free", status: "active", contractVersion: 1 }),
  });
  assert.throws(() => admission.admit({ accountId, capability: "tools.nora.snapshot.explicit", idempotencyKey: key("snapshot") }), (error) => {
    assert.equal(error.code, "ai_capability_blocked");
    assert.equal(error.status, 403);
    return true;
  });
  assert.equal(usageStore.getUsage({ accountId, capability: "tools.nora.snapshot.explicit", period: utcMonthPeriod() }), 0);
});
