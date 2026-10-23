# ContaIA — Contrato técnico E5: matriz y aprobación formal de modelos/proveedores

**Versión:** `ai-model-approval-v1`
**Estado:** implementado y validado localmente; ningún proveedor nuevo se activa automáticamente.
**Dependencias:** `ai-governance-v1`, `ai-admission-v1`, `ai-rate-store-v1`, `ai-observability-v1`.

## Objetivo

E5 impone una frontera server-side entre un modelo configurado y una llamada al Vercel AI Gateway. Un prefijo válido como `openai/...` o `anthropic/...` ya no es suficiente: la coincidencia exacta de proveedor y modelo debe existir en una matriz privada, estar aprobada, no estar vencida y cumplir capacidades y controles mínimos.

La matriz se recibe únicamente mediante `AI_MODEL_APPROVALS_JSON`, como variable privada del servidor. No se lee desde el navegador, query string, body, almacenamiento local ni configuración pública. Si está ausente, es inválida o contiene una entrada no aprobada, las llamadas remotas quedan cerradas con `ai_provider_unapproved`; el análisis CFDI local, las herramientas deterministas, los artefactos locales y el fallback local permanecen disponibles.

## Contrato de entrada

```json
{
  "version": "ai-model-approval-v1",
  "entries": [
    {
      "provider": "openai",
      "model": "openai/<id-exacto-del-gateway>",
      "status": "approved",
      "capabilities": {
        "json_schema_strict": true,
        "structured_output": true,
        "abort_signal": true
      },
      "controls": {
        "no_prompt_logging_by_default": true,
        "configured_retention_policy": true,
        "bounded_output": true
      },
      "retention": {
        "promptLogging": "none",
        "training": "not_permitted",
        "maxDays": 0
      },
      "approval": {
        "reviewedBy": "security-review",
        "reviewedAt": "2026-10-23T10:00:00.000Z",
        "expiresAt": "2027-01-01T00:00:00.000Z",
        "evidenceRef": "review:2026-10-23/model-policy"
      }
    }
  ]
}
```

No se permiten campos adicionales, claves API, tokens, prompts, correos, identificadores fiscales, payloads ni textos libres dentro de la matriz. `status: candidate`, `rejected`, `deprecated` y `superseded` son estados informativos, nunca autorizaciones operativas. La expiración debe ser futura en el momento de cargar la matriz; una entrada vencida vuelve a `unapproved`.

## Matriz viva consultada

El catálogo vivo de Manus se consultó el **23 de octubre de 2026** mediante `manus-node`. Sus IDs y capacidades son evidencia de referencia, no configuración automática del Vercel AI Gateway. El Gateway actual usa IDs con prefijo de proveedor, por lo que cada modelo operativo necesita una revisión exacta e independiente.

| Candidato del catálogo vivo | Proveedor | JSON Schema | Streaming | Señal observada | Estado E5 |
|---|---|---:|---:|---|---|
| `gpt-6.1-sol` | OpenAI | Sí | No | Top en razonamiento, seguimiento, factualidad, escritura, coding y tool use; costo por tarea alto | Candidato de referencia |
| `gpt-6-luna` | OpenAI | Sí | No | Costo por tarea bajo; calidad media en varias dimensiones y baja en razonamiento | Candidato de referencia |
| `gpt-5.5` | OpenAI | Sí | No | Modelo de costo por tarea alto sin señal de retiro en el catálogo consultado | Candidato de referencia |
| `gpt-6-sol` | OpenAI | Sí | No | Superseded por `gpt-6.1-sol` al mismo precio | No aprobar |
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | OpenAI | Sí | No | Deprecated; el catálogo indica cierre de API el 11 de diciembre de 2026 | No aprobar |
| `gemini-3.8-flash`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview` | Google | Sí | No | No pertenecen a la allowlist E5 actual de `openai`/`anthropic` | Fuera de alcance |

La tabla no afirma que los IDs estén habilitados en ContaIA. Antes de cualquier activación se requiere evidencia del modelo exacto configurado en Gateway, política de retención/no entrenamiento, structured output, abort signal, límites de salida y revisión con fecha de expiración.

## Flujo de decisión

`configuredProviders()` puede mostrar únicamente `id`, etiqueta, modelo y un `approvalStatus` seguro. `selectProvider()` vuelve a validar la matriz privada justo antes de construir la solicitud al Gateway. Esa segunda validación es la autoridad; nunca se confía en el estado enviado por el cliente.

El planner JSON y la explicación `cfdi-summary-v1` reutilizan esta frontera. El bloqueo sucede antes de reservar una operación de proveedor o llamar Gateway cuando la configuración no supera la aprobación. No se cambia el payload fiscal, no se añade el snapshot al registro de modelos y no se selecciona un modelo por precio de forma automática.

## No incluido

E5 no habilita modelos, no expande proveedores, no incorpora datos fiscales a la matriz, no implementa compras, no activa Free/Premium, no crea un dashboard ni persiste prompts. E6 queda pendiente para UX de aprobación, canary sintético, matriz operativa visible para administración y autorización de lanzamiento.


## Evidencia de cierre

La implementación en `src/cfdi/ai/model-approval.js` fue validada con entradas aprobadas, candidate, proveedor no allowlisted, prefijo cruzado, capacidades insuficientes, retención permisiva, campos extra, secretos camuflados, expiración y matriz ausente o inválida. El servidor bloqueó un modelo `candidate` con `ai_provider_unapproved` antes de invocar el Gateway y publicó solo `approvalStatus` en la configuración segura.

La fase cerró con **309/309 pruebas unitarias**, build estático aprobado, **24/24 E2E focalizadas** y **110/110 E2E completas** en serie. La matriz Redis y los secretos `AI_GATEWAY_*`/`AI_MODEL_APPROVALS_JSON` no se configuraron en este sandbox; por tanto, no se activó ningún proveedor real nuevo y la ausencia de matriz mantiene cerradas las rutas remotas.
