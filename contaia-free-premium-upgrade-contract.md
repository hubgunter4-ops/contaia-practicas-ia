# ContaIA — Contrato técnico de planes, capacidades, límites y upgrade

**Estado:** propuesta de diseño y contrato; no implementado ni conectado a pagos.

**Alcance:** ContaIA Aprende y ContaIA Herramientas, con prioridad en CFDI, Conciliación bancaria, Pólizas/Auditoría y DIOT.

**Principio rector:** Free permite aprender y probar el flujo con datos propios; Premium vende volumen, profundidad, trazabilidad y productividad. Los límites nunca deben borrar datos, ocultar resultados ya generados ni debilitar el procesamiento local-first.

---

## 1. Objetivos y límites de esta propuesta

Este documento define:

- Qué funciones permanecen disponibles en Free.
- Qué capacidades requieren Premium.
- Los límites iniciales por herramienta y periodo.
- Los mensajes de upgrade y la interfaz cuando una operación excede un límite.
- El contrato de datos que debe consumir la interfaz para decidir si una acción está permitida.
- La conducta para cuentas anónimas, planes vencidos, estado desconocido y fallos de validación.
- Los límites de privacidad para que la venta de Premium no convierta datos fiscales locales en datos remotos.

Este documento **no** implementa checkout, pagos, suscripciones, webhooks, tablas, endpoints ni validación remota. Tampoco cambia la lógica fiscal, los workers, el EventBus, el CleanupScope o los contratos entre islas.

---

## 2. Modelo comercial

### 2.1 ContaIA Aprende

| Capacidad | Free | Premium |
|---|---:|---:|
| Módulos publicados | 2 módulos introductorios | 10 módulos completos |
| Sesiones guiadas | 3 por semana | Acceso completo bajo uso razonable |
| Glosario | Conceptos incluidos en los módulos Free | Glosario completo |
| Prácticas | Prácticas de los módulos Free | Todas las prácticas y proyecto integrador |
| Progreso | Guardado local de módulos y prácticas | Ruta completa, progreso y portafolio local |
| Nora educativa | Guías predefinidas y orientación básica | Guía contextual y retroalimentación ampliada |
| Exportación educativa | Resumen básico | Portafolio y evidencias de aprendizaje |
| Certificación | No disponible | Constancia interna de avance; no es certificación oficial |

`Premium` no debe presentarse como asesoría fiscal, certificación oficial ni garantía de aprobación. La retroalimentación de Nora sigue siendo orientativa y debe conservar sus límites actuales.

### 2.2 ContaIA Herramientas

Los valores son la política inicial del producto. Deben mantenerse en una tabla de configuración versionada, no dispersos en cada workspace.

| Capacidad | Free | Premium | Unidad / alcance |
|---|---:|---:|---|
| CFDI: archivos por lote | 100 | 5,000 | Archivos seleccionados antes de iniciar el análisis |
| CFDI: archivos analizados | 300 | 25,000 | Cuenta / mes calendario |
| Conciliación: movimientos por archivo | 100 | 5,000 | Filas válidas del CSV/XLSX |
| Conciliación: archivos procesados | 10 | 100 | Cuenta / mes calendario |
| Pólizas: borradores por generación | 10 | 500 | Borradores producidos por una ejecución |
| Pólizas: generaciones | 5 | 50 | Cuenta / mes calendario |
| DIOT: operaciones por exportación | 25 | 5,000 | Filas clasificadas para una descarga |
| DIOT: exportaciones | 1 | 50 | Cuenta / mes calendario |
| Auditoría parcial | Muestra limitada a 10 documentos | Completa según fuentes seleccionadas | Por ejecución |
| Auditoría global | No disponible; se muestra una vista de alcance | Disponible | Por ejecución |
| Reglas contables editables | No disponible; reglas predefinidas | Disponible | Por empresa local |
| Catálogo de cuentas | Consulta de estructura predefinida | Edición y reglas por empresa | Perfil local |
| Exportación CSV básica | Disponible | Disponible | Resultado local |
| XLSX fiscal avanzado | No disponible | Disponible | Libro local con hojas y trazabilidad |
| Nora en herramientas | Ayuda contextual sin adjuntar fuentes | Snapshot mínimo explícitamente autorizado | Por acción del usuario |

Los límites de archivos y filas son límites de producto y seguridad de ejecución, no una afirmación de que el parser local no pueda procesar otros volúmenes. La capacidad técnica actual de CFDI puede conservar su máximo de 5,000 archivos; el gate del plan debe detener la ejecución antes de iniciar el worker cuando el lote Free excede 100.

### 2.3 Capacidades que siempre permanecen disponibles

Los siguientes elementos no se bloquean por plan:

- Procesamiento y validación local de los datos que sí están dentro del límite.
- Mensajes de privacidad y explicación de que los archivos no se envían automáticamente.
- Revisión manual de errores, diferencias y advertencias.
- Eliminación de la selección y limpieza de memoria.
- Visualización de resultados ya generados localmente.
- Descarga del resultado básico permitido por el plan.
- Advertencias de alcance: no se presentan declaraciones, no se certifica contabilidad y no se sustituye asesoría profesional.
- Datos ficticios de demostración y recorridos de producto.

No se debe usar un bloqueo Premium para impedir que una persona elimine sus archivos, revise por qué una fila quedó fuera o consulte la evidencia que ya generó localmente.

---

## 3. Estados del plan y decisión de acceso

### 3.1 Identificadores canónicos

```js
const PLAN_IDS = Object.freeze(["free", "premium"]);
const PLAN_STATUSES = Object.freeze([
  "active",
  "grace",
  "expired",
  "unknown",
]);

const ACCESS_DECISIONS = Object.freeze([
  "allowed",
  "blocked",
  "preview",
  "fallback_free",
]);
```

- `free / active`: usa los límites Free.
- `premium / active`: usa los límites Premium.
- `premium / grace`: conserva Premium durante el periodo de gracia definido por la futura suscripción.
- `premium / expired`: no desbloquea nuevas ejecuciones Premium; permite leer y exportar resultados locales ya existentes y usar Free.
- `unknown`: no puede desbloquear Premium. Se aplica `fallback_free` sin borrar datos ni interrumpir la navegación.

El cliente nunca debe inferir Premium solo porque exista un valor editable en `localStorage`. En producción, el desbloqueo Premium deberá proceder de una prueba de entitlement firmada o validada por el servidor. En el estado actual, sin pagos ni endpoint de entitlements, el valor efectivo es Free.

### 3.2 Orden de resolución

1. Resolver la sesión y el identificador de cuenta, si existe.
2. Leer el snapshot de plan válido para la sesión actual.
3. Comprobar que la versión del contrato sea compatible.
4. Comprobar el estado (`active`, `grace`, `expired`, `unknown`).
5. Resolver la capacidad solicitada y su límite.
6. Comparar el uso actual y la cantidad solicitada antes de iniciar parsing, worker o exportación.
7. Devolver una decisión determinista y una clave de mensaje; no enviar datos fiscales para obtener la decisión.

Si falta el snapshot o su versión no es compatible, la interfaz no debe bloquear toda la herramienta: debe aplicar límites Free, mostrar el estado correspondiente y permitir el flujo local dentro de esos límites.

---

## 4. Contrato de configuración de capacidades

### 4.1 Descriptor de una capacidad

```ts
/** Contrato conceptual; no es todavía un módulo ejecutable. */
type CapabilityDescriptor = {
  id: string;
  product: "learn" | "tools";
  unit: "module" | "session" | "file" | "row" | "draft" | "execution" | "export" | "feature";
  scope: "account_week" | "account_month" | "batch" | "file" | "execution" | "profile";
  free: number | boolean | "unavailable";
  premium: number | boolean | "unavailable";
  countBeforeStart: boolean;
  sensitiveInput: boolean;
  upgradeMessageKey: string;
};
```

`countBeforeStart` debe ser `true` para archivos, filas, borradores y exportaciones. El gate se ejecuta antes de crear un Worker, guardar un snapshot, descargar un archivo o compartir un handoff entre islas.

### 4.2 Identificadores iniciales

```js
const CAPABILITIES = Object.freeze({
  learnModules: "learn.modules.published",
  learnSessions: "learn.sessions.week",
  cfdiBatchFiles: "tools.cfdi.files.batch",
  cfdiMonthlyFiles: "tools.cfdi.files.month",
  reconciliationRows: "tools.reconciliation.rows.file",
  reconciliationMonthlyFiles: "tools.reconciliation.files.month",
  journalDrafts: "tools.journal.drafts.execution",
  journalMonthlyGenerations: "tools.journal.generations.month",
  diotRows: "tools.diot.rows.export",
  diotMonthlyExports: "tools.diot.exports.month",
  partialAuditDocuments: "tools.audit.partial.documents",
  globalAudit: "tools.audit.global",
  editableRules: "tools.journal.rules.editable",
  advancedXlsx: "tools.export.xlsx.advanced",
  noraFiscalSnapshot: "tools.nora.snapshot.explicit",
});
```

### 4.3 Configuración inicial versionada

```js
const PLAN_LIMITS_V1 = Object.freeze({
  version: 1,
  free: Object.freeze({
    learnModules: 2,
    learnSessionsPerWeek: 3,
    cfdiBatchFiles: 100,
    cfdiFilesPerMonth: 300,
    reconciliationRowsPerFile: 100,
    reconciliationFilesPerMonth: 10,
    journalDraftsPerExecution: 10,
    journalGenerationsPerMonth: 5,
    diotRowsPerExport: 25,
    diotExportsPerMonth: 1,
    partialAuditDocuments: 10,
    globalAudit: false,
    editableRules: false,
    advancedXlsx: false,
    noraFiscalSnapshot: false,
  }),
  premium: Object.freeze({
    learnModules: 10,
    learnSessionsPerWeek: null, // uso razonable; no prometer ilimitado
    cfdiBatchFiles: 5000,
    cfdiFilesPerMonth: 25000,
    reconciliationRowsPerFile: 5000,
    reconciliationFilesPerMonth: 100,
    journalDraftsPerExecution: 500,
    journalGenerationsPerMonth: 50,
    diotRowsPerExport: 5000,
    diotExportsPerMonth: 50,
    partialAuditDocuments: null, // limitado por memoria y fuentes seleccionadas
    globalAudit: true,
    editableRules: true,
    advancedXlsx: true,
    noraFiscalSnapshot: true,
  }),
});
```

`null` significa “sin límite numérico publicado”, no “infinito”: la implementación debe conservar límites de seguridad del navegador, memoria, tamaño de archivo y política de uso razonable.

---

## 5. Contrato de decisión del gate

### 5.1 Entrada y salida

```ts
type CapabilityGateInput = {
  capability: string;
  requested: number;
  currentUsage: number;
  period?: string; // YYYY-MM para cuotas mensuales; YYYY-Www para semanales
  plan: "free" | "premium";
  status: "active" | "grace" | "expired" | "unknown";
  planVersion: number;
};

type CapabilityGateResult = {
  decision: "allowed" | "blocked" | "preview" | "fallback_free";
  plan: "free" | "premium";
  status: "active" | "grace" | "expired" | "unknown";
  capability: string;
  limit: number | null;
  currentUsage: number;
  requested: number;
  remaining: number | null;
  messageKey: string;
  canContinueWithSample: boolean;
  preservesSelection: boolean;
  requiresUserAction: boolean;
};
```

### 5.2 Reglas deterministas

```text
Si requested <= 0: bloquear con invalid_request.
Si plan/status no son válidos: usar fallback_free.
Si la capacidad booleana es false: blocked.
Si limit es null: allowed, sujeto a seguridad de ejecución.
Si currentUsage + requested <= limit: allowed.
Si currentUsage < limit y existe una muestra posible: preview o blocked con acción de recortar.
Si currentUsage >= limit: blocked.
Siempre: preservesSelection = true y no se inicia parsing si el gate bloquea.
```

El resultado del gate no debe incluir nombres de archivos, XML, RFC, UUID, movimientos, importes, descripciones bancarias ni contenido de Nora. Solo necesita cantidades y claves de capacidad.

---

## 6. Interfaz de bloqueo

### 6.1 Patrón visual común

El bloqueo se presenta como una **superficie de decisión**, no como un error técnico:

```text
┌────────────────────────────────────────────────────────────┐
│  REQUIERE PREMIUM                                          │
│  Esta operación supera el límite de tu plan Free.           │
│                                                            │
│  Seleccionados       142 XML                                │
│  Límite Free         100 XML por lote                       │
│  Disponible ahora    Retirar archivos o analizar una muestra│
│                                                            │
│  Premium permite revisar hasta 5,000 XML por lote.          │
│  También incluye auditoría avanzada y XLSX fiscal.         │
│                                                            │
│  [Ver Premium]  [Elegir una muestra]  [Cancelar]            │
└────────────────────────────────────────────────────────────┘
```

#### Reglas de composición

- Eyebrow: `REQUIERE PREMIUM` en tinta accesible jade/petróleo, no en coral.
- Título: explicar la acción bloqueada, no culpar al usuario.
- Resumen cuantitativo: `solicitado`, `límite`, `restante` cuando exista.
- Beneficio: máximo tres beneficios relevantes para esa acción.
- CTA primario: `Ver Premium` o `Conocer Premium`; en esta fase no abre checkout real.
- CTA secundario: `Elegir una muestra`, si la herramienta puede continuar dentro del límite.
- CTA terciario: `Cancelar` o `Volver`, siempre visible.
- Privacidad: indicar que los archivos no se enviaron ni eliminaron.
- No usar cuenta regresiva, urgencia artificial, texto de culpa ni redirección automática.

### 6.2 Ubicación por dispositivo

**Escritorio:**

- Preferir un panel inline inmediatamente debajo del control que inició la acción.
- Mantener el encabezado de la isla visible para conservar contexto.
- Usar modal solo cuando la decisión interrumpa una acción crítica y no exista un lugar inline claro.

**Tablet:**

- Apilar contenido en una columna desde el breakpoint común de `840px`.
- Los botones deben ocupar el ancho natural del panel y mantener orden lógico.

**Móvil:**

- Usar panel inline o bottom sheet accesible, nunca un modal que deje el contenido inaccesible.
- Orden recomendado: explicación, resumen del límite, CTA Premium, muestra, cancelar.
- Botones con área táctil mínima de 44 px.
- El cierre debe devolver el foco al control que abrió el bloqueo.

### 6.3 Roles y teclado

El componente debe cumplir:

```html
<section
  class="plan-limit-panel"
  data-plan-limit-panel
  data-capability="tools.cfdi.files.batch"
  role="region"
  aria-labelledby="plan-limit-title-cfdi"
  aria-describedby="plan-limit-description-cfdi"
>
  <p class="eyebrow">REQUIERE PREMIUM</p>
  <h2 id="plan-limit-title-cfdi">Tu lote supera el límite Free</h2>
  <p id="plan-limit-description-cfdi">...</p>
  <div role="status" aria-live="polite">No se ha iniciado el análisis.</div>
  <div class="plan-limit-actions">
    <button type="button" data-plan-action="open-upgrade">Ver Premium</button>
    <button type="button" data-plan-action="choose-sample">Elegir una muestra</button>
    <button type="button" data-plan-action="dismiss">Cancelar</button>
  </div>
</section>
```

- El panel no debe usar `role="alert"` para una restricción comercial ordinaria.
- Usar `role="alert"` solo si la operación intentó iniciar y produjo un error técnico real.
- `aria-live="polite"` anuncia la decisión sin interrumpir el flujo.
- El foco se mueve al título o al primer botón solo si el panel es modal; en inline, se conserva el foco y se anuncia el estado.
- `Escape` cierra un modal/bottom sheet.
- `Tab` no puede escapar de un modal mientras está abierto.
- `prefers-reduced-motion` desactiva entrada, desplazamiento y transformaciones no esenciales.

---

## 7. Mensajes de upgrade

### 7.1 Mensaje general de plan

**Etiqueta:** `PLAN FREE`

> Estás usando ContaIA Free. Puedes aprender, revisar resultados locales y probar cada herramienta con límites de volumen. Premium añade más capacidad, auditoría avanzada, reglas editables y exportaciones fiscales ampliadas.

**CTA:** `Conocer Premium`

### 7.2 CFDI — lote excedido

**Título:** `Tu lote supera el límite gratuito`

> Seleccionaste **{requested} XML** y Free permite **{limit} XML por lote**. Tus archivos no se han enviado ni eliminado y el análisis aún no ha comenzado.

> Con Premium puedes revisar hasta **5,000 XML por lote**, generar reportes fiscales avanzados y mantener la trazabilidad local de la revisión.

**Acciones:**

- `Ver Premium`
- `Elegir una muestra de {limit} XML`
- `Cancelar`

**Clave:** `upgrade.cfdi.batch`

### 7.3 CFDI — cuota mensual

**Título:** `Alcanzaste el volumen mensual de CFDI`

> Ya utilizaste **{currentUsage} de {limit} archivos** disponibles este mes en Free. Puedes seguir consultando tus resultados locales y revisar una muestra dentro de los límites del plan.

> Premium amplía el volumen mensual y mantiene disponibles los reportes fiscales avanzados.

**Clave:** `upgrade.cfdi.month`

### 7.4 Conciliación — demasiados movimientos

**Título:** `Este extracto necesita un plan con mayor volumen`

> El archivo contiene **{requested} movimientos** y Free permite **{limit} por archivo**. El extracto no se ha subido a un servidor, no se ha guardado en una cuenta y no se ha enviado a Nora.

> Puedes seleccionar una muestra de **{limit} movimientos** o usar Premium para revisar hasta **5,000 movimientos por archivo**, con diferencias y alternativas de coincidencia.

**Acciones:**

- `Ver Premium`
- `Elegir una muestra`
- `Cambiar archivo`

**Clave:** `upgrade.reconciliation.rows`

### 7.5 Pólizas — borradores excedidos

**Título:** `La generación produciría más borradores de los permitidos`

> Esta ejecución produciría **{requested} borradores** y Free permite **{limit} por generación**. No se ha aprobado ni contabilizado ninguna póliza.

> Premium permite revisar generaciones más amplias, reglas editables por empresa y auditoría global o parcial con evidencia.

**Acciones:**

- `Ver Premium`
- `Seleccionar menos fuentes`
- `Cancelar generación`

**Clave:** `upgrade.journal.drafts`

### 7.6 Auditoría global

**Título:** `La auditoría global está disponible en Premium`

> Free conserva la revisión local de una muestra limitada. La auditoría global recorre las fuentes seleccionadas, separa hallazgos por alcance y genera evidencia descargable para revisión humana.

> Ninguna póliza se aprueba automáticamente y ninguna conclusión se presenta como dictamen fiscal.

**Acciones:**

- `Conocer Premium`
- `Ejecutar revisión parcial`
- `Cancelar`

**Clave:** `upgrade.audit.global`

### 7.7 DIOT — exportación excedida

**Título:** `La selección supera el límite de operaciones Free`

> Esta exportación contiene **{requested} operaciones** y Free permite **{limit}**. La información permanece en esta sesión y no se ha presentado ninguna declaración.

> Premium permite preparar exportaciones más amplias, revisar incidencias y descargar el archivo local con mayor trazabilidad.

**Acciones:**

- `Ver Premium`
- `Revisar una muestra`
- `Cancelar exportación`

**Clave:** `upgrade.diot.rows`

### 7.8 XLSX fiscal avanzado

**Título:** `La hoja fiscal avanzada es una capacidad Premium`

> Puedes continuar con el resumen o CSV básico disponible en Free. Premium añade el libro XLSX con hojas separadas, clasificación fiscal y evidencia trazable.

**Acciones:**

- `Conocer Premium`
- `Descargar CSV básico`
- `Cerrar`

**Clave:** `upgrade.export.xlsx`

### 7.9 Nora y snapshots fiscales

**Título:** `Nora puede ayudarte sin adjuntar tus fuentes`

> En Free, Nora puede orientar sobre el flujo y sus parámetros sin recibir tus archivos. Premium permite compartir, solo después de una acción explícita, un snapshot mínimo y depurado del resultado local; no se adjunta el XML, el extracto bancario ni el archivo original.

**Acciones:**

- `Conocer Premium`
- `Abrir ayuda sin fuentes`
- `Cancelar`

**Clave:** `upgrade.nora.snapshot`

### 7.10 Plan vencido

**Título:** `Tu acceso Premium terminó`

> Tus resultados locales siguen disponibles para consulta y exportación básica. Las nuevas capacidades Premium quedan pausadas hasta reactivar el plan; no hemos eliminado tus datos ni reiniciado tus sesiones locales.

**Acciones:**

- `Reactivar Premium`
- `Continuar con Free`

**Clave:** `plan.expired`

### 7.11 Estado de plan no disponible

**Título:** `Continuamos con los límites Free mientras verificamos tu plan`

> No pudimos confirmar el estado Premium en este momento. Para proteger tu sesión, no se habilitan capacidades Premium de forma temporal. Tus datos locales permanecen intactos y puedes continuar dentro de los límites Free.

**Acciones:**

- `Reintentar verificación`
- `Continuar con Free`

**Clave:** `plan.unknown`

---

## 8. Medidor de uso

El medidor es informativo y no debe revelar documentos ni identificadores fiscales.

```text
PLAN FREE
CFDI este mes
██████████░░░░░░░░░░  180 / 300 archivos

Lote actual
████████████████████  100 / 100 XML
[Ver Premium]
```

### Reglas

- Mostrar el medidor solo cuando la métrica tenga sentido para la acción actual.
- Usar texto y número, no depender únicamente del color.
- Estados visuales:
  - `normal`: jade/petróleo.
  - `near_limit`: amarillo de validación, al alcanzar 80%.
  - `blocked`: coral solo para indicar que la acción requiere una decisión; no usar coral como señal de fallo fiscal.
- El medidor no debe incluir nombres de archivos, RFC, UUID, importes, referencias bancarias o mensajes de Nora.
- Cuando no exista contador verificable, mostrar `Uso no disponible` y no inventar cero.

---

## 9. Privacidad y local-first

### 9.1 Datos que nunca se envían automáticamente para aplicar un límite

- XML completo o contenido CFDI.
- Archivos ZIP.
- Extractos CSV/XLSX.
- Nombres de archivos cuando no sean necesarios para el flujo local.
- RFC, UUID, folios, importes, fechas, referencias bancarias o conceptos.
- Catálogos de cuentas, reglas contables o decisiones de auditoría.
- Texto completo de las conversaciones con Nora.

### 9.2 Datos mínimos permitidos para una futura validación comercial

Si más adelante se integra una suscripción, el servidor puede validar únicamente:

```json
{
  "accountId": "opaque-account-id",
  "plan": "premium",
  "status": "active",
  "contractVersion": 1,
  "period": "2026-10",
  "entitlements": ["tools.export.xlsx.advanced"],
  "usage": {
    "tools.cfdi.files.month": 180,
    "tools.diot.exports.month": 0
  }
}
```

El `accountId` debe ser opaco. Los contadores son agregados y no deben poder reconstruir documentos o personas. El cliente conserva los datos fiscales localmente y la aplicación no usa el contenido fiscal como argumento de checkout o entitlement.

### 9.3 Qué ocurre al bloquear

1. No se inicia el parser ni el Worker si el gate detecta el exceso antes del procesamiento.
2. La selección permanece disponible para elegir una muestra o cancelarla.
3. No se borra el archivo, el análisis anterior ni los resultados locales.
4. No se crea un handoff entre islas por una acción bloqueada.
5. No se modifica el estado fiscal ni se marca una operación como aprobada.
6. El panel registra solo la clave de capacidad y la decisión visual; no registra contenido fiscal.

---

## 10. Contrato de UI y eventos

### 10.1 Atributos de interfaz

```html
<div
  data-plan="free"
  data-plan-status="active"
  data-plan-version="1"
  data-capability="tools.cfdi.files.batch"
  data-limit="100"
  data-current-usage="0"
>
  <!-- La UI deriva los mensajes desde messageKey; no recibe HTML remoto. -->
</div>
```

Los valores de `data-*` son informativos para la interfaz local. No constituyen una autorización Premium. La autorización debe provenir del snapshot validado por el resolver de planes.

### 10.2 Eventos internos propuestos

Estos nombres son contrato de diseño para una futura implementación bajo `CleanupScope`; no se agregan en esta fase.

| Evento | Emisor | Payload permitido |
|---|---|---|
| `plan:resolved` | Resolver de plan | `plan`, `status`, `version`, `source` |
| `plan:limit-near` | Gate de capacidad | `capability`, `currentUsage`, `limit`, `period` |
| `plan:limit-blocked` | Gate de capacidad | `capability`, `requested`, `limit`, `messageKey` |
| `plan:upgrade-opened` | UI de bloqueo | `capability`, `messageKey`, `surface` |
| `plan:sample-requested` | UI de bloqueo | `capability`, `sampleLimit` |
| `plan:upgrade-dismissed` | UI de bloqueo | `capability`, `messageKey` |

Nunca incluir en estos eventos archivos, `File`, `ArrayBuffer`, XML, filas bancarias, RFC, UUID, importes ni texto libre del usuario.

### 10.3 Ciclo de vida

- El panel de bloqueo debe registrarse bajo el `CleanupScope` de la isla activa.
- Al desmontar la isla, se eliminan listeners, timers, focus traps y referencias a la selección local.
- Un cambio de sesión invalida el snapshot de plan y cualquier decisión pendiente.
- Una navegación a otra isla no debe dejar abierto un panel Premium ni conservar un `File` en una cola global.

---

## 11. Estados y copy de los botones

| Situación | CTA primario | CTA alternativo | CTA de cierre |
|---|---|---|---|
| Lote excedido con muestra posible | `Ver Premium` | `Elegir una muestra` | `Cancelar` |
| Cuota mensual agotada | `Ver Premium` | `Revisar resultados locales` | `Cerrar` |
| Capacidad booleana bloqueada | `Conocer Premium` | `Usar opción básica` | `Cerrar` |
| Plan vencido | `Reactivar Premium` | `Continuar con Free` | — |
| Estado desconocido | `Reintentar verificación` | `Continuar con Free` | `Cerrar` |
| Usuario sin sesión | `Crear cuenta` | `Probar con Free` | `Cerrar` |

En esta fase, `Ver Premium`, `Conocer Premium` y `Reactivar Premium` deben abrir una pantalla informativa o quedar como CTA no operativo explícitamente etiquetado en prototipo. No deben simular un cobro, pedir tarjeta ni enviar datos fiscales.

---

## 12. Reglas de producto para evitar abuso o confusión

- No afirmar que Premium presenta declaraciones, valida ante SAT o sustituye a un contador.
- No describir el procesamiento local como ilimitado.
- No ocultar el límite hasta después de cargar o enviar datos.
- No borrar archivos para forzar una conversión.
- No cambiar un resultado local a “aprobado” por tener Premium.
- No habilitar Premium por manipulación de `localStorage`, query string o atributos HTML.
- No bloquear la eliminación de datos ni la revisión de errores.
- No usar colores de error para representar una decisión comercial sin texto explicativo.
- No enviar datos sensibles a Nora, API, backend o proveedor de pagos por mostrar una pantalla de upgrade.
- No convertir una muestra Free en un resultado completo ni estimar filas faltantes como cero.

---

## 13. Criterios de aceptación del contrato

### Matriz y gate

- [ ] Todas las capacidades tienen un identificador estable, unidad, alcance, límite Free y límite Premium.
- [ ] El gate compara uso y solicitud antes de parsing, Worker, exportación o handoff.
- [ ] Un plan desconocido cae a Free sin borrar datos ni habilitar Premium.
- [ ] Un plan vencido conserva lectura y exportación básica de resultados locales.
- [ ] Las decisiones son deterministas y no dependen del contenido de archivos.

### Interfaz

- [ ] Cada bloqueo comunica capacidad, cantidad solicitada, límite y alternativa disponible.
- [ ] Los botones usan el orden y copy definidos para escritorio, tablet y móvil.
- [ ] La selección no se elimina y el foco vuelve al control de origen al cerrar un modal.
- [ ] El panel es navegable por teclado y anuncia el estado con `aria-live` cuando corresponde.
- [ ] La interfaz respeta `prefers-reduced-motion` y mantiene contraste/foco del marco fiscal.

### Privacidad

- [ ] Ningún evento de plan incluye `File`, XML, `ArrayBuffer`, filas bancarias, RFC, UUID, importes o texto de Nora.
- [ ] El flujo bloqueado no crea workers, handoffs ni persistencia remota.
- [ ] La futura validación comercial usa solo entitlement y contadores agregados.
- [ ] El texto explica de forma visible que los archivos no se enviaron ni eliminaron.

### Alcance de implementación

- [ ] Esta propuesta no se considera implementada hasta añadir código, pruebas y validación de UI.
- [ ] No se conectan pagos, suscripciones ni webhooks como parte de este contrato.
- [ ] Los límites pueden cambiar solo mediante una nueva versión del contrato y pruebas de regresión.

---

## 14. Secuencia de implementación propuesta

1. Implementar tipos, `PLAN_LIMITS_V1` y un resolver local con fallback Free.
2. Implementar un `CapabilityGate` puro y pruebas unitarias para todas las combinaciones de estado.
3. Crear el componente visual común de bloqueo en el marco de islas.
4. Integrar primero CFDI como herramienta demostrativa.
5. Integrar Conciliación, Pólizas/Auditoría y DIOT reutilizando el mismo contrato.
6. Añadir medidores de uso y mensajes contextualizados sin datos sensibles.
7. Ejecutar pruebas E2E de límites en escritorio y móvil.
8. En una fase separada y con autorización explícita, diseñar checkout y entitlements remotos.

**Siguiente paso recomendado:** revisar y aprobar esta matriz antes de implementar el `CapabilityGate` y la primera interfaz de bloqueo para CFDI. No se debe iniciar pagos ni cambiar el backend como parte de esa primera implementación.
