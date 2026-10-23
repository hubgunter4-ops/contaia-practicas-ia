export const WORKPAPERS_DEMO_VERSION = "workpapers-demo-v1";

export const WORKPAPER_DEMO_PERIODS = Object.freeze([
  Object.freeze({ id: "2026-09", label: "Septiembre 2026", cutoff: "30/09/2026" }),
  Object.freeze({ id: "2026-10", label: "Octubre 2026", cutoff: "31/10/2026" }),
  Object.freeze({ id: "2026-year", label: "Ejercicio 2026", cutoff: "31/12/2026" }),
]);

export const WORKPAPER_DEMO_TYPES = Object.freeze([
  Object.freeze({ id: "vat", label: "IVA y ventas", description: "Resume ingresos, compras e IVA con fórmulas de ejemplo." }),
  Object.freeze({ id: "cash", label: "Cobros y pagos", description: "Muestra la relación demostrativa entre flujo y documentos." }),
  Object.freeze({ id: "audit", label: "Revisión de pólizas", description: "Organiza partidas y hallazgos para revisión humana." }),
]);

const PERIOD_DATA = Object.freeze({
  "2026-09": Object.freeze({ sales: 168420, purchases: 89480, vat: 12630, pending: 18400, invoices: 21, movements: 18, entries: 9, trend: [112, 124, 119, 138, 152, 168], quality: "1 pendiente" }),
  "2026-10": Object.freeze({ sales: 184320, purchases: 96600, vat: 14172, pending: 23500, invoices: 24, movements: 22, entries: 11, trend: [124, 119, 138, 152, 168, 184], quality: "3 pendientes" }),
  "2026-year": Object.freeze({ sales: 2043980, purchases: 1082120, vat: 153820, pending: 186400, invoices: 268, movements: 241, entries: 126, trend: [128, 142, 153, 165, 174, 184], quality: "12 pendientes" }),
});

function periodFor(periodId) {
  return WORKPAPER_DEMO_PERIODS.find(({ id }) => id === periodId) || WORKPAPER_DEMO_PERIODS[1];
}

function valuesFor(periodId) {
  return PERIOD_DATA[periodId] || PERIOD_DATA["2026-10"];
}

function money(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/**
 * Construye una vista demostrativa. Todos los valores son ficticios, agregados y
 * deterministas: no provienen de CFDI, bancos, perfiles ni snapshots reales.
 */
export function buildWorkpapersDemo(periodId = "2026-10") {
  const period = periodFor(periodId);
  const values = valuesFor(period.id);
  const paid = Math.max(0, values.sales - values.pending);
  const taxableBase = Math.round(values.sales / 1.16 * 100) / 100;
  const purchaseBase = Math.round(values.purchases / 1.16 * 100) / 100;
  const outputVat = Math.round((values.sales - taxableBase) * 100) / 100;
  const inputVat = Math.round((values.purchases - purchaseBase) * 100) / 100;

  return Object.freeze({
    version: WORKPAPERS_DEMO_VERSION,
    isFictitious: true,
    period,
    sources: Object.freeze([
      Object.freeze({ id: "cfdi", title: "CFDI analizados · demo", count: values.invoices, status: "Listos para consultar", detail: "Comprobantes ficticios agregados; no hay XML ni identificadores." }),
      Object.freeze({ id: "reconciliation", title: "Conciliación · demo", count: values.movements, status: "Revisión pendiente", detail: "Movimientos demostrativos y diferencias simuladas." }),
      Object.freeze({ id: "journal", title: "Pólizas sugeridas · demo", count: values.entries, status: "Borradores revisables", detail: "Asientos ficticios; no se contabilizan ni se guardan." }),
    ]),
    metrics: Object.freeze([
      Object.freeze({ label: "Ventas gravadas", value: values.sales, tone: "jade" }),
      Object.freeze({ label: "Compras del periodo", value: values.purchases, tone: "petroleum" }),
      Object.freeze({ label: "IVA neto estimado", value: values.vat, tone: "validation" }),
      Object.freeze({ label: "Cobro pendiente", value: values.pending, tone: "coral" }),
    ]),
    trend: Object.freeze(values.trend.map((value, index) => Object.freeze({ label: `M${index + 1}`, value }))),
    rule: Object.freeze({
      id: "demo-vat-sales-v1",
      title: "Separar ventas gravadas al 16%",
      condition: "Tipo = ingreso y tasa = 16%",
      grouping: "Mes y método de pago",
      output: "Base, IVA trasladado, total y saldo pendiente",
      rationale: "La propuesta organiza importes agregados para que la persona revise una hoja repetible.",
    }),
    entry: Object.freeze({
      title: "Póliza demostrativa de ventas",
      reference: "DEMO-PV-10",
      status: "Borrador · requiere revisión",
      lines: Object.freeze([
        Object.freeze({ account: "Clientes", debit: values.pending, credit: 0 }),
        Object.freeze({ account: "Bancos", debit: paid, credit: 0 }),
        Object.freeze({ account: "Ventas", debit: 0, credit: taxableBase }),
        Object.freeze({ account: "IVA trasladado", debit: 0, credit: outputVat }),
      ]),
    }),
    workbook: Object.freeze({
      title: `Papel de trabajo de IVA · ${period.label}`,
      sheets: Object.freeze([
        Object.freeze({ name: "Parámetros", detail: `Periodo ${period.label} · corte ${period.cutoff}` }),
        Object.freeze({ name: "Resumen", detail: "Totales y fórmulas de demostración" }),
        Object.freeze({ name: "Detalle", detail: "Filas agregadas y ficticias" }),
        Object.freeze({ name: "Procedencia", detail: "Fuentes y reglas consultadas" }),
      ]),
      rows: Object.freeze([
        Object.freeze({ concept: "Ventas gravadas 16%", source: "CFDI demo", base: taxableBase, tax: outputVat, total: values.sales, formula: "=SUM(Detalle!F2:F5)" }),
        Object.freeze({ concept: "Compras gravadas 16%", source: "CFDI demo", base: purchaseBase, tax: inputVat, total: values.purchases, formula: "=SUM(Detalle!F6:F9)" }),
        Object.freeze({ concept: "IVA neto estimado", source: "Cálculo local", base: 0, tax: values.vat, total: values.vat, formula: "=B7-B8" }),
      ]),
    }),
    provenance: Object.freeze([
      Object.freeze({ cell: "Resumen!F7", formula: "=SUM(Detalle!F2:F5)", source: "CFDI analizados · demo", cutoff: period.cutoff, count: values.invoices, total: money(values.sales), note: values.quality }),
      Object.freeze({ cell: "Resumen!F8", formula: "=SUM(Detalle!F6:F9)", source: "CFDI analizados · demo", cutoff: period.cutoff, count: Math.max(1, values.invoices - 4), total: money(values.purchases), note: "Totales ficticios para la demostración" }),
      Object.freeze({ cell: "Resumen!F9", formula: "=F7-F8", source: "Cálculo local de demostración", cutoff: period.cutoff, count: 2, total: money(values.vat), note: "Requiere revisión humana antes de cualquier uso contable" }),
    ]),
  });
}

export const __test = { PERIOD_DATA, periodFor, valuesFor };
