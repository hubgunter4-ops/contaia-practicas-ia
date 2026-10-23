import { buildCfdiAnalysis, buildCfdiTaxReport, buildNoraCfdiContext } from "../analysis.js";
import { assertNoModelSensitiveFields, ToolRegistry, ToolRegistryError } from "./tool-registry.js";

const analysisRefSchema = Object.freeze({ type: "string", pattern: "^analysis:[a-zA-Z0-9:_-]+$" });
const allScopeSchema = Object.freeze({ type: "string", enum: ["all"] });
const safeDestinationSchema = Object.freeze({ type: "string", enum: ["nora-advisor"] });

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function currentAnalysis(getAnalysis, analysisRef) {
  const raw = getAnalysis(analysisRef);
  if (!raw || typeof raw !== "object") throw new ToolRegistryError("No hay un análisis CFDI disponible en esta sesión.", "analysis_missing");
  const analysis = raw.summary ? raw : buildCfdiAnalysis(raw);
  if (!analysis?.summary || !Array.isArray(analysis.facturas) || !Array.isArray(analysis.pagos)) {
    throw new ToolRegistryError("El análisis CFDI local no tiene el formato esperado.", "analysis_invalid");
  }
  return analysis;
}

function alertCount(summary, code) {
  return count((summary.alerts || []).find((alert) => alert?.code === code)?.count);
}

function currencies(summary) {
  return [...new Set((summary.totalsByCurrency || [])
    .map((item) => String(item?.currency || "Sin moneda indicada").slice(0, 12))
    .filter(Boolean))];
}

function evidence(calculation, warnings = []) {
  return {
    source: "cfdi_analysis",
    calculation,
    humanReviewRequired: true,
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

export function buildCfdiSummary(analysis) {
  const summary = analysis?.summary;
  if (!summary) throw new ToolRegistryError("No hay un resumen CFDI disponible.", "analysis_missing");
  return {
    schemaVersion: "cfdi-summary-result-v1",
    status: "ready",
    counts: {
      invoices: count(summary.invoiceCount),
      payments: count(summary.paymentCount),
      concepts: count(summary.conceptCount),
      matchedPayments: count(summary.matchedPayments),
      unmatchedPayments: count(summary.unmatchedPayments),
    },
    currencies: currencies(summary),
    quality: {
      missingAmounts: alertCount(summary, "amount_missing"),
      duplicateUuids: count(summary.duplicateUuids),
      alerts: Array.isArray(summary.alerts) ? summary.alerts.length : 0,
    },
    evidence: evidence("buildCfdiAnalysis", Array.isArray(summary.alerts) && summary.alerts.length ? ["Hay alertas locales por revisar."] : []),
  };
}

export function buildCfdiAlertSummary(analysis) {
  const alerts = Array.isArray(analysis?.summary?.alerts) ? analysis.summary.alerts : [];
  return {
    schemaVersion: "cfdi-alert-summary-v1",
    alerts: alerts.map((alert) => ({
      code: String(alert?.code || "unknown").slice(0, 80),
      severity: alert?.severity === "caution" ? "caution" : "review",
      count: count(alert?.count),
    })),
    humanReviewRequired: true,
    evidence: evidence("buildCfdiAnalysis.alerts", alerts.length ? ["Las alertas son señales de revisión, no una conclusión fiscal."] : []),
  };
}

export function buildCfdiPaymentLinks(analysis) {
  const summary = analysis?.summary;
  if (!summary) throw new ToolRegistryError("No hay relaciones de pago disponibles.", "analysis_missing");
  return {
    schemaVersion: "cfdi-payment-links-v1",
    matched: count(summary.matchedPayments),
    unmatched: count(summary.unmatchedPayments),
    balanceDifferences: count(summary.balanceAlerts),
    missingInvoiceReferences: count(summary.missingInvoiceReferences),
    overpaidLinks: count(summary.overpaidLinks),
    estimatedTaxPayments: alertCount(summary, "estimated_tax_unmatched"),
    humanReviewRequired: true,
    evidence: evidence("buildCfdiAnalysis.payment_relations", ["Las relaciones de pago requieren cotejo con la fuente local."]),
  };
}

export function buildCfdiNextStep(analysis) {
  const summary = analysis?.summary;
  if (!summary) throw new ToolRegistryError("No hay análisis CFDI disponible.", "analysis_missing");
  const alerts = Array.isArray(summary.alerts) ? summary.alerts : [];
  const paymentAlert = alerts.some((alert) => ["payment_without_invoice", "payment_balance_difference", "payment_exceeds_invoice", "payment_tax_missing"].includes(alert?.code));
  const missingAmounts = alerts.some((alert) => alert?.code === "amount_missing");
  if (paymentAlert) {
    return {
      schemaVersion: "cfdi-next-step-v1",
      status: "needs_review",
      action: "open_payments",
      label: "Revisa la vista Pagos y coteja las relaciones señaladas.",
      humanReviewRequired: true,
      evidence: evidence("buildCfdiAnalysis.alerts", ["Se priorizaron alertas de relación de pagos."]),
    };
  }
  if (missingAmounts || alerts.length) {
    return {
      schemaVersion: "cfdi-next-step-v1",
      status: "needs_review",
      action: "open_alerts",
      label: "Revisa las alertas locales antes de exportar o preparar otra herramienta.",
      humanReviewRequired: true,
      evidence: evidence("buildCfdiAnalysis.alerts", ["Hay datos o relaciones por revisar."]),
    };
  }
  return {
    schemaVersion: "cfdi-next-step-v1",
    status: "ready",
    action: "export_local",
    label: "El resumen local está listo para revisión humana o exportación local.",
    humanReviewRequired: true,
    evidence: evidence("buildCfdiAnalysis", ["Un resultado listo no equivale a validación ante SAT."]),
  };
}

const summaryInputSchema = Object.freeze({
  type: "object",
  required: ["analysisRef", "scope"],
  properties: { analysisRef: analysisRefSchema, scope: allScopeSchema },
  additionalProperties: false,
});

const analysisInputSchema = Object.freeze({
  type: "object",
  required: ["analysisRef"],
  properties: { analysisRef: analysisRefSchema },
  additionalProperties: false,
});

const taxInputSchema = Object.freeze({
  type: "object",
  required: ["analysisRef", "businessRfc"],
  properties: {
    analysisRef: analysisRefSchema,
    businessRfc: { type: "string", minLength: 1, maxLength: 13, pattern: "^[A-Za-zÑñ&0-9]+$" },
  },
  additionalProperties: false,
});

const safeContextInputSchema = Object.freeze({
  type: "object",
  required: ["analysisRef", "destination"],
  properties: { analysisRef: analysisRefSchema, destination: safeDestinationSchema },
  additionalProperties: false,
});

const summaryOutputSchema = Object.freeze({
  type: "object",
  required: ["schemaVersion", "status", "counts", "currencies", "quality", "evidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["cfdi-summary-result-v1"] },
    status: { type: "string", enum: ["ready"] },
    counts: { type: "object" },
    currencies: { type: "array", items: { type: "string" }, maxItems: 16 },
    quality: { type: "object" },
    evidence: { type: "object" },
  },
  additionalProperties: false,
});

const alertsOutputSchema = Object.freeze({
  type: "object",
  required: ["schemaVersion", "alerts", "humanReviewRequired", "evidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["cfdi-alert-summary-v1"] },
    alerts: { type: "array", items: { type: "object" }, maxItems: 32 },
    humanReviewRequired: { type: "boolean" },
    evidence: { type: "object" },
  },
  additionalProperties: false,
});

const paymentOutputSchema = Object.freeze({
  type: "object",
  required: ["schemaVersion", "matched", "unmatched", "balanceDifferences", "missingInvoiceReferences", "overpaidLinks", "estimatedTaxPayments", "humanReviewRequired", "evidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["cfdi-payment-links-v1"] },
    matched: { type: "number", minimum: 0 },
    unmatched: { type: "number", minimum: 0 },
    balanceDifferences: { type: "number", minimum: 0 },
    missingInvoiceReferences: { type: "number", minimum: 0 },
    overpaidLinks: { type: "number", minimum: 0 },
    estimatedTaxPayments: { type: "number", minimum: 0 },
    humanReviewRequired: { type: "boolean" },
    evidence: { type: "object" },
  },
  additionalProperties: false,
});

const taxOutputSchema = Object.freeze({
  type: "object",
  required: ["schemaVersion", "status", "businessRfc", "sales", "purchases", "unclassifiedCount"],
  properties: {
    schemaVersion: { type: "string", enum: ["cfdi-tax-report-v1"] },
    status: { type: "string", enum: ["classified", "needs_business_rfc"] },
    businessRfc: { type: "string", maxLength: 13 },
    sales: { type: "object" },
    purchases: { type: "object" },
    unclassifiedCount: { type: "number", minimum: 0 },
  },
  additionalProperties: false,
});

const nextStepOutputSchema = Object.freeze({
  type: "object",
  required: ["schemaVersion", "status", "action", "label", "humanReviewRequired", "evidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["cfdi-next-step-v1"] },
    status: { type: "string", enum: ["ready", "needs_review"] },
    action: { type: "string", enum: ["open_payments", "open_alerts", "export_local"] },
    label: { type: "string", minLength: 1, maxLength: 300 },
    humanReviewRequired: { type: "boolean" },
    evidence: { type: "object" },
  },
  additionalProperties: false,
});

const safeContextOutputSchema = Object.freeze({
  type: "object",
  required: ["schemaVersion", "status"],
  properties: {
    schemaVersion: { type: "string", enum: ["cfdi-summary-v1"] },
    status: { type: "string", enum: ["analyzed", "no_result", "parse_error"] },
  },
  additionalProperties: true,
});

export function createCfdiToolRegistry({ getAnalysis, buildSafeContext = buildNoraCfdiContext } = {}) {
  if (typeof getAnalysis !== "function") throw new TypeError("El registro CFDI necesita getAnalysis.");
  if (typeof buildSafeContext !== "function") throw new TypeError("El registro CFDI necesita un constructor de contexto seguro.");
  const registry = new ToolRegistry();
  const read = (analysisRef) => currentAnalysis(getAnalysis, analysisRef);

  registry.register({
    id: "cfdi.summary",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: true,
    requiresExplicitUserAction: false,
    inputSchema: summaryInputSchema,
    outputSchema: summaryOutputSchema,
    run: ({ analysisRef }) => buildCfdiSummary(read(analysisRef)),
  });
  registry.register({
    id: "cfdi.alerts",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: true,
    requiresExplicitUserAction: false,
    inputSchema: analysisInputSchema,
    outputSchema: alertsOutputSchema,
    run: ({ analysisRef }) => buildCfdiAlertSummary(read(analysisRef)),
  });
  registry.register({
    id: "cfdi.payment_links",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: true,
    requiresExplicitUserAction: false,
    inputSchema: analysisInputSchema,
    outputSchema: paymentOutputSchema,
    run: ({ analysisRef }) => buildCfdiPaymentLinks(read(analysisRef)),
  });
  registry.register({
    id: "cfdi.tax_report",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: false,
    requiresExplicitUserAction: true,
    inputSchema: taxInputSchema,
    outputSchema: taxOutputSchema,
    run: ({ analysisRef, businessRfc }) => buildCfdiTaxReport(read(analysisRef), businessRfc.trim().toUpperCase()),
  });
  registry.register({
    id: "cfdi.safe_context",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: false,
    requiresExplicitUserAction: true,
    inputSchema: safeContextInputSchema,
    outputSchema: safeContextOutputSchema,
    run: ({ analysisRef }) => {
      const safe = buildSafeContext(read(analysisRef));
      assertNoModelSensitiveFields(safe, "cfdi.safe_context");
      return safe;
    },
  });
  registry.register({
    id: "cfdi.next_step",
    version: "1",
    domain: "cfdi",
    execution: "local",
    readOnly: true,
    modelCallable: true,
    requiresExplicitUserAction: false,
    inputSchema: analysisInputSchema,
    outputSchema: nextStepOutputSchema,
    run: ({ analysisRef }) => buildCfdiNextStep(read(analysisRef)),
  });
  return registry;
}

export const __test = { currentAnalysis, alertCount, currencies };
