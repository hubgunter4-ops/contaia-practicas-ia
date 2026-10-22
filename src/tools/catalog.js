export const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "cfdi", icon: "XML", group: "documents", eyebrow: "01 · DOCUMENTOS FISCALES", title: "CFDI 4.0",
    description: "Importa XML o ZIP, revisa el lote y analiza comprobantes localmente antes de decidir qué hacer.",
    availability: "ready", actionLabel: "Abrir analizador", detail: "XML y ZIP · análisis local · revisión humana",
  }),
  Object.freeze({
    id: "accounting", icon: "P", group: "operations", eyebrow: "02 · BORRADORES CONTABLES", title: "Pólizas sugeridas",
    description: "Genera borradores locales desde CFDI y movimientos seleccionados, configura cuentas y revisa cargos = abonos antes de aprobar.",
    availability: "preparation", actionLabel: "Abrir borradores locales", detail: "No contabiliza, no conecta un banco y requiere aprobación humana.",
  }),
  Object.freeze({
    id: "reconciliation", icon: "↔", group: "operations", eyebrow: "03 · MOVIMIENTOS BANCARIOS", title: "Conciliación bancaria",
    description: "Carga CSV o Excel en el navegador y revisa candidatos provisionales contra facturas o pagos CFDI de esta sesión.",
    availability: "preparation", actionLabel: "Abrir carga local", detail: "Sin conexión bancaria · candidatos no confirmados",
  }),
  Object.freeze({
    id: "payroll", icon: "N", group: "operations", eyebrow: "04 · PERSONAS", title: "Nómina",
    description: "El flujo guiado, el cálculo de incidencias y la revisión de nómina siguen en preparación.",
    availability: "preparation", actionLabel: "Registrar pendiente", detail: "No se calculan ni timbran recibos.",
  }),
  Object.freeze({
    id: "diot", icon: "IVA", group: "compliance", eyebrow: "05 · IMPUESTO AL VALOR AGREGADO", title: "DIOT",
    description: "Prepara localmente operaciones con terceros e IVA desde CFDI seleccionados, señala faltantes y descarga un archivo de revisión.",
    availability: "preparation", actionLabel: "Abrir preparación local", detail: "No presenta declaraciones ni usa un formato oficial compatible.",
  }),
  Object.freeze({
    id: "monitor", icon: "!", group: "compliance", eyebrow: "06 · CONTROL CONTINUO", title: "Monitor fiscal",
    description: "La vista operativa de alertas, vencimientos y responsables todavía no está disponible.",
    availability: "preparation", actionLabel: "Registrar pendiente", detail: "No hay alertas ni vencimientos mostrados aquí.",
  }),
]);

export const TOOL_GROUPS = Object.freeze([
  Object.freeze({ id: "documents", eyebrow: "DOCUMENTOS Y ANÁLISIS", title: "Empieza por tus comprobantes", description: "Revisa archivos en el navegador y consulta hallazgos antes de continuar." }),
  Object.freeze({ id: "operations", eyebrow: "OPERACIÓN CONTABLE Y PERSONAS", title: "Preparación de operaciones", description: "Estos módulos muestran su alcance y estado; aún no ejecutan procesos contables o de nómina." }),
  Object.freeze({ id: "compliance", eyebrow: "CUMPLIMIENTO Y SEGUIMIENTO", title: "Revisión fiscal", description: "La disponibilidad se actualizará cuando haya flujos y datos verificables." }),
]);

export const TOOL_AVAILABILITY = Object.freeze({
  ready: Object.freeze({ label: "Listo", className: "is-ready" }),
  requires_setup: Object.freeze({ label: "Requiere configuración", className: "is-setup" }),
  preparation: Object.freeze({ label: "En preparación", className: "is-preparation" }),
  review: Object.freeze({ label: "Requiere revisión", className: "is-review" }),
  error: Object.freeze({ label: "Error", className: "is-error" }),
});
