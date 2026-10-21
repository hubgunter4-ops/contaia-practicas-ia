export const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "cfdi", icon: "XML", group: "documents", eyebrow: "01 · DOCUMENTOS FISCALES", title: "CFDI 4.0",
    description: "Importa XML o ZIP, revisa el lote y analiza comprobantes localmente antes de decidir qué hacer.",
    availability: "ready", actionLabel: "Abrir analizador", detail: "XML y ZIP · análisis local · revisión humana",
  }),
  Object.freeze({
    id: "accounting", icon: "P", group: "operations", eyebrow: "02 · REGISTRO CONTABLE", title: "Contabilidad",
    description: "Clasificación y conciliación están en preparación; este panel todavía no procesa movimientos ni crea pólizas.",
    availability: "preparation", actionLabel: "Registrar pendiente", detail: "El registro no conecta un banco ni un proveedor.",
  }),
  Object.freeze({
    id: "payroll", icon: "N", group: "operations", eyebrow: "03 · PERSONAS", title: "Nómina",
    description: "El flujo guiado, el cálculo de incidencias y la revisión de nómina siguen en preparación.",
    availability: "preparation", actionLabel: "Registrar pendiente", detail: "No se calculan ni timbran recibos.",
  }),
  Object.freeze({
    id: "diot", icon: "IVA", group: "compliance", eyebrow: "04 · IMPUESTO AL VALOR AGREGADO", title: "DIOT",
    description: "La revisión de operaciones con terceros y la preparación de declaraciones están en preparación.",
    availability: "preparation", actionLabel: "Registrar pendiente", detail: "No genera ni presenta declaraciones.",
  }),
  Object.freeze({
    id: "monitor", icon: "!", group: "compliance", eyebrow: "05 · CONTROL CONTINUO", title: "Monitor fiscal",
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
