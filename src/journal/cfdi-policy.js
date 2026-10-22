export const CFDI_JOURNAL_POLICY = Object.freeze({
  version: "cfdi-pue-ppd-rep-mxn-v1",
  currency: "MXN",
  supportedPaymentForms: ["01", "02", "03", "04", "28", "29"],
  disclaimer: "Propuesta contable local; no determina acreditamiento fiscal ni registra asientos.",
});

export const JOURNAL_ACCOUNT_ROLES = Object.freeze({
  sales: "Ventas · base neta",
  purchases: "Compras / inventario / gastos · base neta",
  receivable: "Clientes",
  payable: "Proveedores",
  outputVat: "IVA trasladado cobrado",
  outputVatPending: "IVA trasladado pendiente de cobro",
  inputVat: "IVA pagado · revisión fiscal pendiente",
  inputVatPending: "IVA pendiente de pago",
  salesDiscount: "Descuentos / bonificaciones sobre ventas",
  purchasesDiscount: "Descuentos / bonificaciones sobre compras",
  outputVatAdjustment: "Ajuste de IVA trasladado",
  inputVatAdjustment: "Ajuste de IVA acreditable · revisión fiscal pendiente",
  adjustmentSettlement: "Devolución o compensación · aplicación confirmada",
});

export const PAYMENT_FORM_LABELS = Object.freeze({
  "01": "Efectivo", "02": "Cheque", "03": "Transferencia",
  "04": "Tarjeta de crédito", "28": "Tarjeta de débito", "29": "Tarjeta de servicios",
});

export function emptyLifecycleAccounts() {
  return { sales: "", purchases: "", receivable: "", payable: "", outputVat: "",
    outputVatPending: "", inputVat: "", inputVatPending: "", salesDiscount: "", purchasesDiscount: "",
    outputVatAdjustment: "", inputVatAdjustment: "", adjustmentSettlement: "", paymentForms: {} };
}

export function normalizeUuid(value) { return String(value || "").trim().toLowerCase(); }
export function normalizeRfc(value) { return String(value || "").trim().toUpperCase(); }

export function companyRole(item, rfc) {
  const company = normalizeRfc(rfc);
  if (!company) return "ambiguous";
  const issuer = normalizeRfc(item?.rfcEmisor) === company;
  const receiver = normalizeRfc(item?.rfcReceptor) === company;
  return issuer === receiver ? "ambiguous" : issuer ? "issuer" : "receiver";
}

export function validPeriod(value) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || "")); }
