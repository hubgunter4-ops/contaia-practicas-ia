const MAX_MESSAGE_LENGTH = 2000;
const DLP_POLICY_VERSION = "ai-dlp-v1";
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export class AiDlpError extends Error {
  constructor(message, code, assessment) {
    super(message);
    this.name = "AiDlpError";
    this.code = code;
    this.decision = assessment?.decision || "block";
    this.categories = Object.freeze([...(assessment?.categories || [])]);
    this.reasonCodes = Object.freeze([...(assessment?.reasonCodes || [])]);
    this.redactedPreview = assessment?.redactedPreview || "";
    this.policyVersion = DLP_POLICY_VERSION;
  }
}

const PATTERN_DEFINITIONS = Object.freeze([
  {
    category: "xml_content",
    severity: "high",
    reasonCode: "xml_or_cfdi_markup",
    pattern: /<\?(?:xml|cfdi)|<\s*\/?(?:cfdi|tfd|comprobante)\b[^>]*>/gi,
  },
  {
    category: "cfdi_uuid",
    severity: "high",
    reasonCode: "uuid_identifier",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  },
  {
    category: "rfc",
    severity: "high",
    reasonCode: "rfc_identifier",
    pattern: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/giu,
  },
  {
    category: "curp",
    severity: "high",
    reasonCode: "curp_identifier",
    pattern: /\b[A-Z][AEIOU][A-Z]{2}\d{6}[HM][A-Z]{2}[BCDFGHJKLMNPQRSTVWXYZ]{3}[A-Z\d]\d\b/giu,
  },
  {
    category: "nss",
    severity: "high",
    reasonCode: "nss_identifier",
    pattern: /\b\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\b/g,
    context: /\b(?:nss|numero\s+de\s+seguro|seguro\s+social|imss)\b/i,
  },
  {
    category: "clabe_or_bank_account",
    severity: "high",
    reasonCode: "bank_account_identifier",
    pattern: /\b\d(?:[ -]?\d){17}\b/g,
    context: /\b(?:clabe|cuenta|cuenta\s+bancaria|banco|transferencia|dep[oó]sito)\b/i,
  },
  {
    category: "payment_card",
    severity: "high",
    reasonCode: "payment_card_identifier",
    pattern: /\b(?:\d[ -]?){13,19}\d\b/g,
    context: /\b(?:tarjeta|d[eé]bito|cr[eé]dito|card|visa|mastercard|amex)\b/i,
  },
  {
    category: "email",
    severity: "medium",
    reasonCode: "email_identifier",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  },
  {
    category: "phone",
    severity: "medium",
    reasonCode: "phone_identifier",
    pattern: /(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/g,
    context: /\b(?:tel[eé]fono|celular|m[oó]vil|llamar|llama|contacto|whatsapp)\b/i,
  },
  {
    category: "named_party",
    severity: "medium",
    reasonCode: "named_party_label",
    pattern: /\b(?:cliente|proveedor|beneficiario|titular|empresa|persona|raz[oó]n\s+social)\s*[:=]\s*[^\n,;]{2,100}/giu,
  },
  {
    category: "address",
    severity: "medium",
    reasonCode: "address_label",
    pattern: /\b(?:domicilio|direcci[oó]n|calle|colonia|c[oó]digo\s+postal)\s*[:=]\s*[^\n,;]{2,120}/giu,
  },
  {
    category: "url_query",
    severity: "medium",
    reasonCode: "url_with_query_or_token",
    pattern: /https?:\/\/[^\s]+[?&][^\s]+/giu,
  },
  {
    category: "base64_or_encoded_block",
    severity: "high",
    reasonCode: "encoded_payload",
    pattern: /\b[A-Za-z0-9+/]{80,}={0,2}\b/g,
    context: /\b(?:base64|encoded|codificado|payload|adjunto|archivo)\b/i,
  },
]);

const HIGH_SEVERITY = new Set(["high"]);
const MEDIUM_SEVERITY = new Set(["medium"]);

function normalizeText(raw) {
  if (typeof raw !== "string") throw new AiDlpError("La petición del planner debe ser texto.", "planner_input_invalid");
  const unicode = raw.normalize("NFKC");
  const hadZeroWidth = ZERO_WIDTH_PATTERN.test(unicode);
  ZERO_WIDTH_PATTERN.lastIndex = 0;
  const hadControl = CONTROL_PATTERN.test(unicode);
  CONTROL_PATTERN.lastIndex = 0;
  const withoutHidden = unicode.replace(ZERO_WIDTH_PATTERN, "");
  const withoutControls = withoutHidden.replace(CONTROL_PATTERN, "");
  const normalized = withoutControls.replace(/\r\n?/g, "\n").trim();
  const compact = normalized.replace(/[ \t]+/g, " ").trim();
  return { compact, normalized, hadZeroWidth, hadControl };
}

function contextualMatch(definition, text) {
  if (!definition.context || definition.context.test(text)) return true;
  definition.context.lastIndex = 0;
  return false;
}

function addFinding(findings, definition, text, matches) {
  if (!matches.length) return;
  findings.push({
    category: definition.category,
    severity: definition.severity,
    reasonCode: definition.reasonCode,
    matches: matches.map(({ index, value }) => ({ start: index, end: index + value.length })),
  });
}

function findPatternMatches(definition, text) {
  if (!contextualMatch(definition, text)) return [];
  definition.pattern.lastIndex = 0;
  const matches = [...text.matchAll(definition.pattern)].filter((match) => typeof match.index === "number").map((match) => ({ index: match.index, value: match[0] }));
  definition.pattern.lastIndex = 0;
  return matches;
}

function findTabularOrStructuredMatches(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return [];
  const delimited = lines.filter((line) => (line.match(/[;,\t]/g) || []).length >= 2);
  if (delimited.length < 2) return [];
  const firstIndex = text.indexOf(lines[0]);
  return [{ index: firstIndex, value: text.slice(firstIndex) }];
}

function findJsonMatches(text) {
  const trimmed = text.trim();
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) return [];
  if (!/"[^"\n]{1,80}"\s*:/.test(trimmed)) return [];
  const index = text.indexOf(trimmed);
  return [{ index, value: trimmed }];
}

function findXmlBlock(text) {
  const tag = /<\s*(?:\?|\/?(?:cfdi|tfd|comprobante)\b)/i.exec(text);
  return tag ? [{ index: tag.index, value: text.slice(tag.index) }] : [];
}

function redact(text, findings) {
  const ranges = findings.flatMap(({ category, matches }) => matches.map((range) => ({ ...range, category })))
    .sort((left, right) => left.start - right.start || right.end - left.end);
  let cursor = 0;
  let output = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    output += text.slice(cursor, range.start);
    output += `[DATO_REDACTADO:${range.category}]`;
    cursor = Math.max(cursor, range.end);
  }
  return `${output}${text.slice(cursor)}`.slice(0, MAX_MESSAGE_LENGTH);
}

function assessmentFrom(text, normalized) {
  const findings = [];
  if (normalized.hadControl) findings.push({ category: "control_characters", severity: "high", reasonCode: "control_characters", matches: [] });
  if (normalized.hadZeroWidth) findings.push({ category: "hidden_characters", severity: "medium", reasonCode: "hidden_characters", matches: [] });
  if (!normalized.compact) findings.push({ category: "empty_message", severity: "high", reasonCode: "empty_message", matches: [] });
  if (normalized.compact.length > MAX_MESSAGE_LENGTH) findings.push({ category: "oversized_text", severity: "high", reasonCode: "message_too_long", matches: [] });

  for (const definition of PATTERN_DEFINITIONS) {
    const matches = definition.category === "xml_content"
      ? findXmlBlock(text)
      : findPatternMatches(definition, text);
    addFinding(findings, definition, text, matches);
  }
  addFinding(findings, { category: "tabular_content", severity: "medium", reasonCode: "tabular_or_csv_content" }, text, findTabularOrStructuredMatches(text));
  addFinding(findings, { category: "structured_payload", severity: "medium", reasonCode: "structured_json_content" }, text, findJsonMatches(text));

  const categories = [...new Set(findings.map(({ category }) => category))];
  const reasonCodes = [...new Set(findings.map(({ reasonCode }) => reasonCode))];
  const decision = findings.length === 0
    ? "allow"
    : findings.some(({ severity }) => HIGH_SEVERITY.has(severity))
      ? "block"
      : MEDIUM_SEVERITY.has(findings[0]?.severity) ? "confirm" : "block";
  const unmatchedHigh = findings.some(({ severity, matches }) => HIGH_SEVERITY.has(severity) && matches.length === 0);
  const redactedPreview = decision === "allow"
    ? ""
    : unmatchedHigh
      ? `[DATO_REDACTADO:${categories.join(",")}]`
      : redact(normalized.normalized, findings);
  return Object.freeze({
    policyVersion: DLP_POLICY_VERSION,
    decision,
    categories: Object.freeze(categories),
    reasonCodes: Object.freeze(reasonCodes),
    normalizedLength: normalized.compact.length,
    normalizedMessage: decision === "allow" ? normalized.compact : "",
    redactedPreview,
  });
}

export function assessAiText(raw) {
  const normalized = normalizeText(raw);
  return assessmentFrom(normalized.normalized, normalized);
}

export function assertPlannerSafeText(raw) {
  const assessment = assessAiText(raw);
  if (assessment.decision === "allow") return assessment.normalizedMessage;
  if (assessment.categories.includes("empty_message") || assessment.categories.includes("oversized_text")) {
    throw new AiDlpError("La petición del planner debe tener entre 1 y 2,000 caracteres.", "planner_input_invalid", assessment);
  }
  const message = assessment.decision === "confirm"
    ? "La petición parece incluir información identificable o contenido estructurado. Reformúlala sin nombres, contactos, referencias ni datos del comprobante."
    : "El planner no puede recibir datos identificables ni contenido de archivo. Reformula la pregunta sin datos del comprobante.";
  const code = assessment.decision === "confirm" ? "planner_input_confirmation_required" : "planner_input_sensitive";
  throw new AiDlpError(message, code, assessment);
}

export const __test = {
  DLP_POLICY_VERSION,
  MAX_MESSAGE_LENGTH,
  PATTERN_DEFINITIONS,
  normalizeText,
  redact,
  findTabularOrStructuredMatches,
  findJsonMatches,
  findXmlBlock,
};
