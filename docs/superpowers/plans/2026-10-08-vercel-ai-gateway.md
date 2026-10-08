# Nora con Vercel AI Gateway — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrutar la tutoría de Nora mediante Vercel AI Gateway con modelos OpenAI y Anthropic, conservando streaming, privacidad y límites de gasto acordados.

**Architecture:** El backend Node enviará ambas rutas por el Chat Completions REST compatible de AI Gateway. Cada proveedor usará una clave Gateway distinta con un presupuesto mensual propio de USD 10; el ID del modelo se configura del lado del servidor y no se filtran claves al navegador.

**Tech Stack:** Node.js ESM, Vercel Functions, `fetch` nativo, SSE, `node:test` y Playwright existente.

**Spec:** `docs/superpowers/specs/2026-10-08-vercel-ai-gateway-nora.md`

## Global Constraints

- Endpoint fijo: `https://ai-gateway.vercel.sh/v1/chat/completions`; autenticación `Authorization: Bearer` con secreto del servidor.
- Usar `AI_GATEWAY_OPENAI_API_KEY` + `AI_GATEWAY_OPENAI_MODEL` para OpenAI y `AI_GATEWAY_ANTHROPIC_API_KEY` + `AI_GATEWAY_ANTHROPIC_MODEL` para Anthropic.
- Los IDs deben incluir el prefijo del catálogo de Gateway (`openai/` o `anthropic/`); no fijar modelos no elegidos en código.
- Conservar `AI_PROVIDER_DEFAULT`, el contexto didáctico validado, el hilo efímero, el streaming SSE y el comportamiento sin fallback local.
- No enviar respuestas de ejercicios, selecciones, progreso, notas o portafolio; no registrar ni exponer claves ni cuerpos de error del upstream.
- No comprar créditos, habilitar auto-top-up, crear el proyecto remoto ni desplegar en esta implementación de código.
- Los topes acordados son USD 10/mes por clave dedicada; restringir cada clave al proyecto ContaIA mediante `projectId` si la consola lo permite. El presupuesto es por clave, no un presupuesto agregado del proyecto. Vercel documenta que los presupuestos son soft caps y que la solicitud que cruza el umbral puede terminar con un pequeño exceso.

## Review Focus

- Falta una clave o un modelo no compatible con el prefijo: el proveedor no aparece en `/api/tutor/config`, y el stream falla con un error controlado, nunca con respuesta local.
- Una solicitud selecciona `openai` o `anthropic`: solo puede consumir la clave Gateway y el modelo configurados para ese proveedor.
- Eventos SSE fragmentados, varias líneas `data:` y `data: [DONE]`: deben terminar una sola respuesta completa y no confundir el sentinel con JSON.
- Respuestas Gateway HTTP 401, 402, 429 o error SSE: mostrar un mensaje accionable y genérico, sin pasar al navegador texto crudo, IDs secretos ni cuerpos del proveedor.
- Intentos con contexto inventado, notas, soluciones o historial manipulado: el backend mantiene la lista canónica y excluye campos privados como hoy.

---

### Task 1: Migrar transporte del tutor y pruebas a Chat Completions Gateway

**Files:**
- Modify: `src/tutor/server.js`
- Test: `tests/tutor-api.test.js`
- Test: `tests/tutor-server.test.js`

**Interfaces:**
- `configuredProviders(env)` conserva su forma pública `{ providers, defaultProvider }`; cada proveedor expone únicamente `{ id, label, model }`, nunca su clave.
- `validateTutorInput(body, env)` conserva la validación y el contexto existentes.
- El transporte sustituye llamadas directas por `POST https://ai-gateway.vercel.sh/v1/chat/completions`; selecciona clave/modelo según el proveedor validado y usa `messages`, `max_tokens: 450` y `stream: true`.
- El parser reenvía `choices[0].delta.content` como eventos `token` y cierra con `done` al recibir `[DONE]`.

- [x] **Step 1: Escribir pruebas fallidas** para ambos proveedores/configuración sin filtrar claves; clave/modelo correctos por proveedor; endpoint y body Gateway exactos; mensajes/contexto minimizados; frames Chat Completions fragmentados con `[DONE]`; y 401/402/429/SSE-error sin filtrar datos.
- [x] **Step 2: Ejecutar `node --test tests/tutor-api.test.js tests/tutor-server.test.js` y confirmar fallos** por configuración y formato de proveedor directo actual.
- [x] **Step 3: Implementar selección Gateway por proveedor y parser de Chat Completions** en `src/tutor/server.js`, manteniendo CORS, límite por IP, cancelación, validación y forma SSE hacia el front-end.
- [x] **Step 4: Ejecutar las pruebas unitarias y confirmar PASS**, incluida una solicitud a cada ruta con `fetchImpl` simulado; no se usan claves reales.
- [x] **Step 5: Revisar diff y guardar el cambio de backend** con `git diff --check` y commit `feat: route Nora through Vercel AI Gateway` (`53659aa`).

### Task 2: Documentar claves, modelos y presupuestos, y validar el repositorio

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-08-vercel-ai-gateway-nora.md` (marcar alcance completado/activación remota pendiente)
- Modify: `docs/superpowers/plans/2026-10-08-vercel-ai-gateway.md` (registrar resultados)

**Interfaces:**
- El entorno local/servidor documenta los cuatro nombres: `AI_GATEWAY_OPENAI_API_KEY`, `AI_GATEWAY_OPENAI_MODEL`, `AI_GATEWAY_ANTHROPIC_API_KEY`, `AI_GATEWAY_ANTHROPIC_MODEL`.
- README indica que se crean dos API keys dedicadas, una por ruta, cada una con presupuesto mensual propio de USD 10; el presupuesto es por clave y la clave puede restringirse al proyecto ContaIA si se configura su `projectId`.

- [x] **Step 1: Actualizar `.env.example` y README** con variables sin valores secretos, formato `openai/<modelo>` / `anthropic/<modelo>`, pasos de claves y presupuestos, advertencia de soft cap, catálogo gratis limitado y que no hay compra/recarga automática autorizada.
- [x] **Step 2: Ejecutar verificación completa** con `npm test`, `npm run test:e2e -- --workers=2`, `npm run build:vercel` y `git diff --check`; 60 tests unitarios y 34 E2E desktop/mobile pasan, y el build termina correctamente.
- [x] **Step 3: Revisar entorno de configuración faltante**: no añadir secretos; dejar el despliegue pendiente porque el proyecto Vercel existente `one` es Vercel Drop/Next.js y no el repo ContaIA, y la autorización de cuenta/navegador todavía no permite vincularlo.
- [x] **Step 4: Guardar documentación y validaciones** con commit `docs: document Vercel AI Gateway budgets`; la rama de revisión parte de la `origin/main` sincronizada.

---

## Evidencia técnica revisada

- Chat Completions Gateway: `https://ai-gateway.vercel.sh/v1`, `POST /chat/completions`, autenticación Bearer y IDs `provider/model` — [documentación oficial](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions).
- Streaming: delta `choices[0].delta.content` y final `data: [DONE]` — [documentación oficial](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/streaming).
- Modelos Anthropic aceptados por la interfaz Chat Completions compatible — [solicitudes Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions).
- Presupuestos por API key, proyectos OIDC y respuesta 402 al exceder; los budgets son soft caps — [presupuestos](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets).
- Nivel gratuito para un subconjunto de modelos; créditos pagados y auto-top-up son opciones separadas — [precios](https://vercel.com/docs/ai-gateway/pricing).
