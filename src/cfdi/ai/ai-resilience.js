export const AI_RESILIENCE_CONTRACT_VERSION = "ai-resilience-v1";

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

export class AiResilienceError extends Error {
  constructor(message, { code = "ai_provider_unavailable", status = 503, retryAfter = 0 } = {}) {
    super(message);
    this.name = "AiResilienceError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function boundedPositiveInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

function isTransientFailure(error) {
  if (!error) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  if (TRANSIENT_STATUSES.has(Number(error.status))) return true;
  return ["ai_provider_unavailable", "ai_rate_store_unavailable", "ai_gateway_timeout"].includes(error.code);
}

export function createCircuitBreaker({
  failureThreshold = 3,
  resetTimeoutMs = 30_000,
  now = () => Date.now(),
} = {}) {
  const threshold = boundedPositiveInteger(failureThreshold, 3, 20);
  const resetAfter = boundedPositiveInteger(resetTimeoutMs, 30_000, 10 * 60_000);
  let state = "closed";
  let failures = 0;
  let openedAt = 0;
  let halfOpenProbe = false;

  function snapshot() {
    return Object.freeze({ state, failures, openedAt, halfOpenProbe, failureThreshold: threshold, resetTimeoutMs: resetAfter });
  }

  function beforeRequest() {
    const current = now();
    if (state === "open") {
      const elapsed = current - openedAt;
      if (elapsed < resetAfter) {
        throw new AiResilienceError("El proveedor de IA está temporalmente pausado. Conserva las herramientas locales y vuelve a intentar después.", {
          code: "ai_provider_unavailable",
          status: 503,
          retryAfter: Math.max(1, Math.ceil((resetAfter - elapsed) / 1000)),
        });
      }
      state = "half_open";
      halfOpenProbe = false;
    }
    if (state === "half_open") {
      if (halfOpenProbe) {
        throw new AiResilienceError("El proveedor de IA está recuperándose. Espera antes de volver a intentar.", {
          code: "ai_provider_unavailable",
          status: 503,
          retryAfter: 1,
        });
      }
      halfOpenProbe = true;
    }
    return true;
  }

  function recordSuccess() {
    state = "closed";
    failures = 0;
    openedAt = 0;
    halfOpenProbe = false;
    return snapshot();
  }

  function recordFailure(error) {
    if (!isTransientFailure(error)) {
      if (state === "half_open") halfOpenProbe = false;
      return snapshot();
    }
    if (state === "half_open") {
      state = "open";
      openedAt = now();
      failures = threshold;
      halfOpenProbe = false;
      return snapshot();
    }
    failures += 1;
    if (failures >= threshold) {
      state = "open";
      openedAt = now();
    }
    return snapshot();
  }

  async function run(operation, { signal } = {}) {
    beforeRequest();
    try {
      const result = await operation(signal);
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure(error);
      throw error;
    }
  }

  return Object.freeze({ beforeRequest, recordSuccess, recordFailure, run, snapshot });
}

export function composeAbortSignal(parentSignal, timeoutMs = 15_000) {
  const duration = boundedPositiveInteger(timeoutMs, 15_000, 120_000);
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }
  timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("La solicitud excedió el tiempo permitido.", "TimeoutError"));
  }, duration);
  return Object.freeze({
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.("abort", abortFromParent);
    },
  });
}

function assertHttpsUrl(value) {
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new AiResilienceError("El almacén distribuido no tiene una URL válida.", { code: "ai_rate_store_unavailable", status: 503 }); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search) {
    throw new AiResilienceError("El almacén distribuido no tiene una configuración segura.", { code: "ai_rate_store_unavailable", status: 503 });
  }
  return parsed.toString().replace(/\/$/, "");
}

export function createRedisRestCommandExecutor({ url, token, fetchImpl = fetch, timeoutMs = 2_000 } = {}) {
  const endpoint = assertHttpsUrl(url);
  if (typeof token !== "string" || token.trim().length < 8) throw new AiResilienceError("El almacén distribuido no tiene credencial configurada.", { code: "ai_rate_store_unavailable", status: 503 });
  return async function execute(command, { signal } = {}) {
    if (!Array.isArray(command) || command.length < 1) throw new TypeError("El comando Redis no es válido.");
    const request = composeAbortSignal(signal, timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        signal: request.signal,
        body: JSON.stringify(command),
      });
      if (!response.ok) throw new AiResilienceError("El almacén distribuido no respondió.", { code: "ai_rate_store_unavailable", status: 503, retryAfter: 2 });
      const payload = await response.json().catch(() => null);
      if (!payload || !("result" in payload)) throw new AiResilienceError("El almacén distribuido devolvió una respuesta inválida.", { code: "ai_rate_store_unavailable", status: 503, retryAfter: 2 });
      return payload.result;
    } catch (error) {
      if (error instanceof AiResilienceError) throw error;
      if (request.timedOut()) throw new AiResilienceError("El almacén distribuido excedió el tiempo permitido.", { code: "ai_rate_store_unavailable", status: 503, retryAfter: 2 });
      throw new AiResilienceError("No se pudo consultar el almacén distribuido.", { code: "ai_rate_store_unavailable", status: 503, retryAfter: 2 });
    } finally {
      request.dispose();
    }
  };
}

export const __test = { isTransientFailure, boundedPositiveInteger };
