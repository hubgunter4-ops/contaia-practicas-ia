import { validateSyntheticCanaryReport } from "./synthetic-canary.js";

export const AI_LAUNCH_APPROVAL_CONTRACT_VERSION = "ai-launch-approval-v1";

const HOLD_REASONS = Object.freeze({
  matrix: "model_matrix_not_approved",
  canary: "synthetic_canary_failed",
  privacy: "privacy_review_missing",
  config: "production_config_not_ready",
  metrics: "redacted_metrics_not_clean",
  evidence: "approval_evidence_missing",
});

function boundedCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.trunc(number), 1_000_000) : 0;
}

export function evaluateAiLaunchApproval({
  matrixApproved = false,
  canaryReport = null,
  privacyReview = false,
  productionConfigReady = false,
  metrics = {},
  evidenceRef = "",
} = {}) {
  const reasons = [];
  if (matrixApproved !== true) reasons.push(HOLD_REASONS.matrix);
  if (!validateSyntheticCanaryReport(canaryReport || {})) reasons.push(HOLD_REASONS.canary);
  if (privacyReview !== true) reasons.push(HOLD_REASONS.privacy);
  if (productionConfigReady !== true) reasons.push(HOLD_REASONS.config);
  if (boundedCount(metrics.redactionViolations) !== 0 || boundedCount(metrics.schemaViolations) !== 0) reasons.push(HOLD_REASONS.metrics);
  if (!/^[a-z0-9._:-]{8,120}$/i.test(String(evidenceRef))) reasons.push(HOLD_REASONS.evidence);
  return Object.freeze({
    contractVersion: AI_LAUNCH_APPROVAL_CONTRACT_VERSION,
    decision: reasons.length ? "hold" : "approved",
    reasons,
    canaryPassRate: validateSyntheticCanaryReport(canaryReport || {}) ? canaryReport.passRate : 0,
    evidenceRef: /^[a-z0-9._:-]{8,120}$/i.test(String(evidenceRef)) ? String(evidenceRef) : "",
  });
}

export function assertAiLaunchApproved(input = {}) {
  const decision = evaluateAiLaunchApproval(input);
  if (decision.decision !== "approved") {
    const error = new Error("El lanzamiento IA permanece en espera hasta completar la evidencia requerida.");
    error.code = "ai_launch_on_hold";
    error.decision = decision;
    throw error;
  }
  return decision;
}
