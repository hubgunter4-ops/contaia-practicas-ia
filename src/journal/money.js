const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function normalizeCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  return CURRENCY_PATTERN.test(currency) ? currency : "";
}

function parseDecimalText(value) {
  let text = String(value ?? "").trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/\b(?:MXN|USD|CAD|EUR|GBP)\b/gi, "").replace(/[$€£¥\s\u00a0]/g, "");
  if (text.includes(",") && !text.includes(".")) text = text.replace(",", ".");
  else text = text.replace(/,/g, "");
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const sign = negative || match[1] === "-" ? "-" : "";
  return { sign, whole: match[2], fraction: match[3] || "" };
}

export function decimalToMinor(value, { scale = 2, quality = "source_decimal_exact" } = {}) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) return null;
  const parsed = parseDecimalText(value);
  if (!parsed || parsed.fraction.length > scale && /[^0]/.test(parsed.fraction.slice(scale))) return null;
  const fraction = parsed.fraction.padEnd(scale, "0").slice(0, scale);
  const minor = `${parsed.whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  return { minor: `${parsed.sign}${minor}`, scale, quality };
}

export function moneyFromMinor(minor, currency, { scale = 2, quality = "source_decimal_exact" } = {}) {
  if (!/^-?\d+$/.test(String(minor)) || !normalizeCurrency(currency)) return null;
  return { minor: String(minor), scale, currency: normalizeCurrency(currency), quality };
}

export function normalizeMoney(value, currency, options = {}) {
  const normalizedCurrency = normalizeCurrency(currency);
  if (!normalizedCurrency) return null;
  const isNumber = typeof value === "number";
  const decimal = decimalToMinor(value, {
    scale: options.scale ?? 2,
    quality: isNumber ? "derived_from_number" : options.quality ?? "source_decimal_exact",
  });
  return decimal ? { ...decimal, currency: normalizedCurrency } : null;
}

export function absMinor(value) {
  const minor = String(value?.minor ?? value ?? "");
  return minor.startsWith("-") ? minor.slice(1) : minor;
}

export function negateMinor(value) {
  const minor = String(value?.minor ?? value ?? "");
  return minor.startsWith("-") ? minor.slice(1) : `-${minor}`;
}

export function compareMinor(left, right) {
  const a = BigInt(String(left?.minor ?? left ?? "0"));
  const b = BigInt(String(right?.minor ?? right ?? "0"));
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addMinor(values) {
  return values.reduce((sum, value) => sum + BigInt(String(value?.minor ?? value ?? "0")), 0n).toString();
}

export function subtractMinor(left, right) {
  return (BigInt(String(left?.minor ?? left ?? "0")) - BigInt(String(right?.minor ?? right ?? "0"))).toString();
}

export function formatMinor(value, currency = "MXN", locale = "es-MX") {
  const minor = String(value?.minor ?? value ?? "");
  const scale = Number.isInteger(value?.scale) ? value.scale : 2;
  if (!/^-?\d+$/.test(minor)) return "—";
  const negative = minor.startsWith("-");
  const digits = negative ? minor.slice(1) : minor;
  const padded = digits.padStart(scale + 1, "0");
  const split = scale ? `${padded.slice(0, -scale)}.${padded.slice(-scale)}` : padded;
  const numeric = Number(split) * (negative ? -1 : 1);
  if (Number.isSafeInteger(Number(minor)) && Number.isFinite(numeric)) {
    try { return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: scale, maximumFractionDigits: scale }).format(numeric); } catch { /* Usa formato seguro abajo. */ }
  }
  return `${negative ? "-" : ""}${padded.slice(0, scale ? -scale : undefined)}${scale ? `.${padded.slice(-scale)}` : ""} ${currency}`.trim();
}
