# ContaIA — Fase IA E2: admisión, identidad y cuotas server-side

**Estado:** implementada y validada; se publica mediante el checkpoint firmado de esta fase.
**Contrato:** `ai-admission-v1` en `src/cfdi/ai/ai-admission.js`.
**Alcance:** solo las rutas remotas de planner CFDI y de explicación CFDI explícita mediante `cfdi-summary-v1`.

## Decisión

E2 convierte el servidor en autoridad de admisión antes de que una solicitud alcance AI Gateway. No altera el parser, el análisis fiscal, el `ToolRegistry` ni las herramientas locales. XML, archivos, análisis, RFC, UUID, folios, extractos y pólizas no se incorporan al servicio de admisión ni a sus reservas.

La identidad se resuelve con `Authorization: Bearer` y `Supabase Auth.getUser`. Se usa exclusivamente el ID opaco del usuario como `accountId`; correo, RFC y plan enviados por el cliente se ignoran. Si no hay sesión, la respuesta remota se bloquea sin llamar Gateway y la experiencia local permanece disponible.

## Entitlements y límites

| Capacidad | Free | Premium | Alcance E2 |
|---|---:|---:|---|
| `tools.ai.planner.requests` | 20/mes | 200/mes | Activa para ambas cuentas autenticadas |
| `tools.ai.explanation.requests` | 10/mes | 100/mes | Requerida junto al snapshot CFDI |
| `tools.nora.snapshot.explicit` | No disponible | 50/mes | Impide compartir `cfdi-summary-v1` en Free |

La fuente efectiva es server-side: Free es el valor por defecto y Premium requiere que el ID opaco de Supabase aparezca en `AI_PREMIUM_ACCOUNT_IDS`, una variable privada opcional. `plan`, `status` o atributos manipulados en DOM, body, query string o almacenamiento del navegador no habilitan Premium. Esta allowlist no es una suscripción ni un mecanismo de cobro; una fuente comercial duradera requerirá contrato y migración propios.

## Reserva e idempotencia

Cada admisión usa `accountId`, capacidad, periodo UTC `YYYY-MM` e `Idempotency-Key` con prefijo `ai_`. El store de proceso reserva una unidad antes de Gateway, la completa cuando la respuesta es válida o la libera ante error/abort. Un replay finalizado de planner devuelve el JSON previamente validado y no vuelve a llamar Gateway; un replay pendiente o liberado exige una nueva acción explícita.

El store base de E2 es deliberadamente efímero e inyectable para pruebas. E3 añade el adaptador Redis REST opcional con TTL, reserva atómica y circuit breaker; las variables privadas del store no están configuradas en el sandbox y el semáforo distribuido de concurrencia permanece pendiente.

## Fronteras de transporte

El cliente del planner conserva el body `{ "message": "…" }` tras DLP y envía token/idempotencia únicamente en headers. El cliente de Nora adjunta esos headers solo cuando la persona completó la doble confirmación para compartir `cfdi-summary-v1`. CORS acepta los dos headers, pero el token no se registra ni se expone en errores.

El endpoint planner valida DLP antes de admisión y valida la salida JSON después de Gateway. El endpoint de Nora conserva sus validaciones del resumen seguro y aplica E2 únicamente si existe `cfdiContext`; la tutoría general no se convierte en un plan comercial con esta fase.

## Evidencia y pendientes

La implementación aprobó **281/281** pruebas unitarias, compilación ESM focalizada, build estático, **6/6** E2E focalizadas y **110/110** E2E completas. Las fixtures de navegador emplean tokens sintéticos e interceptan la red; no usan credenciales, CFDI ni datos fiscales reales.

E2 no incluye tablas, pagos, checkout, webhooks, persistencia de prompts, telemetría conectada, UI de upgrade, canary ni aprobación de modelos. E3 queda documentada en el diseño central; la siguiente fase propuesta es **E4 — observabilidad redacted y métricas agregadas**, previa autorización explícita.
