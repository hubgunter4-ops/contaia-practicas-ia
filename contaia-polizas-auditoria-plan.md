# ContaIA — Plan técnico para motor de pólizas contables y auditoría CFDI

**Estado:** plan técnico original; su primer incremento local fue implementado el 22 de octubre de 2026 y permanece pendiente de publicación. La implementación conserva las puertas de autorización: no crea tablas ni endpoints, no conecta bancos, no consulta SAT, no presenta declaraciones, no persiste datos, no hace commit ni despliega cambios.

**Producto:** ContaIA Herramientas · Pólizas sugeridas y Auditoría CFDI.

**Base del proyecto:** SPA Vanilla JS, Supabase Auth/RLS, Vercel, analizador CFDI local, Pólizas sugeridas locales ya implementadas como primera entrega, conciliación bancaria local-first y exportación fiscal XLSX local. El motor descrito aquí debe ampliar el dominio existente de `src/journal/` sin convertir una aprobación local en un asiento registrado.

## 1. Decisión funcional

La herramienta no debe tratar cada CFDI como una póliza independiente. Debe reconstruir primero el ciclo económico y después proponer uno o más eventos contables relacionados:

- reconocimiento de una venta o compra;
- liquidación de una cuenta por cobrar o por pagar;
- ajuste por devolución, descuento o bonificación;
- relación bancaria que sirve como evidencia auxiliar, cuando exista y haya sido revisada.

Una factura y su complemento de pago son documentos fiscales distintos, pero no representan dos ventas o dos compras. La factura puede reconocer la operación y el complemento puede liquidar el saldo. El motor debe mostrar ambas propuestas como eventos relacionados y bloquear el doble conteo.

La interfaz debe usar el lenguaje **Pólizas sugeridas** y **Auditoría CFDI**, no «contabilidad automática». Una póliza puede alcanzar el estado **Lista para aprobar** o **Aprobada localmente; no contabilizada**, pero no puede marcarse como registrada, enviada, timbrada, presentada o aceptada por el SAT.

## 2. Reglas fiscales que deben convertirse en políticas versionadas

### 2.1 Momento y forma del pago

La **forma de pago** identifica cómo se liquidó una operación, por ejemplo efectivo o transferencia. El **método de pago** identifica cuándo se liquida. El SAT distingue PUE, pago en una sola exhibición, de PPD, pago en parcialidades o diferido. En una operación pagada al emitir el comprobante se registra PUE y la forma que corresponda; cuando el pago no se recibe al emitirlo se utiliza PPD y forma 99 por definir, conforme a la guía consultada [1] [2].

El motor debe conservar ambos datos por separado:

```text
paymentMethod: PUE | PPD | missing | unknown
paymentFormCode: 01 | 03 | 04 | 15 | 17 | 99 | ... | missing
paymentFormLabel: texto del catálogo vigente
paymentTimingEvidence: explicit | derived | missing
```

No debe convertir una descripción libre como «transferencia» en una forma de pago válida si el XML no contiene la clave. Tampoco debe concluir que una factura PUE está liquidada si el importe o la forma de pago son inconsistentes.

### 2.2 Complemento para recepción de pagos

El CFDI de tipo P debe reconocerse como un evento de pago, no como una nueva venta o compra. El Anexo 29 de la RMF 2026 establece que cuando `TipoDeComprobante` es P debe existir el Complemento para recepción de Pagos [6]. La página operativa del SAT identifica el complemento como el documento para pagos diferidos o en parcialidades y señala que la versión 2.0 es obligatoria desde el 1 de abril de 2023 [5].

Cada ocurrencia del complemento debe conservarse por separado, incluso cuando varias ocurrencias compartan el mismo UUID del CFDI P. La relación canónica debe incluir:

```text
paymentEventId
paymentCfdiUuid
paymentDate
paymentFormCode
paymentCurrency
paymentAmount
relatedDocumentUuid
relatedDocumentCurrency
exchangeRateToPaymentCurrency
installmentNumber
priorBalance
paidAmount
remainingBalance
objectOfTax
sourceLocation
```

`ImpSaldoAnt`, `ImpPagado` e `ImpSaldoInsoluto` deben validarse con precisión decimal y con la moneda del documento relacionado. La documentación técnica del SAT exige que el saldo insoluto sea la diferencia entre saldo anterior e importe pagado, y define `NumParcialidad` como la parcialidad correspondiente [7]. El motor debe conservar el valor original, calcular la diferencia y producir una incidencia si no cuadra. No debe reparar el XML ni sustituir el importe por un cálculo estimado.

Si la moneda de pago y la moneda del documento relacionado son distintas, `EquivalenciaDR` debe formar parte de la evidencia. La primera versión del motor puede marcar el caso como pendiente si no tiene tipo de cambio y escala verificables; nunca debe convertir silenciosamente a MXN.

### 2.3 CFDI de egreso y notas de crédito

Un CFDI de tipo E debe modelarse como un ajuste. El material del SAT identifica el CFDI de egreso con notas de crédito, devoluciones, descuentos y bonificaciones [4]. La relación `TipoRelacion = 01` corresponde a una nota de crédito de documentos relacionados; el UUID relacionado debe conservarse como arista del grafo fiscal [8].

Una nota de crédito no debe clasificarse automáticamente como transferencia, efectivo o complemento de pago. El motor debe distinguir:

- ajuste que reduce una cuenta por cobrar;
- ajuste que reduce una cuenta por pagar;
- devolución de dinero;
- compensación contra otro documento;
- ajuste relacionado cuya aplicación no puede determinarse con las fuentes disponibles.

El código `15` del catálogo de formas de pago corresponde a **Condonación** en el parser actual. Si una persona dice «donación», la UI debe pedir aclaración y no convertirlo en condonación. Donación y condonación son conceptos distintos. Solo se usará el código que aparezca efectivamente en el CFDI y en el catálogo vigente.

Para un CFDI E con `TipoRelacion = 01`, el motor debe comprobar que el documento relacionado exista, que sea compatible con el papel de la empresa y que el importe/IVA del ajuste no exceda el saldo aplicable sin una decisión humana. Si la guía o el catálogo vigente impone una forma o método específico, la incidencia se marca según la versión normativa activa; no se codifica como una regla universal basada en un ejemplo histórico.

### 2.4 Cancelados y estado de la fuente

Un XML por sí solo no siempre demuestra el estado actual de cancelación. La fuente oficial consultada indica que los comprobantes cancelados deben conservarse como parte de la contabilidad [4]. En el primer incremento no se debe afirmar el estado SAT de un CFDI sin una fuente autorizada.

Cada documento debe tener un estado de fuente independiente:

```text
cancellationStatus: active | canceled | cancellation_pending | unknown
cancellationEvidence: local_xml | supplied_report | authorized_query | missing
```

Cuando el estado es `unknown`, la auditoría debe mostrar «Estado de cancelación no verificable con las fuentes seleccionadas» y no presentar el documento como activo ni cancelado. Una futura consulta autorizada al SAT es una decisión de integración independiente.

## 3. Modelo canónico del ciclo CFDI

### 3.1 Entidades

El dominio debe separar documentos, ocurrencias económicas, relaciones y pólizas. No se debe usar una sola fila de factura para representar una factura, un pago y una nota de crédito al mismo tiempo.

```text
CfdiDocument
  documentId
  uuid
  type: I | E | P | T | N | unknown
  companyRole: issued | received | ambiguous
  issuerRfc
  receiverRfc
  issueDate
  currency
  subtotal
  discount
  total
  paymentMethod
  paymentFormCode
  relatedCfdiUuids[]
  sourceRunId
  sourceLocation
  precisionQuality
  cancellationStatus

PaymentOccurrence
  paymentEventId
  paymentCfdiDocumentId
  relatedDocumentId
  ordinal
  paymentDate
  amount
  paymentCurrency
  relatedCurrency
  equivalence
  installmentNumber
  priorBalance
  paidAmount
  remainingBalance
  taxObject
  precisionQuality

AdjustmentOccurrence
  adjustmentEventId
  adjustmentDocumentId
  relationType
  relatedDocumentId
  adjustmentKind: credit_note | return | discount | bonus | unknown
  amount
  taxEffect
  applicationStatus: pending | applied_to_balance | refund | compensation | ambiguous

JournalCandidate
  candidateId
  eventKind
  sourceRefs[]
  relatedEventRefs[]
  companyLocalId
  period
  currency
  ruleId
  ruleVersion
  catalogVersion
  lines[]
  status
  validation
  evidenceSnapshot

AuditFinding
  findingId
  scope: global | partial
  ruleCode
  severity: blocking | high | review | info
  documentRefs[]
  eventRefs[]
  message
  reason
  expected
  observed
  recommendedAction
  evidenceRefs[]
  status: open | acknowledged | resolved | not_applicable
```

### 3.2 Grafo de relaciones

El motor debe crear aristas explícitas, no inferencias ocultas:

```text
CFDI I ──recognizes──> Sale or Purchase event
CFDI P ──settles─────> CFDI I / E balance
CFDI E ──adjusts─────> CFDI I / E
Bank row ──evidences─> Payment occurrence
Journal candidate ──accounts for──> Economic event
```

Una arista debe conservar `relationSource`, `confidence`, `decision`, `decidedBy` y `decidedAtLocal`. La confianza heurística de conciliación bancaria no equivale a una relación aprobada ni a una póliza lista para contabilizar.

### 3.3 Identidad y deduplicación

La identidad no puede depender del índice de una lista filtrada. Un pago con varios documentos relacionados genera varias `PaymentOccurrence` con ordinal propio. Una recarga de las mismas fuentes no debe producir borradores duplicados si la selección, el catálogo, la regla y la versión son iguales.

La detección debe separar tres casos:

1. mismo UUID y misma ocurrencia, probablemente duplicado de fuente;
2. mismo UUID P con distintos documentos relacionados, ocurrencias distintas y válidas;
3. mismo importe y fecha con UUID distinto, documentos potencialmente independientes.

La auditoría debe mostrar el conflicto antes de que una regla decida qué registro gana. No se debe aplicar «último gana».

## 4. Motor de eventos y pólizas sugeridas

### 4.1 Configuración contable necesaria

Las reglas no deben inventar cuentas. El catálogo local debe pedir, como mínimo, las cuentas o plantillas siguientes:

```text
salesRevenueAccount
salesDiscountAccount
outputVatAccount
accountsReceivableAccount
cashAccountByPaymentForm
bankAccountByPaymentForm
purchaseInventoryOrExpenseAccount
purchaseDiscountAccount
inputVatAccount
accountsPayableAccount
refundReceivableOrPayableAccount
roundingDifferenceAccount (disabled by default)
```

La cuenta de banco o caja se selecciona según la cuenta que la persona configure, no solo según la forma de pago. La forma 03 puede sugerir una cuenta bancaria, pero no puede saber cuál de varias cuentas bancarias recibió el importe sin contexto adicional.

### 4.2 Plantillas iniciales

Las siguientes son plantillas de propuesta, no asientos universales. Cada una requiere empresa, periodo, papel, moneda, cuentas válidas y evidencia suficiente.

**Venta de contado — CFDI I, empresa emisora, PUE.**

```text
Cargo    Caja/Bancos configurados                         Total
Abono    Ventas                                           Base de ingreso
Abono    IVA trasladado                                   IVA identificado
```

Si la forma de pago, impuestos o cuenta no son utilizables, la plantilla queda en revisión. No debe agregarse una cuenta bancaria por intuición.

**Venta a crédito — CFDI I, empresa emisora, PPD.**

```text
Cargo    Clientes                                         Total
Abono    Ventas                                           Base de ingreso
Abono    IVA trasladado                                   IVA identificado
```

**Cobro de complemento de pago emitido por la empresa.**

```text
Cargo    Caja/Bancos configurados                         Importe pagado
Abono    Clientes                                         Importe pagado
```

Este evento liquida saldo y no vuelve a registrar ventas ni IVA de la factura original. Si el complemento incluye varios documentos, debe generarse una propuesta por ocurrencia o una propuesta agrupada explicable, sin sumar dos veces el mismo importe.

**Compra o gasto de contado — CFDI I, empresa receptora, PUE.**

```text
Cargo    Inventario/Gasto configurado                    Base aplicable
Cargo    IVA acreditable                                 IVA identificable
Abono    Caja/Bancos configurados                        Total pagado
```

La cuenta de inventario o gasto debe confirmarse por regla o selección humana. No se debe inferir deducibilidad solo a partir de `UsoCFDI`.

**Compra o gasto a crédito — CFDI I, empresa receptora, PPD.**

```text
Cargo    Inventario/Gasto configurado                    Base aplicable
Cargo    IVA acreditable                                 IVA identificable
Abono    Proveedores                                     Total pendiente
```

**Pago de proveedor mediante complemento de pago recibido.**

```text
Cargo    Proveedores                                     Importe pagado
Abono    Caja/Bancos configurados                        Importe pagado
```

**Nota de crédito emitida por la empresa.**

```text
Cargo    Descuentos/Bonificaciones sobre ventas           Importe del ajuste
Cargo    Ajuste de IVA trasladado                        IVA del ajuste
Abono    Clientes o cuenta de devolución                 Aplicación determinada
```

**Nota de crédito recibida de proveedor.**

```text
Cargo    Proveedores o cuenta de devolución               Aplicación determinada
Abono    Inventario/Gasto                                 Base del ajuste
Abono    Ajuste de IVA acreditable                        IVA del ajuste
```

Si el documento ya estaba pagado o no es posible saber si se aplicó contra saldo, se ofrecen variantes y se bloquea la aprobación hasta elegir aplicación, devolución o compensación. No se elige transferencia, efectivo o condonación automáticamente.

### 4.3 Regla para no producir tres pólizas incorrectas

El sistema debe mostrar una línea de tiempo por documento:

```text
Factura PUE  ── reconocimiento y pago en una exhibición ──> una propuesta principal
Factura PPD  ── reconocimiento de saldo ──> propuesta de factura
Complemento P ── liquidación parcial o total ──> propuesta de pago
Nota E        ── ajuste relacionado ──> propuesta de ajuste
```

No se genera una póliza de crédito y otra de complemento para una factura PUE solo porque existe un XML adicional. Si un usuario selecciona una factura y un pago que parecen representar el mismo evento, el auditor debe mostrar una advertencia de doble conteo y pedir confirmar qué evento se está contabilizando.

## 5. Auditoría CFDI global y parcial

### 5.1 Auditoría global

La auditoría global cubre todas las fuentes seleccionadas para empresa, periodo y moneda. Debe calcular conteos por tipo, papel, evento, estado de relación, estado de cancelación y estado de póliza. Nunca debe mostrar «0 incidencias» si no hay fuentes, el periodo no está confirmado o la cancelación no es verificable.

Las reglas mínimas son:

- `CFDI-I-ROLE-001`: emisor/receptor no coincide con el papel confirmado de la empresa.
- `CFDI-P-REL-001`: complemento P sin documento relacionado disponible.
- `CFDI-P-REL-002`: documento relacionado del complemento no pertenece al periodo/fuente seleccionada.
- `CFDI-P-BAL-001`: saldo anterior menos pagado no coincide con saldo insoluto.
- `CFDI-P-BAL-002`: importe pagado excede el saldo relacionado sin una incidencia de devolución/ajuste autorizada.
- `CFDI-P-CUR-001`: moneda del pago y documento relacionado requieren equivalencia ausente o inválida.
- `CFDI-P-DUP-001`: misma ocurrencia de pago repetida en las fuentes.
- `CFDI-I-PPD-001`: factura PPD sin complemento de pago en el periodo seleccionado; es una revisión de cobertura, no una prueba de que el cliente nunca pagó.
- `CFDI-I-PUE-001`: factura PUE con complemento P relacionado; revisar posible duplicidad o cambio de condición.
- `CFDI-I-PAY-001`: factura PUE con forma 99 o factura PPD con forma distinta de 99; clasificar conforme al esquema vigente y mostrar evidencia, sin corregir el XML.
- `CFDI-E-REL-001`: CFDI E sin relación, relación no encontrada o tipo de relación incompatible.
- `CFDI-E-APP-001`: nota de crédito sin decisión de aplicación, devolución, compensación o saldo.
- `CFDI-E-AMT-001`: ajuste superior al importe disponible del documento relacionado.
- `CFDI-E-PAY-001`: CFDI E contiene datos de pago que no explican por sí solos su aplicación; pedir revisión.
- `CFDI-CANCEL-001`: estado de cancelación desconocido, o documento cancelado incluido en propuestas activas.
- `CFDI-TAX-001`: IVA/IEPS extraído como estimado, incompleto o sin desglose exigible para la plantilla.
- `CFDI-POL-001`: documento elegible sin póliza sugerida, o póliza sugerida sin evidencia fiscal.
- `CFDI-POL-002`: reconocimiento y liquidación registrados como la misma propuesta sin justificación.
- `CFDI-MONEY-001`: moneda ausente, no soportada o mezclada en una suma.
- `CFDI-DUP-001`: UUID repetido con contenido incompatible.

La severidad se calcula con una política versionada. Un saldo imposible, documento relacionado inexistente o importe sin precisión necesaria es bloqueante. Falta de complemento en un periodo incompleto puede ser revisión. La ausencia de una consulta SAT debe llamarse «no verificable», no «cancelado» ni «vigente».

### 5.2 Auditoría parcial

La auditoría parcial usa exactamente las mismas reglas, pero limita el conjunto por filtros explícitos. La UI debe mostrar siempre el alcance:

```text
Alcance: 17 documentos · 12 eventos · septiembre 2026
Filtros: Empresa emisora · PPD · cliente X · MXN
Reglas aplicadas: política CFDI 4.0 / complemento de pagos 2.0 / versión local
```

Filtros iniciales:

- periodo y fecha de emisión/pago;
- emitidos o recibidos;
- tipo I, E o P;
- PUE, PPD o método desconocido;
- forma de pago;
- cliente/proveedor/RFC;
- moneda;
- con o sin complemento;
- notas de crédito;
- saldo descuadrado;
- sin póliza, con póliza en revisión, lista para aprobar o aprobada localmente;
- severidad y estado de incidencia.

Un filtro parcial no debe cambiar el resultado global ni hacer que una relación fuera de la selección parezca ausente sin explicarlo. Si se excluye el complemento relacionado, la fila debe decir «fuera del alcance actual» y no «sin complemento».

### 5.3 Evidencia de un hallazgo

Cada incidencia abre un panel de detalle con:

```text
Regla y versión
Severidad y estado
Documento principal: UUID, tipo, papel, fecha, moneda
Documentos relacionados y ocurrencias
Valor observado y valor esperado
Origen: archivo/hoja/fila o XML/ubicación local
Póliza afectada o ausencia de propuesta
Acción recomendada
Decisión humana: reconocer, excluir, corregir, marcar no aplicable
```

Reconocer una advertencia no corrige la fuente. Excluir un documento lo retira de la preparación actual, pero no lo elimina ni lo marca como fiscalmente corregido.

## 6. Arquitectura propuesta en ContaIA

### 6.1 Módulos

Conservar `src/journal/` como responsable del motor contable y añadir capas específicas del ciclo CFDI:

```text
src/journal/
  workspace.js              estado y render de Pólizas sugeridas
  sources.js                adaptadores de fuentes CFDI/banco
  money.js                  importes exactos, moneda y escala
  catalog.js                catálogo y elegibilidad de cuentas
  rules.js                  reglas contables declarativas
  validation.js             balance y bloqueos de aprobación
  review.js                 snapshots, revisiones y acciones locales
  cfdi-lifecycle.js         documentos, eventos, relaciones y deduplicación
  cfdi-policy.js            políticas versionadas PUE/PPD/I/E/P/relaciones
  journal-events.js         plantillas de reconocimiento, liquidación y ajuste
  audit-engine.js           reglas globales/parciales y severidad
  audit-filters.js          filtros, alcance y conteos comparables
  audit-exporter.js         reporte de auditoría local CSV/JSON/XLSX
  journal.css               estilos del workspace

src/cfdi/
  parser.js                 extracción XML local y campos fiscales
  relations.js              enriquecimiento de pagos sin perder ocurrencias
  analysis.js               análisis agregado existente
  workspace.js              importación, tabs y exportación fiscal
```

El parser debe conservar tanto el código original como la etiqueta. Antes de aprobar una póliza se debe ampliar el modelo para preservar cadenas decimales originales, `TipoRelacion`, todos los UUID relacionados, `FormaPago` y `MetodoPago` sin sustituirlos por texto derivado. Los análisis históricos creados con `Number` deben marcarse como `derived_from_number`.

### 6.2 Flujos de datos

```text
XML/ZIP seleccionado
      ↓
parser CFDI local
      ↓
CfdiDocument + PaymentOccurrence + AdjustmentOccurrence
      ↓
cfdi-lifecycle: papel, relaciones, saldos, duplicados y eventos
      ↓
selección humana de empresa / periodo / fuentes
      ↓
audit-engine ────────────────→ hallazgos globales o parciales
      ↓
journal-events + catálogo + reglas
      ↓
JournalCandidate versionado
      ↓
validation.js
      ↓
Requiere revisión → Listo para aprobar → Aprobada localmente
```

No usar `documentText` ni `cfdiContext` para transportar XML, pólizas, cuentas o eventos al asistente. Abrir Nora no debe generar red. Una futura explicación estructurada necesitaría contrato backend, minimización, consentimiento, límites y retención separados.

### 6.3 Persistencia y seguridad

El primer incremento debe permanecer en memoria, como el workspace actual. Cambiar empresa, usuario, periodo o fuente debe cancelar generación, limpiar eventos y borrar el panel de ayuda activo. No guardar pólizas en `cfdi_analysis_runs`, `localStorage`, IndexedDB o tablas existentes.

Las descargas explícitas pueden incluir un reporte de auditoría y una póliza, pero deben declarar si contienen UUID, RFC, nombres, importes y relaciones. Un archivo descargado no se reimporta automáticamente. La persistencia durable, roles, multiusuario, ERP, bancos y firma contable requieren diseño de seguridad y autorización independiente.

## 7. Diseño de producto y experiencia

### 7.1 Principios de Confianza fiscal

Mantener la combinación de azul petróleo `#123B43`, jade `#16866F`, marfil `#F5F4EC`, arena `#E4E6D8`, coral `#E98268` y amarillo `#D9B84C`. El petróleo estructura el análisis; el jade representa una validación local; el amarillo señala revisión; el coral señala bloqueo o riesgo. Ningún estado debe depender solo del color.

El workspace debe sentirse como un laboratorio contable profesional: una línea de evidencia visible, una acción principal por etapa y una distinción constante entre **Sugerido**, **Requiere revisión**, **Listo para aprobar** y **Aprobada localmente; no contabilizada**.

La tipografía sigue el sistema de ContaIA: títulos editoriales legibles y datos de UUID, códigos, reglas e importes en DM Mono. La voz es explicativa y prudente: «El complemento liquida el saldo relacionado»; no «La operación ya está contabilizada».

### 7.2 Navegación interna

El acceso se ubica en Herramientas como **Pólizas y auditoría CFDI**. La tarjeta comunica:

```text
Pólizas y auditoría CFDI
Reconstruye el ciclo de factura, pago y ajuste; revisa pólizas sugeridas.
Local · requiere configuración · no contabiliza
[ Abrir revisión ]
```

Dentro del workspace, las etapas son:

1. Contexto y fuentes.
2. Ciclo CFDI.
3. Pólizas sugeridas.
4. Auditoría global.
5. Auditoría parcial.
6. Catálogo y reglas.

En móvil se muestra una barra horizontal de etapas con el paso actual, sin esconder la acción primaria ni quedar debajo de la navegación inferior.

### 7.3 Estados visuales

Usar etiquetas textuales con icono y ayuda contextual:

- **Sin configurar:** faltan empresa, periodo, papel o catálogo.
- **En análisis:** se reconstruyen documentos y relaciones.
- **Requiere revisión:** existe al menos una incidencia o decisión pendiente.
- **Listo para aprobar:** la póliza cuadra y no tiene bloqueos.
- **Aprobada localmente:** snapshot aprobado en esta sesión, sin contabilización.
- **Fuera de alcance:** una relación necesaria no está en los filtros actuales.
- **No verificable:** falta una fuente autorizada para concluir.
- **Error:** la fuente es inválida o el cálculo no puede completarse.

## 8. Wireframes y componentes

Los wireframes completos se entregan en `contaia-polizas-auditoria-wireframes.md`. El diseño previsto contiene ocho superficies:

1. portada del workspace y resumen del alcance;
2. selección de fuentes y configuración de empresa;
3. línea de tiempo del ciclo CFDI;
4. bandeja de pólizas sugeridas y detalle de partidas;
5. auditoría global;
6. auditoría parcial con filtros;
7. panel de evidencia de una incidencia;
8. versión móvil apilada y Nora contextual.

La pantalla de póliza debe mostrar siempre fuente principal, relaciones, evento contable, regla y versión, cuenta, concepto, cargo, abono, moneda, total y diferencia. La pantalla de auditoría debe mostrar la fórmula de alcance y el motivo de cada incidencia, no solo un contador.

## 9. Exportaciones de auditoría

La primera salida debe ser una copia de revisión local, no un formato oficial:

```text
Auditoria_Global.csv o .xlsx
  Resumen
  Hallazgos
  Documentos
  Eventos de pago
  Relaciones
  Polizas sugeridas
  Evidencia y reglas
```

El archivo debe contener `generatedAt`, `scope`, `sourceRunIds`, `policyVersion`, `catalogVersion`, `ruleVersion`, severidad y estado de cada hallazgo. Los importes conservan moneda y escala; las fórmulas no deben sustituir los valores exactos almacenados. Si se exportan UUID/RFC/nombres, la pantalla debe advertirlo antes de descargar.

No debe llamarse «auditoría certificada», «contabilidad electrónica», «acuse», «declaración» ni «validación SAT». Debe llamarse **Reporte de revisión de ciclo CFDI** o **Borradores de póliza para revisión**.

## 10. Fases de implementación y puertas

### Fase 0 — contrato y fixtures

Aprobar el vocabulario, las cuentas configurables, el alcance MXN inicial y la política de versiones. Crear fixtures ficticios de venta PUE, venta PPD, complemento de pago parcial, complemento total, compra PUE, compra PPD, nota de crédito emitida, nota de crédito recibida, múltiples documentos en un pago, moneda extranjera, duplicados y cancelación desconocida.

Esta fase también debe fijar qué versión de CFDI, complemento de pagos, catálogos y reglas se está verificando. El Anexo 29 consultado es una compilación técnica y advierte que para sustentar legalmente actos debe utilizarse la publicación del DOF correspondiente [6].

### Fase 1 — ingesta y grafo local

Ampliar el parser para preservar códigos originales, decimales, relaciones y ocurrencias. Crear `cfdi-lifecycle.js` y `cfdi-policy.js`. No tocar el análisis agregado existente hasta contar con pruebas de regresión.

La salida de esta fase es un grafo local reproducible con documentos, eventos, relaciones, monedas, calidad y conflictos.

### Fase 2 — auditoría determinista

Implementar `audit-engine.js` con reglas cerradas, severidad versionada, alcance global/parcial, filtros y trazabilidad. La auditoría debe producir el mismo resultado con las mismas fuentes, política y filtros. No debe depender de Nora ni de IA.

### Fase 3 — plantillas de póliza

Implementar `journal-events.js` con las plantillas de reconocimiento, liquidación y ajuste. Conectar cuentas configuradas y reglas declarativas existentes. Una plantilla sin evidencia o cuenta válida genera una incidencia, no un asiento incompleto.

### Fase 4 — workspace y wireframes

Construir las vistas del documento de wireframes. Mantener el módulo local, sin persistencia nueva y sin conexión bancaria automática. Añadir edición humana de aplicación de notas de crédito, selección de cuenta de banco/caja y confirmación del papel de empresa.

### Fase 5 — exportación y regresión

Añadir exportación local de reportes y pólizas. Probar orden estable, importes, moneda, UUID, relaciones, advertencias, ausencia de XML no autorizado y limpieza al cambiar sesión. Ejecutar regresión de CFDI, conciliación, DIOT, Pólizas y navegación móvil.

### Fase 6 — publicación separada

Solo después de una autorización específica se prepara commit GPG, push y despliegue a `contaia.site`. Esta fase no autoriza pagos, conexión bancaria, consulta SAT, presentación, almacenamiento duradero, roles contables ni integración ERP.

### Estado del incremento local implementado — 22 octubre 2026

Se implementaron `audit-engine.js`, `audit-filters.js` y `audit-exporter.js` como motor determinista local. La auditoría global y la parcial usan las mismas reglas, conservan el alcance explícito y diferencian una relación verdaderamente ausente de una relación existente fuera de la selección o filtro. Los hallazgos conservan severidad, código, documento, evidencia, estado y una decisión local opcional; no marcan un CFDI como vigente/cancelado cuando el XML no lo demuestra.

El workspace añade las pestañas de **Auditoría global**, **Auditoría parcial** y **Notas de crédito**. Las decisiones de aplicación de un CFDI E se guardan solo en memoria y exigen una elección humana: reducir saldo, devolución o compensación. Sin relación `01`, fuente relacionada única, importes/impuestos explícitos, cuentas activas e imputables y una aplicación seleccionada, el ajuste queda bloqueado para aprobación. La forma o método de pago de E nunca se traduce por sí solo a efectivo, banco, condonación o transferencia.

También se entrega un XLSX local de revisión con Resumen, Hallazgos, Documentos y Evidencia. El archivo incluye los identificadores que estaban presentes en las fuentes seleccionadas y se etiqueta como reporte de trabajo, no auditoría certificada ni validación SAT. La descarga no envía XML, CFDI, filas bancarias, importes ni contexto a un servidor.

Pendientes deliberados: política de divisas/EquivalenciaDR, retenciones, IEPS y distribución de una nota contra varios documentos; verificación autorizada de cancelación SAT; persistencia y control de roles; consultas/credenciales SAT; integración ERP; y cualquier presentación, timbrado, registro contable o publicación. La aprobación continúa siendo «Aprobada localmente; no contabilizada».

## 11. Criterios de salida del primer incremento

El primer incremento se considera listo para revisión de producto cuando:

- una factura PUE pagada al momento no genera automáticamente un complemento P adicional;
- una factura PPD genera reconocimiento de cuenta por cobrar/pagar y queda elegible para una liquidación separada;
- un complemento P se relaciona por cada documento y ocurrencia, valida saldo anterior, pagado, insoluto, moneda y parcialidad;
- las notas de crédito se distinguen como ajustes y conservan `TipoRelacion` y UUID relacionado;
- una forma de pago no se confunde con método de pago;
- el motor evita doble conteo de factura, complemento y movimiento bancario;
- una diferencia aritmética, moneda sin equivalencia, cuenta faltante o relación ambigua bloquea aprobación;
- auditoría global y parcial muestran el alcance real, las reglas aplicadas y los documentos fuera de la selección;
- una póliza aprobada se etiqueta «Aprobada localmente; no contabilizada»;
- no se realizan escrituras nuevas, llamadas bancarias, consulta SAT, presentación o envío de fuentes a Nora;
- el funcionamiento de todas las herramientas existentes permanece sin regresión.

## 12. Decisiones que requiere el siguiente visto bueno

Antes de implementar, la persona responsable debe confirmar:

1. si el primer incremento acepta únicamente análisis CFDI cargados localmente o también corridas CFDI guardadas seleccionadas explícitamente;
2. si la primera moneda soportada será solo MXN;
3. qué cuentas de caja, bancos, clientes, proveedores, ventas, compras, inventarios, gastos e IVA estarán disponibles en el catálogo local;
4. si una nota de crédito ya pagada se tratará primero como compensación, devolución o pendiente de aplicación;
5. si la auditoría debe permitir «no aplicable» y quién puede reconocer una incidencia;
6. si se incluirán movimientos bancarios en el primer incremento o se dejarán como evidencia de la fase de conciliación;
7. qué campos identificables pueden incluirse en una descarga de revisión;
8. si se autoriza únicamente implementación frontend local o también persistencia/backend en una fase posterior.

## Referencias

[1]: https://www.sat.gob.mx/minisitio/Factura/documentos/infografias/formaspagometodopagos.pdf "Infografía del SAT sobre forma y método de pago"

[2]: https://www.sat.gob.mx/minisitio/Factura/documentos/Guia_llenadoCFDI_DPA.pdf "Guía de llenado de CFDI 4.0"

[3]: https://www.sat.gob.mx/minisitio/Factura/emite_complementosdefactura.htm "Complementos de factura del SAT"

[4]: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461173737627&ssbinary=true "Preguntas y respuestas sobre comprobación fiscal"

[5]: https://wwwmatnp.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos "Comprobante de recepción de pagos del SAT"

[6]: https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/compiladas/Compilado_PrimeraModificacion_Anexo29_RMF2026-17072026.pdf "Anexo 29 compilado de la RMF 2026"

[7]: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175070885&ssbinary=true "Especificación técnica del complemento para recepción de pagos"

[8]: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175754221&ssbinary=true "Guía Anexo 20 de llenado de CFDI"

[9]: https://wwwmatnp.sat.gob.mx/articulo/99662/articulo-29-a "Artículo 29-A del Código Fiscal de la Federación"
