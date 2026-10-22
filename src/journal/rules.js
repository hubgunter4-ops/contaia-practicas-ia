import { absMinor, moneyFromMinor, normalizeCurrency } from "./money.js";

export const DEFAULT_JOURNAL_RULES = Object.freeze([
  {
    ruleId: "invoice-sale-example",
    version: 1,
    title: "Factura de ingreso · plantilla de revisión",
    description: "Propone Clientes contra Ventas para una factura cuando la empresa actúa como emisor.",
    sourceKinds: ["invoice"],
    requiredCompanySide: "issuer",
    lines: [
      { accountId: "105-CLIENTES", side: "debit", amountSource: "primary" },
      { accountId: "401-VENTAS", side: "credit", amountSource: "primary" },
    ],
  },
  {
    ruleId: "invoice-purchase-example",
    version: 1,
    title: "Factura recibida · plantilla de revisión",
    description: "Propone Gastos contra Proveedores para una factura cuando la empresa actúa como receptor.",
    sourceKinds: ["invoice"],
    requiredCompanySide: "receiver",
    lines: [
      { accountId: "501-GASTOS", side: "debit", amountSource: "primary" },
      { accountId: "201-PROVEEDORES", side: "credit", amountSource: "primary" },
    ],
  },
  {
    ruleId: "payment-collection-example",
    version: 1,
    title: "Cobro bancario · liquidación revisable",
    description: "Propone Bancos contra Clientes con un movimiento de ingreso y un Pago CFDI seleccionado.",
    sourceKinds: ["bank_movement", "payment"],
    requiredCompanySide: "issuer",
    requiredCashDirection: "incoming",
    lines: [
      { accountId: "101-BANCO", side: "debit", amountSource: "bank" },
      { accountId: "105-CLIENTES", side: "credit", amountSource: "payment" },
    ],
  },
  {
    ruleId: "payment-disbursement-example",
    version: 1,
    title: "Pago bancario · liquidación revisable",
    description: "Propone Proveedores contra Bancos con un movimiento de egreso y un Pago CFDI seleccionado.",
    sourceKinds: ["bank_movement", "payment"],
    requiredCompanySide: "receiver",
    requiredCashDirection: "outgoing",
    lines: [
      { accountId: "201-PROVEEDORES", side: "debit", amountSource: "payment" },
      { accountId: "101-BANCO", side: "credit", amountSource: "bank" },
    ],
  },
]);

export function cloneJournalRules(rules = DEFAULT_JOURNAL_RULES) {
  return rules.map((rule) => ({ ...rule, lines: rule.lines.map((line) => ({ ...line })) }));
}

export function ruleMap(rules) {
  return new Map((Array.isArray(rules) ? rules : []).map((rule) => [rule.ruleId, rule]));
}

export function validateRule(rule) {
  const errors = [];
  if (!rule?.ruleId || !rule.title) errors.push("La regla necesita un identificador y un nombre.");
  if (!Array.isArray(rule?.sourceKinds) || !rule.sourceKinds.length) errors.push("La regla debe declarar sus fuentes.");
  if (!Array.isArray(rule?.lines) || rule.lines.length < 2 || rule.lines.length > 10) errors.push("La regla debe tener entre 2 y 10 líneas.");
  for (const line of rule?.lines || []) {
    if (!line.accountId || !["debit", "credit"].includes(line.side)) errors.push("Cada línea necesita cuenta y lado cargo/abono.");
    if (!line.amountSource) errors.push("Cada línea necesita un origen de importe permitido.");
  }
  return [...new Set(errors)];
}

function pickSource(selectedSources, kind) {
  return selectedSources.find((source) => source.kind === kind) || null;
}

function sourceAmount(source) {
  if (!source?.amount?.minor || !normalizeCurrency(source.amount.currency)) return null;
  return moneyFromMinor(absMinor(source.amount), source.amount.currency, { scale: source.amount.scale, quality: source.amount.quality });
}

function lineAmount(line, sources) {
  if (line.amountSource === "bank") return sourceAmount(pickSource(sources, "bank_movement"));
  if (line.amountSource === "payment") return sourceAmount(pickSource(sources, "payment"));
  return sourceAmount(sources[0]);
}

export function generateJournalDraft({ rule, selectedSources = [], companyLocalId, companySide = "unknown", cashDirection = "unknown", period = "" } = {}) {
  const draftId = `draft:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const errors = [];
  const warnings = ["Plantilla local de revisión; no es una póliza contabilizada ni una determinación fiscal."];
  const ruleErrors = validateRule(rule);
  errors.push(...ruleErrors);
  if (selectedSources.some((source) => source.cfdi)) {
    errors.push("Fuentes CFDI: utiliza el modo Ciclo CFDI. Los análisis históricos sin decimales originales deben reanalizarse; la plantilla manual no elude PUE/PPD/REP.");
  }
  for (const kind of rule?.sourceKinds || []) {
    if (!selectedSources.some((source) => source.kind === kind)) errors.push(`Selecciona una fuente de tipo ${kind === "bank_movement" ? "movimiento bancario" : kind === "payment" ? "pago CFDI" : "factura"}.`);
  }
  if (rule?.requiredCompanySide && companySide !== rule.requiredCompanySide) errors.push("Confirma el papel de la empresa para esta plantilla antes de aprobar.");
  if (rule?.requiredCashDirection && cashDirection !== rule.requiredCashDirection) errors.push("Confirma si el movimiento bancario es ingreso o egreso antes de aprobar.");
  const primary = selectedSources.find((source) => source.kind === "invoice" || source.kind === "payment") || selectedSources[0];
  const currencies = [...new Set(selectedSources.map((source) => source.amount?.currency).filter(Boolean))];
  if (currencies.length > 1) errors.push("Las fuentes seleccionadas usan monedas distintas; no se convierten ni compensan automáticamente.");
  if (selectedSources.some((source) => source.amount?.quality !== "source_decimal_exact")) warnings.push("Al menos un importe proviene de un valor ya normalizado; revisa la evidencia original antes de aprobar.");
  if (selectedSources.some((source) => source.warnings?.length)) warnings.push("Una fuente contiene advertencias de procedencia o datos incompletos.");
  const lines = (rule?.lines || []).map((line, index) => ({
    lineId: `${draftId}:line:${index + 1}`,
    accountId: line.accountId,
    side: line.side,
    amount: lineAmount(line, selectedSources),
    concept: primary?.label || `Partida ${index + 1}`,
    amountSource: line.amountSource,
  }));
  const bank = pickSource(selectedSources, "bank_movement");
  const payment = pickSource(selectedSources, "payment");
  if (bank && payment && bank.amount?.minor !== payment.amount?.minor) warnings.push("El importe del movimiento y el pago CFDI no coincide; la validación bloqueará la aprobación.");
  if (primary?.eventKind === "payment_settlement_candidate" && primary.relationStatus !== "matched") warnings.push("El pago CFDI no tiene una relación confirmada con una factura seleccionada.");
  return {
    draftId,
    revision: 1,
    companyLocalId: String(companyLocalId || "company-local"),
    period: String(period || ""),
    ruleId: rule?.ruleId || "",
    ruleVersion: Number(rule?.version) || 1,
    companySide,
    cashDirection,
    sourceRefs: selectedSources.map((source) => source.sourceId),
    sources: selectedSources.map((source) => ({ sourceId: source.sourceId, kind: source.kind, label: source.label, eventKind: source.eventKind })),
    lines,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    warningsAcknowledged: false,
    status: "review",
    approvedAt: "",
    rejectedAt: "",
    createdAt: new Date().toISOString(),
  };
}
