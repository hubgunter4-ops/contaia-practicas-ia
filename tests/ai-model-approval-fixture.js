const entry = (provider, model) => ({
  provider,
  model,
  status: "approved",
  capabilities: { json_schema_strict: true, structured_output: true, abort_signal: true },
  controls: { no_prompt_logging_by_default: true, configured_retention_policy: true, bounded_output: true },
  retention: { promptLogging: "none", training: "not_permitted", maxDays: 0 },
  approval: {
    reviewedBy: "test-security-review",
    reviewedAt: "2026-10-23T10:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    evidenceRef: `fixture:2026-10-23/${provider}`,
  },
});

export const AI_MODEL_APPROVALS_JSON = JSON.stringify({
  version: "ai-model-approval-v1",
  entries: [entry("openai", "openai/gpt-test"), entry("anthropic", "anthropic/claude-test")],
});
