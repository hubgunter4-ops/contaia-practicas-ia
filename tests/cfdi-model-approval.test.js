import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_MODEL_APPROVAL_CONTRACT_VERSION,
  ModelApprovalError,
  createModelApprovalRegistry,
  loadModelApprovalRegistry,
  parseModelApprovalMatrix,
} from "../src/cfdi/ai/model-approval.js";

const validEntry = (overrides = {}) => ({
  provider: "openai",
  model: "openai/gpt-test",
  status: "approved",
  capabilities: { json_schema_strict: true, structured_output: true, abort_signal: true },
  controls: { no_prompt_logging_by_default: true, configured_retention_policy: true, bounded_output: true },
  retention: { promptLogging: "none", training: "not_permitted", maxDays: 0 },
  approval: {
    reviewedBy: "security-review",
    reviewedAt: "2026-10-23T10:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    evidenceRef: "catalog:2026-10-23/openai-gpt-test",
  },
  ...overrides,
});
const matrix = (entries = [validEntry()]) => ({ version: AI_MODEL_APPROVAL_CONTRACT_VERSION, entries });

const now = () => Date.parse("2026-10-23T12:00:00.000Z");

test("acepta una entrada exacta y expone únicamente estado público", () => {
  const parsed = parseModelApprovalMatrix(matrix(), { now: now() });
  const registry = createModelApprovalRegistry({ matrix: parsed, now });
  assert.equal(registry.status("openai", "openai/gpt-test"), "approved");
  assert.deepEqual(registry.listPublic(), [{ provider: "openai", model: "openai/gpt-test", status: "approved" }]);
  assert.equal(registry.get("openai", "openai/gpt-test").retention.maxDays, 0);
});

test("rechaza proveedor fuera de allowlist y modelo con prefijo cruzado", () => {
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ provider: "google", model: "google/model" })]), { now: now() }), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ model: "anthropic/model" })]), { now: now() }), ModelApprovalError);
});

test("rechaza estados no aprobados, capacidades faltantes y retención permisiva", () => {
  const candidate = parseModelApprovalMatrix(matrix([validEntry({ status: "candidate" })]), { now: now() });
  assert.equal(createModelApprovalRegistry({ matrix: candidate, now }).status("openai", "openai/gpt-test"), "candidate");
  assert.throws(() => createModelApprovalRegistry({ matrix: candidate, now }).assertApproved("openai", "openai/gpt-test"), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ capabilities: { json_schema_strict: true, structured_output: true, abort_signal: false } })]), { now: now() }), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ retention: { promptLogging: "redacted", training: "not_permitted", maxDays: 7 } })]), { now: now() }), ModelApprovalError);
});

test("rechaza campos extra y secretos camuflados", () => {
  assert.throws(() => parseModelApprovalMatrix({ ...matrix(), extra: "no" }, { now: now() }), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ apiKey: "secret" })]), { now: now() }), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ approval: { ...validEntry().approval, email: "x@example.test" } })]), { now: now() }), ModelApprovalError);
});

test("marca expiración y no permite que un modelo vencido pase al Gateway", () => {
  const parsed = parseModelApprovalMatrix(matrix(), { now: now() });
  const registry = createModelApprovalRegistry({ matrix: parsed, now: () => Date.parse("2027-02-01T00:00:00.000Z") });
  assert.equal(registry.status("openai", "openai/gpt-test"), "expired");
  assert.throws(() => registry.assertApproved("openai", "openai/gpt-test"), (error) => error.code === "ai_provider_unapproved" && error.reason === "expired");
});

test("matriz ausente o JSON inválido queda cerrada y no se filtra el contenido", () => {
  const empty = loadModelApprovalRegistry("");
  assert.equal(empty.status("openai", "openai/gpt-test"), "unapproved");
  const invalid = loadModelApprovalRegistry('{"version":"ai-model-approval-v1","entries":[');
  assert.equal(invalid.status("openai", "openai/gpt-test"), "unapproved");
  assert.equal(invalid.configurationError, "invalid_matrix");
  assert.throws(() => invalid.assertApproved("openai", "openai/gpt-test"), (error) => error.code === "ai_provider_unapproved");
});

test("rechaza duplicados, expiración pasada y versiones desconocidas", () => {
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry(), validEntry()]), { now: now() }), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix(matrix([validEntry({ approval: { ...validEntry().approval, expiresAt: "2026-10-23T11:00:00.000Z" } })]), { now: now() }), ModelApprovalError);
  assert.throws(() => parseModelApprovalMatrix({ version: "otro", entries: [] }, { now: now() }), ModelApprovalError);
});
