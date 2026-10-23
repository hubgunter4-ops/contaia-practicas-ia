import { routeCfdiIntent } from "./intent-router.js";
import { buildCfdiPlannerRequest, validateCfdiPlannerOutput } from "./planner.js";
import { ToolRegistryError, assertNoModelSensitiveFields } from "./tool-registry.js";

const REQUEST_KEYS = new Set([
  "requestId",
  "message",
  "analysisRef",
  "mode",
  "explicitUserAction",
  "destination",
  "sessionEpoch",
  "toolInput",
]);

const MODES = new Set(["local_only", "plan_and_local", "explain_safe_summary"]);

function opaqueRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `cfdi-ai:${uuid}` : `cfdi-ai:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(now) {
  const value = now();
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(message, code = "request_invalid") {
  return new ToolRegistryError(message, code);
}

export function validateCfdiAiRequest(raw) {
  assertNoModelSensitiveFields(raw, "cfdi_ai_request");
  if (!plainObject(raw)) throw fail("La consulta CFDI debe ser un objeto plano.");
  for (const key of Object.keys(raw)) if (!REQUEST_KEYS.has(key)) throw fail(`El campo ${key} no está permitido en la consulta CFDI.`);
  if (typeof raw.message !== "string" || !raw.message.trim() || raw.message.trim().length > 2000) {
    throw fail("Escribe una petición CFDI de 1 a 2,000 caracteres.");
  }
  if (typeof raw.analysisRef !== "string" || !/^analysis:[a-zA-Z0-9:_-]+$/.test(raw.analysisRef)) {
    throw fail("La referencia de análisis CFDI no es válida.");
  }
  if (!Number.isInteger(raw.sessionEpoch) || raw.sessionEpoch < 0) throw fail("La época de sesión no es válida.");
  if (typeof raw.explicitUserAction !== "boolean") throw fail("Falta indicar si existe una acción humana explícita.");
  const mode = raw.mode || "plan_and_local";
  if (!MODES.has(mode)) throw fail("El modo de consulta CFDI no está permitido.");
  if (raw.destination !== undefined && raw.destination !== "nora-advisor") throw fail("El destino de explicación no está permitido.", "destination_not_allowed");
  if (mode === "explain_safe_summary" && raw.destination !== "nora-advisor") throw fail("La explicación segura necesita destino Nora.", "destination_required");
  const toolInput = raw.toolInput === undefined ? {} : raw.toolInput;
  if (!plainObject(toolInput)) throw fail("Los parámetros de la herramienta no son válidos.");
  if (Object.hasOwn(toolInput, "analysisRef")) throw fail("La referencia de análisis no se repite dentro de los parámetros.");
  return Object.freeze({
    requestId: typeof raw.requestId === "string" && raw.requestId.trim() ? raw.requestId.trim().slice(0, 120) : "",
    message: raw.message.trim().replace(/\s+/g, " "),
    analysisRef: raw.analysisRef,
    mode,
    explicitUserAction: raw.explicitUserAction,
    destination: raw.destination || "",
    sessionEpoch: raw.sessionEpoch,
    toolInput,
  });
}

function defaultEvidence(intent, generatedAt, warnings = []) {
  return {
    schemaVersion: "cfdi-evidence-v1",
    source: "cfdi_analysis",
    calculation: intent?.toolId || "intent_router",
    generatedAt,
    humanReviewRequired: true,
    warnings,
  };
}

function errorDetail(error) {
  const code = error instanceof ToolRegistryError ? error.code : "tool_execution_failed";
  const message = error instanceof Error ? error.message : "No se pudo completar la consulta local.";
  return { code, message: String(message).slice(0, 300) };
}

function candidatesFrom(route) {
  return (route.candidates || []).map(({ id, label }) => ({ id, label, requiresExplicitUserAction: true }));
}

function resultNeedsReview(toolId, artifact) {
  if (toolId === "cfdi.alerts") return artifact.alerts.length > 0;
  if (toolId === "cfdi.payment_links") {
    return [artifact.unmatched, artifact.balanceDifferences, artifact.missingInvoiceReferences, artifact.overpaidLinks, artifact.estimatedTaxPayments].some((value) => Number(value) > 0);
  }
  if (toolId === "cfdi.summary") return Number(artifact.quality?.alerts) > 0;
  return artifact.status === "needs_review";
}

function nextActions(toolId, artifact) {
  const actions = [];
  if (toolId === "cfdi.alerts" || toolId === "cfdi.summary") actions.push({ id: "open_alerts", label: "Revisar alertas", requiresExplicitUserAction: true });
  if (toolId === "cfdi.payment_links" || (toolId === "cfdi.alerts" && artifact.alerts.some((alert) => String(alert.code || "").startsWith("payment_")))) {
    actions.push({ id: "open_payments", label: "Revisar pagos", requiresExplicitUserAction: true });
  }
  if (toolId === "cfdi.tax_report") actions.push({ id: "export_local", label: "Exportar reporte local", requiresExplicitUserAction: true });
  if (toolId === "cfdi.next_step" && artifact.action) actions.push({ id: artifact.action, label: artifact.label, requiresExplicitUserAction: true });
  actions.push({ id: "ask_nora", label: "Pedir apoyo a Nora", requiresExplicitUserAction: true });
  actions.push({ id: "prepare_handoff", label: "Preparar handoff local", requiresExplicitUserAction: true });
  return actions;
}

function makeBase(request, requestId, generatedAt) {
  return {
    requestId,
    status: "failed",
    intent: { id: "", confidence: "low", source: "deterministic_router" },
    plan: null,
    artifact: null,
    explanation: { status: "not_requested" },
    evidence: defaultEvidence(null, generatedAt),
    nextActions: [],
    error: null,
    request: { analysisRef: request?.analysisRef || "", mode: request?.mode || "" },
  };
}

export function createCfdiAiOrchestrator({ toolRegistry, epochProvider = () => 0, cleanupScope = null, now = () => new Date(), requestIdFactory = opaqueRequestId, explainAdapter = null, plannerAdapter = null } = {}) {
  if (!toolRegistry || typeof toolRegistry.execute !== "function" || typeof toolRegistry.get !== "function") {
    throw new TypeError("El AiOrchestrator CFDI necesita un ToolRegistry válido.");
  }
  if (typeof epochProvider !== "function") throw new TypeError("El AiOrchestrator CFDI necesita epochProvider.");
  if (typeof now !== "function" || typeof requestIdFactory !== "function") throw new TypeError("El AiOrchestrator CFDI necesita reloj e identificador válidos.");
  if (explainAdapter !== null && typeof explainAdapter !== "function") throw new TypeError("El adaptador de explicación CFDI no es válido.");
  if (plannerAdapter !== null && typeof plannerAdapter !== "function") throw new TypeError("El adaptador del planner CFDI no es válido.");
  let disposed = false;
  const pending = new Map();

  function dispose(reason = "orchestrator-disposed") {
    if (disposed) return;
    disposed = true;
    for (const controller of pending.values()) {
      if (!controller.signal.aborted) controller.abort(reason);
    }
    pending.clear();
  }

  if (cleanupScope?.add) cleanupScope.add(() => dispose("island-destroyed"));

  async function run(rawRequest) {
    const generatedAt = nowIso(now);
    let request;
    let requestId = "";
    try {
      request = validateCfdiAiRequest(rawRequest);
      requestId = request.requestId || requestIdFactory();
    } catch (error) {
      const result = makeBase(null, requestId || requestIdFactory(), generatedAt);
      result.error = errorDetail(error);
      return result;
    }
    const result = makeBase(request, requestId, generatedAt);
    if (disposed) {
      result.error = { code: "orchestrator_disposed", message: "La consulta CFDI ya no está disponible en esta isla." };
      return result;
    }
    if (Number(epochProvider()) !== request.sessionEpoch) {
      result.status = "cancelled";
      result.error = { code: "session_expired", message: "La sesión local cambió antes de iniciar la consulta." };
      return result;
    }
    const route = routeCfdiIntent(request.message);
    if (route.status === "ambiguous") {
      result.status = "needs_input";
      result.intent = { id: "ambiguous", confidence: "low", source: "deterministic_router" };
      result.evidence = defaultEvidence(null, generatedAt, ["La petición coincide con más de una consulta local."]);
      result.nextActions = candidatesFrom(route);
      return result;
    }
    if (route.status === "unsupported") {
      if (plannerAdapter) {
        const controller = new AbortController();
        pending.set(requestId, controller);
        try {
          const plannerRequest = buildCfdiPlannerRequest({ message: request.message, toolRegistry });
          const rawPlan = await plannerAdapter(plannerRequest, { signal: controller.signal, sessionEpoch: request.sessionEpoch, requestId });
          const plannerPlan = validateCfdiPlannerOutput(rawPlan, toolRegistry);
          result.intent = { id: plannerPlan.intent, confidence: "structured", source: "planner_json" };
          result.plan = { toolId: plannerPlan.toolId, toolVersion: plannerPlan.toolVersion, plannerVersion: "1", inputSummary: { analysisRef: request.analysisRef } };
          if (plannerPlan.missing.length) {
            result.status = "needs_input";
            result.evidence = defaultEvidence({ toolId: plannerPlan.toolId }, generatedAt, ["El planner pidió un dato seguro antes de ejecutar la herramienta local."]);
            result.nextActions = [];
            return result;
          }
          if (plannerPlan.requiresExplicitUserAction && !request.explicitUserAction) {
            result.status = "needs_input";
            result.error = { code: "explicit_action_required", message: "La herramienta propuesta necesita una acción humana explícita." };
            result.evidence = defaultEvidence({ toolId: plannerPlan.toolId }, generatedAt, ["El planner no puede aprobar acciones por sí mismo."]);
            return result;
          }
          const execution = await toolRegistry.execute(plannerPlan.toolId, {
            analysisRef: request.analysisRef,
            ...plannerPlan.arguments,
          }, {
            signal: controller.signal,
            sessionEpoch: request.sessionEpoch,
            epochProvider,
            analysisRef: request.analysisRef,
            explicitUserAction: request.explicitUserAction,
          });
          result.artifact = execution.output;
          result.status = resultNeedsReview(execution.tool.id, execution.output) ? "needs_review" : "completed";
          result.evidence = {
            ...defaultEvidence({ toolId: execution.tool.id }, generatedAt, ["La herramienta fue seleccionada por un planner JSON validado; el resultado se calculó localmente."]),
            ...(execution.output.evidence || {}),
            schemaVersion: "cfdi-evidence-v1",
            generatedAt,
            planner: { version: plannerPlan.plannerVersion, intent: plannerPlan.intent },
          };
          result.nextActions = nextActions(execution.tool.id, execution.output);
          return result;
        } catch (error) {
          const detail = errorDetail(error);
          result.error = detail;
          result.status = ["operation_cancelled", "session_expired"].includes(detail.code) ? "cancelled" : "needs_input";
          result.evidence = defaultEvidence(null, generatedAt, ["El planner fue bloqueado; no se ejecutó ninguna herramienta no validada."]);
          return result;
        } finally {
          pending.delete(requestId);
        }
      }
      result.status = "needs_input";
      result.intent = { id: "unsupported", confidence: "low", source: "deterministic_router" };
      result.evidence = defaultEvidence(null, generatedAt, ["La petición no corresponde a una consulta CFDI local admitida."]);
      result.nextActions = [{ id: "ask_nora", label: "Pedir orientación a Nora", requiresExplicitUserAction: true }];
      return result;
    }
    const intent = route.intent;
    result.intent = { id: intent.id, confidence: "high", source: "deterministic_router" };
    if (intent.id === "cfdi.explain_result" || request.mode === "explain_safe_summary") {
      result.status = "needs_input";
      result.explanation = { status: "unavailable" };
      result.evidence = defaultEvidence(intent, generatedAt, ["La explicación remota se implementa en una fase posterior y requiere una acción explícita."]);
      result.nextActions = [{ id: "ask_nora", label: "Pedir apoyo a Nora", requiresExplicitUserAction: true }];
      return result;
    }
    if (intent.id === "cfdi.tax_report" && (!request.explicitUserAction || !request.toolInput.businessRfc)) {
      result.status = "needs_input";
      result.evidence = defaultEvidence(intent, generatedAt, ["El reporte fiscal necesita RFC empresarial explícito dentro del navegador."]);
      result.nextActions = [{ id: "generate_tax_report", label: "Capturar RFC y generar reporte local", requiresExplicitUserAction: true }];
      return result;
    }
    const controller = new AbortController();
    pending.set(requestId, controller);
    const input = intent.id === "cfdi.summary"
      ? { analysisRef: request.analysisRef, scope: "all" }
      : { analysisRef: request.analysisRef, ...request.toolInput };
    try {
      const execution = await toolRegistry.execute(intent.toolId, input, {
        signal: controller.signal,
        sessionEpoch: request.sessionEpoch,
        epochProvider,
        analysisRef: request.analysisRef,
        explicitUserAction: request.explicitUserAction,
      });
      result.plan = { toolId: execution.tool.id, toolVersion: execution.tool.version, inputSummary: { analysisRef: request.analysisRef } };
      result.artifact = execution.output;
      result.status = resultNeedsReview(execution.tool.id, execution.output) ? "needs_review" : "completed";
      result.evidence = {
        ...defaultEvidence(intent, generatedAt),
        ...(execution.output.evidence || {}),
        schemaVersion: "cfdi-evidence-v1",
        generatedAt,
      };
      result.nextActions = nextActions(execution.tool.id, execution.output);
      return result;
    } catch (error) {
      const detail = errorDetail(error);
      result.error = detail;
      if (detail.code === "operation_cancelled" || detail.code === "session_expired") result.status = "cancelled";
      return result;
    } finally {
      pending.delete(requestId);
    }
  }

  async function explain(rawRequest) {
    const generatedAt = nowIso(now);
    let request;
    let requestId = "";
    try {
      request = validateCfdiAiRequest({ ...rawRequest, mode: "explain_safe_summary", toolInput: {} });
      requestId = request.requestId || requestIdFactory();
    } catch (error) {
      return {
        requestId: requestId || requestIdFactory(),
        status: "failed",
        explanation: { status: "unavailable" },
        evidence: defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt, ["La explicación no se preparó."]),
        error: errorDetail(error),
      };
    }
    if (disposed) return {
      requestId,
      status: "cancelled",
      explanation: { status: "unavailable" },
      evidence: defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt, ["La isla CFDI ya fue desmontada."]),
      error: { code: "orchestrator_disposed", message: "La explicación ya no está disponible en esta isla." },
    };
    if (Number(epochProvider()) !== request.sessionEpoch) return {
      requestId,
      status: "cancelled",
      explanation: { status: "unavailable" },
      evidence: defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt, ["La sesión local cambió antes de compartir el resumen."]),
      error: { code: "session_expired", message: "La sesión local cambió antes de compartir el resumen." },
    };
    if (!request.explicitUserAction) return {
      requestId,
      status: "needs_input",
      explanation: { status: "unavailable" },
      evidence: defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt, ["La explicación necesita una confirmación humana explícita."]),
      error: { code: "explicit_action_required", message: "Confirma antes de preparar el resumen para Nora." },
    };
    if (!explainAdapter) return {
      requestId,
      status: "needs_input",
      explanation: { status: "unavailable" },
      evidence: defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt, ["El adaptador de Nora no está disponible en esta isla."]),
      error: { code: "ai_unavailable", message: "La ayuda remota no está disponible; conserva el resultado local." },
    };
    const controller = new AbortController();
    pending.set(requestId, controller);
    try {
      const execution = await toolRegistry.execute("cfdi.safe_context", {
        analysisRef: request.analysisRef,
        destination: "nora-advisor",
      }, {
        signal: controller.signal,
        sessionEpoch: request.sessionEpoch,
        epochProvider,
        analysisRef: request.analysisRef,
        explicitUserAction: true,
      });
      assertNoModelSensitiveFields(execution.output, "cfdi.explanation_context");
      if (controller.signal.aborted) throw new ToolRegistryError("La explicación fue cancelada.", "operation_cancelled");
      await explainAdapter({
        requestId,
        message: request.message,
        safeContext: execution.output,
        signal: controller.signal,
        sessionEpoch: request.sessionEpoch,
      });
      return {
        requestId,
        status: "completed",
        explanation: { status: "pending", provider: "nora-existing-adapter" },
        evidence: {
          ...defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt),
          calculation: "cfdi.safe_context",
          warnings: ["Nora recibe solo el resumen depurado; el envío final requiere otra acción en Asistente abierto."],
        },
        error: null,
      };
    } catch (error) {
      const detail = errorDetail(error);
      return {
        requestId,
        status: detail.code === "operation_cancelled" || detail.code === "session_expired" ? "cancelled" : "failed",
        explanation: { status: "unavailable" },
        evidence: defaultEvidence({ toolId: "cfdi.safe_context" }, generatedAt, ["El resultado local permanece disponible."]),
        error: detail,
      };
    } finally {
      pending.delete(requestId);
    }
  }

  return Object.freeze({
    run,
    explain,
    dispose,
    get pendingCount() { return pending.size; },
    get disposed() { return disposed; },
  });
}

export const __test = { defaultEvidence, resultNeedsReview, nextActions, plainObject };
