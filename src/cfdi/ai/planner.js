import { assertNoModelSensitiveFields, ToolRegistryError } from "./tool-registry.js";
import { assertPlannerSafeText, __test as dlpTest } from "./ai-dlp-gate.js";

const MAX_MESSAGE_LENGTH = 2000;
const PLANNER_INTENTS = Object.freeze([
  Object.freeze({ id: "cfdi.summary", toolId: "cfdi.summary", label: "Ver resumen", description: "Resume conteos, monedas y calidad del análisis local." }),
  Object.freeze({ id: "cfdi.alerts", toolId: "cfdi.alerts", label: "Ver alertas", description: "Agrupa alertas locales y prioridades de revisión." }),
  Object.freeze({ id: "cfdi.payment_review", toolId: "cfdi.payment_links", label: "Revisar pagos", description: "Resume relaciones, saldos y diferencias de pagos." }),
  Object.freeze({ id: "cfdi.next_step", toolId: "cfdi.next_step", label: "Siguiente paso", description: "Propone la siguiente vista local que debe revisar la persona." }),
]);
const INTENT_BY_TOOL = new Map(PLANNER_INTENTS.map((item) => [item.toolId, item]));
export const CFDI_PLANNER_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    intent: { type: "string", enum: PLANNER_INTENTS.map(({ id }) => id) },
    toolId: { type: "string", enum: PLANNER_INTENTS.map(({ toolId }) => toolId) },
    toolVersion: { type: "string", pattern: "^\\d+(?:\\.\\d+)*$" },
    arguments: { type: "object", properties: { scope: { type: "string", enum: ["all"] } }, additionalProperties: false },
    missing: { type: "array", items: { type: "string", minLength: 1, maxLength: 120 }, maxItems: 6 },
    requiresExplicitUserAction: { type: "boolean" },
    humanReviewRequired: { type: "boolean", enum: [true] },
  },
  required: ["intent", "toolId", "arguments", "missing", "requiresExplicitUserAction", "humanReviewRequired"],
  additionalProperties: false,
});

function normalizeMessage(message) {
  try {
    return assertPlannerSafeText(message);
  } catch (error) {
    if (error?.code === "planner_input_invalid") throw new ToolRegistryError("La petición del planner debe tener entre 1 y 2,000 caracteres.", "planner_input_invalid");
    if (error?.code === "planner_input_confirmation_required") throw new ToolRegistryError(error.message, "planner_input_confirmation_required");
    throw new ToolRegistryError(error?.message || "El planner no puede recibir esta petición.", "planner_input_sensitive");
  }
}

function withoutAnalysisRef(schema) {
  const properties = { ...(schema?.properties || {}) };
  delete properties.analysisRef;
  return Object.freeze({
    ...schema,
    required: (schema?.required || []).filter((key) => key !== "analysisRef"),
    properties,
    additionalProperties: false,
  });
}

function safeToolDescriptor(definition) {
  return {
    toolId: definition.id,
    version: definition.version,
    inputSchema: withoutAnalysisRef(definition.inputSchema),
  };
}

export function listCfdiPlannerIntents() {
  return PLANNER_INTENTS.map((item) => Object.freeze({ ...item }));
}

export function buildCfdiPlannerRequest({ message, toolRegistry } = {}) {
  if (!toolRegistry || typeof toolRegistry.list !== "function") throw new TypeError("El planner CFDI necesita un ToolRegistry válido.");
  const normalized = normalizeMessage(message);
  const callable = new Map(toolRegistry.list({ modelCallable: true }).map((definition) => [definition.id, definition]));
  const intents = PLANNER_INTENTS
    .filter(({ toolId }) => callable.has(toolId))
    .map((item) => ({ ...item, tool: safeToolDescriptor(callable.get(item.toolId)) }));
  return Object.freeze({
    schemaVersion: "cfdi-planner-request-v1",
    untrustedMessage: normalized,
    instruction: "Selecciona una sola intención y herramienta del catálogo. Devuelve JSON estricto; no inventes campos, argumentos, herramientas ni acciones. No recibes análisis, XML, archivos ni identificadores.",
    intents: Object.freeze(intents),
  });
}

export function parseCfdiPlannerOutput(raw) {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { throw new ToolRegistryError("El planner no devolvió JSON válido.", "planner_json_invalid"); }
  }
  return raw;
}

export function validateCfdiPlannerOutput(raw, toolRegistry) {
  if (!toolRegistry || typeof toolRegistry.validatePlannerPlan !== "function") throw new TypeError("El planner CFDI necesita validación del ToolRegistry.");
  const plan = parseCfdiPlannerOutput(raw);
  assertNoModelSensitiveFields(plan, "planner_output");
  const validated = toolRegistry.validatePlannerPlan(plan);
  const intent = INTENT_BY_TOOL.get(validated.toolId);
  if (!intent || intent.id !== validated.intent) throw new ToolRegistryError("La intención y la herramienta del planner no coinciden.", "planner_intent_mismatch");
  return Object.freeze({
    ...validated,
    intent: intent.id,
  });
}

export const __test = { MAX_MESSAGE_LENGTH, PLANNER_INTENTS, normalizeMessage, withoutAnalysisRef, safeToolDescriptor, dlpTest };
