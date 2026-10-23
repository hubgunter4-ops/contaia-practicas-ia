# ContaIA — Contrato técnico de Papeles de trabajo IA

**Estado:** WP0 definido y WP1 implementado como demo interactiva local con datos ficticios.
**Producto:** ContaIA Herramientas.
**Frontera actual:** no consume fuentes fiscales reales, no genera archivos, no persiste ni llama a IA remota.
**Validación:** 270/270 pruebas unitarias, 2/2 E2E focalizadas en Chromium/Pixel 5, build estático y 108/108 E2E completos validados; WP0/WP1 y la demo de Herramientas quedan incluidos en el checkpoint de publicación autorizado de esta tarea.

---

## 1. Propósito

Papeles de trabajo IA prepara libros reutilizables para revisión contable: encabezados, formatos, totales, fórmulas y procedencia. El producto ayuda a organizar evidencia y repetir un periodo; no sustituye el criterio profesional ni altera el sistema contable.

El resultado futuro debe poder explicar, por cada total o rango: qué fuente autorizada se consultó, cuál fue el corte, qué regla local se ejecutó, qué fórmula se aplicó, cuántos registros aportaron y qué advertencias siguen abiertas.

## 2. Límites no negociables

- Solo lectura de fuentes autorizadas explícitamente por la persona.
- No timbrar, cancelar, capturar, contabilizar, aprobar pólizas ni presentar declaraciones.
- No enviar XML, RFC, UUID, cuentas, extractos, filas, nombres o libros completos a Nora, un modelo o un backend automáticamente.
- No crear conexiones bancarias ni una integración contable remota en WP0/WP1.
- Mantener el tratamiento local-first: snapshots efímeros, `CleanupScope`, epoch de sesión y limpieza al cambiar de isla o sesión.
- La IA futura propone y explica; las reglas, fórmulas y acciones posteriores requieren revisión y gesto humano visible.

## 3. Alcance WP0 — contrato

### 3.1 Identidad de producto y navegación

- Identificador de isla: `workpapers`.
- Ruta de SPA: `state.section === "workpapers"`.
- Se presenta dentro de ContaIA Herramientas, sin añadir un sexto destino a la barra inferior móvil.
- La tarjeta del centro de herramientas muestra **Demo disponible**, no la disponibilidad de una integración contable.

### 3.2 Tipos de papel iniciales

| ID | Papel | Resultado esperado |
| --- | --- | --- |
| `vat` | IVA y ventas | Base, IVA trasladado/acreditable, totales y diferencias revisables. |
| `cash` | Cobros y pagos | Relación de documentos, pagos y saldos pendientes para revisión. |
| `audit` | Revisión de pólizas | Borradores, partidas, hallazgos y estado de revisión humana. |

WP1 muestra estos tipos como propuestas; no los ejecuta contra datos de una empresa.

### 3.3 Contrato de un libro futuro

```ts
type WorkpaperBook = {
  schemaVersion: "workpaper-book-v1";
  id: string;                 // opaco, local o server-side cuando se autorice
  type: "vat" | "cash" | "audit" | "custom";
  period: { mode: "month" | "year"; id: string; cutoff: string };
  status: "draft" | "needs_review" | "ready" | "incomplete";
  sourceSnapshots: WorkpaperSourceSnapshot[];
  rules: WorkpaperRule[];
  sheets: WorkpaperSheet[];
  provenance: WorkpaperProvenance[];
  warnings: WorkpaperWarning[];
  createdAt: string;
  refreshedAt: string | null;
};

type WorkpaperSourceSnapshot = {
  source: "cfdi" | "reconciliation" | "journal" | "diot" | "accounting_read";
  snapshotRef: string;         // referencia opaca, nunca XML/filas dentro del contrato compartido
  period: string;
  cutoff: string;
  count: number;
  quality: "ready" | "incomplete" | "review" | "unavailable";
  authorizedByUser: boolean;
};

type WorkpaperRule = {
  id: string;
  version: string;
  source: "preset" | "user" | "ai_proposal";
  status: "proposed" | "accepted" | "rejected" | "applied";
  humanReviewRequired: true;
  condition: string;
  grouping: string;
  output: string[];
};

type WorkpaperProvenance = {
  sheet: string;
  range: string;
  formula: string | null;
  sourceRefs: string[];
  cutoff: string;
  recordCount: number;
  total: number | null;
  warnings: string[];
};
```

Las referencias de fuente deben expirar y no pueden utilizarse después de cambio de sesión, limpieza o desmontaje de isla.

### 3.4 Hojas del libro XLSX avanzado

1. **Parámetros:** periodo, corte, plantilla y notas de alcance.
2. **Resumen:** totales, fórmulas y indicadores revisables.
3. **Detalle:** filas normalizadas de fuentes autorizadas en etapas posteriores.
4. **Pólizas sugeridas:** borradores sin aprobación ni escritura contable.
5. **Auditoría y diferencias:** hallazgo, severidad, regla y responsable de revisión.
6. **Procedencia:** fuente, corte, regla, fórmula, conteo y advertencia por rango.

La exportación XLSX con fórmulas pertenece a WP3. CSV básico no debe prometer trazabilidad de fórmulas.

## 4. Operación futura

```text
Acción visible de la persona
  → elegir tipo y periodo
  → revisar/autorizar snapshots locales de fuente
  → motor determinista calcula totales y fórmulas
  → IA opcional recibe solo contexto permitido y propone regla
  → persona acepta, edita o rechaza la regla
  → se genera vista previa con procedencia
  → persona guarda/exporta el papel localmente
```

`WorkpaperEngine` será la autoridad de cálculos y fórmulas; un adaptador de IA no puede ejecutar acciones, seleccionar fuentes adicionales ni inyectar fórmulas no validadas.

## 5. Estados de fuente

| Estado | Significado | Conducta |
| --- | --- | --- |
| `unavailable` | No hay snapshot local autorizado. | Explicar qué falta; no mostrar ceros engañosos. |
| `ready` | Snapshot local válido para periodo/corte. | Permitir cálculo local. |
| `incomplete` | Faltan campos, registros o corte. | Mostrar advertencia y mantener revisión humana. |
| `review` | Hay diferencias o reglas pendientes. | No presentar el papel como cerrado. |
| `expired` | La capacidad terminó por navegación/sesión. | Limpiar y solicitar una nueva autorización. |

## 6. Capacidades y propuesta Free/Premium

| Capacidad | Free propuesto | Premium propuesto | Estado WP1 |
| --- | ---:|---:|---|
| Demo interactiva | Disponible | Disponible | Implementada con fixtures. |
| Papeles activos | 1 | Varios | No implementado. |
| Filas por ejecución | 500 | 5,000 | No implementado. |
| CSV básico | Disponible | Disponible | No implementado. |
| XLSX con fórmulas/procedencia | No disponible | Disponible | Demostración visual únicamente. |
| Reglas editables | Predefinidas | Personalizables | Aceptar/descartar demo. |
| Créditos de sugerencias IA | Limitados | Mayor volumen | No usa créditos ni IA. |

Las capacidades futuras se agregan al contrato de plan como IDs independientes: `tools.workpapers.rows.execution`, `tools.workpapers.books.active`, `tools.workpapers.xlsx.advanced`, `tools.ai.workpapers.rule_suggestions`, `tools.ai.workpapers.explanations` y `tools.ai.workpapers.projections`.

## 7. WP1 — demo interactiva entregada

La isla `src/workpapers/` incluye:

- Selector mensual/anual de tres periodos ficticios.
- Panel de métricas y tendencia de ejemplo sin librería externa.
- Flujo de cinco pasos: fuentes, regla, póliza, hoja y confirmación.
- Pestañas de flujo, hoja con fórmulas visibles, procedencia y propuesta de planes.
- Aceptar/rechazar regla y confirmación simulada solo en memoria.
- Avisos explícitos de que no hay CFDI, XML, bancos, perfiles, IA remota, endpoints, créditos, XLSX ni persistencia.
- Limpieza de estado al desmontar con `CleanupScope`.

## 8. Criterios de aceptación WP0/WP1

- La tarjeta abre una isla de demo desde ContaIA Herramientas y el menú de escritorio.
- La barra inferior móvil conserva sus cinco destinos y resalta Herramientas para la demo.
- La demo permite cambiar periodo, navegar pasos, aceptar/rechazar regla, visualizar póliza, hoja, fórmulas, procedencia, planes y confirmación simulada.
- Cada pantalla declara que sus cifras son ficticias y que no altera contabilidad ni usa fuentes reales.
- No existe `fetch`, endpoint, almacenamiento, Worker, handoff ni llamada Nora/IA dentro de `src/workpapers/`.
- Al desmontar, el host queda vacío y las decisiones de regla, periodo, guardado y mensajes regresan al estado inicial.
- El diseño responde en escritorio, tablet y móvil, con foco visible y `prefers-reduced-motion` respetado.

## 9. Fases posteriores

- **WP2:** `WorkpaperEngine`, snapshots locales autorizados CFDI/Conciliación/Pólizas y recálculo por periodo.
- **WP3:** generador XLSX, fórmulas validadas, procedencia por rango y descarga local.
- **WP4:** sugerencias IA y explicaciones de diferencias con DLP, entitlements y créditos separados.
- **WP5:** dashboard de periodos, tendencias, proyección claramente estimativa y auditoría de rendimiento.

WP2 no inicia hasta autorización explícita. E2–E6 siguen siendo prerrequisitos para aplicar controles comerciales o IA remota a escala.
