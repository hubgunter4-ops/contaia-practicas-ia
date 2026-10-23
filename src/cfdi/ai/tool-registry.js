const FORBIDDEN_MODEL_KEYS = new Set([
  "xml",
  "rawxml",
  "documenttext",
  "file",
  "blob",
  "arraybuffer",
  "rfc",
  "uuid",
  "folio",
  "password",
  "token",
  "supabasesession",
  "sourcepath",
  "localpath",
]);

const ALLOWED_DEFINITION_KEYS = new Set([
  "id",
  "version",
  "domain",
  "execution",
  "readOnly",
  "modelCallable",
  "requiresExplicitUserAction",
  "inputSchema",
  "outputSchema",
  "run",
]);

const ALLOWED_CONTEXT_KEYS = new Set([
  "signal",
  "sessionEpoch",
  "epochProvider",
  "analysisRef",
  "explicitUserAction",
]);

export class ToolRegistryError extends Error {
  constructor(message, code = "tool_registry_error") {
    super(message);
    this.name = "ToolRegistryError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedKey(key) {
  return String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertSafeValue(value, path = "value", depth = 0) {
  if (depth > 12) throw new ToolRegistryError("El payload supera la profundidad permitida.", "payload_too_deep");
  if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) return;
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new ToolRegistryError(`El tipo de ${path} no está permitido.`, "payload_invalid");
  }
  if (typeof ArrayBuffer !== "undefined" && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) {
    throw new ToolRegistryError(`El buffer ${path} no está permitido en este contrato.`, "payload_sensitive");
  }
  if (typeof File !== "undefined" && value instanceof File) {
    throw new ToolRegistryError(`El archivo ${path} no está permitido en este contrato.`, "payload_sensitive");
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    throw new ToolRegistryError(`El blob ${path} no está permitido en este contrato.`, "payload_sensitive");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) throw new ToolRegistryError(`El objeto ${path} no está permitido.`, "payload_invalid");
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_MODEL_KEYS.has(normalizedKey(key))) {
      throw new ToolRegistryError(`El campo ${path}.${key} no está permitido en un plan de IA.`, "payload_sensitive");
    }
    assertSafeValue(child, `${path}.${key}`, depth + 1);
  }
}

export function assertNoModelSensitiveFields(value, path = "payload") {
  assertSafeValue(value, path);
  return value;
}

function assertSchemaDefinition(schema, path = "schema") {
  if (!isPlainObject(schema) || typeof schema.type !== "string") {
    throw new ToolRegistryError(`El ${path} debe declarar un tipo.`, "schema_invalid");
  }
  if (!["object", "array", "string", "number", "boolean"].includes(schema.type)) {
    throw new ToolRegistryError(`El tipo de ${path} no está admitido.`, "schema_invalid");
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((key) => typeof key === "string" && key))) {
    throw new ToolRegistryError(`Los campos requeridos de ${path} no son válidos.`, "schema_invalid");
  }
  if (schema.properties !== undefined) {
    if (!isPlainObject(schema.properties)) throw new ToolRegistryError(`Las propiedades de ${path} no son válidas.`, "schema_invalid");
    for (const [key, child] of Object.entries(schema.properties)) assertSchemaDefinition(child, `${path}.properties.${key}`);
  }
  if (schema.items !== undefined) assertSchemaDefinition(schema.items, `${path}.items`);
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) throw new ToolRegistryError(`El enum de ${path} no es válido.`, "schema_invalid");
  if (schema.pattern !== undefined) {
    try { new RegExp(schema.pattern, "u"); } catch { throw new ToolRegistryError(`El patrón de ${path} no es válido.`, "schema_invalid"); }
  }
}

function typeMatches(value, type) {
  if (type === "object") return isPlainObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "boolean";
}

export function assertSchema(value, schema, path = "value") {
  assertSchemaDefinition(schema);
  if (!typeMatches(value, schema.type)) throw new ToolRegistryError(`${path} no coincide con el tipo esperado.`, "schema_mismatch");
  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    throw new ToolRegistryError(`${path} no coincide con un valor permitido.`, "schema_mismatch");
  }
  if (schema.type === "object") {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) throw new ToolRegistryError(`Falta ${path}.${key}.`, "schema_mismatch");
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) throw new ToolRegistryError(`${path}.${key} no está permitido.`, "schema_mismatch");
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) assertSchema(value[key], childSchema, `${path}.${key}`);
    }
  }
  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw new ToolRegistryError(`${path} tiene menos elementos de los permitidos.`, "schema_mismatch");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new ToolRegistryError(`${path} supera los elementos permitidos.`, "schema_mismatch");
    if (schema.items) value.forEach((item, index) => assertSchema(item, schema.items, `${path}[${index}]`));
  }
  if (schema.type === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) throw new ToolRegistryError(`${path} es demasiado corto.`, "schema_mismatch");
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new ToolRegistryError(`${path} supera la longitud permitida.`, "schema_mismatch");
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) throw new ToolRegistryError(`${path} no tiene el formato permitido.`, "schema_mismatch");
  }
  if (schema.type === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) throw new ToolRegistryError(`${path} es menor al mínimo permitido.`, "schema_mismatch");
    if (schema.maximum !== undefined && value > schema.maximum) throw new ToolRegistryError(`${path} supera el máximo permitido.`, "schema_mismatch");
  }
  return value;
}

function assertDefinition(definition) {
  if (!isPlainObject(definition)) throw new ToolRegistryError("La definición de herramienta debe ser un objeto plano.", "definition_invalid");
  for (const key of Object.keys(definition)) {
    if (!ALLOWED_DEFINITION_KEYS.has(key)) throw new ToolRegistryError(`La propiedad ${key} no está permitida en una herramienta.`, "definition_invalid");
  }
  if (typeof definition.id !== "string" || !/^cfdi\.[a-z][a-z0-9_]*$/i.test(definition.id)) {
    throw new ToolRegistryError("La herramienta necesita un identificador CFDI estable.", "definition_invalid");
  }
  if (typeof definition.version !== "string" || !/^\d+(?:\.\d+)*$/.test(definition.version)) {
    throw new ToolRegistryError("La herramienta necesita una versión de esquema válida.", "definition_invalid");
  }
  if (definition.domain !== "cfdi" || definition.execution !== "local") {
    throw new ToolRegistryError("La Fase A solo admite herramientas CFDI locales.", "definition_invalid");
  }
  for (const key of ["readOnly", "modelCallable", "requiresExplicitUserAction"]) {
    if (typeof definition[key] !== "boolean") throw new ToolRegistryError(`La propiedad ${key} debe ser booleana.`, "definition_invalid");
  }
  if (!definition.readOnly) throw new ToolRegistryError("La Fase A solo admite herramientas de solo lectura.", "definition_invalid");
  if (typeof definition.run !== "function") throw new ToolRegistryError("La herramienta necesita una función local run.", "definition_invalid");
  assertSchemaDefinition(definition.inputSchema, "inputSchema");
  assertSchemaDefinition(definition.outputSchema, "outputSchema");
}

function assertContext(context) {
  if (!isPlainObject(context)) throw new ToolRegistryError("El contexto de herramienta no es válido.", "context_invalid");
  for (const key of Object.keys(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) throw new ToolRegistryError(`El contexto ${key} no está permitido.`, "context_invalid");
  }
  if (typeof context.analysisRef !== "string" || !/^analysis:[a-z0-9:_-]+$/i.test(context.analysisRef)) {
    throw new ToolRegistryError("La referencia de análisis no es válida.", "context_invalid");
  }
  if (!Number.isInteger(context.sessionEpoch) || context.sessionEpoch < 0) {
    throw new ToolRegistryError("La época de sesión no es válida.", "context_invalid");
  }
  if (typeof context.explicitUserAction !== "boolean") throw new ToolRegistryError("Falta el estado de acción explícita.", "context_invalid");
  if (context.epochProvider !== undefined && typeof context.epochProvider !== "function") {
    throw new ToolRegistryError("El proveedor de época no es válido.", "context_invalid");
  }
  if (context.signal !== undefined && (!context.signal || typeof context.signal.aborted !== "boolean")) {
    throw new ToolRegistryError("La señal de cancelación no es válida.", "context_invalid");
  }
}

function assertCurrentEpoch(context) {
  if (context.signal?.aborted) throw new ToolRegistryError("La operación local fue cancelada.", "operation_cancelled");
  if (context.epochProvider && Number(context.epochProvider()) !== context.sessionEpoch) {
    throw new ToolRegistryError("La sesión local cambió antes de terminar la consulta.", "session_expired");
  }
}

export class ToolRegistry {
  #definitions = new Map();
  #closed = false;

  register(definition) {
    if (this.#closed) throw new ToolRegistryError("El registro de herramientas ya fue cerrado.", "registry_closed");
    assertDefinition(definition);
    if (this.#definitions.has(definition.id)) throw new ToolRegistryError(`La herramienta ${definition.id} ya existe.`, "tool_duplicate");
    const safeDefinition = Object.freeze({ ...definition });
    this.#definitions.set(safeDefinition.id, safeDefinition);
    return safeDefinition;
  }

  get(id, version = "") {
    const definition = this.#definitions.get(String(id || ""));
    if (!definition || (version && definition.version !== version)) {
      throw new ToolRegistryError("La herramienta solicitada no está registrada.", "tool_not_allowed");
    }
    return definition;
  }

  list({ modelCallable } = {}) {
    const definitions = [...this.#definitions.values()];
    return Object.freeze(modelCallable === undefined ? definitions : definitions.filter((item) => item.modelCallable === modelCallable));
  }

  validatePlan(plan) {
    assertNoModelSensitiveFields(plan, "plan");
    if (!isPlainObject(plan)) throw new ToolRegistryError("El plan debe ser un objeto plano.", "plan_invalid");
    const allowedKeys = new Set(["intent", "toolId", "toolVersion", "arguments"]);
    for (const key of Object.keys(plan)) if (!allowedKeys.has(key)) throw new ToolRegistryError(`El campo plan.${key} no está permitido.`, "plan_invalid");
    if (typeof plan.intent !== "string" || !plan.intent) throw new ToolRegistryError("El plan necesita una intención.", "plan_invalid");
    if (typeof plan.toolId !== "string" || !plan.toolId) throw new ToolRegistryError("El plan necesita una herramienta.", "plan_invalid");
    if (plan.toolVersion !== undefined && typeof plan.toolVersion !== "string") throw new ToolRegistryError("La versión del plan no es válida.", "plan_invalid");
    const definition = this.get(plan.toolId, plan.toolVersion || "");
    if (!definition.modelCallable) throw new ToolRegistryError("El plan no puede seleccionar esta herramienta.", "tool_not_model_callable");
    const argumentsValue = plan.arguments === undefined ? {} : plan.arguments;
    assertSchema(argumentsValue, definition.inputSchema, "plan.arguments");
    return Object.freeze({
      intent: plan.intent,
      toolId: definition.id,
      toolVersion: definition.version,
      arguments: argumentsValue,
      requiresExplicitUserAction: definition.requiresExplicitUserAction,
    });
  }

  validatePlannerPlan(plan) {
    assertNoModelSensitiveFields(plan, "planner_output");
    if (!isPlainObject(plan)) throw new ToolRegistryError("El plan del planner debe ser un objeto plano.", "planner_invalid");
    const allowedKeys = new Set(["intent", "toolId", "toolVersion", "arguments", "missing", "requiresExplicitUserAction", "humanReviewRequired"]);
    for (const key of Object.keys(plan)) if (!allowedKeys.has(key)) throw new ToolRegistryError(`El campo planner.${key} no está permitido.`, "planner_invalid");
    if (typeof plan.intent !== "string" || !plan.intent) throw new ToolRegistryError("El planner necesita una intención.", "planner_invalid");
    if (typeof plan.toolId !== "string" || !plan.toolId) throw new ToolRegistryError("El planner necesita una herramienta.", "planner_invalid");
    if (plan.toolVersion !== undefined && (typeof plan.toolVersion !== "string" || !/^\d+(?:\.\d+)*$/.test(plan.toolVersion))) throw new ToolRegistryError("La versión del planner no es válida.", "planner_invalid");
    if (!Array.isArray(plan.missing) || plan.missing.length > 6 || !plan.missing.every((item) => typeof item === "string" && item.trim() && item.length <= 120)) throw new ToolRegistryError("Los datos faltantes del planner no son válidos.", "planner_invalid");
    if (typeof plan.requiresExplicitUserAction !== "boolean") throw new ToolRegistryError("El planner necesita indicar la acción humana.", "planner_invalid");
    if (plan.humanReviewRequired !== true) throw new ToolRegistryError("El planner debe conservar revisión humana.", "planner_human_review_required");
    const definition = this.get(plan.toolId, plan.toolVersion || "");
    if (!definition.modelCallable) throw new ToolRegistryError("El planner no puede seleccionar esta herramienta.", "tool_not_model_callable");
    const argumentsValue = plan.arguments === undefined ? {} : plan.arguments;
    if (!isPlainObject(argumentsValue) || Object.hasOwn(argumentsValue, "analysisRef")) throw new ToolRegistryError("El planner no puede proporcionar analysisRef ni parámetros sensibles.", "planner_arguments_invalid");
    const properties = { ...(definition.inputSchema.properties || {}) };
    delete properties.analysisRef;
    const plannerSchema = { ...definition.inputSchema, required: (definition.inputSchema.required || []).filter((key) => key !== "analysisRef"), properties, additionalProperties: false };
    assertSchema(argumentsValue, plannerSchema, `planner.arguments.${definition.id}`);
    return Object.freeze({
      intent: plan.intent,
      toolId: definition.id,
      toolVersion: definition.version,
      arguments: Object.freeze({ ...argumentsValue }),
      missing: Object.freeze(plan.missing.map((item) => item.trim())),
      requiresExplicitUserAction: Boolean(plan.requiresExplicitUserAction || definition.requiresExplicitUserAction),
      humanReviewRequired: true,
    });
  }

  async execute(id, input, context) {
    if (this.#closed) throw new ToolRegistryError("El registro de herramientas ya fue cerrado.", "registry_closed");
    const definition = this.get(id);
    assertContext(context);
    assertCurrentEpoch(context);
    assertSchema(input, definition.inputSchema, `input:${definition.id}`);
    if (input.analysisRef !== context.analysisRef) {
      throw new ToolRegistryError("La referencia de análisis no coincide con la sesión local.", "analysis_ref_mismatch");
    }
    if (definition.requiresExplicitUserAction && !context.explicitUserAction) {
      throw new ToolRegistryError("Esta herramienta requiere una acción humana explícita.", "explicit_action_required");
    }
    const output = await definition.run(input, context);
    assertCurrentEpoch(context);
    assertSchema(output, definition.outputSchema, `output:${definition.id}`);
    return Object.freeze({ tool: Object.freeze({ id: definition.id, version: definition.version }), output });
  }

  dispose() {
    this.#closed = true;
  }

  get closed() { return this.#closed; }
}

export const __test = {
  FORBIDDEN_MODEL_KEYS,
  assertDefinition,
  assertContext,
  isPlainObject,
  normalizedKey,
};
