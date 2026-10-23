import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_OPERATION_RETENTION_MS,
  AI_RESERVATION_TTL_MS,
  createMemoryAiUsageStore,
  createAiAdmissionService,
} from "../src/cfdi/ai/ai-admission.js";
import { createRedisRestAiUsageStore } from "../src/cfdi/ai/ai-distributed-store.js";

const accountId = "0b907fb8-9f2f-4e50-8f8a-e8a54a1591c2";
const capability = "tools.ai.planner.requests";
const idempotencyKey = "ai_e3-store-12345678";

function reservation(overrides = {}) {
  return {
    id: "res_fixture",
    key: `${accountId}|${capability}|2026-10|${idempotencyKey}`,
    usageRecordKey: `${accountId}|${capability}|2026-10`,
    accountId,
    capability,
    period: "2026-10",
    idempotencyKey,
    state: "reserved",
    createdAt: 0,
    updatedAt: 0,
    expiresAt: AI_RESERVATION_TTL_MS,
    result: null,
    ...overrides,
  };
}

test("una reserva en memoria expira por TTL, libera uso y no permite replay silencioso", () => {
  let clock = 0;
  const store = createMemoryAiUsageStore({ now: () => clock });
  const first = store.reserve({ accountId, capability, period: "2026-10", idempotencyKey, limit: 20 });
  assert.equal(first.decision, "reserved");
  assert.equal(store.getUsage({ accountId, capability, period: "2026-10" }), 1);
  clock = AI_RESERVATION_TTL_MS + 1;
  assert.equal(store.getUsage({ accountId, capability, period: "2026-10" }), 0);
  const replay = store.reserve({ accountId, capability, period: "2026-10", idempotencyKey, limit: 20 });
  assert.equal(replay.decision, "replay_expired");
  assert.equal(store.retentionMs, AI_OPERATION_RETENTION_MS);
});

test("AiAdmissionService conserva contrato async para un store distribuido", async () => {
  const base = createMemoryAiUsageStore();
  const asyncStore = {
    reserve: async (input) => base.reserve(input),
    complete: async (input, result) => base.complete(input, result),
    release: async (input) => base.release(input),
    getUsage: async (input) => base.getUsage(input),
  };
  const admission = createAiAdmissionService({
    usageStore: asyncStore,
    entitlementResolver: () => ({ plan: "free", status: "active", contractVersion: 1, source: "test" }),
    now: () => new Date("2026-10-23T12:00:00.000Z"),
  });
  const result = await admission.admit({ accountId, capability, idempotencyKey });
  assert.equal(result.currentUsage, 1);
  await admission.complete(result, { toolId: "cfdi.summary" });
  const replay = await admission.admit({ accountId, capability, idempotencyKey });
  assert.equal(replay.replay, true);
});

test("el store Redis REST prepara una operación atómica con TTL y sin fuentes fiscales", async () => {
  const commands = [];
  const store = createRedisRestAiUsageStore({
    now: () => 1_000,
    execute: async (command) => {
      commands.push(command);
      return JSON.stringify({ decision: "reserved", reservation: reservation({ createdAt: 1_000, updatedAt: 1_000, expiresAt: 1_000 + AI_RESERVATION_TTL_MS }), currentUsage: 1, remaining: 19 });
    },
  });
  const result = await store.reserve({ accountId, capability, period: "2026-10", idempotencyKey, limit: 20 });
  assert.equal(result.decision, "reserved");
  assert.equal(commands.length, 1);
  assert.equal(commands[0][0], "EVAL");
  assert.equal(commands[0][2], "2");
  assert.equal(commands[0][6], String(AI_RESERVATION_TTL_MS / 1000));
  assert.equal(commands[0][10], String(AI_OPERATION_RETENTION_MS / 1000));
  assert.match(commands[0][1], /expiresAt/);
  assert.doesNotMatch(JSON.stringify(commands), /xml|rfc|uuid|importe|prompt/i);
});
