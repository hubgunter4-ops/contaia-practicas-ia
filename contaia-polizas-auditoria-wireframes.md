# ContaIA Herramientas — Wireframes de Pólizas y Auditoría CFDI

**Estado:** diseño de interfaz; no es una implementación ni un compromiso de publicación.

**Sistema visual:** Confianza fiscal. Azul petróleo `#123B43` para estructura, jade `#16866F` para avance local, marfil `#F5F4EC` para lectura, arena `#E4E6D8` para configuración, amarillo `#D9B84C` para revisión y coral `#E98268` para bloqueos.

## 1. Reglas de composición

La pantalla siempre debe responder cuatro preguntas: qué periodo se revisa, qué documentos forman parte del ciclo, qué póliza se sugiere y qué impide aprobarla. El encabezado mantiene una sola acción principal según la etapa. Los contadores deben mostrar el alcance real, y nunca convertir fuentes ausentes o estados no verificables en «sin problemas».

La tabla de evidencia puede desplazarse dentro de su propio panel en escritorio. En móvil, una fila se transforma en una tarjeta con resumen y botón **Ver evidencia**. El detalle se abre debajo, no en un modal que tape la navegación inferior.

## 2. Portada del workspace

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CONTAIA HERRAMIENTAS · CONTABILIDAD Y AUDITORÍA                        │
│ Pólizas sugeridas y Auditoría CFDI                 [Local · revisión]   │
│ Reconstruye factura, pago y ajuste. Nada se contabiliza automáticamente.│
│                                                                         │
│ Empresa [ Empresa demo                         v ]  Periodo [ 2026-09 ]│
│ Papel   [ Emisor y receptor a confirmar         v ] Moneda [ MXN      ]│
│                                                                         │
│ [ 18 CFDI ] [ 6 pagos ] [ 3 notas ] [ 4 incidencias altas ]             │
│                                                                         │
│ [Contexto] [Ciclo CFDI] [Pólizas] [Auditoría global] [Auditoría parcial]│
│ [Catálogo y reglas]                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

Debajo del encabezado aparece una banda de privacidad: **«Trabajo local de esta sesión. Abrir Nora no comparte tus fuentes. Aprobar significa aprobada localmente; no contabilizada.»** Si falta empresa, periodo, papel o catálogo, el botón principal es **Confirmar contexto** y las etapas posteriores muestran estado bloqueado.

### Componentes

- `ToolHeader`: producto, estado, descripción y acción de regreso.
- `ContextBar`: empresa local opaca, periodo, papel y moneda.
- `AuditSummary`: conteos con enlace a su alcance.
- `LifecycleTabs`: navegación con `aria-current`.
- `PrivacyBanner`: frontera local y aviso de pérdida al recargar.

## 3. Etapa Contexto y fuentes

```text
┌─ 01 · CONTEXTO Y FUENTES ───────────────────────────────────────────────┐
│ Selecciona solo los análisis que formarán esta revisión                 │
│ El historial no se atribuye automáticamente a la empresa abierta.      │
│                                                                         │
│ [ ] CFDI septiembre · 18 comprobantes · MXN · 2026-09-22               │
│     12 I · 3 E · 3 P · precisión derivada · [Ver resumen]              │
│                                                                         │
│ [ ] CFDI agosto · 7 comprobantes · MXN · 2026-08-31                    │
│     5 I · 1 E · 1 P · fuente local                                    │
│                                                                         │
│ Seleccionadas: 1   Papel: [ Emisor ] [ Receptor ] [ Ambos ]             │
│                                                                         │
│ [Confirmar contexto]                                 [Limpiar selección]│
└─────────────────────────────────────────────────────────────────────────┘
```

Una fuente seleccionada conserva su `sourceRunId` y procedencia. La UI muestra si el importe es original o derivado de un `Number`. Si el usuario selecciona una corrida guardada, debe abrirla explícitamente. El sistema no lee todo el historial para encontrar coincidencias.

## 4. Etapa Ciclo CFDI

```text
┌─ 02 · CICLO CFDI ──────────────────────────────────────────────────────┐
│ 18 documentos · 6 eventos de pago · 3 ajustes · 2 relaciones ambiguas  │
│ Filtros [Todos] [Emitidos] [Recibidos] [PUE] [PPD] [Notas] [Pagos]      │
│                                                                         │
│ VENTA / CLIENTE ACME                                                   │
│ ┌─────────────┐      reconoce       ┌─────────────────┐                │
│ │ CFDI I      │ ───────────────────>│ Venta a crédito │                │
│ │ PPD · 99    │                     │ Clientes        │                │
│ └─────────────┘                     └────────┬────────┘                │
│                                              │ liquida                  │
│ ┌─────────────┐      complementa     ┌───────▼─────────┐                │
│ │ CFDI P      │ ───────────────────> │ Pago parcial    │                │
│ │ 03 · $500   │                     │ saldo $620      │                │
│ └─────────────┘                     └─────────────────┘                │
│                                                                         │
│ [Ver relación] [Separar evento] [Marcar para revisión]                 │
└─────────────────────────────────────────────────────────────────────────┘
```

La línea de tiempo distingue «reconocimiento», «liquidación» y «ajuste». El caso PUE se representa como una sola operación principal:

```text
CFDI I · PUE · transferencia ──> Venta de contado y cobro en una exhibición
```

El caso PPD se representa como factura más uno o varios pagos. El pago no se suma como otra venta. Un CFDI E aparece como una rama de ajuste relacionada con el documento origen. Si el UUID relacionado no está en la selección, se muestra **Fuera del alcance actual**, no **Sin relación**.

## 5. Bandeja de pólizas sugeridas

```text
┌─ 03 · PÓLIZAS SUGERIDAS ────────────────────────────────────────────────┐
│ [Generar propuestas]  8 borradores · 3 requieren revisión · 2 listas   │
│                                                                         │
│ BANDEJA                         DETALLE                                 │
│ ┌──────────────────────────┐   ┌─────────────────────────────────────┐ │
│ │ Póliza V-0001             │   │ Venta a crédito · CFDI I · PPD       │ │
│ │ Venta ACME · $1,160 MXN   │   │ Revisión 1 · Regla SALE_PPD_V1       │ │
│ │ [Requiere revisión]       │   │                                     │ │
│ ├──────────────────────────┤   │ Fuentes: UUID factura · periodo     │ │
│ │ Póliza P-0003             │   │ Relación: reconocimiento, no pago   │ │
│ │ Cobro parcial · $500 MXN  │   │                                     │ │
│ │ [Lista para aprobar]      │   │ Cuenta                Cargo  Abono   │ │
│ ├──────────────────────────┤   │ Clientes              —      500.00  │ │
│ │ Ajuste NC-0002            │   │ Bancos                500.00 —      │ │
│ │ Descuento proveedor       │   │                                     │ │
│ │ [Fuera de alcance]        │   │ Total cargos          500.00        │ │
│ └──────────────────────────┘   │ Total abonos                 500.00  │ │
│                                │ Diferencia                       0.00 │ │
│                                │                                     │ │
│                                │ [Ver auditoría] [Aprobar revisión]  │ │
│                                │ Aprobada localmente; no contabilizada│ │
│                                └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

El detalle debe mostrar la regla y versión, cuentas, importes exactos, moneda, documentos fuente, eventos relacionados, advertencias y bloqueos. **Aprobar revisión** solo está habilitado cuando cargos y abonos coinciden, las cuentas son elegibles, el evento está confirmado y no quedan bloqueos. La aprobación no cambia el CFDI, no actualiza saldos y no crea un asiento en Supabase o ERP.

## 6. Editor de aplicación de una nota de crédito

```text
┌─ AJUSTE · CFDI E · TIPO RELACIÓN 01 ───────────────────────────────────┐
│ Nota de crédito NC-0002                                                │
│ Relaciona: FACT-001 · $1,000 MXN · Cliente ACME                        │
│                                                                         │
│ Tipo de ajuste [ Descuento                       v ]                   │
│ Aplicación    [ Reducir saldo de cliente          v ]                  │
│ Forma de pago [ Evidencia en CFDI / no concluir   v ]                  │
│                                                                         │
│ Base del ajuste                         $100.00                         │
│ IVA ajustado                             $16.00                         │
│ Estado del saldo                        [ Requiere confirmación ]       │
│                                                                         │
│ Incidencia: el XML no prueba si hubo devolución o compensación.         │
│                                                                         │
│ [Guardar decisión local]              [Excluir de esta preparación]    │
└─────────────────────────────────────────────────────────────────────────┘
```

El control **Aplicación** es obligatorio cuando la factura original ya está pagada o el saldo no se puede determinar. La interfaz no convierte «condonación» en transferencia ni «donación» en un código de pago. Si el usuario introduce una explicación libre, se conserva como nota de revisión y no como regla contable automática.

## 7. Auditoría global

```text
┌─ 04 · AUDITORÍA GLOBAL · SEPTIEMBRE 2026 ──────────────────────────────┐
│ Alcance: 18 CFDI · 6 pagos · 3 ajustes · MXN · 2 fuentes seleccionadas │
│ Política: ciclo CFDI 4.0 / REP 2.0 / reglas locales v3                 │
│                                                                         │
│ [ 18 documentos ] [ 14 eventos cubiertos ] [ 4 pólizas sugeridas ]     │
│ [ 3 bloqueos ]  [ 7 revisiones ] [ cancelación: no verificable ]        │
│                                                                         │
│ COBERTURA DEL CICLO                                                     │
│ Reconocimiento      ████████████████░░ 14 / 18                         │
│ Liquidación         ████████░░░░░░░░░  6 / 9 PPD                      │
│ Ajustes relacionados██████████████░░░░  2 / 3                          │
│                                                                         │
│ HALLAZGOS PRIORITARIOS                                                   │
│ [ALTO] CFDI-P-BAL-001  P-0003 saldo insoluto no cuadra       [Abrir]   │
│ [ALTO] CFDI-E-REL-001  NC-0002 no encuentra UUID relacionado [Abrir]   │
│ [REVISIÓN] CFDI-I-PPD-001  FACT-004 sin pago en periodo       [Abrir]  │
│ [INFO] CFDI-CANCEL-001  Estado no verificable en 18 documentos         │
│                                                                         │
│ [Descargar reporte de revisión] [Reconstruir auditoría]                 │
└─────────────────────────────────────────────────────────────────────────┘
```

Las barras de cobertura son indicadores de revisión, no porcentajes de cumplimiento fiscal. Si una fuente está incompleta, el texto debe decir qué falta. El estado de cancelación aparece como **no verificable** cuando no existe una fuente autorizada; no se presenta como vigente.

## 8. Auditoría parcial

```text
┌─ 05 · AUDITORÍA PARCIAL ────────────────────────────────────────────────┐
│ Selección aplicada: 7 documentos · 3 eventos · periodo 2026-09          │
│                                                                         │
│ Periodo [2026-09]  Papel [Emisor]  Tipo [PPD]  Moneda [MXN]             │
│ Relación [Sin pago]  Tercero [Todos]  Severidad [Todas]                 │
│ [Aplicar filtros] [Restablecer]                                        │
│                                                                         │
│ [3 bloqueos] [2 revisiones] [1 fuera de alcance]                        │
│                                                                         │
│ Documento   Evento       Regla             Estado       Importe  Acción │
│ FACT-004    Reconocer    CFDI-I-PPD-001   Revisión     2,320    Abrir  │
│ P-0003      Liquidar     CFDI-P-BAL-001   Bloqueo        500    Abrir  │
│ NC-0002     Ajustar      CFDI-E-REL-001   Fuera alcance  100    Abrir  │
│                                                                         │
│ Nota: el complemento relacionado puede estar fuera de la selección.     │
└─────────────────────────────────────────────────────────────────────────┘
```

El encabezado de la auditoría parcial debe mostrar documentos, eventos y reglas aplicadas. Un resultado fuera de la selección se diferencia visualmente de un documento sin relación. Cambiar los filtros vuelve a calcular la vista, pero no altera el resultado global ni las pólizas existentes.

## 9. Panel de evidencia

```text
┌─ DETALLE DE HALLAZGO ───────────────────────────────────────────────────┐
│ CFDI-P-BAL-001 · BLOQUEO · Abierto                                     │
│ El saldo insoluto no coincide con saldo anterior - importe pagado.     │
│                                                                         │
│ Documento P       P-0003                                                │
│ Documento ligado FACT-004                                               │
│ Moneda            MXN                                                   │
│ Saldo anterior    1,000.00                                              │
│ Pagado              500.00                                              │
│ Observado          400.00                                               │
│ Esperado           500.00                                               │
│                                                                         │
│ Evidencia: XML local · Pago[1] · DoctoRelacionado[1]                    │
│ Póliza afectada: Póliza P-0003 · Requiere revisión                      │
│                                                                         │
│ Acción: [Corregir decisión local] [Excluir] [Reconocer advertencia]     │
└─────────────────────────────────────────────────────────────────────────┘
```

El panel debe conservar el valor observado y el valor esperado. Reconocer no edita el XML. Corregir decisión local abre el editor de relación o cuenta; excluir exige un motivo y deja el documento fuera de esa preparación.

## 10. Catálogo y reglas

```text
┌─ 06 · CATÁLOGO Y REGLAS ────────────────────────────────────────────────┐
│ Catálogo empresa local · v4     [Importar configuración]                │
│                                                                         │
│ Cuentas por evento                                                     │
│ Venta contado   Caja/Bancos [Seleccionar]  Ventas [Seleccionar]        │
│ Venta crédito   Clientes    [Seleccionar]  IVA trasladado [Seleccionar] │
│ Compra crédito  Proveedores[Seleccionar]  IVA acreditable [Seleccionar] │
│ Ajuste emitido  Descuentos[Seleccionar]  Aplicación [Revisar]           │
│                                                                         │
│ Reglas activas                                                         │
│ [x] SALE_PUE_V1 · factura emitida PUE                 [Probar]          │
│ [x] SALE_PPD_V1 · factura emitida PPD                 [Probar]          │
│ [x] PAYMENT_V2 · complemento con saldo               [Probar]          │
│ [ ] CREDIT_NOTE_V1 · requiere aplicación humana       [Revisar]         │
│                                                                         │
│ Las reglas son plantillas locales; no sustituyen criterio profesional.  │
└─────────────────────────────────────────────────────────────────────────┘
```

Una regla muestra campos de entrada, evento, cuentas, prioridad, versión y requisitos de revisión. **Probar** solo simula y muestra la explicación; no modifica fuentes ni genera una aprobación. Los empates de prioridad se presentan como conflicto.

## 11. Nora contextual

El panel está cerrado por defecto y vive dentro del workspace activo:

```text
┌ Nora · Asistente abierto · Pólizas y auditoría CFDI                 [+] │
```

Al abrirse:

```text
┌ Nora · Asistente abierto · Auditoría CFDI                           [−] │
│ Abrir no comparte tus fuentes.                                        │
│ [¿Qué significa PPD?] [¿Por qué hay doble conteo?] [¿Qué revisar?]   │
│                                                                        │
│ Pregunta: [Escribe una duda sin pegar UUID, RFC o XML…             ]   │
│ [Enviar consulta]                                                      │
│                                                                        │
│ Ayuda genérica. No recibe CFDI, pólizas, catálogo ni reportes al abrir.│
└────────────────────────────────────────────────────────────────────────┘
```

La apertura, preguntas sugeridas y preparación de contexto no generan una solicitud. El botón **Enviar consulta** sí puede transmitir el texto escrito bajo el contrato del asistente. En el primer incremento no se adjuntan XML, pólizas, catálogos ni hallazgos.

## 12. Móvil

```text
┌──────────────────────────────┐
│ Pólizas y auditoría CFDI     │
│ Local · no contabiliza       │
│ [Contexto] [Ciclo] [Pólizas]│  ← barra desplazable
│                              │
│ 18 CFDI · 3 bloqueos         │
│ [Auditoría global]           │
│                              │
│ ▼ FACT-004 · Venta a crédito │
│   PPD · $2,320 MXN           │
│   Requiere revisión          │
│   [Ver ciclo] [Ver póliza]   │
│                              │
│ ▼ P-0003 · Pago parcial      │
│   Saldo no cuadra            │
│   [Abrir evidencia]          │
│                              │
│ [Descargar reporte]          │
│                              │
│ Nora · Asistente abierto [+] │
├──────────────────────────────┤
│ Inicio Curso Estudio Herram.│
└──────────────────────────────┘
```

La tabla no se fuerza a una anchura horizontal global. La acción de abrir evidencia tiene al menos 44 px de alto. El panel de Nora se ubica antes de la navegación inferior y no la tapa. Las transiciones de acordeón duran 150–200 ms y se eliminan con `prefers-reduced-motion`.

## 13. Componentes y estados técnicos

```text
CfdiAuditWorkspace
  AuditContextBar
  SourceSelectionStage
  LifecycleGraph
  JournalDraftInbox
  JournalDraftDetail
  FindingSummary
  GlobalAuditView
  PartialAuditView
  FindingEvidenceDrawer
  AccountRuleConfiguration
  ToolAssistantPanel
```

Cada componente debe aceptar datos explícitos y no leer directamente el estado de otra herramienta. El estado mínimo de la vista es:

```text
activeStage
companyLocalId
period
companyRole
currency
selectedSourceRunIds[]
selectedDocumentIds[]
selectedEventIds[]
activeDraftId
activeFindingId
auditScope
filters
assistantOpen
```

Los estados de carga, vacío, error y no verificable deben tener representación propia. Un estado vacío por falta de fuentes debe decir **«No hay fuentes seleccionadas»**, no **«0 incidencias»**.

## 14. Accesibilidad y microcopy

Los controles deben tener nombre accesible, foco visible y estado textual. Las pestañas usan `aria-current`; el panel de Nora usa `aria-expanded` y `aria-controls`; el cajón de evidencia anuncia su título y devuelve el foco al control de origen al cerrarse.

Microcopy recomendado:

- «Este complemento liquida un saldo relacionado; no registra otra venta.»
- «La relación está fuera de los filtros actuales. No se puede concluir que falte.»
- «Cuadra aritméticamente, pero aún requiere confirmar cuenta y aplicación.»
- «Estado de cancelación no verificable con las fuentes seleccionadas.»
- «Aprobada localmente; no contabilizada.»

Evitar:

- «SAT validado».
- «Póliza contabilizada».
- «Pago confirmado» cuando solo existe una coincidencia heurística.
- «Sin errores» si faltan fuentes, cancelación o relaciones.

## Referencias normativas de apoyo

El criterio de PUE/PPD y forma de pago se basa en la infografía y guía del SAT [1] [2]. El tratamiento de pagos P y sus saldos se apoya en la página de recepción de pagos y la especificación técnica [3] [4]. El tratamiento de CFDI E y la relación 01 se fundamenta en el material de comprobación fiscal y la guía Anexo 20 [5] [6].

[1]: https://www.sat.gob.mx/minisitio/Factura/documentos/infografias/formaspagometodopagos.pdf "Infografía del SAT sobre forma y método de pago"

[2]: https://www.sat.gob.mx/minisitio/Factura/documentos/Guia_llenadoCFDI_DPA.pdf "Guía de llenado de CFDI 4.0"

[3]: https://wwwmatnp.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos "Comprobante de recepción de pagos del SAT"

[4]: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175070885&ssbinary=true "Especificación técnica del complemento para recepción de pagos"

[5]: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461173737627&ssbinary=true "Preguntas y respuestas sobre comprobación fiscal"

[6]: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175754221&ssbinary=true "Guía Anexo 20 de llenado de CFDI"
