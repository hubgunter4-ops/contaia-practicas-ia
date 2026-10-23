# ContaIA CFDI — Diseño de `AiOrchestrator` y `ToolRegistry`

**Estado:** diseño técnico con Fases A, B, C, D y contrato E0 implementados localmente; el registro, router, orquestador, panel CFDI, explicación segura, planner JSON cerrado y gobernanza de datos/cuotas/telemetría están validados. Las herramientas mutantes, entitlements runtime, DLP ampliado, rate limiting distribuido, acceso a fuentes completas, acciones fiscales y publicación siguen fuera de alcance.

**Objetivo:** llevar al módulo CFDI el patrón operativo observado en plataformas contables con IA: petición en lenguaje natural, plan estructurado, consulta sobre fuentes, resultado reutilizable, procedencia visible y revisión humana. La implementación debe conservar el principio local-first de ContaIA.

---

## 1. Decisión arquitectónica

La IA no será la fuente de la verdad fiscal ni tendrá acceso directo al XML. El flujo se divide en cuatro capas:

```text
Persona
  │
  │ petición en español o acción explícita
  ▼
AiOrchestrator
  │  normaliza intención, aplica plan y controla lifecycle
  ├──────────────► ToolRegistry local
  │                 ├─ resumen determinista
  │                 ├─ reporte IVA 0% / 16% / IEPS
  │                 ├─ alertas y relaciones
  │                 └─ contexto CFDI depurado
  │
  └──────────────► AiProviderAdapter opcional
                    solo con contexto seguro y acción autorizada
                    ▼
                 explicación o propuesta textual

Parser CFDI Worker ──► buildCfdiAnalysis ──► artefacto trazable
```

### Regla principal

- Parsing, normalización, sumas, relaciones, IVA, IEPS, alertas y límites se ejecutan localmente.
- El modelo interpreta una petición o explica un resultado; no calcula desde el XML ni modifica fuentes.
- Ninguna herramienta expuesta al modelo puede aprobar, contabilizar, enviar, guardar remotamente o crear un handoff por sí sola.
- Un resultado de IA siempre conserva la evidencia local que lo originó.

Este diseño adapta la forma operacional de Facture, pero evita copiar una caja negra: cada paso de ContaIA debe mostrar qué fuente local se utilizó, qué cálculo se hizo y qué queda pendiente.

---

## 2. Alcance de la primera versión

### Incluido

1. Interpretar un conjunto pequeño de peticiones CFDI.
2. Resolverlas con herramientas deterministas locales.
3. Mostrar un plan de ejecución antes del resultado cuando la petición sea ambigua.
4. Crear un artefacto local: resumen, reporte, lista de alertas o siguiente acción.
5. Explicar un resultado mediante un resumen CFDI depurado después de una acción explícita.
6. Emitir evidencia con fuente, regla, periodo, calidad y estado.
7. Cancelar y limpiar operaciones mediante `CleanupScope` y `AbortSignal`.

### Fuera de alcance

- Enviar XML, ZIP, `File`, `Blob`, `ArrayBuffer`, RFC, UUID, folios o extractos a un modelo.
- Leer el portal del SAT desde la IA.
- Generar o aprobar pólizas contables desde CFDI.
- Presentar DIOT o declaraciones.
- Cancelar CFDI, timbrar o modificar contabilidad.
- Crear automáticamente handoffs a Pólizas o DIOT.
- Activar pagos, cuotas o capacidades Premium.
- Elegir o fijar un modelo concreto sin consultar el catálogo vigente en la fase de implementación.

---

## 3. Integración con la arquitectura existente

### 3.1 Isla CFDI

`src/cfdi/island.js` ya crea `CleanupScope`, pasa `AbortSignal`, registra el proveedor de fuentes y limpia al desmontar. El orquestador debe vivir dentro de ese lifecycle:

```js
const orchestrator = createCfdiAiOrchestrator({
  toolRegistry,
  aiProvider,
  sessionEpoch: session.epoch,
  cleanupScope: scope,
  getAnalysis,
  emit: bus.emit,
});

scope.add(() => orchestrator.dispose("island-destroy"));
```

El orquestador no debe ser global. Una navegación o cambio de sesión invalida sus solicitudes y sus resultados tardíos.

### 3.2 Parser local y `WorkerBridge`

El parser continúa siendo el único componente que recibe buffers de archivos. `AiOrchestrator` recibe solamente:

- `analysisRef` o snapshot local en memoria.
- Petición textual limitada.
- Contexto de periodo y vista elegido por la persona.
- Intención estructurada validada.

Nunca se debe reutilizar el payload del Worker como prompt. La salida de `buildCfdiAnalysis` pasa primero por una herramienta de reducción o por `buildNoraCfdiContext`.

### 3.3 Fuentes y capacidades efímeras

`buildCfdiSourceSnapshot` y `createSourceCapabilityBroker` continúan reservados a handoffs explícitos hacia `journal` o `diot`. El modelo no recibe un token de handoff y no puede invocar `request()`.

Si una respuesta recomienda “preparar pólizas” o “abrir DIOT”, el resultado solo muestra una acción pendiente:

```text
Siguiente paso sugerido: revisar este resultado en Pólizas.
[Preparar handoff local]
```

El botón pertenece a la UI y exige una nueva acción humana.

### 3.4 Nora actual

La integración inicial puede reutilizar el contrato seguro existente de `buildNoraCfdiContext` y `cfdi-summary-v1`. La acción `Pedir apoyo a Nora` debe seguir siendo explícita y el contexto debe enviarse únicamente al Asistente abierto, como ya exige el servidor actual.

El `AiOrchestrator` no debe llamar directamente a proveedores desde el navegador. `AiProviderAdapter` debe ser una abstracción que, cuando se implemente, use la ruta server-side autorizada y mantenga los secretos fuera del cliente.

---

## 4. Contrato de `ToolRegistry`

### 4.1 Responsabilidad

`ToolRegistry` es una lista cerrada y versionada de operaciones permitidas. Cada herramienta declara:

- Identificador estable.
- Versión de esquema.
- Entrada y salida.
- Si es local o remota.
- Si es solo lectura.
- Si requiere acción explícita.
- Si puede ser sugerida por el modelo.
- Si produce artefacto o solo datos intermedios.
- Qué campos sensibles quedan prohibidos.

El registro no es un sistema genérico de plugins. No debe permitir que una respuesta del modelo invente funciones o seleccione módulos fuera de CFDI.

### 4.2 Tipos conceptuales

```ts
type ToolContext = {
  signal: AbortSignal;
  sessionEpoch: number;
  analysisRef: string;
  explicitUserAction: boolean;
  sourceSelection?: "current" | "selected";
};

type ToolDefinition = {
  id: string;
  version: string;
  domain: "cfdi";
  execution: "local" | "server_explanation";
  readOnly: boolean;
  modelCallable: boolean;
  requiresExplicitUserAction: boolean;
  inputSchema: object;
  outputSchema: object;
  run(input: unknown, context: ToolContext): Promise<unknown> | unknown;
};

class ToolRegistry {
  register(definition: ToolDefinition): void;
  get(id: string, version?: string): ToolDefinition;
  list(options?: { modelCallable?: boolean }): ToolDefinition[];
  validatePlan(plan: ToolPlan): ValidatedToolPlan;
  execute(id: string, input: unknown, context: ToolContext): Promise<ToolResult>;
  dispose(reason?: string): void;
}
```

### 4.3 Invariantes del registro

1. Un identificador duplicado se rechaza.
2. Una herramienta sin `inputSchema` y `outputSchema` se rechaza.
3. `modelCallable: true` exige `execution: "local"` o una salida server-side estrictamente depurada.
4. `readOnly` debe ser `true` para todas las herramientas de la primera versión.
5. Una herramienta con `requiresExplicitUserAction: true` no se ejecuta solo porque aparezca en un plan del modelo.
6. El registro rechaza campos `File`, `Blob`, `ArrayBuffer`, `xml`, `rawXml`, `documentText`, `rfc`, `uuid`, `folio`, `password`, `token` y `supabaseSession` en entradas destinadas al modelo.
7. El resultado se valida antes de entregarse al orquestador.
8. La ejecución comprueba `sessionEpoch` antes de resolver.
9. Las herramientas no realizan `fetch` salvo el adaptador de explicación aprobado; las herramientas fiscales son locales.

---

## 5. Herramientas CFDI de la primera versión

### 5.1 `cfdi.summary`

**Propósito:** devolver un resumen de conteos, monedas y calidad del análisis.

- `execution`: `local`
- `readOnly`: `true`
- `modelCallable`: `true`
- `requiresExplicitUserAction`: `false`
- `sensible`: no sale del navegador; usa el análisis local completo internamente.

Entrada conceptual:

```json
{
  "analysisRef": "analysis:current",
  "scope": "all"
}
```

Salida:

```json
{
  "schemaVersion": "cfdi-summary-result-v1",
  "status": "ready",
  "counts": {
    "invoices": 42,
    "payments": 8,
    "concepts": 0,
    "matchedPayments": 6,
    "unmatchedPayments": 2
  },
  "currencies": ["MXN"],
  "quality": {
    "missingAmounts": 0,
    "duplicateUuids": 1,
    "alerts": 3
  },
  "evidence": {
    "source": "cfdi_analysis",
    "calculation": "buildCfdiAnalysis",
    "humanReviewRequired": true
  }
}
```

Los valores anteriores son ilustrativos. El resultado real debe derivarse del análisis y no inventar cero cuando un dato está ausente.

### 5.2 `cfdi.tax_report`

**Propósito:** separar ventas y compras por el RFC explícitamente proporcionado en la pantalla local y resumir IVA 0%, IVA 16% e IEPS.

- `execution`: `local`
- `readOnly`: `true`
- `modelCallable`: `false` en primera versión; el modelo puede solicitar una explicación del resultado, no suministrar el RFC.
- `requiresExplicitUserAction`: `true`, porque la persona pulsa “Generar reporte local”.

Entrada local:

```json
{
  "analysisRef": "analysis:current",
  "businessRfc": "AAA010101AAA"
}
```

El RFC permanece dentro del navegador. La salida que puede explicar la IA debe eliminarlo y conservar únicamente:

```json
{
  "schemaVersion": "cfdi-tax-report-summary-v1",
  "status": "classified",
  "sales": { "invoiceCount": 20, "currencies": ["MXN"] },
  "purchases": { "invoiceCount": 22, "currencies": ["MXN"] },
  "taxes": {
    "iva0Base": "derived-local",
    "iva16Base": "derived-local",
    "ieps": "derived-local"
  },
  "unclassifiedCount": 1,
  "humanReviewRequired": true
}
```

Para un reporte fiscal descargable, la cifra exacta se mantiene en el artefacto local y no se reemplaza por una explicación generada.

### 5.3 `cfdi.alerts`

**Propósito:** listar alertas aritméticas y de relación detectadas por `buildCfdiAnalysis`.

- `execution`: `local`
- `readOnly`: `true`
- `modelCallable`: `true` solo después de convertir la salida a códigos, severidad y conteos.
- `requiresExplicitUserAction`: `false` para consultar; `true` para abrir evidencia detallada.

Salida segura para interpretación:

```json
{
  "schemaVersion": "cfdi-alert-summary-v1",
  "alerts": [
    { "code": "duplicate_uuid", "severity": "review", "count": 1 },
    { "code": "payment_balance_difference", "severity": "review", "count": 2 },
    { "code": "estimated_tax_unmatched", "severity": "caution", "count": 1 }
  ],
  "humanReviewRequired": true
}
```

El modelo puede explicar qué revisar primero, pero no puede declarar fraude, cancelación, incumplimiento ni error fiscal definitivo.

### 5.4 `cfdi.payment_links`

**Propósito:** resumir la calidad de relaciones entre pagos y facturas.

- `execution`: `local`
- `readOnly`: `true`
- `modelCallable`: `true` con un resumen depurado.
- `requiresExplicitUserAction`: `false` para resumen; `true` para abrir una relación concreta.

Salida:

```json
{
  "schemaVersion": "cfdi-payment-links-v1",
  "matched": 6,
  "unmatched": 2,
  "balanceDifferences": 1,
  "missingInvoiceReferences": 0,
  "overpaidLinks": 0,
  "estimatedTaxPayments": 1,
  "humanReviewRequired": true
}
```

No se incluyen UUID, folios, nombres, RFC, fechas exactas ni importes en el contexto de explicación por defecto.

### 5.5 `cfdi.safe_context`

**Propósito:** construir el único contexto permitido para una explicación remota explícita.

- `execution`: `local`
- `readOnly`: `true`
- `modelCallable`: `false`; es un boundary de privacidad, no una herramienta del modelo.
- `requiresExplicitUserAction`: `true` cuando el destino es Nora.

Debe delegar en `buildNoraCfdiContext` o en un reductor equivalente con schema versionado. Su salida compatible inicial es `cfdi-summary-v1`.

```json
{
  "schemaVersion": "cfdi-summary-v1",
  "status": "analyzed",
  "counts": {
    "invoices": 42,
    "payments": 8,
    "concepts": 0,
    "matchedPayments": 6,
    "unmatchedPayments": 2
  },
  "checks": {
    "duplicateUuids": 1,
    "paymentBalanceDifferences": 2,
    "paymentWithoutInvoice": 0,
    "paymentsExceedingInvoice": 0,
    "estimatedTaxPayments": 1
  },
  "totalsByCurrency": [
    { "currency": "MXN", "invoiced": 42000, "paid": 18000, "remaining": 24000 }
  ],
  "samplePayments": []
}
```

El contrato actual ya limita este resumen y el servidor lo vuelve a sanear antes de llamar al Gateway. No se debe ampliar el schema para “dar más contexto” sin una revisión de privacidad.

### 5.6 `cfdi.next_step`

**Propósito:** convertir el resultado local en una recomendación de siguiente acción.

Puede ser determinista en la primera versión:

```text
Si hay errores de parsing → revisar el archivo.
Si hay alertas de pago → abrir vista Pagos.
Si hay faltantes de RFC para reporte → pedir RFC en la pantalla local.
Si hay fuentes listas → ofrecer revisión o handoff explícito.
Si no hay alertas → ofrecer exportación local o revisión humana.
```

No necesita llamar a un modelo. Si posteriormente se explica con IA, el modelo recibe únicamente códigos de estado y opciones permitidas.

---

## 6. Registro inicial conceptual

```js
export function createCfdiToolRegistry({ getAnalysis, buildSafeContext }) {
  const registry = new ToolRegistry();

  registry.register({
    id: "cfdi.summary",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: true,
    requiresExplicitUserAction: false,
    inputSchema: { type: "object", required: ["analysisRef", "scope"] },
    outputSchema: { type: "object", required: ["schemaVersion", "status", "counts", "evidence"] },
    run: ({ analysisRef }, context) => buildSummary(getAnalysis(analysisRef), context),
  });

  registry.register({
    id: "cfdi.tax_report",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: false,
    requiresExplicitUserAction: true,
    inputSchema: { type: "object", required: ["analysisRef", "businessRfc"] },
    outputSchema: { type: "object", required: ["schemaVersion", "status", "sales", "purchases"] },
    run: ({ analysisRef, businessRfc }, context) => buildTaxReport(getAnalysis(analysisRef), businessRfc, context),
  });

  registry.register({
    id: "cfdi.alerts",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: true,
    requiresExplicitUserAction: false,
    inputSchema: { type: "object", required: ["analysisRef"] },
    outputSchema: { type: "object", required: ["schemaVersion", "alerts", "humanReviewRequired"] },
    run: ({ analysisRef }, context) => buildAlertSummary(getAnalysis(analysisRef), context),
  });

  registry.register({
    id: "cfdi.safe_context",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: false,
    requiresExplicitUserAction: true,
    inputSchema: { type: "object", required: ["analysisRef", "destination"] },
    outputSchema: { type: "object", required: ["schemaVersion", "status"] },
    run: ({ analysisRef, destination }, context) => buildSafeContext(getAnalysis(analysisRef), destination, context),
  });

  return registry;
}
```

El código anterior es pseudocódigo de contrato. Las funciones `buildSummary`, `buildTaxReport` y `buildAlertSummary` deben reutilizar `buildCfdiAnalysis` y `buildCfdiTaxReport`; no deben crear una segunda lógica fiscal.

---

## 7. Contrato de `AiOrchestrator`

### 7.1 Responsabilidad

`AiOrchestrator` coordina cuatro pasos y devuelve un artefacto consistente:

1. `interpret`: convertir una petición a una intención permitida.
2. `plan`: seleccionar una herramienta del registro y validar entradas.
3. `execute`: ejecutar la herramienta local con `AbortSignal` y `sessionEpoch`.
4. `explain`: opcionalmente pedir a Nora una explicación sobre un resumen seguro.

No debe mezclar el resultado textual con el estado fiscal. La respuesta debe contener ambos canales:

```js
{
  artifact: { ...resultadoDeterminista },
  explanation: { status: "not_requested" },
  evidence: { ...procedencia },
  nextActions: [ ...accionesPermitidas ],
}
```

### 7.2 Entrada

```ts
type CfdiAiRequest = {
  requestId?: string;
  message: string;
  analysisRef: string;
  mode: "local_only" | "plan_and_local" | "explain_safe_summary";
  explicitUserAction: boolean;
  destination?: "cfdi" | "nora-advisor";
  sessionEpoch: number;
  planId: "free" | "premium";
};
```

Reglas:

- `message` máximo 2,000 caracteres, sin documentos adjuntos.
- `analysisRef` es un identificador opaco local, no un JSON serializado.
- `mode: "explain_safe_summary"` exige `explicitUserAction: true`, `destination: "nora-advisor"` y el contexto `cfdi-summary-v1`.
- El orquestador rechaza propiedades inesperadas como `xml`, `rawXml`, `file`, `blob`, `documentText`, `rfc`, `uuid`, `folio`, `token` y `supabaseSession`.
- `planId` solo decide capacidades de producto; nunca cambia el resultado fiscal.

### 7.3 Salida

```ts
type CfdiAiResult = {
  requestId: string;
  status: "completed" | "needs_input" | "needs_review" | "cancelled" | "failed";
  intent: {
    id: string;
    confidence: "high" | "medium" | "low";
    source: "deterministic_router" | "model_planner" | "user_action";
  };
  plan: {
    toolId: string;
    toolVersion: string;
    inputSummary: object;
  };
  artifact: object | null;
  explanation: {
    status: "not_requested" | "pending" | "completed" | "unavailable";
    text?: string;
    provider?: string;
  };
  evidence: {
    schemaVersion: "cfdi-evidence-v1";
    source: "cfdi_analysis";
    calculation: string;
    generatedAt: string;
    humanReviewRequired: boolean;
    warnings: string[];
  };
  nextActions: Array<{
    id: "open_alerts" | "open_payments" | "generate_tax_report" | "ask_nora" | "prepare_handoff" | "export_local";
    label: string;
    requiresExplicitUserAction: true;
  }>;
};
```

`text` es solo una explicación. No puede sustituir `artifact` ni cambiar sus valores.

---

## 8. Flujo operacional

### 8.1 Petición simple y determinista

Petición:

> “Muéstrame las alertas del análisis.”

Flujo:

```text
1. AiOrchestrator recibe la petición sin archivos.
2. DeterministicRouter reconoce cfdi.alerts.
3. ToolRegistry ejecuta cfdi.alerts en memoria.
4. Se valida el resultado.
5. Se muestra una lista de alertas con evidencia.
6. No se usa IA ni se consume crédito.
```

### 8.2 Petición de reporte fiscal

Petición:

> “Separa las ventas y compras por IVA.”

Flujo:

```text
1. El orquestador identifica que falta el RFC explícito de la empresa.
2. Devuelve status = needs_input.
3. La UI solicita el RFC solo en el formulario local.
4. La persona pulsa “Generar reporte local”.
5. ToolRegistry ejecuta cfdi.tax_report.
6. El reporte conserva clasificación y faltantes.
7. Se ofrece exportación local o explicación sin enviar el RFC.
```

La IA no debe adivinar si la empresa es emisor o receptor.

### 8.3 Petición ambigua

Petición:

> “Revísame esto.”

Flujo:

```text
1. El router devuelve intent = ambiguous.
2. No se llama al modelo todavía.
3. La UI ofrece tres acciones: Resumen, Alertas, Pagos.
4. La persona elige una acción.
5. El orquestador ejecuta una herramienta local.
```

Esta respuesta es más segura y más barata que enviar una petición vaga a un modelo.

### 8.4 Explicación con Nora

Petición explícita:

> “Ayúdame a interpretar las diferencias de pago.”

Flujo:

```text
1. La persona pulsa “Pedir apoyo a Nora”.
2. AiOrchestrator ejecuta cfdi.safe_context.
3. El contexto se reduce a cfdi-summary-v1.
4. Se valida tamaño, schema y ausencia de identificadores.
5. El adapter llama a la ruta server-side existente.
6. Nora explica el resultado, no recalcula desde el XML.
7. La UI conserva el artefacto local y muestra la explicación como orientación.
```

Si no hay configuración de Gateway, la UI debe conservar el resultado local y mostrar una explicación controlada: “La ayuda remota no está disponible; revisa las alertas locales y la evidencia de la vista Pagos”.

---

## 9. Router de intenciones

### 9.1 Intenciones permitidas

| Intent | Herramienta principal | ¿IA necesaria? | Resultado |
|---|---|---:|---|
| `cfdi.summary` | `cfdi.summary` | No | Resumen local |
| `cfdi.alerts` | `cfdi.alerts` | No | Alertas y prioridades |
| `cfdi.payment_review` | `cfdi.payment_links` | No | Relaciones y diferencias |
| `cfdi.tax_report` | `cfdi.tax_report` | No | Ventas/compras e impuestos |
| `cfdi.explain_result` | `cfdi.safe_context` + adapter | Sí, opcional | Explicación de Nora |
| `cfdi.next_step` | `cfdi.next_step` | No | Siguiente acción |
| `cfdi.prepare_handoff` | UI + capability broker | No | Acción explícita posterior |
| `ambiguous` | Ninguna | No | Selector de intención |
| `unsupported` | Ninguna | No | Mensaje de alcance |

### 9.2 Router determinista inicial

Antes de recurrir a un modelo, usar coincidencias acotadas y transparentes:

```js
const INTENT_PATTERNS = [
  { id: "cfdi.alerts", pattern: /alertas|hallazgos|problemas|revisar primero/i },
  { id: "cfdi.payment_review", pattern: /pagos|complementos|saldo|parcialidad|liquid/i },
  { id: "cfdi.tax_report", pattern: /ventas|compras|iva|ieps|0\s*%|16\s*%/i },
  { id: "cfdi.summary", pattern: /resumen|cuántos|cuantas|total de comprobantes/i },
];
```

El router no calcula ni modifica el análisis. Solo selecciona una intención si la señal es suficiente. Si hay varias coincidencias, devuelve `ambiguous` y no elige en silencio.

### 9.3 Planner opcional con modelo

Un planner LLM puede entrar posteriormente para peticiones que el router no reconoce, pero debe devolver exclusivamente JSON conforme a un schema cerrado:

```json
{
  "intent": "cfdi.payment_review",
  "toolId": "cfdi.payment_links",
  "arguments": {
    "scope": "all"
  },
  "missing": [],
  "requiresExplicitUserAction": false,
  "humanReviewRequired": true
}
```

El planner no recibe el análisis ni el XML. Recibe una lista de intenciones permitidas y la petición textual. Su salida se valida contra `ToolRegistry`; cualquier `toolId` desconocido, argumento extra o intento de acción mutante se rechaza.

Cuando se implemente este planner, se debe consultar el catálogo vigente de modelos, elegir un modelo compatible con salida JSON estructurada y probarlo con un conjunto de casos sintéticos. No se fija aquí un proveedor ni un identificador de modelo.

---

## 10. Plan de ejecución y evidencia

Cada ejecución debe crear un registro efímero en memoria:

```js
{
  "schemaVersion": "cfdi-evidence-v1",
  "requestId": "ai:opaque-request-id",
  "intent": "cfdi.alerts",
  "tool": { "id": "cfdi.alerts", "version": "1" },
  "source": {
    "kind": "cfdi_analysis",
    "analysisRef": "analysis:current",
    "scope": "all"
  },
  "calculation": {
    "engine": "buildCfdiAnalysis",
    "rules": ["duplicate_uuid", "payment_balance_difference"]
  },
  "quality": {
    "missingData": [],
    "derivedValues": [],
    "humanReviewRequired": true
  },
  "status": "needs_review",
  "generatedAt": "2026-10-22T00:00:00.000Z"
}
```

La evidencia puede persistirse localmente solo si la persona activa guardar resultado. El registro no debe guardar prompts completos, contexto privado de Nora ni archivos originales por defecto.

### Estados visibles

- `Interpretando la petición`.
- `Revisando el análisis local`.
- `Calculando con reglas locales`.
- `Resultado listo para revisión`.
- `Nora está preparando una explicación`.
- `La explicación no cambia el resultado local`.
- `Falta un dato para continuar`.
- `La operación fue cancelada y los datos temporales se limpiaron`.

---

## 11. Privacidad y validación de límites

### 11.1 Frontera de datos

| Capa | Puede recibir | No puede recibir |
|---|---|---|
| Worker CFDI | `ArrayBuffer` transferido y opciones locales | llamadas de IA, sesiones, tokens |
| `buildCfdiAnalysis` | resultado del parser local | prompt o proveedor externo |
| `ToolRegistry` local | análisis en memoria y parámetros locales | red, credenciales, archivos crudos en salida |
| `AiOrchestrator` | intención, `analysisRef`, artefactos reducidos | `File`, XML, ZIP, Blob, ArrayBuffer |
| `AiProviderAdapter` | petición, schema seguro, `cfdi-summary-v1` tras acción | RFC, UUID, folios, nombres, XML, extractos |
| `source-capabilities` | selección explícita y destino autorizado | invocación desde el modelo |

### 11.2 Sanitización doble

La protección debe ejecutarse dos veces:

1. **Cliente:** `cfdi.safe_context` y `buildNoraCfdiContext` eliminan identificadores y limitan conteos, importes y muestras.
2. **Servidor:** la validación actual vuelve a comprobar `schemaVersion`, tamaño, conteos, monedas, checks y muestras antes de llamar a Gateway.

Nunca confiar en que el cliente “ya sanitizó” el contexto.

### 11.3 Free y Premium

- Free puede ejecutar herramientas locales dentro de los límites del plan y consultar explicaciones genéricas sin adjuntar fuentes.
- Premium puede habilitar un snapshot seguro de `cfdi-summary-v1` solo después de una acción explícita; no obtiene XML ni acceso implícito a fuentes.
- Los cálculos locales básicos no deben consumir créditos de IA.
- Una explicación, clasificación de intención no determinista o papel de trabajo generado por IA sí puede consumir una cuota separada.
- Si se agota la cuota de IA, el artefacto local permanece disponible y se ofrece revisión manual.

---

## 12. Lifecycle, cancelación y errores

### 12.1 Cancelación

`AiOrchestrator` debe mantener un `AbortController` por ejecución. Al cancelar:

1. Aborta el adapter remoto si existe.
2. Cancela tareas locales pendientes.
3. Elimina timers y listeners.
4. Invalida el `requestId`.
5. Limpia el contexto seguro temporal.
6. Conserva el análisis CFDI original hasta que la persona elija quitarlo.
7. Devuelve `status: "cancelled"` sin mensaje de error técnico.

### 12.2 Errores canónicos

| Código | Significado | Conducta |
|---|---|---|
| `analysis_missing` | No hay resultado CFDI en memoria | Pedir cargar y analizar primero |
| `intent_ambiguous` | La petición coincide con varias intenciones | Mostrar selector |
| `intent_unsupported` | La petición está fuera de CFDI | Explicar alcance y ofrecer Nora general |
| `tool_not_allowed` | Plan pidió una herramienta no registrada | Bloquear y registrar solo código |
| `tool_input_invalid` | Faltan parámetros o hay campos inesperados | Pedir dato seguro |
| `session_expired` | Cambió la época de sesión | Cancelar y limpiar |
| `source_capability_expired` | Lease vencida o isla desmontada | Pedir nueva acción explícita |
| `ai_context_forbidden` | El contexto contiene un campo sensible | No enviar; mostrar bloqueo de privacidad |
| `ai_quota_exceeded` | Se agotó la cuota de IA | Mantener artefacto local y ofrecer revisión manual |
| `ai_unavailable` | Gateway/proveedor no disponible | No bloquear funciones locales |
| `tool_execution_failed` | Falló una función local | Mostrar error recuperable sin perder análisis |

Los errores de IA no deben convertir el resultado local en “fallido”. La ejecución fiscal y la explicación son estados separados.

---

## 13. Integración futura con la UI de CFDI

### 13.1 Punto de entrada inicial

Reutilizar el CTA existente `data-cfdi-ask-nora` como adaptador:

```js
onAskNora: (safeContext, message) => {
  orchestrator.explain({
    message,
    safeContext,
    destination: "nora-advisor",
    explicitUserAction: true,
  });
}
```

No añadir un chat general dentro de CFDI en la primera iteración. Primero se debe demostrar que la UI puede separar:

- Resultado local.
- Explicación opcional.
- Acción siguiente.

### 13.2 Nuevo panel de “consulta operativa”

En una segunda etapa, se puede agregar un panel colapsable:

```text
NORA · CONSULTA CFDI LOCAL
¿Qué quieres revisar?
[Ver alertas] [Revisar pagos] [Separar ventas/compras] [Explicar resultado]

O escribe una petición breve…
[Ejecutar consulta]

La consulta usa el análisis de esta pestaña. El XML no se adjunta automáticamente.
```

Las acciones rápidas deben invocar herramientas locales y no usar modelo. El campo libre usa primero el router determinista y solo después el planner opcional.

### 13.3 Artefactos visuales

Cada resultado debe renderizar:

- Encabezado: `Resultado local · CFDI`.
- Estado: `Listo`, `Requiere revisión`, `Falta contexto` o `No disponible`.
- Procedencia: `Fuente: análisis CFDI de esta sesión`.
- Método: `Cálculo local determinista` o `Explicación de Nora sobre resumen depurado`.
- CTA principal: revisar, exportar o completar dato.
- CTA secundaria: pedir explicación, siempre explícita.
- Aviso: `La explicación no modifica el resultado ni aprueba una operación.`

---

## 14. Pruebas requeridas antes de implementar

### Unitarias

- El registro rechaza herramientas duplicadas o sin schema.
- El registro rechaza `toolId` desconocido.
- El planner no puede seleccionar una herramienta mutante.
- El orquestador rechaza `File`, `Blob`, `ArrayBuffer`, XML y campos identificables.
- El router determinista reconoce alertas, pagos, impuestos y resumen.
- La ambigüedad devuelve opciones y no ejecuta una herramienta al azar.
- `cfdi.tax_report` exige RFC explícito local.
- `cfdi.safe_context` produce únicamente `cfdi-summary-v1` permitido.
- La explicación no cambia el artefacto local.
- Cuotas de IA agotadas no bloquean herramientas deterministas.
- Cambio de `sessionEpoch` invalida el resultado tardío.
- `dispose()` aborta, limpia y no deja listeners.

### E2E

- Una petición “muéstrame alertas” funciona sin llamada de red.
- Una petición de ventas/compras solicita RFC y genera reporte local.
- Una petición ambigua muestra opciones.
- “Pedir apoyo a Nora” requiere clic, comparte solo el resumen depurado y conserva la privacidad.
- Al desmontar CFDI, se limpian orquestador, contexto temporal y tareas pendientes.
- Un error del Gateway conserva visible el resultado local.
- Un handoff a Pólizas o DIOT nunca ocurre sin botón explícito.
- La interfaz funciona con teclado y no produce overflow en móvil.

### Seguridad y privacidad

- Interceptar `fetch` en pruebas y comprobar que ningún cuerpo contiene XML, RFC, UUID, folio, nombre, archivo o movimiento bancario.
- Probar que el contexto con una clave prohibida se rechaza antes de red.
- Confirmar que el servidor vuelve a sanitizar el resumen.
- Confirmar que un resultado de modelo con `toolId` inventado no se ejecuta.
- Confirmar que un prompt injection dentro de un campo fiscal se trata como dato, no como instrucción.

---

## 15. Plan de implementación por fases

### Fase A — Contratos puros

Crear `src/cfdi/ai/tool-registry.js`, `src/cfdi/ai/cfdi-ai-orchestrator.js` y pruebas unitarias. En esta fase no hay llamada a IA; solo router determinista, herramientas locales y evidencia.

### Fase B — Integración con CFDI

Conectar el orquestador a `bindCfdiWorkspace`, preservar `CleanupScope`, añadir estados de consulta y reutilizar `buildCfdiAnalysis`/`buildCfdiTaxReport` sin duplicar lógica.

### Fase C — Explicación segura — implementada localmente

`AiOrchestrator.explain()` prepara solo `cfdi-summary-v1` después de `explicitUserAction`, limita el destino a `nora-advisor` y usa el callback/adaptador existente de Nora. La UI exige confirmar el resumen y después revisar/pulsar Enviar en Asistente abierto. El proveedor y Gateway permanecen detrás del servidor existente; la isla no realiza la llamada remota ni recibe la respuesta del modelo en su estado local.

### Fase D — Planner controlado — implementada localmente

`src/cfdi/ai/planner.js` declara el schema cerrado, cuatro intenciones y la construcción de un catálogo sin `analysisRef`. `AiOrchestrator` consulta un `plannerAdapter` únicamente para peticiones `unsupported`; el adaptador recibe solo la petición textual y el catálogo seguro. `ToolRegistry.validatePlannerPlan()` valida la respuesta, descarta herramientas no `modelCallable`, argumentos extra, propiedades sensibles y revisiones humanas falsas antes de inyectar `analysisRef` localmente.

La aplicación conecta el adaptador con `src/cfdi/ai/planner-api.js` y `POST /api/cfdi/planner`. El servidor selecciona el proveedor/modelo ya configurado en Vercel AI Gateway, solicita `response_format: json_schema` estricto y vuelve a validar el JSON antes de responder. El planner no recibe análisis, XML, archivos ni identificadores; si no hay Gateway configurado o la salida no cumple el catálogo, las consultas locales no se ejecutan por esa ruta y el resultado se conserva como pendiente de entrada.

### Fase E0 — Gobernanza IA — implementada localmente

`ai-governance-v1` establece clases de datos, políticas por endpoint, cuotas iniciales de planner/explicación/snapshot, catálogo E-01–E-12, códigos de error y eventos de telemetría redacted. El contrato puro vive en `src/cfdi/ai/ai-governance-contract.js` y no activa red, persistencia, entitlements, DLP runtime ni observabilidad conectada. Su validador admite únicamente escalares y enums contractuales; rechaza prompts, bodies, headers, fuentes fiscales y referencias de cuenta no opacas.

La especificación completa está en `contaia-ai-phase-e0-governance-contract.md`. Las siguientes etapas deben implementar el control runtime en orden: E1 DLP local, E2 admisión/entitlements, E3 cuotas distribuidas y resiliencia, E4 telemetría, E5 proveedores aprobados y E6 UX/canary.

### Fase E1 — DLP local — implementada localmente

`src/cfdi/ai/ai-dlp-gate.js` implementa `ai-dlp-v1` como gate determinista y local. El planner comparte esta frontera en cliente y servidor, clasifica señales de alta/media confianza, redacciona previews locales y detiene cualquier señal no permitida antes de Gateway. E1 no habilita DLP semántico para archivos/imágenes, confirmación interactiva de señales medias, entitlements, cuotas o telemetría conectada.

El contrato y los límites están en `contaia-ai-phase-e1-dlp-gate.md`. La evidencia de cierre es 265/265 unitarias, 21/21 pruebas focalizadas de DLP/servidor, 4/4 E2E focalizadas y build estático aprobado. La siguiente etapa es E2 — admisión, identidad, entitlements y cuotas server-side.

### Fase E — Capacidades Premium

Conectar el `CapabilityGate` del contrato Free/Premium para cuotas de explicación, snapshots y artefactos avanzados. Los límites de volumen y las funciones locales siguen siendo independientes de la disponibilidad del modelo.

---

## 16. Criterios de aceptación del diseño

- [ ] El AiOrchestrator separa interpretación, plan, ejecución local y explicación.
- [ ] El ToolRegistry contiene una allowlist versionada para CFDI.
- [ ] Ninguna herramienta de primera versión modifica fuentes o realiza acciones fiscales irreversibles.
- [ ] Parser y cálculos permanecen locales y reutilizan las funciones existentes.
- [ ] El modelo solo recibe un contexto depurado después de acción explícita.
- [ ] La respuesta de IA no puede ejecutar herramientas por texto libre sin validación del registro.
- [ ] Los handoffs entre islas siguen usando leases y acción humana explícita.
- [ ] Cancelación, cambio de sesión y desmontaje limpian tareas y contexto temporal.
- [ ] Los errores remotos no bloquean resultados locales.
- [ ] Free/Premium controla capacidades de IA y volumen, no la transparencia básica ni la eliminación de datos.
- [ ] No se fija un modelo concreto hasta consultar el catálogo vigente y completar un piloto sintético.

**Siguiente paso recomendado:** implementar primero la Fase A — contratos puros de `ToolRegistry`, router determinista y `AiOrchestrator` local para CFDI. Requiere confirmación independiente antes de comenzar la implementación.
