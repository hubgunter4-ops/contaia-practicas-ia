export const DIOT_REVIEW_SCHEMA = Object.freeze({
  schemaVersion: "diot-review-cfdi-v1",
  label: "Preparación local de revisión DIOT",
  verifiedAt: "2026-10-21",
  sourceLabel: "Anexo 1 RMF 2026 y material oficial del SAT consultado",
  sourceUrl: "https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-1-RMF-2026_DOF-28122025.pdf",
  officialCompatible: false,
  currency: "MXN",
  thirdPartyTypes: Object.freeze([
    Object.freeze({ code: "national", label: "Proveedor nacional", required: ["identifier"] }),
    Object.freeze({ code: "foreign", label: "Proveedor extranjero", required: ["identifier", "name", "country", "nationality"] }),
    Object.freeze({ code: "global", label: "Proveedor global · sujeto a revisión", required: ["globalAcknowledged"] }),
  ]),
  operationTypes: Object.freeze([
    Object.freeze({ code: "goods", label: "Adquisición de bienes · revisión" }),
    Object.freeze({ code: "services", label: "Prestación de servicios · revisión" }),
    Object.freeze({ code: "leasing", label: "Uso o goce temporal · revisión" }),
    Object.freeze({ code: "other", label: "Otra operación · revisión" }),
  ]),
  categories: Object.freeze([
    Object.freeze({ code: "taxable", label: "Acto gravado · confirmar categoría/tasa", requiresTransferredVat: true }),
    Object.freeze({ code: "zero", label: "Tasa cero · confirmar categoría", requiresTransferredVat: false }),
    Object.freeze({ code: "exempt", label: "Exento · confirmar categoría", requiresTransferredVat: false }),
    Object.freeze({ code: "import", label: "Importación · confirmar tratamiento", requiresTransferredVat: false }),
  ]),
  globalRule: Object.freeze({
    sourceLabel: "Facilidad de proveedor global consultada en SAT",
    sourceUrl: "https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461172244551&ssbinary=true",
    maximumPeriodSharePercent: 10,
    maximumPerSupplierMx: "50000.00",
    requiresCompletePeriod: true,
  }),
});

export function schemaOption(items, code) {
  return items.find((item) => item.code === code) || null;
}

export function schemaLabel(items, code, fallback = "Pendiente") {
  return schemaOption(items, code)?.label || fallback;
}

export function categoryRequiresTransferredVat(code, schema = DIOT_REVIEW_SCHEMA) {
  return Boolean(schemaOption(schema.categories, code)?.requiresTransferredVat);
}
