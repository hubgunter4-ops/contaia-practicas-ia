# ContaIA — Contrato técnico E4: observabilidad redacted

**Versión:** `ai-observability-v1`
**Estado:** implementado localmente y validado; sin commit, push ni despliegue de esta fase.
**Dependencias:** `ai-governance-v1`, `ai-admission-v1`, `ai-rate-store-v1`, `ai-dlp-v1`.

## Objetivo

Operar el planner CFDI y la explicación segura de Nora sin guardar ni transmitir prompts, cuerpos de solicitud, snapshots fiscales, archivos, XML, RFC, UUID, importes, cookies, tokens o credenciales. E4 agrega visibilidad operacional, no una nueva fuente de datos ni una capacidad fiscal.

## Implementación

El módulo `src/cfdi/ai/ai-observability.js` reutiliza `createAiTelemetryEvent()` del contrato E0. Expone un registry en memoria con `emit()`, `startRequest()`, `snapshot()` y `reset()`. El registry solo conserva contadores de cardinalidad acotada, buckets de latencia y los contadores de eventos emitidos o rechazados. Los eventos completos no se almacenan.

Cada solicitud obtiene un identificador opaco `ai:*`. Las referencias de cuenta se reducen a `acct_*` mediante un hash no reversible para el sink; ningún evento conserva el `accountId` original. Los proveedores se normalizan a `openai`, `anthropic`, `local` o `unknown`, y el ambiente a `development`, `test`, `preview` o `production`.

El sink está desactivado por defecto en pruebas y desarrollo. Solo `AI_OBSERVABILITY_SINK=console` activa el sink de consola redacted. Un error del sink incrementa `droppedEvents`, pero nunca interrumpe la solicitud remota, la ejecución local ni la respuesta al usuario.

## Eventos operativos

| Evento | Uso | Campos adicionales permitidos |
|---|---|---|
| `ai.admission.allowed` | Reserva aceptada | `capability`, `quotaDecision`, `plan`, `environment` |
| `ai.admission.blocked` | Identidad, cuota o capacidad rechazada | `capability`, `errorCode`, `quotaDecision`, `environment` |
| `ai.planner.requested` | Planner autorizado antes de Gateway | `route`, `capability`, `provider`, `modelFamily`, `environment` |
| `ai.planner.completed` | Plan JSON aceptado y ejecutable | `route`, `outcome`, `latencyMs`, `toolId`, `environment` |
| `ai.planner.fallback_local` | Planner no disponible o DLP bloqueó | `route`, `errorCode`, `outcome`, `environment` |
| `ai.planner.invalid_output` | Respuesta que no cumple el schema | `requestId`, `errorCode`, `outcome`, `environment` |
| `ai.planner.rate_limited` | Límite local o server-side | `capability`, `errorCode`, `environment` |
| `ai.explanation.sanitized` | Contexto `cfdi-summary-v1` ya depurado | `schemaVersion`, `environment` |
| `ai.explanation.confirmed` | Acción humana habilitó el envío | `schemaVersion`, `environment` |
| `ai.explanation.failed` | Explicación no completada | `errorCode`, `outcome`, `environment` |
| `ai.lifecycle.cancelled` | Abort o desmontaje | `errorCode`, `environment` |

Todos los eventos siguen los campos requeridos y enums de `ai-governance-v1`. DLP, autenticación, cuota, timeout, circuit breaker y schema se expresan mediante códigos canónicos; no se copia el mensaje upstream.

## Métricas agregadas

Los buckets de latencia son `lt_100`, `100_499`, `500_999`, `1s_2s` y `2s_plus`. La cardinalidad de contadores se limita a 500 claves; cualquier exceso cae en un contador agregado `overflow`. El snapshot no se expone por una ruta HTTP, no se añade a respuestas del planner/Nora y no se persiste.

## Fronteras de privacidad

E4 no añade tablas, cookies, `localStorage`, `sessionStorage`, IndexedDB, WebSocket, endpoint de telemetría, dashboard externo ni retención persistente. El planner sigue enviando únicamente el texto depurado permitido por E1; la explicación sigue enviando solo el contexto `cfdi-summary-v1` después de doble confirmación y admisión E2/E3. El registry recibe únicamente metadatos enumerados y contadores.

## Validación

- **301/301 pruebas unitarias** con la suite completa.
- **24/24 E2E focalizadas** de CFDI, admisión y Nora.
- **110/110 E2E** completas en escritorio y Pixel 5.
- Build estático `npm run build:vercel` aprobado.
- Pruebas explícitas de rechazo de campos prohibidos, referencias opacas, buckets, cardinalidad, sink fallido, DLP bloqueado y ausencia de snapshot en eventos server-side.

## Fuera de alcance

E4 no implementa dashboards, alertas externas, exportación de métricas, semáforo distribuido de concurrencia, aprobación de modelos/proveedores, retención persistente, facturación, cuotas nuevas ni acciones fiscales. Esos cambios requieren E5/E6 y autorización separada.
