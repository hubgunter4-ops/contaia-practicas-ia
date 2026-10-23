export const SYNTHETIC_CANARY_CONTRACT_VERSION = "ai-synthetic-canary-v1";

export const SYNTHETIC_CANARY_CASES = Object.freeze([
  Object.freeze({ id: "summary", intent: "summary", message: "Resume este caso CFDI ficticio sin consultar datos externos." }),
  Object.freeze({ id: "alerts", intent: "alerts", message: "¿Qué alertas debería revisar en un lote ficticio?" }),
  Object.freeze({ id: "payments", intent: "payments", message: "¿Cómo reviso los pagos de un ejemplo ficticio?" }),
  Object.freeze({ id: "next_step", intent: "next_step", message: "¿Cuál es el siguiente paso para revisar un caso ficticio?" }),
]);

const SENSITIVE_PATTERN = /(?:\bRFC\b|\bCURP\b|\bUUID\b|\bSAT\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{10,}\b|<\?xml|api[_-]?key|bearer\s+[\w.-]+)/i;

function safeCase(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.intent !== "string" || typeof item.message !== "string") {
    throw new Error("Caso de canary inválido.");
  }
  if (!/^[a-z_]{3,32}$/.test(item.id) || !/^[a-z_]{3,32}$/.test(item.intent) || item.message.length > 240 || SENSITIVE_PATTERN.test(item.message)) {
    throw new Error("El caso de canary no cumple el contrato sintético.");
  }
  return { id: item.id, intent: item.intent, message: item.message };
}

function safeErrorCode(value) {
  return ["canary_case_failed", "canary_schema_invalid", "canary_provider_unavailable", "canary_unexpected"].includes(value)
    ? value
    : "canary_unexpected";
}

function safeBoolean(value) { return value === true; }

export async function runSyntheticCanary({ execute, cases = SYNTHETIC_CANARY_CASES, now = () => Date.now() } = {}) {
  if (typeof execute !== "function") throw new Error("El canary requiere un ejecutor inyectado.");
  const selectedCases = cases.map(safeCase);
  const startedAt = now();
  const results = [];
  for (const item of selectedCases) {
    try {
      const output = await execute({ caseId: item.id, intent: item.intent, message: item.message });
      const passed = safeBoolean(output?.ok)
        && safeBoolean(output?.schemaValid)
        && safeBoolean(output?.noSensitiveData)
        && output?.intent === item.intent;
      results.push({ id: item.id, passed, errorCode: passed ? "" : safeErrorCode(output?.errorCode) });
    } catch {
      results.push({ id: item.id, passed: false, errorCode: "canary_provider_unavailable" });
    }
  }
  const passed = results.filter((result) => result.passed).length;
  return Object.freeze({
    contractVersion: SYNTHETIC_CANARY_CONTRACT_VERSION,
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    durationBucket: (() => {
      const duration = Math.max(0, now() - startedAt);
      return duration < 100 ? "lt_100ms" : duration < 500 ? "100_499ms" : duration < 1000 ? "500_999ms" : "1s_plus";
    })(),
    cases: results,
  });
}

export function validateSyntheticCanaryReport(report = {}) {
  if (report.contractVersion !== SYNTHETIC_CANARY_CONTRACT_VERSION || !Number.isInteger(report.total) || report.total < 1 || report.total > 32) return false;
  if (!Number.isInteger(report.passed) || !Number.isInteger(report.failed) || report.passed < 0 || report.failed < 0 || report.passed + report.failed !== report.total) return false;
  if (report.passRate !== report.passed / report.total || !Array.isArray(report.cases) || report.cases.length !== report.total) return false;
  const errorCodes = new Set(["canary_case_failed", "canary_schema_invalid", "canary_provider_unavailable", "canary_unexpected"]);
  return report.cases.every((item) => /^[a-z_]{3,32}$/.test(item?.id) && typeof item?.passed === "boolean" && (item.passed ? item.errorCode === "" : errorCodes.has(item.errorCode)));
}
