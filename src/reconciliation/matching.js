const DAY_MS = 86_400_000;
const DIRECTION_CREDIT = /^(?:CREDITO|CR|ABONO|INGRESO|DEPOSITO|DEP|ENTRADA|POSITIVO|HABER)$/i;
const DIRECTION_DEBIT = /^(?:DEBITO|DB|CARGO|EGRESO|RETIRO|SALIDA|NEGATIVO|DEBE)$/i;

export function normalizeHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeReference(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseAmountToCents(value, decimalMark = ".") {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const cents = Math.round((value + Number.EPSILON) * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  let text = String(value ?? "").trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  text = text.replace(/\b(?:MXN|USD|CAD|EUR|GBP)\b/gi, "").replace(/[$€£¥\s\u00a0]/g, "").replace(/[+'’']/g, "");
  if (decimalMark === ",") {
    if ((text.match(/,/g) || []).length > 1) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    if ((text.match(/\./g) || []).length > 1) return null;
    text = text.replace(/,/g, "");
  }
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  let cents = Math.round((Number(text) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) return null;
  if (negative) cents = -Math.abs(cents);
  return cents;
}

export function parseDateToIso(value, format = "") {
  if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (format !== "excel") return "";
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * DAY_MS);
    return validIsoParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (iso) return validIsoParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  if (format === "excel" && /^\d{4,5}(?:\.\d+)?$/.test(text)) return parseDateToIso(Number(text), "excel");
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s.*)?$/);
  if (!dmy || !["dmy", "mdy"].includes(format)) return "";
  const first = Number(dmy[1]);
  const second = Number(dmy[2]);
  const year = Number(dmy[3]);
  return format === "dmy" ? validIsoParts(year, second, first) : validIsoParts(year, first, second);
}

function validIsoParts(year, month, day) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value) { return String(value).padStart(2, "0"); }

function parseDirection(value) {
  const text = normalizeReference(value);
  if (DIRECTION_CREDIT.test(text)) return 1;
  if (DIRECTION_DEBIT.test(text)) return -1;
  return 0;
}

function normalizeCurrency(value, fallback = "") {
  const currency = String(value || fallback || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

export function normalizeBankRows(rows, headers, mapping, settings = {}) {
  const decimalMark = settings.decimalMark === "," ? "," : ".";
  const dateFormat = settings.dateFormat || "";
  const amountConvention = settings.amountConvention || "";
  const defaultCurrency = normalizeCurrency(settings.defaultCurrency);
  const firstDataRowNumber = Number.isInteger(settings.firstDataRowNumber) ? settings.firstDataRowNumber : 2;
  return rows.map((row, index) => {
    const get = (field) => {
      const column = mapping[field];
      return Number.isInteger(column) && column >= 0 ? row[column] : "";
    };
    const amountCentsRaw = parseAmountToCents(get("amount"), decimalMark);
    const dateIso = parseDateToIso(get("date"), dateFormat);
    const reference = String(get("reference") ?? "").trim();
    const description = String(get("description") ?? "").trim();
    const currencyRaw = mapping.currency !== "" && Number.isInteger(mapping.currency) ? get("currency") : defaultCurrency;
    const currency = normalizeCurrency(currencyRaw, mapping.currency === "" ? defaultCurrency : "");
    let amountCents = amountCentsRaw;
    let directionError = "";
    if (amountCents !== null && Number.isInteger(mapping.direction) && mapping.direction >= 0) {
      const direction = parseDirection(get("direction"));
      if (!direction) directionError = "No se reconoció el valor cargo/abono de esta fila.";
      else amountCents = Math.abs(amountCents) * direction;
    } else if (amountCents !== null && amountConvention === "debit-positive") {
      amountCents = -amountCents;
    } else if (amountCents !== null && !["signed", "credit-positive"].includes(amountConvention)) {
      directionError = "Selecciona cómo interpretar el signo del importe.";
    }
    const reasons = [];
    if (amountCents === null) reasons.push("Importe vacío o con formato no reconocido.");
    if (!dateIso) reasons.push("Fecha vacía, ambigua o no válida.");
    if (!currency) reasons.push("Moneda vacía o no válida; usa un código de tres letras.");
    if (directionError) reasons.push(directionError);
    return {
      rowNumber: firstDataRowNumber + index,
      dateIso,
      amountCents,
      signedAmountCents: amountCents,
      currency,
      reference,
      normalizedReference: normalizeReference(reference),
      description,
      status: reasons.length ? "invalid" : "ready",
      reasons,
    };
  });
}

function sourceCandidates(analysis, sourceType = "both") {
  if (!analysis || typeof analysis !== "object") return [];
  const candidates = [];
  if (sourceType === "both" || sourceType === "invoices") {
    (Array.isArray(analysis.facturas) ? analysis.facturas : []).forEach((item, index) => {
      candidates.push({
        id: `invoice:${index}:${String(item.uuid || "").toLowerCase()}`,
        kind: "Factura",
        amountCents: toCents(item.total),
        dateIso: parseDateToIso(item.fecha, "ymd"),
        currency: normalizeCurrency(item.moneda),
        references: [item.uuid, item.serieFolio, item.cfdiRelacionado].flatMap(splitReferences),
        label: item.serieFolio || abbreviate(item.uuid) || `Factura ${index + 1}`,
      });
    });
  }
  if (sourceType === "both" || sourceType === "payments") {
    (Array.isArray(analysis.pagos) ? analysis.pagos : []).forEach((item, index) => {
      candidates.push({
        id: `payment:${index}:${String(item.uuid || "").toLowerCase()}:${String(item.docRelacionado || "").toLowerCase()}`,
        kind: "Pago CFDI",
        amountCents: toCents(item.impPagado),
        dateIso: parseDateToIso(item.fechaPago, "ymd"),
        currency: normalizeCurrency(item.moneda),
        references: [item.uuid, item.serieFolio, item.docRelacionado].flatMap(splitReferences),
        label: item.serieFolio || abbreviate(item.docRelacionado || item.uuid) || `Pago ${index + 1}`,
      });
    });
  }
  return candidates.filter((item) => Number.isSafeInteger(item.amountCents) && item.dateIso && item.currency);
}

function splitReferences(value) {
  return String(value ?? "").split(/[;,\s]+/).map(normalizeReference).filter((reference) => reference.length >= 3);
}

function abbreviate(value) {
  const text = String(value ?? "").trim();
  return text ? `${text.slice(0, 8)}…` : "";
}

function toCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const cents = Math.round((numeric + Number.EPSILON) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function dayDistance(left, right) {
  const leftTime = Date.parse(`${left}T00:00:00Z`);
  const rightTime = Date.parse(`${right}T00:00:00Z`);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? Math.round(Math.abs(leftTime - rightTime) / DAY_MS) : null;
}

function centsText(cents) { return Number.isSafeInteger(cents) ? (cents / 100).toFixed(2) : ""; }

export function buildReconciliationRows(movements, analysis, { sourceType = "both", dateToleranceDays = 3 } = {}) {
  const tolerance = Math.max(0, Math.min(31, Number(dateToleranceDays) || 0));
  const source = sourceCandidates(analysis, sourceType);
  const evaluated = movements.map((movement) => {
    if (movement.status !== "ready") return { ...movement, result: "invalid", candidates: [], evidence: movement.reasons };
    const compatibleCurrency = source.filter((candidate) => candidate.currency === movement.currency);
    const reference = movement.normalizedReference;
    const scored = compatibleCurrency.map((candidate) => {
      const exactReference = reference.length >= 3 && candidate.references.includes(reference);
      const amountDifferenceCents = Math.abs(movement.amountCents) - Math.abs(candidate.amountCents);
      const amountExact = amountDifferenceCents === 0;
      const daysApart = dayDistance(movement.dateIso, candidate.dateIso);
      const withinDateWindow = daysApart !== null && daysApart <= tolerance;
      const matchedRule = exactReference || (amountExact && withinDateWindow);
      if (!matchedRule) return null;
      const evidence = [];
      if (exactReference) evidence.push("Referencia normalizada exacta");
      if (amountExact) evidence.push("Importe absoluto exacto");
      else evidence.push(`Diferencia de importe: ${centsText(amountDifferenceCents)} ${movement.currency}`);
      if (daysApart === 0) evidence.push("Misma fecha");
      else if (daysApart !== null && withinDateWindow) evidence.push(`${daysApart} día(s) de diferencia`);
      else evidence.push(`Fecha fuera de ±${tolerance} días`);
      evidence.push("Sentido cargo/abono pendiente de revisión manual");
      return {
        id: candidate.id,
        kind: candidate.kind,
        label: candidate.label,
        dateIso: candidate.dateIso,
        amountCents: candidate.amountCents,
        currency: candidate.currency,
        daysApart,
        amountDifferenceCents,
        exactReference,
        amountExact,
        withinDateWindow,
        rank: (exactReference ? 1000 : 0) + (amountExact ? 100 : 0) + (withinDateWindow ? 10 : 0) - (daysApart ?? 31),
        evidence,
      };
    }).filter(Boolean).sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id));
    if (!scored.length) {
      const reason = source.length ? "No se encontró referencia exacta ni importe exacto en la ventana de fechas y la misma moneda." : "El análisis CFDI seleccionado no contiene candidatos válidos.";
      return { ...movement, result: "unmatched", candidates: [], evidence: [reason] };
    }
    const bestRank = scored[0].rank;
    const bestGroup = scored.filter((candidate) => candidate.rank === bestRank);
    const result = bestGroup.length > 1 ? "ambiguous" : scored[0].amountExact && scored[0].withinDateWindow ? "suggested" : "difference";
    return { ...movement, result, candidates: scored.slice(0, 3), evidence: scored[0].evidence };
  });

  const candidateUse = new Map();
  for (const row of evaluated) {
    if (["suggested", "ambiguous"].includes(row.result)) {
      for (const candidate of row.candidates.slice(0, 1)) candidateUse.set(candidate.id, (candidateUse.get(candidate.id) || 0) + 1);
    }
  }
  return evaluated.map((row) => {
    let finalRow = row;
    if (row.result === "suggested") {
      const candidate = row.candidates[0];
      if (candidateUse.get(candidate.id) > 1) {
        finalRow = { ...row, result: "ambiguous", evidence: [...row.evidence, "Este candidato aparece en más de un movimiento del extracto."] };
      }
    }
    const confidence = finalRow.result === "suggested"
      ? (finalRow.candidates[0]?.exactReference ? "high" : "medium")
      : ["difference", "ambiguous"].includes(finalRow.result) ? "low" : "none";
    return { ...finalRow, confidence };
  });
}

export function summarizeReconciliationRows(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary[row.result] = (summary[row.result] || 0) + 1;
    return summary;
  }, { total: 0, suggested: 0, difference: 0, ambiguous: 0, unmatched: 0, invalid: 0 });
}
