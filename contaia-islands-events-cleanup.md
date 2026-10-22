# ContaIA — Contrato exacto de eventos y limpieza para Arquitectura de Islas

**Estado:** Fases 1–8 implementadas localmente y validadas. La infraestructura base, Conciliación como isla real, CFDI como isla real, las capacidades explícitas entre fuentes, Pólizas + Auditoría, DIOT, Aprende/Estudio y la recuperación de contraseña con destino seguro ya funcionan; no se agrega persistencia nueva ni se autoriza commit, push o despliegue por este documento.

**Objetivo:** aislar Aprende, Herramientas y Nora sin permitir que CFDI, extractos bancarios, pólizas, auditorías o conversaciones sobrevivan al desmontaje de una isla, al cambio de usuario o a una transición de sección.

---

## 1. Decisión de arquitectura

ContaIA conservará un **shell central** responsable de navegación, autenticación, producto activo y montaje de una sola isla privada a la vez. Cada isla será responsable de su estado de trabajo, listeners, operaciones asíncronas y destrucción.

```text
AppShell / main.js
├── IslandManager
├── EventBus tipado
├── SessionEpoch
├── navegación y autenticación
└── host #island-root
    └── una isla activa
        ├── CFDI
        ├── Conciliación
        ├── Pólizas + Auditoría
        ├── DIOT
        ├── Aprende
        └── Nora
```

El bus sirve para **comandos y notificaciones pequeñas**, no para transportar documentos. XML, `File`, `Blob`, extractos, análisis completos, filas bancarias, pólizas, RFC e importes no se colocan en `CustomEvent.detail`.

La comunicación que requiere datos utiliza una capacidad explícita entregada al montar la isla, por ejemplo `getSelectedCfdiSources()`. La capacidad solo se ejecuta después de una acción humana y devuelve una copia limitada al propietario de la fuente. No se crea un almacén global de CFDI.

---

## 2. Contrato de una isla

Cada módulo debe exportar una función `mountIsland` con el mismo contrato:

```js
export async function mountIsland({
  host,
  islandId,
  session,
  bus,
  capabilities,
  signal,
}) {
  const cleanup = createCleanupScope({ islandId, sessionEpoch: session.epoch });
  const state = createPrivateState();

  cleanup.addEventListener(host, "click", onClick);
  cleanup.addAbortController(new AbortController());
  render(host, state);

  return {
    update(nextProps = {}) {
      if (signal.aborted) return;
      Object.assign(state, nextProps);
      render(host, state);
    },
    async destroy(reason = "navigation") {
      await cleanup.run(reason);
      destroyPrivateState(state);
      host.replaceChildren();
    },
  };
}
```

### Reglas obligatorias del contrato

1. `mountIsland` nunca registra listeners globales sin registrarlos también en `CleanupScope`.
2. `destroy()` debe ser **idempotente**: llamarlo una segunda vez no lanza error y no ejecuta dos veces la limpieza.
3. Toda operación asíncrona recibe el `AbortSignal` de la isla y comprueba `signal.aborted` antes de mutar estado o DOM.
4. La isla no modifica `state.section` directamente. Solicita navegación mediante `bus.emit("navigation:request", ...)`.
5. La isla no modifica la sesión ni borra tokens de autenticación. Solo libera sus referencias de datos de trabajo.
6. La isla no guarda CFDI, bancos, pólizas, XML, filas, RFC ni conversaciones fiscales en `localStorage`, `sessionStorage` o `indexedDB`.
7. Si necesita descargar un archivo, debe revocar el `ObjectURL` en la misma isla durante `destroy()` y también después de la descarga.
8. Una isla no puede reactivarse después de `destroy()`. Para volver se crea una instancia nueva con un `sessionEpoch` actual.

---

## 3. `SessionEpoch`: frontera contra resultados tardíos

El shell mantiene un contador monotónico:

```js
let sessionEpoch = 0;

function nextSessionEpoch(reason) {
  sessionEpoch += 1;
  bus.emit("session:epoch-changed", {
    eventVersion: 1,
    reason,
    sessionEpoch,
  });
  return sessionEpoch;
}
```

Cada isla recibe el valor al montarse. Cualquier callback asíncrono debe comprobar ambos valores:

```js
const mountedEpoch = session.epoch;
const requestId = ++state.requestId;

const result = await readLocalFile(file, { signal });

if (signal.aborted) return;
if (session.epoch !== mountedEpoch) return;
if (state.requestId !== requestId) return;

state.result = result;
render(host, state);
```

Esto evita que una lectura de XML, un `FileReader`, un import dinámico de SheetJS, una respuesta de Nora o una tarea de auditoría escriba en una isla nueva después de que la anterior se desmontó.

---

## 4. `EventBus`: mecanismo exacto

El bus será un módulo pequeño basado en `document` y `CustomEvent`, pero con validación de nombres, versión y metadatos.

```js
const EVENT_PREFIX = "contaia:";

export function emit(name, detail = {}) {
  const eventName = name.startsWith(EVENT_PREFIX) ? name : `${EVENT_PREFIX}${name}`;
  const payload = {
    eventVersion: 1,
    eventId: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    ...detail,
  };
  document.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
  return payload.eventId;
}

export function on(name, handler, { signal } = {}) {
  const eventName = name.startsWith(EVENT_PREFIX) ? name : `${EVENT_PREFIX}${name}`;
  const listener = (event) => handler(event.detail, event);
  document.addEventListener(eventName, listener, { signal });
  return () => document.removeEventListener(eventName, listener);
}
```

En producción el bus debe rechazar o sanear `detail` con cualquiera de estas propiedades: `File`, `Blob`, `ArrayBuffer`, XML completo, texto de documento, `cfdiContext`, tokens, claves, `Supabase session`, objetos DOM o funciones. Los datos sensibles no cruzan el bus.

### Metadatos obligatorios

Todo evento contiene:

```ts
{
  eventVersion: 1,
  eventId: string,
  emittedAt: string,
  sourceIsland: string,
  sessionEpoch: number,
  causationId?: string,
  explicitUserAction?: boolean
}
```

`sourceIsland` y `sessionEpoch` sirven para trazabilidad y para descartar eventos de una instancia antigua. `explicitUserAction` debe ser `true` cuando el evento permite leer o compartir una fuente fiscal.

---

## 5. Catálogo de eventos

### 5.1 Navegación y ciclo de vida

#### `contaia:navigation:request`

**Emisor:** cualquier isla o control del shell.

```js
bus.emit("navigation:request", {
  sourceIsland: "journal",
  target: "diot",
  reason: "user-action",
  explicitUserAction: true,
});
```

**Payload permitido:** `target`, `reason`, `sourceIsland`, `sessionEpoch`, `causationId`.

**Payload prohibido:** datos de la herramienta, XML, análisis, RFC, filas o una función de callback.

El shell valida que `target` pertenezca al registro de islas. Si ya existe una transición, cancela la anterior y conserva solo la última solicitud válida.

#### `contaia:island:before-unmount`

**Emisor:** `IslandManager` antes de invocar `destroy()`.

```js
{
  islandId: "journal",
  reason: "navigation | session-change | auth-signout | replacement | pagehide",
  sessionEpoch: 7,
  hardClear: false
}
```

Es un evento informativo para cancelar tareas internas. No se usa para pasar datos a otra isla.

#### `contaia:island:mounted`

Se emite después de que `mountIsland()` terminó y el host contiene la vista. Incluye `islandId`, `sessionEpoch` y `mountId`; no incluye estado privado.

#### `contaia:island:destroyed`

Se emite después de que `destroy()` terminó y el host fue vaciado. Si la destrucción falla, el manager continúa con la limpieza del host y emite `cleanup:error` sin incluir datos privados.

---

### 5.2 Sesión y privacidad

#### `contaia:session:will-clear`

**Emisor:** shell al cerrar sesión, cambiar de usuario o detectar una sesión inválida.

```js
{
  reason: "auth-signout | user-switch | auth-invalid | privacy-reset",
  previousSessionEpoch: 7,
  hardClear: true
}
```

Orden obligatorio:

1. Incrementar el `sessionEpoch`.
2. Emitir `session:will-clear` con el nuevo límite.
3. Desmontar todas las islas privadas.
4. Ejecutar los resets de workspaces heredados.
5. Limpiar referencias de Nora y conversaciones con contexto.
6. Renderizar la vista pública o de autenticación.

#### `contaia:session:cleared`

Se emite únicamente después de que todas las islas y capacidades privadas fueron destruidas. No significa que el usuario haya cerrado sesión ante un proveedor; significa que la memoria de la aplicación quedó limpia.

#### `contaia:privacy:clear-request`

Permite que un botón «Eliminar datos de esta sesión» solicite un borrado global. El payload solo contiene `reason`, `sourceIsland` y `hardClear: true`.

---

### 5.3 Fuentes fiscales, sin transporte automático

#### `contaia:cfdi:analysis-available`

Notifica que CFDI terminó de analizarse, pero no entrega el análisis.

```js
{
  sourceIsland: "cfdi",
  analysisRunId: "local-run-opaque-id",
  sourceCount: 42,
  periodHints: ["2026-10"],
  currencies: ["MXN"],
  explicitUserAction: false
}
```

La isla de Pólizas o DIOT no debe importar nada automáticamente al recibirlo.

#### `contaia:cfdi:selection-requested`

Se emite después de que la persona pulsa «Usar en Pólizas», «Auditar selección» o una acción equivalente.

```js
{
  sourceIsland: "journal",
  targetIsland: "cfdi",
  sourceIds: ["cfdi-invoice:...", "cfdi-payment:..."],
  explicitUserAction: true,
  causationId: "click-event-id"
}
```

El propietario CFDI responde mediante una capacidad explícita, no con otro evento que contenga XML:

```js
const sources = await capabilities.cfdi.getSelectedSources({
  sourceIds,
  signal,
});
```

La capacidad debe comprobar `sessionEpoch`, pertenencia de los IDs y que la petición provenga de una acción explícita. Devuelve solo una copia serializable y limitada al contrato solicitado.

#### `contaia:workspace:reset`

Notifica que el propietario destruyó sus fuentes. El payload solo contiene `workspace`, `reason`, `sessionEpoch` y un conteo opcional; nunca incluye las fuentes eliminadas.

---

### 5.4 Banco y conciliación

#### `contaia:bank:selection-available`

Solo comunica que existe una selección local, no sus movimientos:

```js
{
  sourceIsland: "reconciliation",
  selectionId: "bank-selection-opaque",
  rowCount: 120,
  currencies: ["MXN"],
  explicitUserAction: false
}
```

Para Pólizas, la lectura requiere una acción «Usar movimientos seleccionados como evidencia» y una capacidad limitada. El evento nunca contiene CSV, XLSX, descripciones, cuentas, referencias, importes o fechas bancarias.

#### `contaia:bank:selection-cleared`

Se emite al cambiar archivo, cerrar el workspace, cambiar de usuario o desmontar Conciliación. Los consumidores eliminan cualquier copia temporal de ese contexto.

---

### 5.5 Nora

#### `contaia:assistant:open`

Abrir el panel no comparte contexto. Solo comunica `sourceIsland`, `assistantMode` y `sessionEpoch`.

#### `contaia:assistant:send`

Solo se emite al pulsar «Enviar consulta». El payload permitido es:

```js
{
  sourceIsland: "journal",
  assistantMode: "open",
  message: "¿Qué significa este bloqueo?",
  explicitUserAction: true,
  sessionEpoch: 7
}
```

No se permite agregar automáticamente `documentText`, XML, RFC, importes, `cfdiContext`, extractos, pólizas o filas. Si la persona desea compartir un resumen, debe existir una acción independiente y una confirmación visible antes de construirlo.

#### `contaia:assistant:cancel`

Cancela el `AbortController` de la solicitud activa y limpia el texto de respuesta parcial. Debe emitirse en desmontaje y al cambiar de herramienta.

---

## 6. `CleanupScope`: limpieza determinista

Cada isla crea un scope de limpieza. No se debe depender de que `innerHTML = ""` retire recursos no-DOM.

```js
export function createCleanupScope({ islandId, sessionEpoch }) {
  const disposers = new Set();
  const controllers = new Set();
  let finished = false;

  const add = (disposer) => {
    if (finished) { disposer(); return disposer; }
    disposers.add(disposer);
    return disposer;
  };

  const addAbortController = (controller = new AbortController()) => {
    controllers.add(controller);
    add(() => controller.abort(`island-destroyed:${islandId}`));
    return controller;
  };

  return {
    add,
    addAbortController,
    addEventListener(target, type, handler, options = {}) {
      const controller = options.signal ? null : addAbortController();
      const effective = controller ? { ...options, signal: controller.signal } : options;
      target.addEventListener(type, handler, effective);
      return add(() => target.removeEventListener(type, handler, effective));
    },
    addObjectUrl(url) { return add(() => URL.revokeObjectURL(url)); },
    async run(reason) {
      if (finished) return;
      finished = true;
      for (const controller of controllers) controller.abort(`destroy:${reason}`);
      for (const disposer of [...disposers].reverse()) {
        try { await disposer(); } catch (error) { console.warn("island cleanup failed", { islandId, reason, error }); }
      }
      disposers.clear();
      controllers.clear();
    },
  };
}
```

### Recursos que toda isla debe registrar

| Recurso | Registro obligatorio | Limpieza |
|---|---|---|
| Listener en `document`, `window`, `visualViewport` | `cleanup.addEventListener` | `removeEventListener`/AbortSignal |
| Listener delegado en host | `cleanup.addEventListener(host, ...)` | AbortSignal |
| `setTimeout` / `setInterval` | `cleanup.add(() => clearTimeout(id))` | Cancelar timer |
| `requestAnimationFrame` | `cleanup.add(() => cancelAnimationFrame(id))` | Cancelar frame |
| `ResizeObserver` / `MutationObserver` | `cleanup.add(() => observer.disconnect())` | Desconectar |
| `AbortController` de fetch/FileReader | `cleanup.addAbortController(controller)` | `abort()` |
| `URL.createObjectURL` | `cleanup.addObjectUrl(url)` | `URL.revokeObjectURL(url)` |
| Worker local | `cleanup.add(() => worker.terminate())` | Terminar worker |
| Audio/Video/Anam | `cleanup.add(() => stream.getTracks().forEach(track => track.stop()))` | Detener tracks y cerrar cliente |
| Importación o proceso con resultado tardío | `sessionEpoch + requestId` | Ignorar callback obsoleto |
| Texto/filas/objetos sensibles | `cleanup.add(() => clearSensitiveState(state))` | Vaciar arrays, Maps, strings y referencias |

---

## 7. Política de datos por sensibilidad

### Nivel público

Incluye navegación, etiquetas de producto, estado visual y progreso educativo permitido. Puede permanecer en el shell o en el almacenamiento de progreso ya existente.

### Nivel de sesión

Incluye filtros de estudio, selección de módulo y estado temporal de una vista. Se elimina al desmontaje si no tiene valor fuera de la isla.

### Nivel fiscal sensible

Incluye XML, CFDI, RFC, UUID, importes, impuestos, pólizas, auditoría, DIOT, nombres de terceros y conversaciones que los contengan. Reglas:

- vive únicamente en la isla propietaria o en una copia temporal otorgada por una capacidad explícita;
- no se coloca en el bus;
- no se escribe en `localStorage`, `sessionStorage` ni `indexedDB`;
- se elimina al desmontar la isla;
- se elimina inmediatamente al cambiar `sessionEpoch`;
- no se conserva como historial de Nora;
- no se incluye en logs, errores, analytics ni URLs.

### Nivel bancario altamente sensible

Incluye CSV/XLSX, movimientos, referencias, descripciones, cuentas y saldos. Además de las reglas fiscales:

- se eliminan bytes y referencias al `File` al cambiar archivo o desmontar;
- se revocan todos los `ObjectURL`;
- se cancelan parsers, workers e importaciones SheetJS pendientes;
- se limpian tablas y previews del DOM;
- cualquier copia temporal en Pólizas se elimina cuando Conciliación emite `bank:selection-cleared` o cuando cambia la sesión.

El token de autenticación pertenece al módulo de Auth y no debe copiarse en ninguna isla. La isla solo recibe `sessionEpoch` y capacidades limitadas.

---

## 8. Secuencia exacta de navegación

La navegación actual de `main.js` asigna `state.section` y llama `render()` directamente. La migración debe reemplazar esa asignación dispersa por una única función:

```js
async function navigateTo(target, meta = {}) {
  if (!isAllowedSection(target)) return;
  if (transition?.target === target) return transition.promise;

  const transitionId = ++nextTransitionId;
  transition?.controller.abort("superseded-navigation");
  const controller = new AbortController();
  transition = { transitionId, target, controller };

  const previous = activeIsland;
  if (previous) {
    bus.emit("island:before-unmount", {
      sourceIsland: "shell",
      islandId: previous.islandId,
      reason: meta.reason || "navigation",
      sessionEpoch,
    });
    await previous.instance.destroy(meta.reason || "navigation");
    if (activeIsland?.mountId === previous.mountId) activeIsland = null;
  }

  if (controller.signal.aborted || transitionId !== nextTransitionId) return;
  state.section = target;
  renderShellWithoutPrivateIsland();

  const entry = islandRegistry[target];
  if (!entry) return;
  const module = await entry.load();
  if (controller.signal.aborted || transitionId !== nextTransitionId) return;

  const instance = await module.mountIsland({
    host: document.querySelector("#island-root"),
    islandId: target,
    session: { epoch: sessionEpoch },
    bus,
    capabilities: capabilitiesFor(target),
    signal: controller.signal,
  });
  if (controller.signal.aborted || transitionId !== nextTransitionId) {
    await instance.destroy("superseded-navigation");
    return;
  }
  activeIsland = { islandId: target, mountId: crypto.randomUUID(), instance };
  bus.emit("island:mounted", { sourceIsland: "shell", islandId: target, sessionEpoch });
}
```

### Orden de la transición

1. Validar ruta.
2. Cancelar transición previa.
3. Abort de operaciones de la isla activa.
4. Emitir `island:before-unmount`.
5. Ejecutar `destroy()` de la isla activa.
6. Vaciar host y comprobar que no quedan nodos privados.
7. Cambiar `state.section`.
8. Renderizar shell y host vacío.
9. Cargar módulo de nueva isla.
10. Montar con `sessionEpoch` vigente.
11. Emitir `island:mounted`.
12. Enfocar `#contenido` y restaurar scroll.

La nueva isla nunca se monta antes de que la anterior termine su limpieza. Esto evita que una respuesta tardía o un listener antiguo modifique la vista nueva.

---

## 9. Secuencia exacta de cierre de sesión o cambio de usuario

```js
async function clearPrivateSession(reason) {
  const previousEpoch = sessionEpoch;
  sessionEpoch += 1;
  bus.emit("session:will-clear", {
    sourceIsland: "shell",
    reason,
    previousSessionEpoch: previousEpoch,
    sessionEpoch,
    hardClear: true,
  });

  await islandManager.destroyAll({ reason, hardClear: true });
  resetReconciliationWorkspace();
  resetJournalWorkspace();
  resetDiotWorkspace();
  resetCfdiWorkspace?.();
  clearOpenAssistantContext();
  clearTutorRequests();

  bus.emit("session:cleared", {
    sourceIsland: "shell",
    reason,
    sessionEpoch,
    hardClear: true,
  });
}
```

Los resets existentes de `main.js` (`resetReconciliationWorkspace`, `resetJournalWorkspace` y `resetDiotWorkspace`) deben quedar como una segunda barrera durante la migración. Cuando una isla ya administre completamente su estado, el reset duplicado se puede retirar después de una regresión.

---

## 10. Ownership de datos y capacidades

| Dato | Propietario | Quién puede solicitarlo | Condición |
|---|---|---|---|
| Análisis CFDI completo | Isla CFDI | CFDI, Pólizas, DIOT mediante capacidad | Acción explícita y `sourceIds` validados |
| XML original | Isla CFDI/parser | Solo CFDI | Nunca se comparte por bus; no se envía a Nora por defecto |
| Extracto y filas bancarias | Isla Conciliación | Conciliación; Pólizas con capacidad limitada | Acción explícita; no se comparte el archivo original |
| Borradores contables | Isla Pólizas | Isla Pólizas | Nunca salen por eventos |
| Hallazgos de auditoría | Isla Pólizas/Auditoría | Misma isla | Se puede exportar localmente por acción explícita |
| Preparación DIOT | Isla DIOT | Isla DIOT | No se comparte automáticamente con Nora |
| Mensajes de Nora | Isla Nora | Nora | Se limpian al desmontar modo contextual |
| Sesión/auth | Shell/Auth | Shell/Auth | Las islas reciben capacidades, no tokens |

Una capacidad debe aceptar únicamente IDs, un `AbortSignal` y opciones enumeradas. Debe devolver una copia profunda limitada y no una referencia mutable al estado del propietario.

---

## 11. Reglas para evitar fugas por eventos

- No usar nombres genéricos como `data`, `payload`, `context` o `analysis` en eventos fiscales.
- No poner `innerHTML`, nodos, callbacks, `File`, `Blob`, XML o errores crudos en `detail`.
- No registrar en consola el detalle completo de eventos fiscales en producción.
- No incluir UUID, RFC o nombres de terceros en `eventId`, URL, título de página, analytics o nombres de timers.
- El `causationId` es un ID opaco de interacción, no un UUID fiscal.
- Un evento de «fuente disponible» no equivale a autorización para leerla.
- Un evento de «póliza aprobada localmente» no equivale a contabilización, presentación o registro ERP.
- Nora recibe solo la pregunta escrita explícitamente, salvo una futura confirmación específica para compartir un resumen.
- Las capacidades se invalidan cuando cambia `sessionEpoch`; una referencia antigua debe lanzar `SessionExpiredError` o devolver `null` sin datos.

---

## 12. Pruebas de aceptación del mecanismo

1. Navegar de CFDI a Conciliación desmonta CFDI antes de montar Conciliación.
2. Navegar rápidamente CFDI → Pólizas → DIOT aborta las dos transiciones anteriores y deja solo DIOT montada.
3. Una lectura XML que termina después de desmontar no modifica el DOM ni el estado de la isla nueva.
4. Un XLSX importado libera `File`, buffers, workers y Object URLs al desmontar Conciliación.
5. Cambiar usuario incrementa `sessionEpoch`, destruye todas las islas privadas y deja vacías las vistas privadas.
6. Cerrar sesión cancela solicitudes de Nora y elimina respuestas parciales y borradores contextuales.
7. El bus nunca contiene XML, `File`, `Blob`, RFC, importes, filas bancarias, pólizas ni tokens.
8. Abrir Nora no produce una solicitud de red; solo enviar una pregunta explícita puede producirla.
9. Pólizas no lee CFDI al recibir `cfdi:analysis-available`; solo lo hace después de una acción «Usar en Pólizas».
10. Una relación de fuente fuera del alcance se comunica mediante IDs y estado, no mediante una copia global del archivo original.
11. Ejecutar `destroy()` dos veces no duplica errores, listeners ni llamadas de limpieza.
12. Los eventos de una isla desmontada se ignoran por `sessionEpoch`, `mountId` o `AbortSignal`.
13. El progreso educativo autorizado puede permanecer en su almacenamiento existente; ningún dato fiscal puede llegar a ese almacenamiento.
14. Los tests de escritorio y móvil comprueban que el host privado no conserva nodos ni provoca desbordamiento tras cambiar de sección.

---

## 13. Orden recomendado de implementación

### Paso 1 — infraestructura sin cambiar vistas

Crear:

```text
src/app/event-bus.js
src/app/cleanup-scope.js
src/app/island-manager.js
src/app/island-registry.js
```

Añadir pruebas unitarias del bus, `CleanupScope`, `SessionEpoch` y transiciones canceladas.

### Paso 2 — migrar una isla de riesgo medio

Migrar Conciliación porque ya es local-first y tiene una frontera clara de archivos, SheetJS, Object URLs y filas bancarias. Mantener un adaptador temporal para `bindReconciliationWorkspace`.

### Paso 3 — migrar Pólizas/Auditoría

Incluir PUE/PPD/REP, notas E, hallazgos, decisiones, exportador y Nora contextual. Las capacidades CFDI/banco se entregan solo por acción explícita.

### Paso 4 — migrar DIOT y CFDI

Separar el parser/worker de la vista y validar que cambiar de isla no conserva XML ni datos derivados.

### Paso 5 — migrar Aprende

El Aula y Estudio pueden compartir el shell, pero deben conservar el almacenamiento de progreso educativo como única excepción autorizada.

### Paso 6 — retirar compatibilidad antigua

Solo después de una regresión completa se eliminan los listeners globales y resets duplicados de `main.js`. La publicación queda en una fase separada y requiere autorización específica.

---

## Decisión final

La regla operativa para ContaIA será:

> **Los eventos anuncian intención y estado; las capacidades entregan datos bajo acción explícita; `CleanupScope` destruye recursos; `SessionEpoch` invalida resultados tardíos; y ninguna isla puede conservar datos fiscales después de desmontarse.**


---

## 10. Web Workers para parsing local

La primera integración real usa `WorkerBridge` en CFDI y Conciliación. El bridge crea un Worker dedicado por operación de parsing y lo termina después de recibir el resultado, un error o una cancelación. No se mantiene un Worker permanente con referencias a archivos.

### 10.1 Mensaje permitido

El hilo principal nunca envía objetos `File` o `Blob`, XML como texto, RFC, sesión, token ni contexto de Nora. Primero obtiene el `ArrayBuffer`, lo envía como objeto transferible y pierde la propiedad sobre ese buffer en el hilo principal:

```js
const buffer = await file.arrayBuffer();
const result = await bridge.run("cfdi", {
  files: [{ name: file.name, size: file.size, buffer }],
}, {
  signal: island.signal,
  sessionEpoch: session.epoch,
  transfer: [buffer],
});
```

El nombre se usa únicamente para la trazabilidad local del resultado; no se publica ni se coloca en eventos globales. El Worker importa únicamente módulos locales del proyecto y el bundle local de SheetJS/CFDI. No usa CDN, `fetch`, Supabase, Nora ni endpoints de documentos.

### 10.2 Fronteras de seguridad

- `WorkerBridge` permite solo dos operaciones registradas: `cfdi` y `reconciliation`; no acepta una URL arbitraria de Worker.
- El payload solo admite valores simples, objetos planos, arrays y `ArrayBuffer`. Rechaza `File`, `Blob`, funciones, objetos DOM y propiedades sensibles como `rfc`, `xml`, `documentText`, `cfdiContext`, tokens y secretos.
- El Worker devuelve resultados normalizados y errores limitados; nunca devuelve el XML original, `File`, `Blob`, stack trace ni credenciales.
- La hoja de cálculo bancaria se reduce al conjunto de hojas y filas necesario; el objeto interno de SheetJS no cruza de vuelta al hilo principal.
- El árbol XML del Worker usa `fast-xml-parser` local con `processEntities: false`, rechaza `DOCTYPE` y `ENTITY`, y conserva la validación nativa con `DOMParser` cuando el parser se ejecuta en la ventana.
- El bridge no usa `postMessage` para comandos del bus y no publica los bytes en `CustomEvent.detail`.

### 10.3 Cancelación y desmontaje

Cada análisis conserva un `AbortController` privado y una época monotónica. Cambiar archivo, delimitador, usuario, sesión o isla ejecuta esta secuencia:

1. Incrementar la época local.
2. Abortar el `AbortController` del parsing activo.
3. Invocar `Worker.terminate()` mediante `WorkerBridge`.
4. Vaciar referencias a archivos, buffers, resultados temporales y selecciones.
5. Ignorar cualquier resultado cuyo `sessionEpoch` o token ya no coincida.
6. Revocar URLs de descarga de la isla cuando corresponda.

Una respuesta tardía no puede mutar el DOM ni el estado de una instancia nueva. La misma política se aplica al reset CFDI conectado al cambio de autenticación y al reset de Conciliación conectado al cambio de archivo o sesión.

### 10.4 Fallback explícito

No existe fallback silencioso al hilo principal para estas operaciones. Si el navegador no admite Web Workers, la herramienta muestra un error local y conserva intacta la frontera de privacidad. Esto evita que una degradación del navegador cambie sin aviso el perfil de memoria y rendimiento del tratamiento de XML o extractos.

### 10.5 Archivos implementados

- `src/app/worker-bridge.js`: bridge, allowlist, transferencia, abortos y épocas.
- `src/workers/cfdi-parser.worker.js`: parsing XML/ZIP CFDI local.
- `src/workers/reconciliation-parser.worker.js`: parsing CSV/XLSX y delimitadores local.
- `src/cfdi/xml-dom.js`: árbol XML compatible con Worker.
- `tests/worker-bridge.test.js`: contrato de payload, cancelación y expiración.
- `tests/e2e/cfdi-worker.spec.js`: prueba de navegador del Worker CFDI real y ausencia de transmisión del XML.


---

## 11. Estado de fases

- **Fase 1 — Infraestructura base: TERMINADA.** EventBus, CleanupScope, IslandRegistry, IslandManager, WorkerBridge, Workers de parsing y épocas de sesión implementados. Validación: 206 unitarias y 64 E2E antes de esta migración.
- **Fase 2 — Primera isla real: TERMINADA.** Conciliación bancaria usa `mountIsland()`/`destroy()`, CleanupScope para listeners, cancelación de Workers al desmontar, host administrado por IslandManager y limpieza al cambiar de usuario/archivo. Validación actual: 206 unitarias y 66 E2E aprobadas.
- **Fase 3 — Migración CFDI: TERMINADA.** CFDI usa `mountIsland()`/`destroy()`, conserva el bootstrap de autenticación del shell, carga el historial únicamente cuando la isla está activa, limpia XML/ZIP, análisis, cola e historial temporal al desmontar y mantiene exportación XLSX y Worker XML/ZIP. Validación actual: 206 unitarias y 68 E2E aprobadas.
- **Fase 4 — Siguiente propuesta: capacidades explícitas entre islas.** Sustituir los accesos implícitos de DIOT y Pólizas a `cfdiState.analysis` por capacidades de fuente seleccionada, con acción humana, `sourceIds`, `sessionEpoch` y copias mínimas serializables. Esto evitará reintroducir datos fiscales en un store global antes de migrar esas islas.


---

## Estado de implementación — Fase 4: capacidades explícitas entre islas

**Fase 4 — TERMINADA localmente, sin commit, push ni despliegue.**

- Se añadió `src/app/source-capabilities.js` como broker efímero de capacidades. Una solicitud requiere `explicitUserAction: true`, destino permitido, propietario registrado y `sourceIds` que pertenezcan a la isla CFDI.
- El snapshot CFDI se limita por destino: DIOT recibe comprobantes de tipo factura; Pólizas puede recibir facturas y complementos de pago. El snapshot excluye XML, `File`, `Blob`, buffers, rutas locales y conceptos no requeridos.
- Las capacidades usan un token opaco de un solo uso, TTL corto, copia profunda, validación de época y limpieza inmediata al consumir, expirar o cambiar de sesión. No pasan por `CustomEvent.detail`, `localStorage`, `sessionStorage` ni `indexedDB`.
- CFDI muestra la acción visible «Usar esta lectura en otra herramienta» con destinos separados para «Usar en Pólizas sugeridas» y «Preparar DIOT asistida». Abrir Nora sigue sin compartir datos.
- DIOT y Pólizas aceptan el handoff mediante funciones explícitas de destino, muestran la procedencia temporal y obligan a seleccionar las fuentes dentro de la herramienta antes de clasificar o generar.
- El broker se invalida en `contaia:auth-updated`; CFDI registra y libera el proveedor con `CleanupScope` al desmontar la isla. La ruta de cambio de usuario conserva además los resets existentes como segunda barrera.
- Validación reproducible: **210 pruebas unitarias aprobadas**, build estático aprobado y **70 pruebas E2E aprobadas** en serie, incluyendo el handoff CFDI y los viewports de escritorio/móvil.

### Límites pendientes

DIOT y Pólizas todavía conservan sus workspaces heredados y no son islas `mountIsland()` independientes; el handoff actual es la capa de capacidad previa a esa migración. La siguiente fase recomendada es **Fase 5 — Pólizas + Auditoría como isla real**, con `CleanupScope`, `SessionEpoch`, capacidades CFDI/banco recibidas al montar y limpieza de drafts, auditoría, decisiones y conversaciones al destruir. No se autoriza migrar esa fase, crear backend, añadir persistencia ni publicar cambios sin confirmación explícita.


---

## Estado de implementación — Fase 5: Pólizas + Auditoría como isla real

**Fase 5 — TERMINADA localmente, sin commit, push ni despliegue.**

Pólizas + Auditoría ahora se monta mediante `src/journal/island.js` y el mismo `IslandManager` del shell. El adaptador registra los listeners de `bindJournalWorkspace` en `CleanupScope`, consume al montar las capacidades CFDI y bancaria entregadas por acción explícita, y destruye de forma idempotente drafts, fuentes, snapshots aprobados, decisiones de auditoría, aplicaciones de notas de crédito y el estado/conversación de Nora al desmontar o cambiar de sesión.

Se eliminó el acoplamiento global de `main.js`: Pólizas ya no recibe automáticamente `cfdiState.analysis` ni `reconciliationState.movements`. CFDI entrega una lease opaca al destino Pólizas, Conciliación puede entregar un snapshot bancario limitado de movimientos normalizados, y la isla consume cada lease una sola vez. Se conservan los campos originales necesarios para trazabilidad local, pero no se transportan XML, `File`, `Blob`, buffers, archivo bancario ni contexto de Nora.

El refresco de Nora usa `IslandManager.update()` para no reconstruir el shell ni volver a montar la isla durante el streaming. La navegación mantiene una sola isla privada activa; el cambio de usuario incrementa la época, invalida leases y ejecuta los resets heredados como segunda barrera. Validación reproducible: **211 pruebas unitarias aprobadas**, build estático aprobado y **72 pruebas E2E aprobadas** en serie en escritorio y móvil.

### Límites pendientes y siguiente fase

La Fase 6 tomó el workspace DIOT heredado y lo aisló sin cambiar su alcance fiscal. La Fase 7 aisló Aprende/Estudio y conserva los handlers heredados únicamente como compatibilidad bloqueada para eventos fuera de la isla; la siguiente fase sugerida es retirar esos duplicados después de una regresión específica. No se autoriza esa limpieza ni ninguna publicación sin una confirmación explícita posterior.


---

## Estado de implementación — Fase 6: DIOT como isla real

**Fase 6 — TERMINADA localmente, sin commit, push ni despliegue.**

DIOT ahora se monta mediante `src/diot/island.js` y el `IslandManager`. Sus listeners de contexto, fuentes, clasificación, revisión, descargas y Nora se registran bajo `CleanupScope`; el adaptador consume el handoff CFDI únicamente al montarse después de la acción explícita «Preparar DIOT asistida». El shell ya no inyecta `cfdiState.analysis` por defecto y DIOT no se reconstruye globalmente durante el streaming de Nora.

El desmontaje es idempotente y limpia preparación, fuentes, selección, overrides, incidencias, estado de descarga, handoff y conversación de Nora. Una entrada directa a DIOT muestra el estado vacío y solicita abrir CFDI para seleccionar fuentes; no lee historial ni fuentes implícitas. La lease CFDI pendiente se invalida al cambiar de ruta, sesión o usuario.

Validación reproducible del corte: **211 pruebas unitarias aprobadas**, build estático aprobado y **74 pruebas E2E aprobadas** en serie en escritorio y móvil, incluyendo montaje/destrucción de DIOT, handoff CFDI, privacidad de Nora, exportación local y responsive.

### Límites pendientes y siguiente fase

Aprende/Estudio ya usa un host estable gestionado por `src/learn/island.js`. El contenido de Aula, Laboratorio y Estudio se renderiza y actualiza dentro de la isla; sus listeners de interacción se registran bajo `CleanupScope`, y el progreso/estudio educativo autorizado permanece separado de cualquier fuente fiscal. `main.js` conserva ramas históricas con guardas para eventos fuera del host, como compatibilidad temporal; no reciben eventos de la isla.

---

## Estado de implementación — Fase 7: Aprende/Estudio como isla real

**Fase 7 — TERMINADA localmente, sin commit, push ni despliegue.**

`src/learn/island.js` monta Aula, Laboratorio y Estudio mediante el mismo `IslandManager`, con un host estable, `CleanupScope`, abortado de transición y destrucción idempotente. El shell conserva navegación, autenticación y barra inferior; la isla controla el render de contenido, clics, formularios, `toggle`, entradas y cambios. Las actualizaciones de respuesta, fases, búsqueda y notas no reconstruyen el shell.

La navegación explícita entre Aprende, Herramientas y Estudio provoca desmontaje antes de montar el siguiente destino. Al desmontar se liberan listeners y se limpian filtros, selección de estudio, borrador de nota, glosario, demostración y módulo abierto; no se borra el progreso educativo autorizado ni la base local de estudio. No se introducen datos fiscales, APIs, tablas nuevas, pagos ni persistencia fiscal.

Validación reproducible del corte: **211 pruebas unitarias aprobadas**, build estático aprobado y **78 pruebas E2E aprobadas** en serie en escritorio y móvil, incluyendo montaje/actualización/destrucción de la isla, navegación autenticada ficticia Aula→Estudio→Herramientas→Aula, regresión pública, CFDI, DIOT, Pólizas y Conciliación.

### Límites pendientes y siguiente fase

La Fase 9 retiró las ramas globales duplicadas de módulos, fases, glosario, demostraciones, Laboratorio, Estudio, onboarding y respuestas educativas después de una regresión específica. Los handlers que permanecen en `main.js` son los propietarios de la isla y se invocan mediante `CleanupScope`; el shell conserva únicamente navegación exterior, Auth, Herramientas, Nora global y sincronizadores.


---

## Estado de implementación — Fase 8: recuperación de contraseña con destino

**Fase 8 — TERMINADA localmente, sin commit, push ni despliegue.**

El cliente Auth se inicializa también en rutas públicas de recuperación y confirmación, sin montar una isla fiscal como requisito. El destino se conserva únicamente mediante una allowlist (`curso`, `cfdi`, `asistente`); `anam` se normaliza a `asistente` y cualquier valor desconocido se descarta. El flujo construye `redirectTo` hacia `/recuperar-contrasena?destino=...`, con rewrite en Vercel y fallback equivalente en el servidor de pruebas.

Cuando Supabase emite `PASSWORD_RECOVERY`, la aplicación muestra el estado «Enlace verificado» y habilita un formulario de nueva contraseña. La actualización usa exclusivamente `client.auth.updateUser({ password })`; la contraseña no entra en URLs, logs, capacidades, eventos, Nora ni estado persistente. Después de un éxito se limpian los campos y se ofrece un enlace a `/?destino=...`, que conserva la llegada posterior a Aprende, CFDI o Nora.

El enlace de recuperación dentro del diálogo de inicio de sesión también conserva el destino de producto. Se corrigió la semántica accesible para evitar regiones `status` anidadas, y los mocks E2E de Auth incluyen ahora los métodos mínimos (`getSession` y `onAuthStateChange`) necesarios para que la isla CFDI no invalide una sesión simulada durante la prueba.

Validación reproducible del corte: **211 pruebas unitarias aprobadas**, build estático aprobado y **16 pruebas E2E de autenticación aprobadas** en escritorio y móvil. La regresión completa anterior aprobó 88/90 pruebas; sus dos fallos restantes correspondían al mock histórico del destino CFDI y pasaron 6/6 tras corregirlo.

### Límites pendientes

La Fase 8 no añade SMS, proveedores alternativos, tablas, backend, pagos, presentación fiscal, cambios de sesión remota fuera del cliente Auth existente, commit, push ni despliegue. La siguiente revisión sugerida es retirar compatibilidad histórica bloqueada y medir el rendimiento de las islas, previa confirmación explícita.


---

## Estado de implementación — Fase 9: limpieza de compatibilidad y rendimiento

**Fase 9 — TERMINADA localmente, sin commit, push ni despliegue.**

Después de que Aula, Laboratorio y Estudio quedaron bajo `src/learn/island.js`, se retiraron del shell los handlers globales que duplicaban sus acciones: selección de módulos y fases, glosario, demostraciones, navegación de ejercicios, fichas de Estudio, notas, `toggle` de módulos, búsqueda/filtros, respuestas, onboarding y acciones de revisión. El `click`, `submit`, `toggle`, `input` y `change` global conserva solo responsabilidades del shell; los eventos del contenido educativo son gestionados por la isla mediante `CleanupScope`.

La eliminación no alteró el almacenamiento de progreso educativo ni `study-db`. La isla sigue limpiando únicamente filtros, selección, borradores y demás estado efímero al desmontarse. Auth, Herramientas, Nora global, navegación exterior, sincronizadores fiscales y resets de sesión siguen en `main.js` porque no son propiedad del contenido de Aprende.

Se añadió `tests/e2e/learning-performance.spec.js` con presupuestos de montaje menor a 2,500 ms, actualización menor a 500 ms y navegación menor a 2,500 ms, además de una comprobación de que el host estable no se reemplaza durante una actualización. Las mediciones observadas fueron: Chromium, montaje **391.9 ms**, actualización **259.5 ms**, navegación **225.6 ms**; Pixel 5, montaje **267.1 ms**, actualización **238.4 ms**, navegación **248.7 ms**.

La validación final aprobó **211 pruebas unitarias**, el build estático y **92 pruebas E2E** en serie en escritorio y móvil. Esta fase no autoriza optimizaciones de infraestructura, cambios de Auth, cambios en el esquema educativo, backend, pagos, integración remota, commit, push ni despliegue.
