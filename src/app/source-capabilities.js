const ALLOWED_TARGETS = new Set(["diot", "journal"]);
const MAX_SOURCES = 5000;
const LEASE_TTL_MS = 30_000;
const FORBIDDEN_KEYS = new Set(["xml", "rawxml", "rawXml", "file", "blob", "arraybuffer", "arrayBuffer", "sourcePath", "localPath"]);

export class CapabilityExpiredError extends Error {
  constructor(message = "La capacidad fiscal expiró o ya fue consumida.") {
    super(message);
    this.name = "CapabilityExpiredError";
  }
}

function clone(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function opaqueId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}:${uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result.toString(16).padStart(8, "0");
}

function stableSourceId(kind, item, index) {
  const identity = [kind, item?.uuid, item?.docRelacionado, item?.paymentIndex, item?.relatedIndex, index].join("|");
  return `cfdi-source:${kind}:${hash(identity)}`;
}

function pick(item, keys) {
  return Object.fromEntries(keys.filter((key) => item && item[key] !== undefined).map((key) => [key, clone(item[key])]));
}

const INVOICE_FIELDS = [
  "uuid", "tipo", "serieFolio", "fecha", "rfcEmisor", "rfcReceptor", "nombreEmisor", "nombreReceptor", "emisor", "receptor",
  "moneda", "metodoPago", "formaPagoCode", "cancellationStatus", "rawAmounts", "subtotal", "descuento", "total", "taxDetails",
  "taxObjectCodes", "taxRates", "taxBaseKnown", "baseIva0", "iva0", "baseIva16", "iva16", "ieps", "iepsBreakdown",
  "cfdiRelations", "cfdiRelacionado", "tipoRelacion", "objetoImp",
];
const PAYMENT_FIELDS = [
  "uuid", "tipo", "serieFolio", "fecha", "fechaPago", "rfcEmisor", "rfcReceptor", "moneda", "monedaPago", "equivalenciaDR",
  "formaPagoCode", "montoPago", "numParcialidad", "paymentIndex", "relatedIndex", "docRelacionado", "objetoImpDR", "taxDetails",
  "rawAmounts", "relationStatus", "taxEvidenceStatus", "estimatedTax", "cancellationStatus",
];
const BANK_FIELDS = ["rowNumber", "dateIso", "amountCents", "signedAmountCents", "currency", "reference", "normalizedReference", "description", "status", "reasons", "result", "confidence"];

function assertNoForbiddenKeys(value, path = "snapshot", seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) { value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`, seen)); return; }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`El snapshot contiene una propiedad no permitida: ${path}.${key}`);
    assertNoForbiddenKeys(child, `${path}.${key}`, seen);
  }
}

export function buildCfdiSourceSnapshot(analysis, target, { sourceIds = null } = {}) {
  if (!ALLOWED_TARGETS.has(target)) throw new TypeError(`Destino CFDI no permitido: ${target}`);
  const invoices = Array.isArray(analysis?.facturas) ? analysis.facturas.map((item) => pick(item, INVOICE_FIELDS)) : [];
  const payments = target === "journal" && Array.isArray(analysis?.pagos) ? analysis.pagos.map((item) => pick(item, PAYMENT_FIELDS)) : [];
  const available = [
    ...invoices.map((item, index) => ({ item, sourceId: stableSourceId("invoice", item, index), kind: "invoice" })),
    ...payments.map((item, index) => ({ item, sourceId: stableSourceId("payment", item, index), kind: "payment" })),
  ];
  const requested = sourceIds == null ? available : available.filter((entry) => sourceIds.includes(entry.sourceId));
  const selectedInvoices = requested.filter((entry) => entry.kind === "invoice").map((entry) => entry.item);
  const selectedPayments = requested.filter((entry) => entry.kind === "payment").map((entry) => entry.item);
  const snapshot = {
    schemaVersion: "cfdi-source-handoff-v1",
    target,
    sourceIds: requested.map((entry) => entry.sourceId),
    counts: { invoices: selectedInvoices.length, payments: selectedPayments.length },
    analysis: { facturas: selectedInvoices, pagos: selectedPayments, conceptos: [] },
  };
  assertNoForbiddenKeys(snapshot);
  return snapshot;
}

export function buildBankSourceSnapshot(movements, target = "journal", { sourceIds = null } = {}) {
  if (target !== "journal") throw new TypeError(`Destino bancario no permitido: ${target}`);
  const rows = Array.isArray(movements) ? movements : [];
  const available = rows.map((item, index) => ({
    item: pick(item, BANK_FIELDS),
    sourceId: `bank-source:${hash([item?.rowNumber, item?.dateIso, item?.amountCents, item?.reference, index].join("|"))}`,
  }));
  const requested = sourceIds == null ? available : available.filter((entry) => sourceIds.includes(entry.sourceId));
  const bankRows = requested.map((entry) => ({ ...entry.item, sourceId: entry.sourceId }));
  const snapshot = {
    schemaVersion: "bank-source-handoff-v1",
    target,
    sourceIds: requested.map((entry) => entry.sourceId),
    counts: { movements: bankRows.length },
    bankRows,
  };
  assertNoForbiddenKeys(snapshot);
  return snapshot;
}

export function createSourceCapabilityBroker({ initialSessionEpoch = 0, ttlMs = LEASE_TTL_MS } = {}) {
  let sessionEpoch = Number.isInteger(initialSessionEpoch) ? initialSessionEpoch : 0;
  const providers = new Map();
  const leases = new Map();

  const clearLease = (token) => {
    const lease = leases.get(token);
    if (!lease) return false;
    clearTimeout(lease.timer);
    leases.delete(token);
    return true;
  };

  return {
    registerSourceProvider(owner, provider) {
      const key = String(owner || "").trim();
      if (!key || typeof provider !== "function") throw new TypeError("La capacidad necesita propietario y proveedor.");
      providers.set(key, provider);
      return () => { if (providers.get(key) === provider) providers.delete(key); };
    },
    request({ owner = "cfdi", target, sourceIds = null, explicitUserAction = false, selection = "current" } = {}) {
      if (!explicitUserAction) throw new Error("La lectura de una fuente requiere una acción humana explícita.");
      if (!ALLOWED_TARGETS.has(target)) throw new Error("El destino de la fuente no está autorizado.");
      const provider = providers.get(owner);
      if (!provider) throw new CapabilityExpiredError("La isla propietaria ya no está montada.");
      const available = provider({ target, selection, sourceIds: null, sessionEpoch });
      if (!available || available.target !== target || !Array.isArray(available.sourceIds) || available.sourceIds.length > MAX_SOURCES) {
        throw new Error("El propietario devolvió un snapshot de fuentes inválido.");
      }
      const requestedSourceIds = sourceIds == null ? available.sourceIds : [...new Set(sourceIds)];
      const availableIds = new Set(available.sourceIds);
      if (!requestedSourceIds.length || requestedSourceIds.some((sourceId) => !availableIds.has(sourceId))) throw new Error("La selección contiene una fuente que no pertenece a la isla propietaria.");
      const snapshot = provider({ target, selection, sourceIds: requestedSourceIds, sessionEpoch });
      if (!snapshot || snapshot.target !== target || !Array.isArray(snapshot.sourceIds) || snapshot.sourceIds.length !== requestedSourceIds.length || snapshot.sourceIds.some((sourceId) => !requestedSourceIds.includes(sourceId))) {
        throw new Error("El propietario no devolvió exactamente las fuentes solicitadas.");
      }
      assertNoForbiddenKeys(snapshot);
      const token = opaqueId("handoff");
      const timer = setTimeout(() => clearLease(token), Math.max(1000, Number(ttlMs) || LEASE_TTL_MS));
      leases.set(token, { token, owner, target, sessionEpoch, snapshot: clone(snapshot), timer });
      return Object.freeze({ token, target, sessionEpoch, sourceCount: snapshot.sourceIds.length });
    },
    consume(token, { target, sessionEpoch: requestedEpoch = sessionEpoch } = {}) {
      const lease = leases.get(token);
      if (!lease) throw new CapabilityExpiredError();
      clearLease(token);
      if (lease.target !== target || lease.sessionEpoch !== sessionEpoch || requestedEpoch !== sessionEpoch) throw new CapabilityExpiredError();
      return clone(lease.snapshot);
    },
    advanceSessionEpoch(reason = "session-change") {
      sessionEpoch += 1;
      this.clear(reason);
      return sessionEpoch;
    },
    clear() {
      for (const token of [...leases.keys()]) clearLease(token);
    },
    get sessionEpoch() { return sessionEpoch; },
    get leaseCount() { return leases.size; },
    get providerCount() { return providers.size; },
  };
}

export const __test = { hash, stableSourceId, assertNoForbiddenKeys, ALLOWED_TARGETS };
