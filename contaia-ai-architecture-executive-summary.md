# ContaIA — Resumen ejecutivo de arquitectura de IA

**Corte arquitectónico:** Fase IA E2 terminada localmente
**Producto:** ContaIA Herramientas · módulo CFDI
**Estado de publicación:** cambios locales, sin commit, push ni despliegue
**Audiencia:** revisión de arquitectura, seguridad y producto

## 1. Resumen ejecutivo

La arquitectura implementada trata la IA como una capa de interpretación y acompañamiento, no como fuente de verdad fiscal. El análisis CFDI, la lectura de archivos, los cálculos, las alertas, las relaciones de pagos y los reportes locales permanecen bajo ejecución determinista en el navegador. La IA únicamente puede recibir un contexto explícitamente reducido o una petición textual sin fuentes fiscales, y nunca puede modificar fuentes ni ejecutar acciones fiscales irreversibles.

Hasta la Fase IA D se implementaron cuatro capas progresivas:

1. **Contratos puros:** `ToolRegistry`, router determinista y `AiOrchestrator`.
2. **Integración local en la isla CFDI:** panel de consultas y artefactos trazables.
3. **Explicación segura con Nora:** resumen depurado y doble confirmación humana.
4. **Planner JSON cerrado:** selección controlada de herramientas read-only para peticiones que el router no reconoce.

La decisión central es conservar una frontera estricta entre datos fiscales sensibles y modelos remotos. El planner no recibe análisis CFDI; Nora no recibe XML; y ninguna salida textual puede ejecutar una herramienta sin pasar por validación estructural del registro.

## 2. Decisión arquitectónica principal

```text
Persona
  │
  │ petición textual o acción explícita
  ▼
CFDI Island
  │
  ▼
AiOrchestrator
  ├── Router determinista
  │     ├── alertas
  │     ├── pagos
  │     ├── resumen
  │     └── siguiente paso
  │
  ├── Planner JSON opcional
  │     └── solo para peticiones unsupported
  │           recibe texto + catálogo cerrado
  │
  └── ToolRegistry local
        ├── valida schema y allowlist
        ├── inyecta analysisRef localmente
        └── ejecuta herramientas read-only
              │
              ▼
        buildCfdiAnalysis / artefacto local

Parser CFDI Worker
  └── procesa archivos localmente

Artefacto local ── acción explícita ──► cfdi.safe_context
                                      └── resumen cfdi-summary-v1
                                            │
                                            ▼
                                      Nora / Gateway existente
                                      con segunda sanitización server-side
```

El modelo nunca ocupa el lugar del parser, del motor fiscal ni del registro de herramientas. El modelo propone; el código valida; la herramienta local ejecuta; la persona revisa.

## 3. Componentes y responsabilidades

| Componente | Responsabilidad | Datos permitidos | Datos prohibidos o límites |
|---|---|---|---|
| **Parser CFDI Worker** | Leer y analizar XML/lotes localmente | `File`, buffers y contenido CFDI dentro del flujo local | No convierte el payload del Worker en prompt |
| **`buildCfdiAnalysis`** | Generar análisis determinista y trazable | Fuentes CFDI en memoria | No llama modelos ni Gateway |
| **CFDI Island** | Encapsular UI, estado y lifecycle | `analysis:current`, capacidades efímeras | No conserva tareas después del desmontaje |
| **`AiOrchestrator`** | Coordinar intención, plan, ejecución y explicación | Mensaje normalizado, `analysisRef` interno y artefactos reducidos | No acepta XML, `File`, `Blob`, `ArrayBuffer` ni campos sensibles en solicitudes de IA |
| **Router determinista** | Resolver consultas conocidas de forma transparente | Texto de hasta 2,000 caracteres | No calcula ni decide por coincidencias ambiguas |
| **`ToolRegistry`** | Allowlist versionada y validación de schemas | Herramientas CFDI locales read-only | Rechaza herramientas desconocidas, mutantes o fuera de versión |
| **Planner JSON** | Proponer una intención y herramienta de catálogo | Texto no sensible y catálogo de cuatro herramientas | No recibe análisis, `analysisRef`, XML, archivos, RFC, UUID o folios |
| **`cfdi.safe_context`** | Reducir el resultado antes de Nora | Conteos, checks, totales agregados y muestras numéricas acotadas | No expone identificadores ni archivos |
| **Nora / Gateway** | Explicar el resumen o responder una consulta textual | `cfdi-summary-v1` después de autorización | No recalcula desde XML ni puede alterar el análisis local |
| **`CleanupScope` / `AbortSignal`** | Cancelar y limpiar recursos | Estado efímero de la isla | Impide resultados tardíos y uso después del desmontaje |

## 4. Flujo operativo por tipo de consulta

### 4.1 Consulta conocida: ruta determinista local

1. La persona escribe una petición, por ejemplo: “muéstrame las alertas”.
2. `AiOrchestrator` normaliza y valida la entrada.
3. El router encuentra exactamente una intención.
4. `ToolRegistry` valida el schema, la época de sesión y la referencia local.
5. La herramienta consulta el análisis en memoria.
6. El orquestador devuelve un artefacto agregado con procedencia, cálculo y revisión humana.
7. Las acciones siguientes son botones locales explícitos, como abrir alertas, revisar pagos o exportar.

No se necesita llamada remota para esta ruta.

### 4.2 Consulta ambigua: no delegación automática

Si una petición coincide con más de una intención, el router devuelve `ambiguous`. La interfaz muestra opciones y no elige una herramienta en silencio. El planner no participa en esta ruta porque la ambigüedad ya fue detectada por el mecanismo determinista.

### 4.3 Consulta no reconocida: planner controlado

1. El router devuelve `unsupported`.
2. El cliente construye `cfdi-planner-request-v1`.
3. Se filtra el texto y se rechazan patrones de XML, RFC y UUID.
4. Se envían al endpoint únicamente `{ message }`.
5. El servidor agrega el catálogo cerrado y solicita JSON Schema estricto al Gateway configurado.
6. La salida vuelve a validarse server-side.
7. El cliente valida de nuevo intención, herramienta, argumentos, versión y revisión humana.
8. Solo después se inyecta `analysisRef` localmente.
9. La herramienta read-only se ejecuta dentro del navegador.
10. Si el planner falla o propone algo inválido, no se ejecuta ninguna herramienta propuesta.

El planner no puede seleccionar `cfdi.tax_report`, `cfdi.safe_context` ni ninguna futura herramienta que no sea explícitamente `modelCallable`.

### 4.4 Explicación opcional con Nora

1. La persona pulsa “Pedir apoyo a Nora”.
2. La interfaz muestra la primera confirmación y explica qué se compartirá.
3. `cfdi.safe_context` construye `cfdi-summary-v1`.
4. El contexto se entrega al callback allowlisted de Nora.
5. Se abre Asistente abierto con un borrador revisable.
6. La persona debe pulsar **Enviar** como segunda acción humana.
7. El servidor de Nora vuelve a sanitizar el resumen.

Si Nora no está configurada, falla o cambia la sesión, el artefacto local permanece disponible y no se transforma en un resultado fiscal diferente.

## 5. Fronteras de datos

### Nivel 1 — Fuentes sensibles locales

Incluye XML, `File`, `Blob`, `ArrayBuffer`, nombres de archivo, RFC, UUID, folios y contenido original. Estos datos se procesan en el navegador/Worker y no forman parte de solicitudes al planner ni a Nora.

### Nivel 2 — Análisis local

Incluye `buildCfdiAnalysis`, relaciones, alertas y referencias internas como `analysis:current`. Permanece en el registro local y se consulta mediante herramientas. El planner no recibe esta capa.

### Nivel 3 — Artefactos agregados

Incluye conteos, estados, etiquetas de revisión, monedas y diferencias numéricas. Se muestran en la interfaz con procedencia visible y revisión humana requerida.

### Nivel 4 — Contexto seguro para Nora

`cfdi-summary-v1` es una reducción explícita y versionada. Puede contener conteos, checks, totales agregados y muestras numéricas limitadas, pero no identificadores, XML ni archivos. Solo se produce después de una acción visible.

### Nivel 5 — Petición textual para planner

La petición del usuario puede viajar al endpoint planner únicamente después de validación de longitud y filtros básicos de sensibilidad. No se adjunta análisis, catálogo fiscal privado, archivos ni referencias de fuentes. El servidor reconstruye el catálogo permitido; el cliente no puede ampliar la allowlist mediante el request.

## 6. Controles de seguridad y privacidad

### Allowlist y schemas

- Herramientas registradas con versión, dominio, ejecución local, modo read-only y flag `modelCallable`.
- `validatePlannerPlan()` rechaza propiedades adicionales y argumentos que no coinciden con el schema.
- La intención y el `toolId` deben coincidir.
- `humanReviewRequired` debe permanecer en `true`.
- `analysisRef` se inyecta después de la validación, nunca desde la salida del modelo.

### Defensa contra prompt injection

- La petición textual se trata como dato no confiable.
- El prompt de sistema indica que no debe seguir instrucciones incluidas en la petición.
- La salida no se ejecuta directamente: pasa por `ToolRegistry`.
- Un intento de seleccionar `cfdi.tax_report`, agregar campos o inventar herramientas se bloquea.
- Las pruebas incluyen mensajes que intentan ignorar el catálogo y cambiar las reglas.

### Lifecycle y cancelación

- Cada ejecución mantiene un `AbortController`.
- `CleanupScope` cancela operaciones al desmontar la isla.
- La época de sesión invalida respuestas tardías.
- El registro se cierra al destruir la isla.
- Consultas, resultados, confirmaciones y errores efímeros se limpian al resetear, cambiar análisis o desmontar.

### Transporte y servidor

- `POST /api/cfdi/planner` aplica CORS existente, límite de método, rate limit compartido y respuestas `no-store`.
- El Gateway recibe el modelo configurado por ambiente; no se hardcodea un proveedor nuevo en el código.
- Los errores del Gateway se traducen a mensajes controlados sin devolver diagnósticos privados upstream.
- No se guardan prompts ni conversaciones del planner.

## 7. Estado de implementación por fase

| Fase | Resultado | Estado |
|---|---|---|
| **IA A** | Contratos puros, router determinista, ToolRegistry y AiOrchestrator local | Terminada localmente |
| **IA B** | Panel CFDI, consultas locales y artefactos trazables | Terminada localmente |
| **IA C** | Explicación segura con `cfdi-summary-v1`, Nora y doble confirmación | Terminada localmente |
| **IA D** | Planner JSON cerrado, endpoint Gateway, doble validación y ejecución read-only | Terminada localmente |
| **IA E0** | Contrato de gobernanza: datos, amenazas, cuotas, modelos y observabilidad redacted | Terminada localmente |
| **IA E1** | `AiDataLossPreventionGate` local, modo planner estricto y rechazo antes de Gateway | Terminada localmente |
| **IA E2** | Admisión autenticada, entitlement server-side Free/Premium, cuota mensual e idempotencia | Terminada localmente |
| **IA E3-E6** | Rate limit distribuido, resiliencia, telemetría conectada, revisión de proveedores y UX Premium | Pendientes |

## 8. Evidencia de validación

La validación acumulada del estado actual incluye:

- **281/281 pruebas unitarias aprobadas.**
- **110/110 pruebas E2E aprobadas** en escritorio y Pixel 5.
- **6/6 E2E focalizadas** de planner/admisión y panel CFDI aprobadas.
- **21/21 pruebas focalizadas** de DLP y servidor aprobadas.
- Build estático `npm run build:vercel` aprobado.
- Compilación focalizada de planner, orquestador y endpoint aprobada.
- Sintaxis JavaScript validada en módulos y pruebas nuevas.
- `git diff --check` aprobado.
- Pruebas de servidor con Gateway simulado:
  - respuesta JSON cerrada;
  - ausencia de secretos en la respuesta;
  - rechazo de XML/RFC/UUID antes de Gateway;
  - rechazo de `cfdi.tax_report` desde la salida del modelo.
- Pruebas E2E con datos ficticios y locales; no se usaron datos fiscales reales.

## 9. Riesgos y decisiones pendientes para revisión

### Compatibilidad del modelo configurado

El endpoint solicita `response_format: json_schema` estricto, pero la compatibilidad efectiva debe verificarse para cada modelo configurado en el Gateway antes de producción. La validación server-side impide ejecutar una salida incorrecta, pero una incompatibilidad puede producir indisponibilidad del planner.

### Filtros de texto sensibles

E1 amplió la defensa local a XML, UUID, RFC, CURP, NSS, CLABE, tarjetas, contactos, nombres/domicilios etiquetados, URLs con query, tablas, JSON, Base64 y caracteres de control. El gate sigue siendo determinista y limitado a texto del planner; no es un DLP semántico completo ni cubre imágenes, audio o archivos. Las señales medias se detienen hasta que exista una UI de confirmación explícita.

### Disponibilidad y degradación

El planner es opcional. Las acciones deterministas deben seguir funcionando aunque el Gateway no tenga configuración, alcance rate limit, falle o devuelva JSON inválido. Esta degradación es un requisito de producto, no un error fiscal.

### Observabilidad

Actualmente la privacidad impide guardar prompts y payloads completos por defecto. Antes de operar a escala conviene definir métricas agregadas y no sensibles: latencia, tasa de JSON inválido, tasa de fallback, errores por proveedor y cantidad de planes bloqueados.

### Alcance fiscal

El planner no aprueba pólizas, no presenta declaraciones, no cancela CFDI, no modifica fuentes, no activa handoffs automáticos y no ejecuta acciones irreversibles. Estas funciones requerirían contratos independientes, permisos y confirmaciones adicionales.

### Monetización y Premium

E2 aplica cuotas y entitlements server-side en las rutas remotas: planner Free/Premium y explicación/snapshot CFDI explícito. Free conserva las herramientas locales, pero no puede compartir `cfdi-summary-v1` con Nora. La allowlist privada de Premium es una transición operativa, no cobro, checkout ni fuente comercial definitiva; E3–E6 deben aportar almacenamiento distribuido, resiliencia, telemetría redacted, revisión de proveedores y UX de upgrade.

## 10. Recomendación para la revisión de arquitectura

La arquitectura actual es apta para avanzar como **capa asistiva acotada y local-first**, siempre que el planner se considere no autoritativo y se mantengan las dos validaciones —servidor y cliente— antes de ejecutar una herramienta.

Antes de una publicación productiva del planner se recomienda aprobar explícitamente:

1. Una matriz de modelos Gateway compatibles con JSON Schema estricto.
2. Métricas agregadas de calidad, latencia y fallback sin registrar datos sensibles.
3. Un límite operativo y presupuesto por usuario para llamadas de planner.
4. Un análisis formal de DLP si se amplían las expresiones libres aceptadas.
5. La prohibición permanente de usar el planner para herramientas mutantes o acciones fiscales irreversibles.

## 11. Referencias de implementación

- [Diseño de AiOrchestrator y ToolRegistry](/home/ubuntu/contaia-practicas-ia/contaia-cfdi-ai-orchestrator-tool-registry.md)
- [Contrato de islas, lifecycle y privacidad](/home/ubuntu/contaia-practicas-ia/contaia-islands-events-cleanup.md)
- [Planner JSON cerrado](/home/ubuntu/contaia-practicas-ia/src/cfdi/ai/planner.js)
- [Orquestador CFDI](/home/ubuntu/contaia-practicas-ia/src/cfdi/ai/cfdi-ai-orchestrator.js)
- [ToolRegistry](/home/ubuntu/contaia-practicas-ia/src/cfdi/ai/tool-registry.js)
- [Cliente del planner](/home/ubuntu/contaia-practicas-ia/src/cfdi/ai/planner-api.js)
- [Endpoint del planner](/home/ubuntu/contaia-practicas-ia/api/cfdi/planner.js)
- [Servidor de Nora y Gateway](/home/ubuntu/contaia-practicas-ia/src/tutor/server.js)
- [Checklist de implementación](/home/ubuntu/contaia-practicas-ia/TODO.md)
- [Contrato de gobernanza E0](/home/ubuntu/contaia-practicas-ia/contaia-ai-phase-e0-governance-contract.md)
- [Contrato de DLP E1](/home/ubuntu/contaia-practicas-ia/contaia-ai-phase-e1-dlp-gate.md)
- [AiDataLossPreventionGate](/home/ubuntu/contaia-practicas-ia/src/cfdi/ai/ai-dlp-gate.js)
