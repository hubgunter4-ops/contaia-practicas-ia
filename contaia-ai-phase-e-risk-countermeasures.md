# ContaIA — Riesgos pendientes y contramedidas técnicas para Fase IA E

**Corte:** revisión posterior a Fase IA E3
**Alcance:** planner JSON CFDI, explicación segura con Nora, cuotas Premium, DLP y observabilidad
**Estado:** E0, E1, E2 y E3 implementadas localmente; E4–E6 continúan como controles pendientes

## 1. Conclusión ejecutiva

La arquitectura de Fases IA A-D tiene una frontera fiscal sólida: el parser, el análisis CFDI, las alertas y las herramientas permanecen locales; el planner no recibe `analysisRef` ni fuentes; y el resultado del modelo se valida antes de ejecutar una herramienta read-only. Por tanto, el riesgo dominante de la siguiente etapa no es que el modelo modifique directamente una póliza o un CFDI.

Los riesgos pendientes están en cinco superficies operativas:

1. **Salida de texto hacia terceros:** el filtro actual bloquea XML, RFC y UUID, pero no constituye DLP completo para nombres, correos, teléfonos, CLABE, cuentas, tarjetas, direcciones, importes o referencias bancarias.
2. **Control de acceso y cuotas:** E2 vincula planner y explicación CFDI a identidad, entitlements y cuotas server-side; el límite por IP sigue siendo un `Map` secundario y el store Redis distribuido de E3 requiere activación privada en el entorno de producción.
3. **Observabilidad:** existen validaciones y errores controlados, pero no hay todavía un contrato de métricas redacted para saber cuántas solicitudes llegan, cuántos planes se bloquean, cuánto tardan o cuándo se degrada el proveedor.
4. **Dependencia del Gateway/modelo:** se solicita `json_schema` estricto y E3 añade timeout, `Retry-After` y circuit breaker; todavía falta la matriz de compatibilidad y aprobación por modelo.
5. **Entitlements Premium:** E2 ya aplica Free/Premium server-side mediante allowlist privada temporal. Todavía no existe suscripción comercial, checkout ni resolver de entitlements versionado.

La recomendación es que Fase IA E sea una fase de **admisión segura, DLP, control de costos y observabilidad**, no una fase para ampliar el poder fiscal del modelo. No se deben añadir herramientas mutantes ni acciones de presentación, cancelación, aprobación o contabilización.

> **Actualización E3:** planner y `cfdi-summary-v1` ya pasan por admisión server-side autenticada, entitlement Free por defecto, límites mensuales, idempotencia, leases con TTL y breaker. El adaptador Redis REST distribuido está preparado pero no activado en este sandbox; E4 aún debe conectar observabilidad redacted sin prompts ni datos fiscales.

## 2. Estado técnico observado

### 2.1 Controles que ya existen

- `ToolRegistry` cerrado, versionado y con herramientas locales.
- Router determinista antes del planner.
- Planner limitado a cuatro herramientas `modelCallable` de solo lectura.
- `analysisRef` eliminado del catálogo que ve el planner y añadido únicamente después de la validación local.
- Schema JSON estricto solicitado al Gateway.
- Validación server-side de la respuesta y validación posterior en el cliente/orquestador.
- Rechazo de XML, UUID y patrones básicos de RFC en la petición del planner.
- Contexto `cfdi-summary-v1` reducido y vuelto a sanitizar en el servidor de Nora.
- Doble confirmación para la explicación con Nora.
- `AbortController`, `CleanupScope` y época de sesión para cancelar operaciones y descartar resultados tardíos.
- Respuestas `no-store`, CORS, límite de tamaño de cuerpo y rate limit básico.
- No se guardan prompts ni conversaciones del planner.
- Degradación a herramientas locales cuando el planner o Nora no están disponibles.

### 2.2 Riesgos directamente verificables en el código actual

| Observación | Riesgo asociado |
|---|---|
| `handleCfdiPlanner()` valida método, origen, cuerpo, Bearer y cuenta antes de admisión | La autoridad server-side existe para planner; la activación comercial definitiva de entitlements continúa pendiente |
| `rateBuckets` es un `Map` en memoria del proceso y el store Redis E3 es opcional | El límite por IP se reinicia al reciclar la función; producción necesita configurar el store distribuido para cuota global |
| La clave de rate limit deriva de `x-forwarded-for` o `remoteAddress` | Debe confiarse únicamente en el encabezado de IP que el runtime de despliegue garantice; no conviene tratar un header arbitrario del cliente como identidad |
| El filtro `SENSITIVE_TEXT_PATTERNS` cubre XML, UUID y una forma de RFC | No detecta todos los datos personales, bancarios, comerciales o fiscales que una persona puede escribir en texto libre |
| No hay `requestId` ni eventos estructurados en `callCfdiPlanner()`/`handleCfdiPlanner()` | No se puede correlacionar una solicitud, su latencia, su fallback, su error de schema y su consumo sin inspeccionar datos potencialmente sensibles |
| `vercel.json` declara `maxDuration` para `api/cfdi/planner.js`, pero el timeout de Gateway es configurable | Un valor de entorno excesivo o una configuración de modelo incompatible puede degradar disponibilidad; E4/E5 deben añadir evidencia operativa |
| La selección de modelo acepta un prefijo `openai/` o `anthropic/` y un valor de ambiente | Hay validación sintáctica, pero no una allowlist de modelos probados para `json_schema`, costo, latencia y retención |
| El cliente puede ejecutar herramientas locales desde el navegador | Esto es aceptable para resultados locales, pero no puede usarse como autoridad para Premium, cuotas, cobros o acciones remotas futuras |
| La limpieza termina referencias y Workers, pero JavaScript no ofrece borrado criptográfico garantizado de memoria | La promesa correcta es “limpieza best effort en memoria y lifecycle”, no “borrado forense” |

## 3. Modelo de amenazas para Fase IA E

La revisión debe cubrir al menos estos actores y fallos:

- **Persona accidentalmente desinformada:** pega un correo, RFC, extracto bancario o texto de un CFDI en una petición aparentemente general.
- **Persona maliciosa:** intenta consumir presupuesto, evadir cuotas, forzar el planner a elegir herramientas no permitidas o extraer prompts/configuración.
- **Prompt injection:** el texto del usuario contiene instrucciones que intentan cambiar el catálogo, revelar reglas o forzar una acción.
- **Modelo defectuoso:** devuelve JSON válido pero semánticamente incorrecto, con una intención distinta, una herramienta fuera de alcance o `missing` engañoso.
- **Proveedor degradado:** devuelve formato incompatible, latencia alta, error de cuota, respuesta vacía o datos de diagnóstico inesperados.
- **Abuso distribuido:** muchas IPs o instancias consumen Gateway; el rate limit por proceso no es suficiente.
- **Configuración equivocada:** se selecciona un modelo no compatible, una clave de Gateway incorrecta o un origen permitido demasiado amplio.
- **Observador interno o proveedor:** logs, traces, dashboards o retención del Gateway capturan texto libre o contextos que no debían salir.
- **Cliente manipulado:** alguien edita JavaScript, `localStorage`, atributos HTML o requests para aparentar Premium.
- **Error de lifecycle:** una respuesta tardía repuebla una isla, reutiliza contexto de otra sesión o conserva un panel de Premium después de navegar.

El modelo de amenaza no pretende resolver malware del navegador, extensiones comprometidas o captura de pantalla del dispositivo. Esos límites deben comunicarse por separado en la política de privacidad.

## 4. Riesgo P0 — DLP insuficiente para texto libre

### 4.1 Problema

El planner bloquea XML, etiquetas CFDI, UUID y una expresión de RFC. Eso reduce el riesgo más obvio, pero una petición como las siguientes todavía podría contener datos sensibles que no son reconocidos por esos patrones:

- “Revisa la transferencia de Juan Pérez por $84,500 de la cuenta terminación 9182”.
- “¿Qué hago con la CLABE 646180157012345678?”.
- “La empresa `Comercial Ejemplo SA de CV`, correo `contabilidad@...` y teléfono ...”.
- “El proveedor me dio el número de factura 12345 y la referencia bancaria ...”.
- Texto con separadores, espacios, caracteres Unicode confusables, imágenes o datos codificados.

El texto de la petición se incorpora al mensaje enviado al Gateway. Aunque no se adjunta el análisis CFDI, el usuario puede introducir manualmente información sensible.

### 4.2 Contramedida propuesta: `AiDataLossPreventionGate`

Crear un módulo puro, compartido por planner y explicación, con un contrato explícito:

```ts
type DlpDecision = {
  decision: "allow" | "block" | "confirm";
  categories: string[];
  reasonCodes: string[];
  normalizedLength: number;
  redactedPreview?: string;
  policyVersion: string;
};
```

El módulo debe:

1. Normalizar Unicode y eliminar caracteres de control o zero-width antes de clasificar.
2. Detectar XML, UUID, RFC, CURP, NSS, correos, teléfonos, URLs con parámetros, tarjetas, CLABE, cuentas bancarias y secuencias de referencia de alta confianza.
3. Detectar texto que parezca contenido de archivo pegado: encabezados XML/CSV/XLSX convertidos a texto, múltiples filas tabulares, bloques Base64 y payloads JSON grandes.
4. Aplicar límites independientes de longitud, cantidad de líneas, tokens y repetición.
5. Devolver solo categorías y códigos; nunca incluir el texto original en logs o eventos.
6. Bloquear de manera inmediata los hallazgos de alta confianza.
7. Para hallazgos de confianza media, mostrar una vista local de redacción y pedir confirmación explícita; no redaccionar silenciosamente sin informar a la persona.
8. Mantener un modo estricto para el planner y un modo explícito para Nora. El planner debe ser más restrictivo porque su envío puede iniciar una llamada sin una revisión de contexto fiscal.

### 4.3 Política recomendada

| Hallazgo | Planner | Nora / `cfdi-summary-v1` |
|---|---|---|
| XML, UUID, RFC, CURP, CLABE, tarjeta | Bloquear | Bloquear si aparece fuera del schema seguro |
| Correo, teléfono, nombre, dirección | Bloquear o redacción visible | El schema no debe permitirlos; bloquear si aparecen |
| Importe aislado sin identificador | Permitir si la persona lo necesita para una duda general, sin adjuntarlo a una fuente | Solo si está en campo numérico agregado permitido |
| Texto tabular o bloque largo pegado | Bloquear y explicar cómo formular una pregunta general | No enviar; usar el snapshot local reducido |
| Ambigüedad media | Confirmación visible antes de red | Confirmación visible y revisión del borrador |

La primera versión no debe intentar resolver DLP con un modelo remoto, porque eso trasladaría el problema al mismo tercero que se quiere proteger. El clasificador inicial debe ser local, determinista y auditable.

### 4.4 Pruebas obligatorias

- Variantes con espacios, guiones, saltos de línea y caracteres Unicode.
- RFC/UUID válidos, inválidos y falsos positivos.
- CLABE, cuenta, tarjeta, correo y teléfono con formatos mexicanos comunes.
- XML y CSV pegados parcialmente.
- Prompt injection mezclado con datos sensibles.
- Mensajes permitidos que no contengan identificadores.
- Garantía de que `redactedPreview`, logs y eventos no contienen el original.
- Property-based/fuzz testing de entradas hasta el límite de 2,000 caracteres.

## 5. Riesgo P0 — Planner sin admisión de identidad y cuota autoritativa

### 5.1 Problema

El endpoint planner actual puede llegar a seleccionar proveedor y llamar Gateway sin una sesión de usuario verificada. El `Map` de `rateBuckets` limita por IP dentro del proceso, pero no representa:

- cuenta;
- plan Free/Premium;
- periodo mensual;
- uso acumulado;
- presupuesto reservado;
- reintentos o duplicados;
- consumo distribuido entre instancias serverless.

El contrato Free/Premium ya define que el cliente no puede desbloquear Premium por `localStorage`, query string o atributos HTML. Esa regla todavía debe convertirse en un control server-side antes de iniciar una llamada remota.

### 5.2 Contramedida: admisión server-side

Implementar un `AiAdmissionService` antes de `callCfdiPlanner()`:

```ts
type AiAdmissionInput = {
  capability: "tools.ai.planner.requests" | "tools.ai.explanation.requests";
  accountId: string;
  planVersion: number;
  requested: 1;
  idempotencyKey: string;
  messageClass: "general_text";
};
```

El flujo recomendado es:

1. Verificar `Authorization: Bearer ...` con el mecanismo de sesión existente.
2. Resolver un `accountId` opaco; no usar RFC, correo o texto fiscal como clave.
3. Obtener entitlement firmado/versionado desde el servidor.
4. Resolver plan y estado: `free`, `premium`, `grace`, `expired`, `unknown`.
5. Aplicar `fallback_free` cuando el estado sea desconocido; nunca habilitar Premium por incertidumbre.
6. Comprobar la cuota antes de Gateway.
7. Crear una reserva atómica con `idempotencyKey`.
8. Liberar o cerrar la reserva según resultado; evitar contar dos veces un retry.
9. Enviar al Gateway únicamente después de la admisión.

El modo local determinista no debe requerir una llamada de entitlement. Una persona puede seguir usando CFDI local sin cuenta o cuando el servicio comercial esté caído. Solo planner remoto, explicación remota, snapshots Premium y futuras capacidades server-side requieren admisión.

### 5.3 Capacidades iniciales de Fase E

Agregar al contrato versionado, sin cambiar límites fiscales:

- `tools.ai.planner.requests.month`.
- `tools.ai.explanation.requests.month`.
- `tools.nora.snapshot.explicit`.
- `tools.ai.concurrent.requests`.
- `tools.ai.max_input_chars`.
- `tools.ai.provider_model` como capacidad operativa interna, no como dato de usuario.

La cuota debe contar una admisión remota, no archivos, XML, filas o importes. El gate local puede mejorar la UX, pero el servidor es la autoridad final.

## 6. Riesgo P0 — Rate limit y costo insuficientes

### 6.1 Problema

El límite inmediato actual es de 30 solicitudes por 10 minutos y vive en un `Map` de módulo. En un entorno serverless puede:

- reiniciarse con el proceso;
- existir de forma independiente en múltiples instancias;
- no limitar por cuenta;
- no reservar presupuesto de Gateway;
- compartir accidentalmente presión entre rutas que usan el mismo helper;

E2 añadió cuota mensual por cuenta e idempotencia, y E3 preparó un store Redis REST con reserva atómica y TTL. Sin `AI_RATE_LIMIT_KV_REST_URL` y `AI_RATE_LIMIT_KV_REST_TOKEN`, el modo en memoria solo es válido para desarrollo/pruebas y no debe presentarse como cuota distribuida de producción.
- depender de una IP que no siempre es una identidad estable.

El límite de cuerpo es 192 KB aunque el planner solo necesita un mensaje de 2,000 caracteres. Eso no representa un costo grande por sí solo, pero permite consumir parsing y memoria innecesarios antes de rechazar campos adicionales.

### 6.2 Contramedidas y estado E3

- Mantener el límite local inmediato para reducir abuso barato.
- [x] Preparar rate limit distribuido por `accountId` opaco, capability y periodo UTC, manteniendo un límite separado por IP/anónimo.
- [x] Usar almacenamiento atómico con TTL de 30 segundos, retención de 62 días y política fail-closed cuando una configuración Redis explícita es inválida.
- [x] Añadir `Retry-After` en respuestas de cuota y circuit breaker.
- [ ] Añadir un semáforo distribuido independiente por cuenta y proveedor/modelo; la capability de concurrencia permanece pendiente.
- [x] Añadir circuit breaker por modelo: tres fallos transitorios abren 30 segundos y una sola prueba half-open permite recuperación.
- [x] Definir timeout de función explícito para `api/cfdi/planner.js` y timeout de Gateway configurable, con 15 segundos por defecto.
- [x] No reintentar automáticamente una llamada cuyo resultado ya llegó; usar `idempotencyKey` y distinguir replay, expiración y liberación.
- [x] Reservar antes de Gateway y representar `reserved`, `completed`, `released` y `expired` sin datos fiscales.
- [x] Mantener el mismo presupuesto de cuenta aunque cambie el proveedor por ambiente.

## 7. Riesgo P0 — Observabilidad inexistente o demasiado rica

### 7.1 Problema

Sin observabilidad no se puede distinguir:

- caída del Gateway;
- incompatibilidad con `json_schema`;
- exceso de solicitudes;
- bloqueo de DLP;
- plan inválido del modelo;
- fallback local esperado;
- latencia de red;
- error de lifecycle;
- intento de abuso.

Pero registrar request/response completos resolvería el problema de operación creando uno de privacidad. El texto de usuario, los prompts, el catálogo, los mensajes a Nora y los contextos CFDI no deben entrar en logs, traces ni analytics.

### 7.2 Contrato de telemetría redacted

Crear una interfaz inyectable, con implementación no-op para pruebas:

```ts
telemetry.emit("ai.planner.completed", {
  requestId,
  route: "cfdi_planner",
  accountHash,
  planVersion,
  provider: "openai",
  modelFamily: "configured",
  outcome: "executed_local_tool",
  toolId: "cfdi.alerts",
  latencyMs,
  dlpDecision: "allow",
  quotaDecision: "allowed",
});
```

Campos permitidos:

- `requestId` aleatorio y no derivado de RFC, correo o UUID.
- `accountHash` HMACado con secreto de servidor, o identificador opaco ya emitido por auth.
- Route, versión de contrato, plan y capability.
- Proveedor y familia de modelo, nunca la API key.
- Resultado enumerado y código de error canónico.
- Latencia, tamaño de request en rangos y consumo agregado si el Gateway lo ofrece.
- Intent/toolId solo de allowlist.
- Estado de cuota y DLP como enums.
- Región/ambiente y versión de aplicación.

Campos prohibidos:

- prompt, `untrustedMessage`, history, documento, XML, JSON completo, `cfdiContext`, `safeContext`;
- RFC, UUID, folio, nombre, correo, teléfono, CLABE, importe o referencia bancaria;
- Authorization, cookies, API keys y headers completos;
- URL completa con query string;
- respuesta completa del modelo.

### 7.3 Eventos mínimos

| Evento | Cuándo | Indicadores |
|---|---|---|
| `ai.admission.allowed` | Antes de Gateway | cuota, plan, capability |
| `ai.admission.blocked` | Cuota, auth o DLP | razón enumerada |
| `ai.planner.requested` | Request aceptado | proveedor, versión, región |
| `ai.planner.completed` | JSON válido y herramienta local ejecutada | latencia, toolId, resultado |
| `ai.planner.invalid_output` | JSON o plan rechazado | código de schema |
| `ai.planner.fallback_local` | Gateway no disponible o no configurado | razón, sin texto |
| `ai.planner.rate_limited` | 429 local/distribuido | bucket, capability |
| `ai.explanation.confirmed` | Primera/segunda confirmación | destino, sin contexto |
| `ai.explanation.sanitized` | Contexto depurado | schema version |
| `ai.explanation.failed` | Nora/Gateway falló | código seguro |
| `ai.lifecycle.cancelled` | Abort, destroy o epoch mismatch | razón |

Los eventos internos de UI deben seguir pasando por `EventBus` con payload plano y sin datos fiscales. La telemetría server-side no debe depender de publicar el prompt en el navegador.

### 7.4 Métricas y alertas

Definir métricas de baja cardinalidad:

- disponibilidad del endpoint;
- P50/P95/P99 de latencia;
- tasa de respuesta 2xx, 4xx, 402, 429, 502, 503;
- tasa de DLP block/confirm/allow;
- tasa de salida JSON inválida;
- tasa de plan bloqueado por allowlist;
- tasa de fallback local;
- tasa de cancelación por usuario/navegación;
- reservas creadas, consumidas, liberadas y expiradas;
- costo y tokens agregados por plan/proveedor/modelo;
- ratio de planner respecto de consultas deterministas.

Alertas iniciales sugeridas:

- P95 por encima del presupuesto durante 10 minutos.
- JSON inválido o schema mismatch por encima de un umbral bajo.
- Aumento brusco de DLP blocks o intentos `tool_not_model_callable`.
- 429/402 sostenidos.
- Reservas huérfanas o consumo no reconciliado.
- Fallback local superior al objetivo de disponibilidad.
- Errores de autenticación o CORS fuera del patrón normal.

Los umbrales deben definirse con datos sintéticos y carga controlada, no con datos de usuarios reales.

## 8. Riesgo P1 — Compatibilidad y configuración del modelo

### Problema

La configuración actual valida prefijo y longitud del modelo, pero no prueba que cada identificador configurado soporte de forma consistente:

- `response_format: json_schema`;
- `strict: true`;
- `additionalProperties: false`;
- mensajes en español;
- límites de tokens y latencia aceptables;
- respuestas sin texto adicional alrededor del JSON.

### Contramedidas

Crear una matriz versionada `AI_MODEL_CAPABILITIES_V1` con:

- provider/model id permitido;
- JSON Schema estricto soportado;
- límite de salida;
- timeout;
- costo operativo estimado;
- retención/procesamiento contratado;
- región y estado de aprobación;
- fecha de última prueba.

Añadir un test sintético de startup o CI, no una llamada con datos de usuarios. Si el modelo no está aprobado, el endpoint debe responder `503 planner_unavailable` y dejar funcionando la ruta local. No aceptar cualquier modelo que solo cumpla el prefijo del proveedor.

Añadir:

- timeout explícito y AbortSignal;
- circuit breaker;
- respuesta `Retry-After` para 429;
- backoff controlado solo para errores transitorios y con idempotencia;
- protección contra respuestas excesivamente grandes;
- no registrar contenido upstream en errores.

## 9. Riesgo P1 — Cliente manipulado y Premium no autoritativo

### Problema

Una persona puede modificar el JavaScript del navegador, `localStorage`, atributos `data-plan` o invocar módulos locales directamente. Eso no permite alterar el servidor si el servidor valida correctamente, pero sí puede:

- aparentar una UI Premium;
- saltarse un gate local;
- enviar más solicitudes al endpoint;
- mostrar una función que el servidor no debería admitir;
- producir una falsa señal comercial si la interfaz confía en el cliente.

### Contramedidas

- Tratar todo `data-plan`, `localStorage` y query string como informativo.
- Resolver entitlements server-side con snapshot firmado/versionado.
- Autorizar planner Premium, snapshots y cualquier operación remota en servidor.
- Vincular reservas a `accountId`, capability, versión de contrato e idempotency key.
- Mantener en el navegador solo el gate UX para detener Workers antes de iniciar.
- Hacer que un entitlement desconocido caiga a Free; nunca a Premium.
- Añadir pruebas de manipulación de DOM/localStorage y requests directos sin token.
- No introducir endpoints de cobro o checkout en esta fase sin contrato separado y skill de pagos.

## 10. Riesgo P1 — Retención y cadena de proveedores

### Problema

Aunque ContaIA no envíe CFDI automáticamente, el planner sí envía texto libre permitido y Nora puede recibir el resumen seguro después de confirmación. El Gateway o proveedor final puede tener retención, logging, entrenamiento, región o subprocesadores que todavía no están documentados en el contrato de producto.

### Contramedidas

Antes de habilitar Premium o producción amplia:

1. Inventariar exactamente qué campos llegan a Gateway por cada ruta.
2. Confirmar política de retención, entrenamiento, subprocesadores y región de cada proveedor/modelo aprobado.
3. Configurar opciones de no entrenamiento/no retención cuando estén disponibles.
4. Separar planner general de Nora con claves, presupuestos y proveedores configurables.
5. Documentar en la UI qué se comparte y con qué finalidad.
6. Mantener `cfdi-summary-v1` como schema cerrado; cualquier campo nuevo requiere revisión de privacidad y nueva versión.
7. No pasar identificadores opacos que puedan correlacionarse con documentos reales sin una necesidad justificada.
8. Realizar pruebas de contrato con mocks que aseguren que el body enviado no contiene datos prohibidos.

## 11. Riesgo P1 — Limpieza de memoria y lifecycle

### Problema

`CleanupScope` y `AbortSignal` reducen la exposición de larga duración, pero no garantizan borrado forense de memoria administrada por JavaScript. Además, Fase E agregará timers de cuota, reservas, focus panels y listeners de telemetría que pueden sobrevivir a la navegación si no se registran bajo la isla.

### Contramedidas

- Registrar bajo `CleanupScope` cada `AbortController`, timer, listener, subscription, object URL, focus trap y reserva local.
- Cancelar primero red y planner; después limpiar UI y referencias de estado.
- Revocar Object URLs y terminar Workers al resetear.
- Evitar copiar mensajes o snapshots en caches globales.
- No poner DLP previews, prompts ni entitlement payloads en `EventBus` global.
- Asociar cada callback a `sessionEpoch` y `islandId`.
- Añadir E2E de navegar CFDI → otra isla → volver → sign out mientras hay planner pendiente.
- Documentar “best-effort memory cleanup” en la política técnica; no prometer borrado seguro de memoria del navegador.

## 12. Riesgo P1 — Semántica y confianza de la respuesta

### Problema

Un plan puede ser válido y ejecutar una herramienta read-only, pero aun así ser una elección poco útil: la petición podría ser confusa, `missing` podría estar incompleto o la persona podría interpretar el artefacto como una conclusión fiscal.

### Contramedidas

- Mostrar siempre `source: deterministic_router` o `source: planner_json`.
- Mostrar que el planner eligió una vista local, no que “analizó el XML”.
- Mantener “revisión humana requerida” visible.
- No usar `completed` como “aprobado fiscalmente”.
- Si el planner devuelve `missing`, mostrarlo como pendiente, no completarlo por inferencia.
- Añadir una segunda confirmación para cualquier nueva capacidad que comparta contexto o genere un documento.
- Crear un conjunto de casos dorados en español con consultas conocidas, ambiguas, unsupported y maliciosas.
- Evaluar utilidad del plan separado de exactitud fiscal: la exactitud fiscal pertenece a las herramientas deterministas.

## 13. Plan de implementación propuesto para Fase IA E

### E0 — Contrato de amenazas y configuración

**Objetivo:** congelar qué sale, quién puede llamar y qué métricas existen.

**Estado:** completado como contrato puro en `contaia-ai-phase-e0-governance-contract.md` y `src/cfdi/ai/ai-governance-contract.js`. E0 no activa todavía DLP runtime, entitlements, rate limiting distribuido ni telemetría remota.

Entregables:

- [x] Matriz de datos permitidos/prohibidos por endpoint;
- [x] `AI_MODEL_CAPABILITIES_V1`;
- [x] Eventos redacted y códigos de error;
- [x] Capacidades de cuota iniciales para planner y explicación;
- [x] Catálogo versionado de amenazas;
- [x] Política contractual de autenticación, entitlements, retención de logs y Gateway;
- [x] Validador puro de telemetría que rechaza prompts, bodies, headers y datos fiscales.

**Criterio de salida:** contrato y pruebas unitarias aprobados; la revisión de arquitectura sigue siendo requisito antes de iniciar E2 o conectar cuotas, entitlements y telemetría al runtime.

### E1 — DLP local

**Objetivo:** reemplazar el filtro de cuatro patrones por `AiDataLossPreventionGate`.

**Estado:** completado localmente en `src/cfdi/ai/ai-dlp-gate.js` e integrado en `src/cfdi/ai/planner.js`. El gate opera en modo estricto para el planner: las señales de alta confianza se bloquean y las señales medias requieren reformulación; ninguna llega a `fetchImpl`.

Entregables:

- [x] Módulo puro y versionado como `ai-dlp-v1`;
- [x] Modo planner estricto compartido por cliente y servidor;
- [x] Clasificación de alta/media confianza;
- [x] Redacción local sin texto original para previews bloqueados;
- [x] Pruebas de formatos fiscales, bancarios, personales, tabulares y estructurados;
- [x] Errores sin texto original y sin acceso del DLP a red, persistencia o modelos;
- [x] Pruebas server-side que demuestran que las señales sensibles no invocan Gateway.

**Criterio de salida:** aprobado con **265 pruebas unitarias**, **21 pruebas focalizadas** de DLP/servidor, **4 E2E focalizadas** del panel CFDI, build estático y compilación focalizada; ninguna entrada de prueba sensible alcanzó `fetchImpl`.

### E2 — Admisión, identidad y cuotas

**Objetivo:** hacer que el servidor sea autoridad de plan y consumo.

Entregables:

- verificación Bearer/accountId;
- resolver de entitlement versionado;
- `CapabilityGate` local con fallback Free;
- `AiAdmissionService` server-side;
- reserva idempotente y reconciliación;
- límites Free/Premium para planner y explicación.

**Criterio de salida:** manipular `localStorage`, DOM o body no desbloquea Premium ni supera el límite server-side.

### E3 — Rate limit distribuido y resiliencia

**Objetivo:** controlar abuso y costo de Gateway.

**Estado:** implementada localmente y validada. El store distribuido está preparado para activarse con `AI_RATE_LIMIT_KV_REST_URL` y `AI_RATE_LIMIT_KV_REST_TOKEN`; esas variables no están configuradas en el sandbox ni se inventaron secretos.

Entregables:

- [x] límites por cuenta opaca, IP/anónimo y provider/model;
- [x] almacenamiento Redis REST atómico con TTL de lease y retención de operación;
- [x] `Retry-After`;
- [x] circuit breaker y timeout;
- [x] `maxDuration` explícito de la función;
- [x] pruebas de duplicados, expiración, retries, circuit breaker y configuración del almacén;
- [ ] semáforo distribuido independiente para concurrencia por cuenta/proveedor.

**Criterio de salida:** con el store Redis configurado, una oleada distribuida no puede crear consumo ilimitado ni duplicar reservas; sin esa configuración, el runtime remoto debe considerarse no habilitado para producción y las herramientas locales permanecen disponibles. Evidencia actual: **290/290 unitarias**, **9 focalizadas E3**, **24 E2E focalizadas** y **110/110 E2E completas**.

### E4 — Observabilidad redacted

**Objetivo:** operar sin registrar datos fiscales.

Entregables:

- interfaz `AiTelemetry`;
- eventos enumerados;
- métricas y dashboards de latencia, fallback, DLP y schema;
- alertas de costo y disponibilidad;
- retención y control de acceso a logs;
- pruebas de no filtración de prompt/body/header.

**Criterio de salida:** los fixtures con RFC, UUID, XML, correo y texto Nora no aparecen en ningún evento o log capturado.

### E5 — Compatibilidad de modelos y vendor review

**Objetivo:** aceptar solo modelos configurados que estén probados y aprobados.

Entregables:

- matriz de modelos;
- pruebas sintéticas de JSON Schema;
- política de cambio de modelo;
- configuración de no retención cuando aplique;
- fallback local y circuit breaker por modelo.

**Criterio de salida:** un modelo no aprobado no puede habilitar planner aunque cumpla el prefijo de proveedor.

### E6 — UX, regresión y canary

**Objetivo:** hacer visibles las decisiones sin confundir Premium con validación fiscal.

Entregables:

- medidor de uso sin datos fiscales;
- panel Free/Premium con `aria-live`, foco y fallback;
- mensajes de DLP y cuota;
- E2E escritorio/móvil;
- pruebas de sign out, navegación y request pendiente;
- canary con datos sintéticos y límite bajo.

**Criterio de salida:** no hay despliegue general hasta observar métricas redacted estables en canary.

## 14. Matriz priorizada de riesgos y aceptación

| ID | Riesgo | Prioridad | Contramedida mínima | Criterio de aceptación |
|---|---|---:|---|---|
| E-01 | Texto sensible sale por planner | P0 | DLP local estricto | Fixtures sensibles no llegan a `fetchImpl` |
| E-02 | Endpoint sin identidad de cuenta | P0 | Bearer + accountId opaco | Sin token no hay planner Premium ni consumo de cuenta |
| E-03 | Rate limit evadible entre instancias | P0 | Cuota distribuida + IP/account limits | Carga distribuida respeta límites globales |
| E-04 | No se detecta abuso o caída | P0 | Telemetría redacted y alertas | Se puede medir éxito, fallback, 429, schema y latencia |
| E-05 | Modelo incompatible con JSON Schema | P0 | Matriz y prueba sintética | Modelo no aprobado se degrada a local |
| E-06 | Premium confiado al cliente | P0 | Entitlement server-side | Manipulación de DOM/storage no habilita Premium |
| E-07 | Gateway/proveedor retiene texto | P1 | Vendor review y política de retención | Ruta y campos transmitidos están documentados |
| E-08 | Reserva/cuota duplicada por retry | P1 | Idempotency key + reserva atómica | Un intento lógico consume una unidad |
| E-09 | Fuga en logs | P1 | Logger estructurado redacted | Prohibidos body, prompts, headers y campos fiscales |
| E-10 | Resultado semánticamente engañoso | P1 | Provenance + revisión humana | UI nunca muestra planner como conclusión fiscal |
| E-11 | Recursos sobreviven a navegación | P1 | CleanupScope ampliado | E2E confirma cancelación y ausencia de estado viejo |
| E-12 | Mala experiencia al bloquear | P2 | Gate visual accesible | Selección intacta, alternativa local y foco correcto |

## 15. Decisiones que requieren aprobación de arquitectura

Antes de iniciar implementación de Fase IA E conviene confirmar:

1. Si todo planner remoto requerirá sesión autenticada o si existirá un presupuesto anónimo Free separado.
2. Qué proveedor/modelos están permitidos y cuál es la política de retención aceptable.
3. Qué almacenamiento distribuido se autoriza para cuotas y reservas; no debe contener datos fiscales.
4. Si el producto acepta bloqueo estricto ante cualquier señal DLP o una confirmación visible para señales de confianza media.
5. Qué métricas y retención son suficientes sin registrar prompts.
6. Qué nivel de disponibilidad se espera del planner frente a la garantía de continuidad de las herramientas locales.
7. Si Premium venderá volumen de planner, snapshots depurados, exportaciones o solo funciones locales; cada capability debe tener límite independiente.

## 16. Recomendación final

Fase IA E debe aprobarse solo como una fase de **control**, no de expansión de autoridad del modelo. El orden correcto es:

1. DLP local y contrato de datos.
2. Identidad, entitlement y cuota server-side.
3. Rate limit distribuido, costo y circuit breaker.
4. Observabilidad redacted.
5. Compatibilidad y revisión de proveedores.
6. UX y canary.

Mientras E-01 a E-06 no estén cerrados, el planner puede permanecer deshabilitado en producción sin afectar CFDI local, conciliación, pólizas, auditoría ni DIOT. La degradación correcta es: “planner no disponible; continúa con herramientas locales”, nunca enviar más datos, habilitar Premium por intuición o ejecutar una acción fiscal para compensar el fallo.

**No se realizaron cambios de código, commit, push ni despliegue como parte de este análisis.**
