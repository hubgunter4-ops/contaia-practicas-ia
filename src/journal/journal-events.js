import { normalizeMoney, subtractMinor, addMinor } from "./money.js";
import { cloneCatalog } from "./catalog.js";
import { validateJournalDraft } from "./validation.js";
import { CFDI_JOURNAL_POLICY, companyRole, normalizeRfc, normalizeUuid, validPeriod } from "./cfdi-policy.js";
import { buildCfdiLifecycle, lifecycleEventKey, stableSnapshotKey } from "./cfdi-lifecycle.js";

const unique = (values) => [...new Set(values)];
const copy = (value) => JSON.parse(JSON.stringify(value));
const datePart = (value) => String(value || "").slice(0, 10);
function validDate(value) {
  const day = datePart(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

function exactMoney(value, errors, label, { positive = false } = {}) {
  // Solo lexemas originales; Number y ausencia nunca se sustituyen por cero.
  const amount = typeof value === "string" && value.length <= 64 && /^\d+(?:\.\d+)?$/.test(value)
    ? normalizeMoney(value, "MXN") : null;
  if (!amount || positive && BigInt(amount.minor) <= 0n) {
    errors.push(`${label}: falta un decimal original utilizable a centavos.`);
    return null;
  }
  return amount;
}

function addLine(draft, accounts, role, side, amount, concept) {
  if (!amount || amount.minor === "0") return;
  const accountId = role.startsWith("payment:")
    ? accounts.paymentForms?.[role.slice(8)] : accounts[role];
  if (!accountId) draft.errors.push(`Configura la cuenta ${role} antes de aprobar.`);
  draft.lines.push({ lineId: `${draft.draftId}:${draft.lines.length + 1}`, accountId: accountId || "",
    side, amount: { ...amount }, concept, amountSource: role });
}

function paymentForm(item, errors) {
  const code = item.formaPagoCode;
  if (!CFDI_JOURNAL_POLICY.supportedPaymentForms.includes(code)) {
    errors.push("Forma de pago no soportada o sin código original: requiere revisión manual.");
  }
  return code || "unknown";
}

function validateVatDetail(tax, errors) {
  const base = exactMoney(tax.base, errors, "Base IVA original");
  if (tax.factor === "Exento") {
    if (tax.amount && !/^0(?:\.0+)?$/.test(tax.amount)) errors.push("IVA exento con importe positivo contradictorio.");
    return { base, amount: null };
  }
  const zero = /^0(?:\.0+)?$/.test(String(tax.rate));
  const sixteen = /^0\.16(?:0*)$/.test(String(tax.rate));
  if (tax.factor !== "Tasa" || !zero && !sixteen) errors.push("Factor o tasa IVA no soportado.");
  const amount = exactMoney(tax.amount, errors, "IVA explícito");
  if (base && amount && (zero || sixteen)) {
    // Compara el impuesto declarado con el producto a centavos, sin modificar la fuente.
    const expected = zero ? 0n : (BigInt(base.minor) * 16n + 50n) / 100n;
    if (BigInt(amount.minor) !== expected) errors.push("Base y tasa IVA no explican el importe declarado.");
  }
  return { base, amount };
}

function invoiceLines(draft, item, role, accounts, lifecycle) {
  if (item.tipo !== "I") {
    draft.errors.push("Solo CFDI I admite reconocimiento PUE/PPD; notas de crédito y otros tipos requieren su motor de ajuste.");
    return;
  }
  const method = item.metodoPago;
  if (!["PUE", "PPD"].includes(method)) draft.errors.push("Método de pago ausente o distinto de PUE/PPD.");
  const isCredit = method === "PPD";
  draft.eventKind = `${role === "issuer" ? "sale" : "purchase"}_${isCredit ? "credit" : "cash"}`;
  draft.ruleId = `${draft.eventKind}-v1`;
  let settlementRole = role === "issuer" ? "receivable" : "payable";
  if (isCredit) {
    if (item.formaPagoCode !== "99") draft.errors.push("PPD requiere revisar la forma de pago: no consta código 99 original.");
  } else {
    settlementRole = `payment:${paymentForm(item, draft.errors)}`;
    if ((lifecycle.paymentsByInvoice.get(normalizeUuid(item.uuid)) || []).length) {
      draft.errors.push("Factura PUE con complemento relacionado: posible doble liquidación; revisión manual obligatoria.");
    }
  }
  const raw = item.rawAmounts || {};
  const total = exactMoney(raw.total, draft.errors, "Total", { positive: true });
  const subtotal = exactMoney(raw.subtotal, draft.errors, "Subtotal");
  const discount = exactMoney(raw.discount, draft.errors, "Descuento");
  let base = null;
  if (subtotal && discount) {
    if (BigInt(discount.minor) > BigInt(subtotal.minor)) draft.errors.push("Descuento mayor que subtotal.");
    else base = { ...subtotal, minor: subtractMinor(subtotal, discount) };
  }
  if (!Array.isArray(item.taxDetails)) draft.errors.push("Falta el desglose original de impuestos; vuelve a analizar los XML.");
  if (!item.taxDetails?.length && !(item.taxObjectCodes?.length && item.taxObjectCodes.every((code) => code === "01"))) {
    draft.errors.push("Sin desglose de impuestos ni evidencia original de ObjetoImp 01: no se presume IVA cero.");
  }
  const taxAmounts = [];
  const taxBases = [];
  for (const tax of item.taxDetails || []) {
    if (tax.kind !== "transfer" || tax.tax !== "002") {
      draft.errors.push("Retenciones o impuestos distintos de IVA requieren política contable adicional; no se omiten automáticamente.");
      continue;
    }
    const { amount, base: taxBase } = validateVatDetail(tax, draft.errors);
    if (taxBase) taxBases.push(taxBase);
    if (amount) taxAmounts.push(amount);
  }
  if (base && taxBases.length && addMinor(taxBases) !== base.minor) draft.errors.push("Las bases IVA explícitas no cubren la base neta de la factura; requiere clasificación manual.");
  const vat = { minor: addMinor(taxAmounts), scale: 2, currency: "MXN", quality: "source_decimal_exact" };
  if (base && total && addMinor([base, vat]) !== total.minor) {
    draft.errors.push("Base neta más IVA explícito no coincide exactamente con Total; no se crea ajuste de redondeo.");
  }
  if (role === "issuer") {
    addLine(draft, accounts, settlementRole, "debit", total, "Cobro / cuenta por cobrar");
    addLine(draft, accounts, "sales", "credit", base, "Venta · base neta, sin duplicar pago");
    addLine(draft, accounts, isCredit ? "outputVatPending" : "outputVat", "credit", vat, "IVA explícito de venta");
  } else {
    addLine(draft, accounts, "purchases", "debit", base, "Compra / gasto · clasificación humana");
    addLine(draft, accounts, isCredit ? "inputVatPending" : "inputVat", "debit", vat, "IVA explícito · revisión fiscal pendiente");
    addLine(draft, accounts, settlementRole, "credit", total, "Pago / cuenta por pagar");
  }
}

function paymentLines(draft, source, role, accounts, lifecycle) {
  const item = source.cfdi;
  draft.eventKind = role === "issuer" ? "customer_collection" : "supplier_payment";
  draft.ruleId = `${draft.eventKind}-v1`;
  const reference = normalizeUuid(item.docRelacionado);
  const linked = lifecycle.invoicesByUuid.get(reference) || [];
  if (linked.length !== 1 || linked[0].cfdi.tipo !== "I") {
    draft.errors.push("El complemento requiere una factura I relacionada única en las fuentes seleccionadas.");
  }
  const invoice = linked.length === 1 ? linked[0].cfdi : null;
  if (invoice) {
    draft.sourceRefs.push(linked[0].sourceId);
    draft.sources.push({ sourceId: linked[0].sourceId, label: linked[0].label, kind: "invoice", eventKind: "relation_evidence_only" });
    if (companyRole(invoice, draft.businessRfc) !== role
      || normalizeRfc(invoice.rfcEmisor) !== normalizeRfc(item.rfcEmisor)
      || normalizeRfc(invoice.rfcReceptor) !== normalizeRfc(item.rfcReceptor)) {
      draft.errors.push("RFC y papel de empresa no coinciden entre factura y complemento.");
    }
    if (invoice.metodoPago !== "PPD") draft.errors.push("Complemento ligado a factura no PPD: posible doble cobro/pago.");
    if (invoice.formaPagoCode !== "99") draft.errors.push("La factura PPD relacionada no conserva forma 99 original.");
    if (["canceled", "cancellation_pending"].includes(invoice.cancellationStatus)) draft.errors.push("La factura relacionada está cancelada o en cancelación pendiente.");
    if (invoice.moneda !== "MXN") draft.errors.push("La moneda de la factura ligada no es MXN.");
    if (!validDate(invoice.fecha) || datePart(item.fechaPago) < datePart(invoice.fecha)) {
      draft.errors.push("Fecha de factura inválida o posterior al pago.");
    }
    if (datePart(invoice.fecha).slice(0, 7) !== draft.period) draft.warnings.push("La factura relacionada pertenece a otro periodo; se usa solo como evidencia del saldo.");
  }
  if (item.monedaPago !== "MXN" || item.moneda !== "MXN") {
    draft.errors.push("Pago y documento relacionado deben ser MXN; la conversión de divisas no está habilitada.");
  }
  if (item.equivalenciaDR && !/^1(?:\.0+)?$/.test(item.equivalenciaDR)) {
    draft.errors.push("EquivalenciaDR incompatible con las monedas MXN seleccionadas.");
  }
  if (!/^[1-9]\d*$/.test(String(item.numParcialidad || "")) || !Number.isSafeInteger(Number(item.numParcialidad))) draft.errors.push("Falta una parcialidad original válida.");
  if (![item.paymentIndex, item.relatedIndex].every((ordinal) => Number.isSafeInteger(ordinal) && ordinal > 0)) draft.errors.push("Faltan ordinales originales de Pago/DoctoRelacionado; vuelve a analizar el XML.");
  const code = paymentForm(item, draft.errors);
  const raw = item.rawAmounts || {};
  const paid = exactMoney(raw.paid, draft.errors, "ImpPagado", { positive: true });
  const prior = exactMoney(raw.prior, draft.errors, "ImpSaldoAnt", { positive: true });
  const remaining = exactMoney(raw.remaining, draft.errors, "ImpSaldoInsoluto");
  const paymentTotal = exactMoney(item.montoPago, draft.errors, "Monto original del Pago", { positive: true });
  const allocations = [...lifecycle.paymentsByInvoice.values()].flat().filter((entry) =>
    normalizeUuid(entry.cfdi.uuid) === normalizeUuid(item.uuid) && entry.cfdi.paymentIndex === item.paymentIndex);
  const allocationKeys = new Set();
  const allocationAmounts = [];
  for (const allocation of allocations) {
    const key = lifecycleEventKey(allocation);
    if (allocationKeys.has(key)) { draft.errors.push("Pago con ocurrencias duplicadas en su distribución."); continue; }
    allocationKeys.add(key);
    if (allocation.cfdi.moneda !== "MXN" || allocation.cfdi.monedaPago !== "MXN") draft.errors.push("El Pago incluye una distribución en otra moneda no soportada.");
    const amount = exactMoney(allocation.cfdi.rawAmounts?.paid, draft.errors, "Distribución del Pago");
    if (amount) allocationAmounts.push(amount);
  }
  if (paymentTotal && addMinor(allocationAmounts) !== paymentTotal.minor) draft.errors.push("La suma de documentos relacionados no coincide con Monto del Pago.");
  if (paid && prior && remaining && (BigInt(paid.minor) > BigInt(prior.minor)
    || subtractMinor(prior, paid) !== remaining.minor)) {
    draft.errors.push("Saldo anterior menos pagado no coincide con saldo insoluto.");
  }
  const total = invoice && exactMoney(invoice.rawAmounts?.total, draft.errors, "Total factura ligada", { positive: true });
  if (total && prior && BigInt(prior.minor) > BigInt(total.minor)) draft.errors.push("Saldo anterior superior al total de la factura.");
  const linkedPayments = lifecycle.paymentsByInvoice.get(reference) || [];
  const seenEvents = new Set();
  let cumulative = 0n;
  const byInstallment = new Map();
  for (const other of linkedPayments) {
    const eventKey = lifecycleEventKey(other);
    if (seenEvents.has(eventKey)) { draft.errors.push("El historial de la factura contiene un pago duplicado."); continue; }
    seenEvents.add(eventKey);
    const otherPaid = exactMoney(other.cfdi.rawAmounts?.paid, draft.errors, "Pago acumulado");
    if (otherPaid) cumulative += BigInt(otherPaid.minor);
    const installment = String(other.cfdi.numParcialidad || "");
    if (byInstallment.has(installment)) draft.errors.push("Parcialidad repetida para la misma factura: relación ambigua.");
    byInstallment.set(installment, other.cfdi);
  }
  if (total && cumulative > BigInt(total.minor)) draft.errors.push("Los pagos acumulados exceden el total de la factura.");
  const previous = byInstallment.get(String(Number(item.numParcialidad) - 1));
  if (previous && prior) {
    const previousRemaining = exactMoney(previous.rawAmounts?.remaining, draft.errors, "Saldo de parcialidad anterior");
    if (previousRemaining && previousRemaining.minor !== prior.minor) draft.errors.push("La cadena de saldos entre parcialidades no coincide.");
    if (datePart(previous.fechaPago) > datePart(item.fechaPago)) draft.errors.push("Las fechas de parcialidades están fuera de secuencia.");
  } else if (Number(item.numParcialidad) > 1) {
    draft.warnings.push("No está disponible la parcialidad anterior; el historial de saldo está incompleto.");
  } else if (total && prior && total.minor !== prior.minor) {
    draft.errors.push("Primera parcialidad con saldo anterior distinto del total: falta evidencia de ajuste.");
  }
  if (role === "issuer") {
    addLine(draft, accounts, `payment:${code}`, "debit", paid, "Cobro de complemento · no es otra venta");
    addLine(draft, accounts, "receivable", "credit", paid, "Liquidación de Clientes");
  } else {
    addLine(draft, accounts, "payable", "debit", paid, "Liquidación de Proveedores");
    addLine(draft, accounts, `payment:${code}`, "credit", paid, "Pago de complemento · no es otro gasto");
  }
  if (!["01", "02"].includes(item.objetoImpDR)) draft.errors.push("ObjetoImpDR ausente o no soportado; requiere revisión.");
  if (!Array.isArray(item.taxDetails)) draft.errors.push("No hay desglose DR original; no se usa IVA estimado.");
  if (item.objetoImpDR === "02" && !item.taxDetails?.length) draft.errors.push("Documento objeto de impuesto sin desglose DR explícito.");
  let vatTotal = 0n;
  const drBases = [];
  for (const tax of item.taxDetails || []) {
    if (tax.kind !== "transfer" || tax.tax !== "002") {
      draft.errors.push("Retenciones/IEPS DR requieren una política adicional.");
      continue;
    }
    if (item.objetoImpDR === "01") draft.errors.push("ObjetoImpDR 01 con impuestos DR: evidencia contradictoria.");
    const { amount: vat, base: drBase } = validateVatDetail(tax, draft.errors);
    if (drBase) drBases.push(drBase);
    if (vat) vatTotal += BigInt(vat.minor);
    if (vat && /^0(?:\.0+)?$/.test(tax.rate) && vat.minor !== "0") draft.errors.push("IVA DR a tasa cero con importe distinto de cero.");
    if (role === "issuer") {
      addLine(draft, accounts, "outputVatPending", "debit", vat, "Reclasificación IVA pendiente · sin nuevo ingreso");
      addLine(draft, accounts, "outputVat", "credit", vat, "IVA cobrado según DR explícito");
    } else {
      addLine(draft, accounts, "inputVat", "debit", vat, "IVA pagado según DR · no determina acreditamiento");
      addLine(draft, accounts, "inputVatPending", "credit", vat, "Reclasificación IVA pendiente · sin nuevo gasto");
    }
  }
  if (paid && vatTotal > BigInt(paid.minor)) draft.errors.push("IVA DR superior al pago aplicado.");
  if (paid && item.taxDetails?.length && BigInt(addMinor(drBases)) + vatTotal !== BigInt(paid.minor)) {
    draft.errors.push("Las bases e impuestos DR no explican el importe pagado; requiere revisión de la distribución.");
  }
  if (invoice) {
    if (!Array.isArray(invoice.taxDetails)) draft.errors.push("La factura ligada no conserva impuestos originales para cotejar el IVA.");
    const invoiceVat = [];
    for (const tax of invoice.taxDetails || []) {
      if (tax.kind === "transfer" && tax.tax === "002" && tax.factor !== "Exento") {
        const amount = exactMoney(tax.amount, draft.errors, "IVA factura ligada");
        if (amount) invoiceVat.push(amount);
      } else if (tax.kind === "retention" || tax.tax !== "002") draft.errors.push("La factura ligada contiene impuestos no soportados.");
    }
    const appliedVat = [];
    const seen = new Set();
    for (const payment of linkedPayments) {
      const key = lifecycleEventKey(payment);
      if (seen.has(key)) continue;
      seen.add(key);
      for (const tax of payment.cfdi.taxDetails || []) {
        if (tax.kind === "transfer" && tax.tax === "002" && tax.factor !== "Exento") {
          const amount = exactMoney(tax.amount, draft.errors, "IVA acumulado en complementos");
          if (amount) appliedVat.push(amount);
        }
      }
    }
    if (BigInt(addMinor(appliedVat)) > BigInt(addMinor(invoiceVat))) draft.errors.push("IVA aplicado en complementos superior al IVA de la factura.");
    if (BigInt(addMinor(invoiceVat)) > 0n && item.objetoImpDR === "01") draft.errors.push("Factura gravada con REP declarado no objeto de impuesto; requiere revisión del desglose.");
  }
}

const CREDIT_NOTE_APPLICATIONS = new Set(["reduce_balance", "refund", "compensation"]);

function creditNoteLines(draft, source, role, accounts, lifecycle, application = "") {
  const item = source.cfdi;
  draft.eventKind = role === "issuer" ? "issuer_credit_note" : "supplier_credit_note";
  draft.ruleId = `${draft.eventKind}-v1`;
  const creditRelations = (Array.isArray(item.cfdiRelations) ? item.cfdiRelations : [])
    .filter((relation) => relation.type === "01")
    .flatMap((relation) => relation.uuids || [])
    .map(normalizeUuid).filter(Boolean);
  if (creditRelations.length !== 1) draft.errors.push("La nota de crédito requiere una relación 01 y un documento original único.");
  const reference = creditRelations[0] || "";
  const candidates = (lifecycle.invoicesByUuid.get(reference) || []).filter((entry) => entry.cfdi.tipo === "I");
  if (candidates.length !== 1) draft.errors.push("La nota de crédito requiere una factura I relacionada única dentro de las fuentes seleccionadas.");
  const invoice = candidates.length === 1 ? candidates[0].cfdi : null;
  if (candidates.length === 1) {
    draft.sourceRefs.push(candidates[0].sourceId);
    draft.sources.push({ sourceId: candidates[0].sourceId, label: candidates[0].label, kind: "invoice", eventKind: "adjustment_evidence_only" });
    if (companyRole(invoice, draft.businessRfc) !== role) draft.errors.push("El RFC y el papel de empresa no coinciden entre nota de crédito y factura relacionada.");
    if (invoice.moneda !== "MXN") draft.errors.push("La factura relacionada de la nota no es MXN; no hay conversión automática.");
    if (!validDate(invoice.fecha)) draft.errors.push("La factura relacionada de la nota tiene fecha inválida.");
    else if (datePart(invoice.fecha).slice(0, 7) !== draft.period) draft.warnings.push("La factura relacionada pertenece a otro periodo; se usa como evidencia del ajuste.");
    if (["canceled", "cancellation_pending"].includes(invoice.cancellationStatus)) draft.errors.push("La factura relacionada está cancelada o en cancelación pendiente.");
  }
  if (!CREDIT_NOTE_APPLICATIONS.has(application)) draft.errors.push("Elige la aplicación humana de la nota: reducir saldo, devolución o compensación.");
  const raw = item.rawAmounts || {};
  const total = exactMoney(raw.total, draft.errors, "Total de nota de crédito", { positive: true });
  const subtotal = exactMoney(raw.subtotal, draft.errors, "Subtotal de nota de crédito");
  const discount = exactMoney(raw.discount, draft.errors, "Descuento de nota de crédito");
  let base = null;
  if (subtotal && discount) {
    if (BigInt(discount.minor) > BigInt(subtotal.minor)) draft.errors.push("Descuento de nota de crédito mayor que subtotal.");
    else base = { ...subtotal, minor: subtractMinor(subtotal, discount) };
  }
  if (!Array.isArray(item.taxDetails)) draft.errors.push("Falta el desglose original de impuestos de la nota de crédito.");
  if (!item.taxDetails?.length && !(item.taxObjectCodes?.length && item.taxObjectCodes.every((code) => code === "01"))) {
    draft.errors.push("Nota de crédito sin impuestos explícitos ni evidencia original de ObjetoImp 01; no se presume IVA cero.");
  }
  const taxAmounts = [];
  const taxBases = [];
  for (const tax of item.taxDetails || []) {
    if (tax.kind !== "transfer" || tax.tax !== "002") {
      draft.errors.push("Retenciones o impuestos distintos de IVA en la nota requieren una política adicional.");
      continue;
    }
    const { amount, base: taxBase } = validateVatDetail(tax, draft.errors);
    if (taxBase) taxBases.push(taxBase);
    if (amount) taxAmounts.push(amount);
  }
  if (base && taxBases.length && addMinor(taxBases) !== base.minor) draft.errors.push("Las bases IVA explícitas no cubren la base neta de la nota de crédito.");
  const vat = { minor: addMinor(taxAmounts), scale: 2, currency: "MXN", quality: "source_decimal_exact" };
  if (base && total && addMinor([base, vat]) !== total.minor) draft.errors.push("Base neta más IVA explícito no coincide con el total de la nota de crédito.");
  if (invoice && total) {
    const invoiceTotal = exactMoney(invoice.rawAmounts?.total, draft.errors, "Total de factura relacionada", { positive: true });
    if (invoiceTotal && BigInt(total.minor) > BigInt(invoiceTotal.minor)) draft.errors.push("El ajuste excede el total de la factura relacionada.");
    const relatedPayments = lifecycle.paymentsByInvoice.get(reference) || [];
    const paymentAmounts = [];
    for (const payment of relatedPayments) {
      const paid = exactMoney(payment.cfdi.rawAmounts?.paid, draft.errors, "Pago relacionado con la nota");
      if (paid) paymentAmounts.push(paid);
    }
    const otherAdjustments = (lifecycle.adjustmentsByInvoice.get(reference) || []).filter((entry) => entry.sourceId !== source.sourceId);
    const adjustmentAmounts = [];
    for (const adjustment of otherAdjustments) {
      const amount = exactMoney(adjustment.cfdi.rawAmounts?.total, draft.errors, "Otro ajuste relacionado");
      if (amount) adjustmentAmounts.push(amount);
    }
    if (application === "reduce_balance" && invoiceTotal) {
      const alreadyApplied = BigInt(addMinor([...paymentAmounts, ...adjustmentAmounts]));
      const available = BigInt(invoiceTotal.minor) - alreadyApplied;
      if (available < 0n || BigInt(total.minor) > available) draft.errors.push("El ajuste excede el saldo disponible según las fuentes seleccionadas; define devolución o compensación con evidencia.");
    }
  }
  draft.adjustmentApplication = application || "pending";
  const settlementRole = application === "reduce_balance" ? (role === "issuer" ? "receivable" : "payable") : "adjustmentSettlement";
  const applicationLabel = application === "reduce_balance" ? "Aplicación contra saldo relacionado" : application === "refund" ? "Devolución confirmada localmente" : application === "compensation" ? "Compensación confirmada localmente" : "Aplicación pendiente";
  if (role === "issuer") {
    addLine(draft, accounts, "salesDiscount", "debit", base, "Descuento / bonificación sobre ventas");
    addLine(draft, accounts, "outputVatAdjustment", "debit", vat, "Ajuste de IVA trasladado explícito");
    addLine(draft, accounts, settlementRole, "credit", total, applicationLabel);
  } else {
    addLine(draft, accounts, settlementRole, "debit", total, applicationLabel);
    addLine(draft, accounts, "purchasesDiscount", "credit", base, "Descuento / bonificación sobre compras");
    addLine(draft, accounts, "inputVatAdjustment", "credit", vat, "Ajuste de IVA acreditable · revisión fiscal pendiente");
  }
  draft.warnings.push("La aplicación de la nota se decidió localmente; no modifica el CFDI, no confirma devolución y no contabiliza.");
}

export function generateLifecycleDrafts({ sources = [], selectedSourceIds = [], businessRfc = "",
  companyLocalId = "", period = "", accounts = {}, catalog, creditNoteApplications = {} } = {}) {
  const selected = new Set(selectedSourceIds);
  const selectedSources = sources.filter((item) => selected.has(item.sourceId));
  const lifecycle = buildCfdiLifecycle(selectedSources);
  const drafts = [];
  for (const source of selectedSources) {
    if (!source.cfdi) continue; // Banco sigue en su flujo manual; no es otro evento CFDI.
    const item = source.cfdi;
    const role = companyRole(item, businessRfc);
    const eventKey = `${companyLocalId}:${lifecycleEventKey(source)}`;
    const draft = { draftId: `lifecycle:${eventKey}`, eventKey, revision: 1, companyLocalId, period,
      businessRfc: normalizeRfc(businessRfc), companySide: role, ruleVersion: 1, policyVersion: CFDI_JOURNAL_POLICY.version,
      catalogVersion: catalog?.version, sourceRefs: [source.sourceId],
      sources: [{ sourceId: source.sourceId, label: source.label, kind: source.kind, eventKind: source.eventKind }],
      lines: [], errors: [], warnings: [CFDI_JOURNAL_POLICY.disclaimer,
        "Estado de cancelación no verificable con el XML seleccionado; no se consultó al SAT."],
      warningsAcknowledged: false, status: "review", approvedAt: "", createdAt: new Date().toISOString() };
    if (!companyLocalId || !validPeriod(period)) draft.errors.push("Confirma empresa y periodo mensual válido.");
    if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(draft.businessRfc) || role === "ambiguous") {
      draft.errors.push("Confirma un RFC de empresa que identifique emisor o receptor sin ambigüedad.");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalizeUuid(item.uuid))) draft.errors.push("Falta UUID original válido para identificar el evento.");
    if (item.moneda !== "MXN") draft.errors.push("Solo MXN está soportado; no hay conversión automática.");
    const date = source.kind === "payment" ? item.fechaPago : item.fecha;
    if (!validDate(date) || datePart(date).slice(0, 7) !== period) draft.errors.push("Fecha inválida o evento fuera del periodo confirmado.");
    if ((lifecycle.eventCounts.get(lifecycleEventKey(source)) || 0) > 1) draft.errors.push("Ocurrencia CFDI duplicada; resuelve el conflicto de origen antes de aprobar.");
    const reference = normalizeUuid(source.kind === "payment" ? item.docRelacionado : item.uuid);
    if (item.tipo !== "E" && lifecycle.adjustmentsByInvoice.has(reference)) draft.warnings.push("La factura tiene un CFDI E relacionado; revisa el ajuste como evento separado para evitar doble conteo.");
    if (["canceled", "cancellation_pending"].includes(item.cancellationStatus)) draft.errors.push("La fuente está cancelada o con cancelación pendiente.");
    if (source.kind === "payment") paymentLines(draft, source, role, accounts, lifecycle);
    else if (item.tipo === "E") creditNoteLines(draft, source, role, accounts, lifecycle, creditNoteApplications[source.sourceId]?.application);
    else invoiceLines(draft, item, role, accounts, lifecycle);
    if (source.kind === "payment" && !lifecycle.invoicesByUuid.has(reference)
      && sources.some((entry) => entry.cfdi && normalizeUuid(entry.cfdi.uuid) === reference)) {
      draft.errors.push("Factura relacionada fuera del alcance actual: selecciónala explícitamente para revisar este pago.");
    }
    draft.errors = unique(draft.errors);
    draft.warnings = unique(draft.warnings);
    draft.evidenceSnapshot = copy(sources.filter((entry) => draft.sourceRefs.includes(entry.sourceId)).map((entry) => entry.cfdi));
    draft.catalogSnapshot = cloneCatalog(catalog);
    draft.accountsSnapshot = copy(accounts);
    draft.generationKey = stableSnapshotKey({ eventKey, evidence: draft.evidenceSnapshot, accounts, catalog: draft.catalogSnapshot, period, businessRfc: draft.businessRfc });
    draft.validation = validateJournalDraft(draft, catalog);
    drafts.push(draft);
  }
  return drafts;
}

export function mergeLifecycleDrafts(existing, generated) {
  const result = [...existing];
  for (const draft of generated) {
    const index = result.findIndex((entry) => entry.eventKey === draft.eventKey);
    if (index < 0) { result.push(draft); continue; }
    const previous = result[index];
    if (previous.generationKey === draft.generationKey) continue;
    result[index] = { ...draft, revision: (previous.revision || 1) + 1,
      previousRevision: copy(previous), draftId: previous.draftId };
  }
  return result;
}
