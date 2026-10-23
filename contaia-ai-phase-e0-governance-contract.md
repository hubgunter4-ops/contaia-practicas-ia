# ContaIA — Contrato técnico de gobernanza IA E0

**Versión:** `ai-governance-v1`
**Fase:** E0 — contrato de amenazas, datos permitidos, cuotas y observabilidad
**Estado:** implementado como contrato puro y validado localmente; no activa todavía gates, entitlements, DLP runtime, rate limiting distribuido ni telemetría real.

## 1. Propósito

E0 congela las reglas que deberán respetar las futuras Fases E1-E6 antes de ampliar el uso de IA remota. El contrato separa lo que puede permanecer en el navegador de lo que puede salir mediante una acción explícita y define una forma de medir operación sin registrar prompts ni datos fiscales.

E0 no agrega endpoints, llamadas de red, almacenamiento remoto, pagos, suscripciones ni cambios en la lógica fiscal. Su implementación es deliberadamente pura para que los siguientes componentes puedan probarse contra el mismo contrato.

## 2. Artefactos implementados

- `src/cfdi/ai/ai-governance-contract.js`
  - `AI_GOVERNANCE_CONTRACT_VERSION`.
  - Clases de datos y políticas por endpoint.
  - Capacidades y límites iniciales de IA.
  - Catálogo de modelos y requisitos de aprobación.
  - Catálogo de amenazas y códigos de error.
  - Definiciones y validador de eventos de telemetría redacted.
- `tests/cfdi-ai-governance-contract.test.js`
  - Ocho pruebas unitarias de invariantes E0.

## 3. Clases de datos

| Clase | Ejemplos | Transporte permitido | ¿Puede salir? | Telemetría |
|---|---|---|---:|---|
| `local_sensitive` | XML, `File`, extracto bancario, buffer de Worker | navegador, Worker, herramienta local | No | Nunca |
| `local_derived` | análisis CFDI, auditoría, póliza borrador, revisión DIOT | navegador, herramienta local, exportación local | No | Solo agregados |
| `safe_summary` | `cfdi-summary-v1` | adaptador existente de Nora después de confirmación | Sí, explícito | Solo versión/schema |
| `planner_text` | pregunta normalizada de la persona | endpoint planner después de filtro | Sí, filtrado | Solo decisión DLP |
| `telemetry_aggregate` | latencia, status, error, cuota, resultado | logs/métricas redacted | Sí | Es el propio evento |
| `entitlement_aggregate` | referencia de cuenta opaca, plan, estado y uso agregado | admisión server-side futura | Sí | Solo decisión |

### Regla de no ampliación

Agregar un campo a `safe_summary`, `planner_text` o `telemetry_aggregate` requiere cambiar la versión del contrato, revisar privacidad y actualizar pruebas. Ninguna interfaz puede ampliar estos objetos mediante `data-*`, `localStorage`, query string o campos enviados por el cliente.

## 4. Políticas por endpoint

### 4.1 Planner CFDI — `/api/cfdi/planner`

**Permitido:** únicamente `message`, con texto normalizado y sujeto al DLP de E1.
**Prohibido:** `analysisRef`, XML, archivos, `Blob`, `ArrayBuffer`, RFC, UUID, folios, `documentText`, historial y fuentes completas.
**Acción:** envío explícito de la consulta.
**Persistencia:** ninguna por defecto.

El servidor debe reconstruir el catálogo cerrado. No debe confiar en un catálogo o capability enviado por el navegador para desbloquear herramientas, plan o volumen.

### 4.2 Nora CFDI — `/api/tutor/stream`

**Permitido:** `cfdi-summary-v1` depurado, junto con la pregunta que la persona revisó y envió.
**Prohibido:** XML, archivos, RFC, UUID, folios, nombres de archivo, extractos bancarios, fuentes originales y texto de conversaciones en telemetría.
**Acción:** doble confirmación: preparación del resumen y envío desde Asistente abierto.
**Persistencia:** sujeta a la política explícita de conversación; no se crea persistencia nueva en E0.

### 4.3 Admisión comercial futura

**Permitido:** referencia de cuenta opaca, plan, estado, versión de contrato, periodo, capability y uso agregado.
**Prohibido:** archivos, filas, XML, RFC, UUID, folios, importes, prompts y texto de Nora.
**Acción:** decisión server-side.
**Persistencia:** solo snapshot de entitlement versionado.

### 4.4 Observabilidad

**Permitido:** identificador opaco, ruta, capability, plan, proveedor/familia de modelo, resultado enumerado, error enumerado, latencia, status, herramienta allowlisted, decisión DLP/cuota, versión y ambiente.
**Prohibido:** prompts, body, contenido, historial, documentos, XML, RFC, UUID, folio, importes, `cfdiContext`, `safeContext`, Authorization, cookies, tokens y API keys.
**Acción:** ninguna; la telemetría no debe modificar el flujo.

## 5. Capacidades y cuotas iniciales

Estas cantidades son el contrato inicial de arquitectura, no una implementación de cobro ni una promesa comercial definitiva. El estado efectivo actual sigue siendo Free hasta que exista un resolver de entitlement server-side.

| Capability | Unidad | Alcance | Free | Premium | Inicio antes de ejecutar |
|---|---|---|---:|---:|---:|
| `tools.ai.planner.requests` | request | cuenta / mes | 20 | 200 | Sí |
| `tools.ai.explanation.requests` | request | cuenta / mes | 10 | 100 | Sí |
| `tools.nora.snapshot.explicit` | snapshot | cuenta / mes | no disponible | 50 | Sí |
| `tools.ai.concurrent.requests` | request concurrente | cuenta | 1 | 2 | No |
| `tools.ai.planner.input_chars` | carácter | request | 2,000 | 2,000 | No |

Las cuotas cuentan operaciones remotas admitidas, no archivos, filas, XML ni importes. El gate de cliente solo mejora la experiencia; la autoridad para desbloquear Premium, reservar una unidad y reconciliar consumo será server-side en E2.

### Degradación obligatoria

- Entitlement desconocido: `fallback_free`.
- Gateway no configurado: continuar con local y mostrar planner no disponible.
- Cuota agotada: conservar selección y resultados locales; no iniciar Gateway.
- Error de reserva: no asumir que la operación fue admitida.
- Retry: usar una idempotency key para evitar doble consumo.

## 6. Catálogo inicial de amenazas

| ID | Severidad | Categoría | Fase de control | Estado E0 |
|---|---:|---|---|---|
| E-01 | P0 | DLP de texto libre | E1 | Abierto |
| E-02 | P0 | Identidad y admisión | E2 | Abierto |
| E-03 | P0 | Rate limit distribuido | E3 | Abierto |
| E-04 | P0 | Observabilidad | E4 | Abierto |
| E-05 | P0 | Compatibilidad de modelo | E5 | Abierto |
| E-06 | P0 | Entitlement Premium | E2 | Abierto |
| E-07 | P1 | Retención de proveedor | E5 | Abierto |
| E-08 | P1 | Idempotencia de cuota | E3 | Abierto |
| E-09 | P1 | Fuga en logs | E4 | Abierto |
| E-10 | P1 | Confianza semántica | E6 | Abierto |
| E-11 | P1 | Lifecycle y memoria | E6 | Abierto |
| E-12 | P2 | UX de bloqueo | E6 | Abierto |

E0 registra las amenazas; no declara que estén mitigadas. La única excepción es la documentación y validación de las fronteras ya existentes de Fases A-D.

## 7. Política de modelos

`AI_MODEL_CAPABILITIES_V1` establece que un modelo comienza como `unapproved`. La futura allowlist debe registrar por modelo:

- proveedor e identificador exacto;
- compatibilidad con `json_schema` estricto;
- structured output;
- soporte de cancelación;
- límite de salida y timeout;
- costo operativo;
- retención y entrenamiento;
- región/subprocesadores;
- fecha y resultado de la última prueba sintética.

Cumplir un prefijo como `openai/` o `anthropic/` no equivale a aprobación. Un modelo no registrado debe degradar a la ruta local.

## 8. Contrato de observabilidad redacted

### 8.1 Eventos permitidos

- `ai.admission.allowed`
- `ai.admission.blocked`
- `ai.planner.requested`
- `ai.planner.completed`
- `ai.planner.invalid_output`
- `ai.planner.fallback_local`
- `ai.planner.rate_limited`
- `ai.explanation.confirmed`
- `ai.explanation.sanitized`
- `ai.explanation.failed`
- `ai.lifecycle.cancelled`

Cada evento contiene `eventName`, `contractVersion` y únicamente escalares de una lista cerrada. Los campos de cuenta deben ser referencias opacas como `acct_...`, `anon_...` o `hmac_...`; no se aceptan correos, RFC o UUID.

### 8.2 Campos prohibidos

El validador rechaza campos como `message`, `prompt`, `body`, `content`, `history`, `document`, `xml`, `rfc`, `uuid`, `folio`, `amount`, `importe`, `cfdiContext`, `safeContext`, `authorization`, `cookie`, `apiKey`, `token`, `email` y `phone`. Tampoco admite objetos anidados ni cadenas con caracteres de control.

### 8.3 Métricas futuras

La implementación E4 podrá medir:

- disponibilidad y P50/P95/P99;
- 2xx, 4xx, 402, 429, 502 y 503;
- DLP allow/block/confirm;
- JSON/schema inválido;
- plan rechazado por allowlist;
- fallback local;
- cancelación y epoch mismatch;
- reservas creadas, consumidas, liberadas y expiradas;
- consumo agregado por plan/proveedor/modelo.

No se almacenarán prompts, respuestas, documentos ni contextos CFDI para calcular estas métricas.

## 9. Códigos de error canónicos

El contrato reserva códigos para que UI, logs y métricas no dependan de texto libre:

`ai_auth_required`, `ai_entitlement_unknown`, `ai_capability_blocked`, `ai_dlp_blocked`, `ai_dlp_confirmation_required`, `ai_rate_limited`, `ai_concurrency_limited`, `ai_provider_unapproved`, `ai_provider_unavailable`, `ai_schema_invalid`, `ai_plan_rejected`, `ai_request_cancelled`, `ai_session_expired`, `ai_budget_exhausted`.

Los mensajes visibles pueden ser localizados y contextualizados, pero los eventos deben usar el código estable.

## 10. Fuera de alcance de E0

- No se implementa `AiDataLossPreventionGate`; corresponde a E1.
- No se verifica Bearer ni entitlement en planner; corresponde a E2.
- No se añade almacenamiento distribuido ni reservas; corresponde a E3.
- No se envían eventos a un backend de telemetría; corresponde a E4.
- No se activa ninguna allowlist de modelo productivo; corresponde a E5.
- No se añade UI Premium ni medidor de uso; corresponde a E6.
- No se agregan herramientas mutantes, acciones fiscales, pagos, persistencia de prompts o nuevas fuentes remotas.

## 11. Evidencia de E0

- **8/8 pruebas unitarias** del contrato aprobadas.
- Sintaxis JavaScript aprobada.
- El módulo no contiene `fetch`, `localStorage`, `indexedDB`, `sendBeacon`, `XMLHttpRequest` ni logging real.
- Las únicas rutas presentes en el módulo son referencias contractuales a endpoints existentes/futuros; no se realizan llamadas.
- No se modificó la lógica fiscal ni el runtime de las islas.

## 12. Siguiente decisión

E0 queda terminado como contrato cuando la revisión de arquitectura acepta sus reglas y cuotas iniciales. La implementación posterior de **E1 — DLP local** ya fue realizada en `src/cfdi/ai/ai-dlp-gate.js`; sus límites y evidencia están documentados en `contaia-ai-phase-e1-dlp-gate.md`. La siguiente fase propuesta es **E2 — admisión, identidad, entitlements y cuotas server-side**.
