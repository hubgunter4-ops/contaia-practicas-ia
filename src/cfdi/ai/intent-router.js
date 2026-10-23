export const CFDI_INTENTS = Object.freeze([
  Object.freeze({ id: "cfdi.alerts", toolId: "cfdi.alerts", label: "Ver alertas" }),
  Object.freeze({ id: "cfdi.payment_review", toolId: "cfdi.payment_links", label: "Revisar pagos" }),
  Object.freeze({ id: "cfdi.tax_report", toolId: "cfdi.tax_report", label: "Separar ventas y compras" }),
  Object.freeze({ id: "cfdi.summary", toolId: "cfdi.summary", label: "Ver resumen" }),
  Object.freeze({ id: "cfdi.next_step", toolId: "cfdi.next_step", label: "Ver siguiente paso" }),
  Object.freeze({ id: "cfdi.explain_result", toolId: "cfdi.safe_context", label: "Pedir una explicación" }),
]);

const INTENT_PATTERNS = Object.freeze([
  Object.freeze({ id: "cfdi.alerts", pattern: /\b(?:alertas?|hallazgos?|problemas?|inconsistencias?|revisar\s+primero)\b/iu }),
  Object.freeze({ id: "cfdi.payment_review", pattern: /\b(?:pagos?|complementos?|saldo(?:s)?|parcialidades?|liquidaci[oó]n)\b/iu }),
  Object.freeze({ id: "cfdi.tax_report", pattern: /\b(?:ventas?|compras?|iva|ieps|impuestos?|0\s*%|16\s*%)\b/iu }),
  Object.freeze({ id: "cfdi.summary", pattern: /\b(?:resumen|cu[aá]nt[oa]s?|cantidad|total(?:es)?\s+de\s+(?:comprobantes|facturas|pagos)?)\b/iu }),
  Object.freeze({ id: "cfdi.next_step", pattern: /\b(?:siguiente\s+paso|qu[eé]\s+debo\s+hacer|por\s+d[oó]nde\s+empiezo)\b/iu }),
  Object.freeze({ id: "cfdi.explain_result", pattern: /\b(?:explica(?:r)?|interpreta(?:r)?|ay[uú]dame\s+a\s+entender)\b/iu }),
]);

function normalizeMessage(message) {
  if (typeof message !== "string") throw new TypeError("La petición CFDI debe ser texto.");
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) throw new TypeError("Escribe una petición CFDI.");
  if (normalized.length > 2000) throw new TypeError("La petición CFDI supera 2,000 caracteres.");
  return normalized;
}

function intentById(id) {
  return CFDI_INTENTS.find((item) => item.id === id) || null;
}

export function routeCfdiIntent(message) {
  const normalized = normalizeMessage(message);
  const matches = INTENT_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ id }) => intentById(id))
    .filter(Boolean);
  if (matches.length === 1) {
    const [intent] = matches;
    return Object.freeze({ status: "matched", message: normalized, intent, candidates: Object.freeze([]) });
  }
  if (matches.length > 1) {
    return Object.freeze({ status: "ambiguous", message: normalized, intent: null, candidates: Object.freeze(matches) });
  }
  return Object.freeze({ status: "unsupported", message: normalized, intent: null, candidates: Object.freeze([]) });
}

export function listCfdiIntentChoices() {
  return CFDI_INTENTS.map(({ id, label }) => Object.freeze({ id, label }));
}

export const __test = { INTENT_PATTERNS, normalizeMessage };
