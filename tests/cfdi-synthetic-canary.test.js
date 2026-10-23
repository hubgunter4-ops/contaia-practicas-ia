import test from "node:test";
import assert from "node:assert/strict";
import { runSyntheticCanary, SYNTHETIC_CANARY_CASES, validateSyntheticCanaryReport } from "../src/cfdi/ai/synthetic-canary.js";
import { assertAiLaunchApproved, evaluateAiLaunchApproval } from "../src/cfdi/ai/launch-approval.js";

const passingOutput = (input) => ({ ok: true, schemaValid: true, noSensitiveData: true, intent: input.intent });

test("el canary usa solo casos sintéticos y devuelve resultados agregados", async () => {
  const received = [];
  const report = await runSyntheticCanary({ execute: async (input) => { received.push(input); return passingOutput(input); }, now: (() => { let value = 100; return () => (value += 10); })() });
  assert.equal(report.total, SYNTHETIC_CANARY_CASES.length);
  assert.equal(report.passed, report.total);
  assert.equal(report.passRate, 1);
  assert.ok(received.every((input) => !/rfc|uuid|xml|bearer|@/i.test(JSON.stringify(input))));
  assert.ok(report.cases.every((item) => !Object.hasOwn(item, "message") && !Object.hasOwn(item, "response")));
  assert.equal(validateSyntheticCanaryReport(report), true);
});

test("el canary convierte una salida inválida en fallo enumerado", async () => {
  const report = await runSyntheticCanary({ cases: [SYNTHETIC_CANARY_CASES[0]], execute: async () => ({ ok: false, errorCode: "leak_of_prompt" }) });
  assert.equal(report.failed, 1);
  assert.equal(report.cases[0].errorCode, "canary_unexpected");
  assert.equal(validateSyntheticCanaryReport(report), true);
});

test("el canary rechaza fixtures con identificadores o XML", async () => {
  await assert.rejects(() => runSyntheticCanary({ cases: [{ id: "rfc_case", intent: "summary", message: "Incluye RFC ABC010101AB1" }], execute: passingOutput }), /contrato sintético/);
});

test("el gate permanece en espera por defecto", () => {
  const decision = evaluateAiLaunchApproval();
  assert.equal(decision.decision, "hold");
  assert.ok(decision.reasons.includes("model_matrix_not_approved"));
});

test("el gate aprueba únicamente con evidencia completa", () => {
  const report = {
    contractVersion: "ai-synthetic-canary-v1", total: 1, passed: 1, failed: 0, passRate: 1,
    cases: [{ id: "summary", passed: true, errorCode: "" }],
  };
  const decision = evaluateAiLaunchApproval({ matrixApproved: true, canaryReport: report, privacyReview: true, productionConfigReady: true, metrics: { redactionViolations: 0, schemaViolations: 0 }, evidenceRef: "e5-canary-20261023" });
  assert.equal(decision.decision, "approved");
  assert.doesNotThrow(() => assertAiLaunchApproved({ matrixApproved: true, canaryReport: report, privacyReview: true, productionConfigReady: true, metrics: { redactionViolations: 0, schemaViolations: 0 }, evidenceRef: "e5-canary-20261023" }));
});

test("el gate no aprueba si existe una violación redacted", () => {
  const report = { contractVersion: "ai-synthetic-canary-v1", total: 1, passed: 1, failed: 0, passRate: 1, cases: [{ id: "summary", passed: true, errorCode: "" }] };
  const decision = evaluateAiLaunchApproval({ matrixApproved: true, canaryReport: report, privacyReview: true, productionConfigReady: true, metrics: { redactionViolations: 1 }, evidenceRef: "e5-canary-20261023" });
  assert.equal(decision.decision, "hold");
  assert.ok(decision.reasons.includes("redacted_metrics_not_clean"));
});
