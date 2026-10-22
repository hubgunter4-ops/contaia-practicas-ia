import { buildCfdiLifecycle, lifecycleEventKey, stableSnapshotKey } from "./cfdi-lifecycle.js";
import { CFDI_JOURNAL_POLICY, companyRole, normalizeRfc, normalizeUuid, validPeriod } from "./cfdi-policy.js";
import { normalizeMoney, subtractMinor } from "./money.js";

export const AUDIT_POLICY = Object.freeze({
  version: "cfdi-audit-local-v1",
  label: "CFDI 4.0 / REP 2.0 / reglas locales",
  disclaimer: "Reporte local de revisión. No es auditoría certificada, validación SAT ni determinación fiscal.",
});

export const AUDIT_SEVERITIES = Object.freeze(["blocking", "high", "review", "info"]);
const severityRank = Object.freeze({ blocking: 0, high: 1, review: 2, info: 3 });
const copy = (value) => JSON.parse(JSON.stringify(value));
const datePart = (value) => String(value || "").slice(0, 10);
const sourceDate = (source) => datePart(source?.kind === "payment" ? source.cfdi?.fechaPago : source?.cfdi?.fecha);
const sourceType = (source) => String(source?.cfdi?.tipo || "");
const normalizedText = (value) => String(value || "").trim().toLowerCase();
const localKey = (value) => {
  let hash = 2166136261;
  for (const character of stableSnapshotKey(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16);
};

function exactMoney(value, currency = "MXN") {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? normalizeMoney(value, currency) : null;
}

function documentLabel(source) {
  const item = source?.cfdi || {};
  return item.serieFolio || item.uuid || source?.label || "Documento sin identificador";
}

function sourceSnapshot(source, businessRfc) {
  const item = source?.cfdi || {};
  return {
    sourceId: source?.sourceId || "",
    uuid: item.uuid || "",
    type: item.tipo || "",
    label: documentLabel(source),
    date: sourceDate(source),
    currency: item.moneda || "",
    role: companyRole(item, businessRfc),
    relation: item.docRelacionado || item.cfdiRelacionado || "",
    source: source?.evidence?.source || "Fuente local",
  };
}

function finding({ code, severity = "review", source, related = [], message, reason, expected = "", observed = "", recommendedAction, scope, businessRfc, decisions = {}, forcedStatus = "" }) {
  const sourceIds = [source, ...related].filter(Boolean).map((entry) => entry.sourceId).sort();
  const findingId = `finding:${code}:${localKey({ code, sourceIds, expected, observed, scope: scope.id })}`;
  const decision = decisions[findingId] || {};
  return {
    findingId, code, severity: AUDIT_SEVERITIES.includes(severity) ? severity : "review",
    scope: scope.kind,
    status: forcedStatus || decision.status || "open",
    decisionNote: decision.note || "",
    documentRefs: sourceIds,
    eventRefs: [source, ...related].filter(Boolean).map((entry) => lifecycleEventKey(entry)),
    source: sourceSnapshot(source, businessRfc),
    related: related.filter(Boolean).map((entry) => sourceSnapshot(entry, businessRfc)),
    message, reason, expected, observed,
    recommendedAction: recommendedAction || "Revisa el XML y conserva una decisión humana local.",
    evidenceRefs: [source, ...related].filter(Boolean).map((entry) => ({ sourceId: entry.sourceId, origin: entry.evidence?.source || "Fuente local", reference: entry.evidence?.reference || entry.evidence?.folio || "" })),
  };
}

function relationshipIndex(sources) {
  const invoices = new Map();
  const payments = new Map();
  for (const source of sources) {
    if (!source?.cfdi) continue;
    if (source.kind === "payment") {
      const reference = normalizeUuid(source.cfdi.docRelacionado);
      if (reference) (payments.get(reference) || payments.set(reference, []).get(reference)).push(source);
    } else {
      const uuid = normalizeUuid(source.cfdi.uuid);
      if (uuid) (invoices.get(uuid) || invoices.set(uuid, []).get(uuid)).push(source);
    }
  }
  return { invoices, payments };
}

function relationState(reference, allIndex, scopeIds) {
  const all = allIndex.invoices.get(normalizeUuid(reference)) || [];
  const inScope = all.filter((source) => scopeIds.has(source.sourceId));
  if (!all.length) return { kind: "missing", all, inScope };
  if (!inScope.length) return { kind: "out_of_scope", all, inScope };
  if (inScope.length !== 1) return { kind: "ambiguous", all, inScope };
  return { kind: "available", all, inScope };
}

function moneyAmount(source, field, fallback) {
  const item = source?.cfdi || {};
  const text = item.rawAmounts?.[field] ?? item[fallback];
  return exactMoney(text, item.moneda || "MXN");
}

function hasTaxEvidence(item) {
  if (!Array.isArray(item?.taxDetails)) return false;
  if (item.taxDetails.length) return true;
  return Array.isArray(item.taxObjectCodes) && item.taxObjectCodes.length > 0 && item.taxObjectCodes.every((code) => code === "01");
}

function currentDraftsFor(source, drafts) {
  return (Array.isArray(drafts) ? drafts : []).filter((draft) => Array.isArray(draft.sourceRefs) && draft.sourceRefs.includes(source.sourceId));
}

function sourceFingerprint(source) {
  const item = source?.cfdi || {};
  return stableSnapshotKey({ uuid: item.uuid, tipo: item.tipo, date: sourceDate(source), currency: item.moneda, rawAmounts: item.rawAmounts, rfcEmisor: item.rfcEmisor, rfcReceptor: item.rfcReceptor, relations: item.cfdiRelations, payment: item.docRelacionado ? { doc: item.docRelacionado, ordinal: [item.paymentIndex, item.relatedIndex], paid: item.rawAmounts?.paid } : null });
}

export function buildCfdiAudit({ sources = [], scopeSourceIds = [], availableSourceIds = scopeSourceIds, businessRfc = "", period = "", drafts = [], decisions = {} } = {}) {
  const allSources = (Array.isArray(sources) ? sources : []).filter((source) => source?.cfdi);
  const scopeIds = new Set(scopeSourceIds);
  const availableIds = new Set(availableSourceIds);
  const scopeSources = allSources.filter((source) => scopeIds.has(source.sourceId));
  const availableSources = allSources.filter((source) => availableIds.has(source.sourceId));
  const scope = { id: localKey({ scopeSourceIds: [...scopeIds].sort(), period, businessRfc }), kind: scopeIds.size === availableIds.size ? "global" : "partial" };
  const findings = [];
  const add = (input) => findings.push(finding({ ...input, scope, businessRfc, decisions }));
  const allIndex = relationshipIndex(allSources);
  const availableIndex = relationshipIndex(availableSources);
  const lifecycle = buildCfdiLifecycle(scopeSources);
  const rfc = normalizeRfc(businessRfc);

  if (!scopeSources.length) {
    return { policy: AUDIT_POLICY, status: "empty", scope: { ...scope, sourceCount: 0, documentCount: 0, paymentCount: 0, adjustmentCount: 0, period, businessRfc: rfc, rulesApplied: [] }, findings: [], summary: { bySeverity: {}, openCount: 0, outOfScopeCount: 0, coverage: { recognized: 0, liquidated: 0, adjusted: 0 } } };
  }
  if (!rfc || !validPeriod(period)) {
    const source = scopeSources[0];
    add({ code: "CFDI-CONTEXT-001", severity: "blocking", source, message: "Falta confirmar RFC de empresa o periodo mensual.", reason: "La auditoría no puede atribuir papeles ni delimitar el alcance.", expected: "RFC válido y periodo AAAA-MM", observed: `${rfc || "RFC pendiente"} · ${period || "periodo pendiente"}`, recommendedAction: "Confirma el contexto local antes de interpretar el resultado." });
  }

  const invoiceByUuid = new Map();
  for (const source of scopeSources.filter((entry) => entry.kind !== "payment")) {
    const uuid = normalizeUuid(source.cfdi.uuid);
    if (uuid) (invoiceByUuid.get(uuid) || invoiceByUuid.set(uuid, []).get(uuid)).push(source);
  }
  for (const [uuid, entries] of invoiceByUuid) {
    if (entries.length < 2) continue;
    const unique = new Set(entries.map(sourceFingerprint));
    if (unique.size > 1) add({ code: "CFDI-DUP-001", severity: "blocking", source: entries[0], related: entries.slice(1), message: "UUID repetido con contenido incompatible.", reason: "No se aplica la regla «último gana».", expected: "Una identidad CFDI por contenido compatible", observed: `${entries.length} fuentes con UUID ${uuid}`, recommendedAction: "Conserva la fuente correcta y excluye duplicados con una decisión humana." });
    else add({ code: "CFDI-DUP-001", severity: "review", source: entries[0], related: entries.slice(1), message: "UUID repetido dentro del alcance.", reason: "La misma evidencia puede duplicar eventos o pólizas.", expected: "Una ocurrencia por UUID", observed: `${entries.length} fuentes equivalentes`, recommendedAction: "Revisa el lote y conserva una sola evidencia para generar propuestas." });
  }

  for (const source of scopeSources) {
    const item = source.cfdi;
    const type = sourceType(source);
    const role = companyRole(item, rfc);
    const draftsForSource = currentDraftsFor(source, drafts);
    if (role === "ambiguous") add({ code: "CFDI-I-ROLE-001", severity: "high", source, message: "El emisor/receptor no permite confirmar el papel de la empresa.", reason: "No se puede elegir una plantilla de venta o compra por inferencia.", expected: "Empresa identificada solo como emisor o receptor", observed: `${item.rfcEmisor || "sin RFC emisor"} / ${item.rfcReceptor || "sin RFC receptor"}`, recommendedAction: "Confirma el RFC de la empresa o excluye esta fuente de la preparación." });
    if (!item.cancellationStatus || item.cancellationStatus === "unknown") add({ code: "CFDI-CANCEL-001", severity: "info", source, message: "Estado de cancelación no verificable con las fuentes seleccionadas.", reason: "El XML local no prueba vigencia o cancelación ante el SAT.", expected: "Evidencia autorizada de estado", observed: item.cancellationEvidence || "solo XML local", recommendedAction: "Conserva esta limitación; una consulta SAT requeriría autorización e integración separadas." });
    if (item.moneda !== "MXN") add({ code: "CFDI-MONEY-001", severity: "blocking", source, message: "La fuente usa moneda ausente o no soportada por el motor local.", reason: "No hay conversión automática habilitada.", expected: "MXN con importe exacto", observed: item.moneda || "moneda pendiente", recommendedAction: "Revisa la fuente o usa una política de divisas autorizada." });
    if ((type === "I" || type === "E") && !hasTaxEvidence(item)) add({ code: "CFDI-TAX-001", severity: "blocking", source, message: "No hay desglose fiscal original suficiente para la plantilla.", reason: "No se presume IVA cero ni se estima el impuesto.", expected: "Impuestos explícitos o ObjetoImp 01 original", observed: "desglose ausente", recommendedAction: "Vuelve a analizar el XML original o conserva el documento fuera de la póliza." });
    if (!draftsForSource.length && ["I", "E", "P"].includes(type)) add({ code: "CFDI-POL-001", severity: "info", source, message: "Documento elegible sin póliza sugerida en esta sesión.", reason: "La auditoría no crea ni aprueba pólizas automáticamente.", expected: "Borrador explicable o exclusión humana", observed: "sin propuesta local", recommendedAction: "Configura cuentas, decide aplicación si corresponde y genera la propuesta." });
    for (const draft of draftsForSource) {
      if (!Array.isArray(draft.evidenceSnapshot) || !draft.evidenceSnapshot.length) add({ code: "CFDI-POL-001", severity: "blocking", source, message: "La póliza sugerida no conserva evidencia fiscal local.", reason: "No puede aprobarse un borrador sin snapshot de fuentes.", expected: "Snapshot de CFDI relacionado", observed: `Borrador ${draft.draftId}`, recommendedAction: "Genera una nueva revisión desde fuentes seleccionadas." });
    }

    if (type === "I") {
      const uuid = normalizeUuid(item.uuid);
      const allPayments = allIndex.payments.get(uuid) || [];
      const availablePayments = availableIndex.payments.get(uuid) || [];
      const scopedPayments = allPayments.filter((entry) => scopeIds.has(entry.sourceId));
      if (item.metodoPago === "PPD") {
        if (!allPayments.length) add({ code: "CFDI-I-PPD-001", severity: "review", source, message: "Factura PPD sin complemento de pago disponible en las fuentes.", reason: "Es una revisión de cobertura; no prueba que nunca se haya pagado.", expected: "Complemento relacionado o evidencia fuera del alcance", observed: "sin CFDI P local", recommendedAction: "Carga el complemento si corresponde o documenta la cobertura incompleta." });
        else if (!availablePayments.length) add({ code: "CFDI-P-REL-002", severity: "review", source, related: allPayments, message: "El complemento relacionado está fuera de las fuentes seleccionadas.", reason: "No se concluye que falte una relación.", expected: "Complemento dentro de fuentes seleccionadas", observed: `${allPayments.length} relación(es) local(es) fuera de selección`, recommendedAction: "Incluye el complemento si debe formar parte de esta preparación.", forcedStatus: "out_of_scope" });
        else if (!scopedPayments.length) add({ code: "CFDI-P-REL-002", severity: "review", source, related: availablePayments, message: "El complemento relacionado está fuera del alcance parcial actual.", reason: "El filtro no convierte una relación existente en relación ausente.", expected: "Complemento dentro del alcance parcial", observed: `${availablePayments.length} relación(es) en alcance global`, recommendedAction: "Amplía filtros para revisar la liquidación.", forcedStatus: "out_of_scope" });
        if (item.formaPagoCode !== "99") add({ code: "CFDI-I-PAY-001", severity: "review", source, message: "Factura PPD con forma de pago distinta de 99.", reason: "La auditoría conserva la evidencia sin corregirla.", expected: "PPD con forma 99 en el XML", observed: item.formaPagoCode || "sin forma", recommendedAction: "Verifica el CFDI y la política vigente antes de generar la póliza." });
      }
      if (item.metodoPago === "PUE") {
        if (item.formaPagoCode === "99") add({ code: "CFDI-I-PAY-001", severity: "review", source, message: "Factura PUE con forma de pago 99.", reason: "Método y forma requieren revisión, no corrección automática.", expected: "Forma de pago compatible con PUE", observed: "99 · Por definir", recommendedAction: "Verifica la evidencia del CFDI antes de tratarla como contado." });
        if (allPayments.length && !scopedPayments.length) add({ code: "CFDI-I-PUE-001", severity: "review", source, related: availablePayments.length ? availablePayments : allPayments, message: "Factura PUE con complemento relacionado fuera del alcance actual.", reason: "Puede existir doble conteo o cambio de condición; no se concluye sin revisar ambas fuentes.", expected: "Una sola explicación del evento", observed: "CFDI P relacionado fuera de vista", recommendedAction: "Incluye el complemento o documenta la excepción.", forcedStatus: "out_of_scope" });
        if (scopedPayments.length) add({ code: "CFDI-I-PUE-001", severity: "high", source, related: scopedPayments, message: "Factura PUE con complemento de pago relacionado.", reason: "Podría duplicarse la liquidación de una operación de contado.", expected: "Evento PUE sin REP adicional", observed: `${scopedPayments.length} complemento(s) en alcance`, recommendedAction: "Revisa el ciclo y decide cuál evento representa la evidencia correcta." });
      }
    }

    if (source.kind === "payment" || type === "P") {
      const reference = normalizeUuid(item.docRelacionado);
      const relation = relationState(reference, allIndex, scopeIds);
      if (relation.kind === "missing") add({ code: "CFDI-P-REL-001", severity: "blocking", source, message: "Complemento sin documento relacionado disponible.", reason: "No se puede liquidar Clientes o Proveedores sin la factura única relacionada.", expected: "Factura I relacionada en las fuentes", observed: item.docRelacionado || "UUID pendiente", recommendedAction: "Carga la factura relacionada o excluye el complemento de esta preparación." });
      if (relation.kind === "out_of_scope") add({ code: "CFDI-P-REL-002", severity: "review", source, related: relation.all, message: "Factura relacionada fuera del alcance actual.", reason: "La relación existe en memoria pero el filtro/selección actual no la incluye.", expected: "Factura dentro del alcance", observed: `${relation.all.length} fuente(s) fuera de alcance`, recommendedAction: "Amplía el alcance antes de validar la liquidación.", forcedStatus: "out_of_scope" });
      if (relation.kind === "ambiguous") add({ code: "CFDI-P-REL-001", severity: "blocking", source, related: relation.inScope, message: "El complemento tiene más de una factura candidata dentro del alcance.", reason: "No se decide qué fuente gana por orden de lista.", expected: "Una factura I única", observed: `${relation.inScope.length} candidatas`, recommendedAction: "Resuelve el duplicado de evidencia antes de generar la póliza." });
      const prior = moneyAmount(source, "prior", "saldoAnterior");
      const paid = moneyAmount(source, "paid", "impPagado");
      const remaining = moneyAmount(source, "remaining", "saldoInsoluto");
      if (!prior || !paid || !remaining || BigInt(paid.minor) > BigInt(prior.minor) || subtractMinor(prior, paid) !== remaining.minor) add({ code: "CFDI-P-BAL-001", severity: "blocking", source, message: "El saldo del complemento no cuadra con saldo anterior − importe pagado.", reason: "El motor no repara valores XML ni sustituye importes faltantes.", expected: "ImpSaldoAnt − ImpPagado = ImpSaldoInsoluto", observed: `${item.rawAmounts?.prior || "—"} − ${item.rawAmounts?.paid || "—"} = ${item.rawAmounts?.remaining || "—"}`, recommendedAction: "Revisa la ocurrencia Pago/DoctoRelacionado original." });
      if (relation.kind === "available" && paid) {
        const invoice = relation.inScope[0];
        const invoiceTotal = moneyAmount(invoice, "total", "total");
        if (invoiceTotal && BigInt(paid.minor) > BigInt(invoiceTotal.minor)) add({ code: "CFDI-P-BAL-002", severity: "high", source, related: [invoice], message: "El importe pagado excede el total de la factura relacionada.", reason: "No se interpreta como devolución o ajuste sin evidencia adicional.", expected: `≤ ${invoice.cfdi.rawAmounts?.total || "total factura"}`, observed: item.rawAmounts?.paid || "importe pendiente", recommendedAction: "Revisa notas de crédito, devoluciones o duplicidad antes de liquidar." });
        if (item.moneda !== invoice.cfdi.moneda || item.monedaPago !== invoice.cfdi.moneda) {
          if (!item.equivalenciaDR || !/^\d+(?:\.\d+)?$/.test(item.equivalenciaDR)) add({ code: "CFDI-P-CUR-001", severity: "blocking", source, related: [invoice], message: "Pago y documento relacionado usan monedas que requieren equivalencia verificable.", reason: "La conversión automática no está habilitada.", expected: "EquivalenciaDR original válida", observed: item.equivalenciaDR || "sin equivalencia", recommendedAction: "Revisa la evidencia de moneda antes de continuar." });
        }
      }
      if ((lifecycle.eventCounts.get(lifecycleEventKey(source)) || 0) > 1) add({ code: "CFDI-P-DUP-001", severity: "blocking", source, message: "La misma ocurrencia de pago se repite en las fuentes.", reason: "Puede duplicar una liquidación.", expected: "Una ocurrencia Pago/DoctoRelacionado", observed: lifecycleEventKey(source), recommendedAction: "Conserva una sola evidencia de esta ocurrencia." });
      if (item.objetoImpDR === "02" && (!Array.isArray(item.taxDetails) || !item.taxDetails.length)) add({ code: "CFDI-TAX-001", severity: "blocking", source, message: "Documento objeto de impuesto sin desglose DR explícito.", reason: "No se prorratea IVA desde la factura ligada.", expected: "ImpuestosDR originales", observed: "desglose DR ausente", recommendedAction: "Carga el XML completo o deja el evento en revisión." });
    }

    if (type === "E") {
      const relations = Array.isArray(item.cfdiRelations) ? item.cfdiRelations : [];
      const creditRelations = relations.filter((entry) => entry.type === "01").flatMap((entry) => entry.uuids || []);
      if (creditRelations.length !== 1) add({ code: "CFDI-E-REL-001", severity: "blocking", source, message: "Nota de crédito sin una relación 01 única hacia el documento ajustado.", reason: "No se infiere devolución, compensación ni cuenta afectada.", expected: "TipoRelacion 01 y un UUID relacionado", observed: relations.length ? relations.map((entry) => `${entry.type || "sin tipo"}:${(entry.uuids || []).length}`).join(" · ") : "sin relaciones", recommendedAction: "Revisa el XML y confirma la relación antes de proponer el ajuste." });
      for (const reference of creditRelations) {
        const relation = relationState(reference, allIndex, scopeIds);
        if (relation.kind === "missing") add({ code: "CFDI-E-REL-001", severity: "blocking", source, message: "Nota de crédito con documento relacionado no disponible.", reason: "No se puede medir el ajuste frente al saldo/documento origen.", expected: "Documento relacionado dentro de fuentes", observed: reference, recommendedAction: "Carga el CFDI origen o conserva la nota fuera de la preparación." });
        if (relation.kind === "out_of_scope") add({ code: "CFDI-E-REL-001", severity: "review", source, related: relation.all, message: "Documento ajustado fuera del alcance parcial actual.", reason: "La relación existe, pero no se decide su aplicación sin incluir la evidencia.", expected: "Documento relacionado en alcance", observed: reference, recommendedAction: "Amplía los filtros o selección para revisar el ajuste.", forcedStatus: "out_of_scope" });
        if (relation.kind === "available") {
          const target = relation.inScope[0];
          const adjustment = moneyAmount(source, "total", "total");
          const targetTotal = moneyAmount(target, "total", "total");
          if (adjustment && targetTotal && BigInt(adjustment.minor) > BigInt(targetTotal.minor)) add({ code: "CFDI-E-AMT-001", severity: "blocking", source, related: [target], message: "El ajuste excede el importe total del documento relacionado.", reason: "No se fuerza una aplicación parcial ni se crea un saldo negativo.", expected: `≤ ${target.cfdi.rawAmounts?.total || "total origen"}`, observed: item.rawAmounts?.total || "importe pendiente", recommendedAction: "Revisa el documento origen y la aplicación de la nota." });
          if (companyRole(target.cfdi, rfc) !== role) add({ code: "CFDI-E-REL-001", severity: "high", source, related: [target], message: "El papel de empresa no coincide entre nota y documento relacionado.", reason: "La cuenta por cobrar/pagar afectada no es concluyente.", expected: "Mismo papel de empresa en ambos CFDI", observed: `${role} / ${companyRole(target.cfdi, rfc)}`, recommendedAction: "Confirma el RFC y la relación comercial." });
        }
      }
      const application = decisions[`credit:${source.sourceId}`]?.application || "";
      if (!application) add({ code: "CFDI-E-APP-001", severity: "review", source, message: "Nota de crédito sin decisión de aplicación local.", reason: "El XML no prueba por sí mismo si reduce saldo, devuelve dinero o compensa otra obligación.", expected: "Reducir saldo, devolución o compensación elegida por una persona", observed: "aplicación pendiente", recommendedAction: "Elige una aplicación antes de generar la póliza de ajuste." });
      if ((item.formaPagoCode || item.metodoPago) && !application) add({ code: "CFDI-E-PAY-001", severity: "review", source, message: "La nota contiene datos de pago que no explican su aplicación contable.", reason: "No se clasifica como efectivo, transferencia o condonación automáticamente.", expected: "Decisión explícita de aplicación", observed: `${item.metodoPago || "método pendiente"} · ${item.formaPagoCode || "forma pendiente"}`, recommendedAction: "Conserva el dato como evidencia y define la aplicación humana." });
    }
  }

  findings.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || left.code.localeCompare(right.code) || left.findingId.localeCompare(right.findingId));
  const bySeverity = Object.fromEntries(AUDIT_SEVERITIES.map((severity) => [severity, findings.filter((entry) => entry.severity === severity && entry.status === "open").length]));
  const adjustmentSources = scopeSources.filter((source) => sourceType(source) === "E");
  const ppdInvoices = scopeSources.filter((source) => sourceType(source) === "I" && source.cfdi.metodoPago === "PPD");
  const invoices = scopeSources.filter((source) => sourceType(source) === "I");
  const payments = scopeSources.filter((source) => source.kind === "payment");
  return {
    policy: AUDIT_POLICY,
    status: findings.some((entry) => entry.severity === "blocking" && entry.status === "open") ? "review" : "ready",
    scope: { ...scope, sourceCount: scopeSources.length, documentCount: invoices.length + adjustmentSources.length, paymentCount: payments.length, adjustmentCount: adjustmentSources.length, period, businessRfc: rfc, rulesApplied: ["CFDI-I-ROLE-001", "CFDI-P-REL-001", "CFDI-P-BAL-001", "CFDI-E-REL-001", "CFDI-E-APP-001", "CFDI-CANCEL-001", "CFDI-TAX-001"] },
    findings,
    documents: scopeSources.map((source) => sourceSnapshot(source, rfc)),
    summary: {
      bySeverity,
      openCount: findings.filter((entry) => entry.status === "open").length,
      outOfScopeCount: findings.filter((entry) => entry.status === "out_of_scope").length,
      coverage: {
        recognized: invoices.filter((source) => currentDraftsFor(source, drafts).length).length,
        liquidated: payments.filter((source) => currentDraftsFor(source, drafts).length).length,
        adjusted: adjustmentSources.filter((source) => currentDraftsFor(source, drafts).length).length,
        invoices: invoices.length,
        ppdInvoices: ppdInvoices.length,
        adjustments: adjustmentSources.length,
      },
    },
  };
}

export function filterAuditFindings(findings = [], { severity = "all", status = "all" } = {}) {
  return (Array.isArray(findings) ? findings : []).filter((entry) => (severity === "all" || entry.severity === severity) && (status === "all" || entry.status === status));
}

export function auditFindingLabel(finding) {
  return `${finding?.code || "CFDI-REVIEW"} · ${finding?.message || "Revisión local"}`;
}
