import { addMinor, moneyFromMinor } from "../journal/money.js";

function aggregateAmount(records, key, currency) {
  const values = records.map((record) => record.amounts?.[key]).filter(Boolean);
  if (!values.length) return null;
  return moneyFromMinor(addMinor(values), currency, { scale: values[0].scale, quality: values.some((value) => value.quality !== "manual_confirmed") ? "derived" : "manual_confirmed" });
}

function groupKey(record) {
  const party = record.thirdParty || {};
  return [
    party.type || "pending",
    party.identifier || "missing",
    record.operationType || "pending",
    record.category || "pending",
    record.currency || "missing",
    record.quality || "missing",
  ].join("|");
}

export function aggregateDiotRecords(records = []) {
  const groups = new Map();
  for (const record of records.filter((item) => !item.excluded)) {
    const key = groupKey(record);
    const existing = groups.get(key) || { key, records: [] };
    existing.records.push(record);
    groups.set(key, existing);
  }
  return [...groups.values()].map((group) => {
    const first = group.records[0];
    return {
      key: group.key,
      thirdParty: first.thirdParty,
      operationType: first.operationType,
      category: first.category,
      currency: first.currency,
      quality: first.quality,
      count: group.records.length,
      amounts: {
        base: aggregateAmount(group.records, "base", first.currency),
        ivaTransferred: aggregateAmount(group.records, "ivaTransferred", first.currency),
        ivaWithheld: aggregateAmount(group.records, "ivaWithheld", first.currency),
      },
      evidence: group.records.map((record) => ({ sourceId: record.sourceId, uuid: record.evidence?.uuid || "", folio: record.evidence?.folio || "", date: record.evidence?.date || "" })),
    };
  });
}

export function summarizeGlobalEligibility(records = [], globalRule = {}) {
  const candidates = records.filter((record) => !record.excluded && record.thirdParty?.type === "global");
  return {
    candidates,
    status: "not_determinable",
    message: candidates.length
      ? "No determinable con las fuentes seleccionadas: falta confirmar que el total del periodo está completo y que no existen exclusiones aplicables."
      : "No hay operaciones marcadas como proveedor global.",
    rule: globalRule,
  };
}
