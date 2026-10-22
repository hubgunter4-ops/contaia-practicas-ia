import { normalizeUuid } from "./cfdi-policy.js";

export function lifecycleEventKey(source) {
  const item = source?.cfdi || {};
  const uuid = normalizeUuid(item.uuid);
  if (source.kind === "payment") {
    const ordinal = item.paymentIndex && item.relatedIndex
      ? `${item.paymentIndex}:${item.relatedIndex}`
      : `legacy:${normalizeUuid(item.docRelacionado)}:${item.numParcialidad || "?"}:${item.fechaPago || "?"}`;
    return `payment:${uuid || source.sourceId}:${ordinal}`;
  }
  return `invoice:${uuid || source.sourceId}`;
}

export function buildCfdiLifecycle(sources = []) {
  const invoicesByUuid = new Map();
  const paymentsByInvoice = new Map();
  const eventCounts = new Map();
  const adjustmentsByInvoice = new Map();
  for (const source of sources) {
    if (!source.cfdi) continue;
    const item = source.cfdi;
    const key = lifecycleEventKey(source);
    eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
    if (source.kind === "payment") {
      const reference = normalizeUuid(item.docRelacionado);
      const list = paymentsByInvoice.get(reference) || [];
      list.push(source);
      paymentsByInvoice.set(reference, list);
    } else {
      const uuid = normalizeUuid(item.uuid);
      const list = invoicesByUuid.get(uuid) || [];
      list.push(source);
      invoicesByUuid.set(uuid, list);
      if (item.tipo === "E") {
        const related = item.cfdiRelations?.flatMap((relation) => relation.uuids || [])
          || String(item.cfdiRelacionado || "").split(",");
        for (const reference of related.map(normalizeUuid).filter(Boolean)) {
          const adjustments = adjustmentsByInvoice.get(reference) || [];
          adjustments.push(source);
          adjustmentsByInvoice.set(reference, adjustments);
        }
      }
    }
  }
  return { invoicesByUuid, paymentsByInvoice, adjustmentsByInvoice, eventCounts };
}

// Las fuentes y sus lexemas participan en la identidad; no se usa el orden visible.
export function stableSnapshotKey(value) {
  const canonical = (item) => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.keys(item).sort().map((key) => [key, canonical(item[key])]),
    );
    return item;
  };
  return JSON.stringify(canonical(value));
}
