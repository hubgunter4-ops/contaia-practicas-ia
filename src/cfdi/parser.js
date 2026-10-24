import JSZip from "jszip";
import { MAX_BATCH_FILES, MAX_UPLOAD_BYTES } from "./upload-queue.js";
import { parseXmlDocument } from "./xml-dom.js";

const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 1024 * 1024 * 1024;
const MAX_XML_FILES = MAX_BATCH_FILES;
const paymentForms = {
  "01": "01 - Efectivo", "02": "02 - Cheque nominativo", "03": "03 - Transferencia electrónica de fondos",
  "04": "04 - Tarjeta de crédito", "05": "05 - Monedero electrónico", "06": "06 - Dinero electrónico",
  "08": "08 - Vales de despensa", "12": "12 - Dación en pago", "13": "13 - Pago por subrogación",
  "14": "14 - Pago por consignación", "15": "15 - Condonación", "17": "17 - Compensación",
  "23": "23 - Novación", "24": "24 - Confusión", "25": "25 - Remisión de deuda",
  "26": "26 - Prescripción o caducidad", "27": "27 - A satisfacción del acreedor",
  "28": "28 - Tarjeta de débito", "29": "29 - Tarjeta de servicios", "30": "30 - Aplicación de anticipos",
  "31": "31 - Intermediario pagos", "99": "99 - Por definir",
};
const describePaymentForm = (code) => paymentForms[code] || code || "";
const safeNumber = (value) => {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

export function formatIEPSRate(rate, factor = "") {
  if (!rate) return "S/T (Sin Tasa)";
  const value = Number.parseFloat(rate);
  if (!Number.isFinite(value)) return rate;
  return factor === "Cuota" ? `Cuota ($${Number(value.toFixed(6))})` : `${Number((value * 100).toFixed(4))}%`;
}

function attr(element, name) { return element?.getAttribute(name) ?? ""; }
function numAttr(element, name) { return safeNumber(attr(element, name)); }
function localName(node) { return String(node?.localName || node?.nodeName || "").split(":").pop(); }
const allElementsCache = new WeakMap();
const nodeQueryCache = new WeakMap();

function allElements(parent) {
  if (!parent || typeof parent !== "object") return [];
  const cached = allElementsCache.get(parent);
  if (cached) return cached;
  const elements = typeof parent.getElementsByTagName === "function" ? Array.from(parent.getElementsByTagName("*")) : [];
  allElementsCache.set(parent, elements);
  return elements;
}
function getNodes(parent, name) {
  if (!parent || typeof parent !== "object") return [];
  let queries = nodeQueryCache.get(parent);
  if (!queries) {
    queries = new Map();
    nodeQueryCache.set(parent, queries);
  }
  if (queries.has(name)) return queries.get(name);
  const namespaceNodes = Array.from(parent?.getElementsByTagNameNS?.("*", name) ?? []);
  const nodes = namespaceNodes.length ? namespaceNodes : allElements(parent).filter((node) => localName(node) === name);
  queries.set(name, nodes);
  return nodes;
}
function getNode(parent, name) { return getNodes(parent, name)[0] ?? null; }
function directChildren(parent, name) {
  const children = parent?.children ? Array.from(parent.children) : Array.from(parent?.childNodes ?? []).filter((node) => node?.nodeType === 1);
  return children.filter((node) => localName(node) === name);
}
function descendantTaxNodes(parent, names) {
  const allowed = new Set(names);
  return allElements(parent).filter((node) => allowed.has(localName(node)));
}
function documentTaxNodes(comprobante) {
  return directChildren(comprobante, "Impuestos").flatMap((container) => descendantTaxNodes(container, ["Traslado", "Retencion"]));
}
function conceptTaxNodes(doc) {
  return getNodes(doc, "Concepto").flatMap((concept) => descendantTaxNodes(concept, ["Traslado", "Retencion"]));
}
function firstAttr(element, names) {
  for (const name of names) {
    const value = attr(element, name);
    if (value !== "") return value;
  }
  return "";
}
function taxDetailFromNode(node, kind, suffix = "") {
  const suffixNames = (name) => suffix ? [`${name}${suffix}`, name] : [name];
  return {
    tax: firstAttr(node, suffixNames("Impuesto")),
    factor: firstAttr(node, suffixNames("TipoFactor")),
    rate: firstAttr(node, suffixNames("TasaOCuota")),
    base: firstAttr(node, suffixNames("Base")),
    amount: firstAttr(node, suffixNames("Importe")),
    kind,
  };
}
function detailKind(node) { return localName(node).startsWith("Retencion") ? "retention" : "transfer"; }
function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function numericTaxRate(value) {
  const parsed = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function summarizeIvaTransfers(nodes) {
  let iva0 = 0; let baseIva0 = 0; let iva16 = 0; let baseIva16 = 0;
  let zeroSeen = false; let sixteenSeen = false; let zeroBaseKnown = true; let sixteenBaseKnown = true;
  const taxRates = new Set();
  for (const traslado of nodes) {
    if (attr(traslado, "Impuesto") !== "002") continue;
    const factor = attr(traslado, "TipoFactor");
    const rate = numericTaxRate(attr(traslado, "TasaOCuota"));
    const baseText = attr(traslado, "Base").trim();
    const base = numAttr(traslado, "Base");
    const amount = numAttr(traslado, "Importe");
    if (factor === "Exento" || rate === null) continue;
    if (Math.abs(rate) < Number.EPSILON) {
      zeroSeen = true;
      zeroBaseKnown = zeroBaseKnown && Boolean(baseText);
      baseIva0 += base;
      taxRates.add("0");
    } else if (Math.abs(rate - 0.16) < Number.EPSILON) {
      sixteenSeen = true;
      sixteenBaseKnown = sixteenBaseKnown && Boolean(baseText);
      baseIva16 += base;
      iva16 += amount;
      taxRates.add("16");
    }
    if (Math.abs(rate) < Number.EPSILON) iva0 += amount;
  }
  return {
    iva0: round2(iva0), baseIva0: round2(baseIva0), iva16: round2(iva16), baseIva16: round2(baseIva16),
    taxRates: [...taxRates], taxBaseKnown: { zero: zeroSeen && zeroBaseKnown, sixteen: sixteenSeen && sixteenBaseKnown },
  };
}

export function parsearXML(xmlText, fileName = "") {
  if (typeof xmlText !== "string" || !xmlText.trim() || xmlText.length > MAX_XML_BYTES) throw new Error("El XML está vacío o supera el límite permitido.");
  const doc = parseXmlDocument(xmlText);
  if (getNodes(doc, "parsererror").length || doc.documentElement?.localName === "parsererror") throw new Error("No se pudo leer un XML CFDI válido.");
  const comprobante = getNode(doc, "Comprobante") || doc.documentElement;
  if (!comprobante?.localName?.includes("Comprobante")) throw new Error("El archivo no contiene un nodo Comprobante CFDI.");

  const tipo = attr(comprobante, "TipoDeComprobante");
  const serieFolio = [attr(comprobante, "Serie"), attr(comprobante, "Folio")].filter(Boolean).join("-");
  const fecha = attr(comprobante, "Fecha");
  const formaPagoCode = attr(comprobante, "FormaPago");
  const metodoPago = attr(comprobante, "MetodoPago");
  const moneda = attr(comprobante, "Moneda") || "Sin moneda indicada";
  const total = numAttr(comprobante, "Total");
  const uuid = attr(getNode(doc, "TimbreFiscalDigital"), "UUID");
  const emisorEl = getNode(doc, "Emisor");
  const receptorEl = getNode(doc, "Receptor");
  const rfcEmisor = attr(emisorEl, "Rfc");
  const rfcReceptor = attr(receptorEl, "Rfc");
  const nombreEmisor = attr(emisorEl, "Nombre") || rfcEmisor || "Sin nombre";
  const nombreReceptor = attr(receptorEl, "Nombre") || rfcReceptor || "Sin nombre";
  const pagos = [];
  const facturas = [];
  const conceptos = [];

  if (tipo === "P") {
    const pagoNodes = getNodes(doc, "Pago");
    for (const [paymentNodeIndex, pagoNode] of pagoNodes.entries()) {
      const fechaPago = attr(pagoNode, "FechaPago");
      const formaPagoCodeP = attr(pagoNode, "FormaDePagoP");
      const forma = describePaymentForm(formaPagoCodeP);
      const monedaPagoCode = attr(pagoNode, "MonedaP");
      const monedaPago = monedaPagoCode || "Sin moneda indicada";
      const montoPago = attr(pagoNode, "Monto");
      const relatedNodes = getNodes(pagoNode, "DoctoRelacionado");
      for (const [relatedNodeIndex, related] of relatedNodes.entries()) {
        const impPagado = numAttr(related, "ImpPagado");
        const paymentTaxNodes = descendantTaxNodes(related, ["TrasladoDR", "RetencionDR"]);
        const paymentTaxBlockPresent = getNodes(related, "ImpuestosDR").length > 0
          || getNodes(related, "TrasladosDR").length > 0
          || getNodes(related, "RetencionesDR").length > 0;
        const taxDetails = paymentTaxNodes.map((node) => taxDetailFromNode(node, detailKind(node), "DR"));
        let baseIVA16 = 0; let iva16 = 0; let ivaRetenido = 0; let ieps = 0;
        const iepsBreakdown = {};
        for (const traslado of paymentTaxNodes.filter((node) => detailKind(node) === "transfer")) {
          const tax = firstAttr(traslado, ["ImpuestoDR", "Impuesto"]);
          const rate = firstAttr(traslado, ["TasaOCuotaDR", "TasaOCuota"]);
          const factor = firstAttr(traslado, ["TipoFactorDR", "TipoFactor"]);
          const amount = safeNumber(firstAttr(traslado, ["ImporteDR", "Importe"]));
          if (tax === "002" && Math.abs((numericTaxRate(rate) ?? NaN) - 0.16) < Number.EPSILON) {
            baseIVA16 += safeNumber(firstAttr(traslado, ["BaseDR", "Base"]));
            iva16 += amount;
          } else if (tax === "003" && amount > 0) {
            ieps += amount;
            const label = formatIEPSRate(rate, factor);
            iepsBreakdown[label] = (iepsBreakdown[label] || 0) + amount;
          }
        }
        for (const retention of paymentTaxNodes.filter((node) => detailKind(node) === "retention")) {
          if (firstAttr(retention, ["ImpuestoDR", "Impuesto"]) === "002") ivaRetenido += safeNumber(firstAttr(retention, ["ImporteDR", "Importe"]));
        }
        const pago = {
          uuid, serieFolio, emisor: nombreEmisor, receptor: nombreReceptor, fechaPago, formaPago: forma,
          formaPagoCode: formaPagoCodeP, monedaPago: monedaPagoCode, montoPago,
          docRelacionado: attr(related, "IdDocumento"), saldoAnterior: numAttr(related, "ImpSaldoAnt"),
          impPagado, saldoInsoluto: numAttr(related, "ImpSaldoInsoluto"), baseIVA16, iva16,
          exento: Math.max(0, impPagado - (baseIVA16 + iva16 + ieps - ivaRetenido)), rfcEmisor, rfcReceptor,
          nombreEmisor, nombreReceptor, fileName, ivaRetenido, ieps, iepsBreakdown,
          fechaEmision: fecha, moneda: attr(related, "MonedaDR") || monedaPago,
          rawAmounts: { paid: attr(related, "ImpPagado"), prior: attr(related, "ImpSaldoAnt"), remaining: attr(related, "ImpSaldoInsoluto") },
          paymentIndex: paymentNodeIndex + 1, relatedIndex: relatedNodeIndex + 1,
          equivalenciaDR: attr(related, "EquivalenciaDR"), numParcialidad: attr(related, "NumParcialidad"),
          objetoImpDR: attr(related, "ObjetoImpDR"), taxDetails,
        };
        if (paymentTaxNodes.length || paymentTaxBlockPresent) pago.rawPaymentTaxes = true;
        pagos.push(pago);
      }
    }
  } else if (tipo === "I" || tipo === "E") {
    const subtotal = numAttr(comprobante, "SubTotal");
    const descuento = numAttr(comprobante, "Descuento");
    const globalTaxNodes = documentTaxNodes(comprobante);
    const conceptNodes = conceptTaxNodes(doc);
    const invoiceTaxNodes = globalTaxNodes.length ? globalTaxNodes : conceptNodes;
    const taxDetailsSource = globalTaxNodes.length ? "document" : conceptNodes.length ? "concept" : "none";
    const taxDetails = invoiceTaxNodes.map((node) => taxDetailFromNode(node, detailKind(node)));
    const allIvaTransfers = getNodes(doc, "Traslado").filter((node) => attr(node, "Impuesto") === "002");
    const globalIvaTransfers = globalTaxNodes.filter((node) => localName(node) === "Traslado" && attr(node, "Impuesto") === "002");
    const ivaSummary = summarizeIvaTransfers(globalIvaTransfers.length ? globalIvaTransfers : allIvaTransfers);
    const { iva0, baseIva0, iva16, baseIva16, taxRates, taxBaseKnown } = ivaSummary;
    let ieps = 0; let ivaRetenido = 0;
    const iepsBreakdown = {};
    for (const traslado of globalTaxNodes.filter((node) => localName(node) === "Traslado")) {
      const tax = attr(traslado, "Impuesto");
      const rate = attr(traslado, "TasaOCuota");
      const factor = attr(traslado, "TipoFactor");
      const amount = numAttr(traslado, "Importe");
      if (tax === "003" && amount > 0) {
        ieps += amount;
        const label = formatIEPSRate(rate, factor);
        iepsBreakdown[label] = (iepsBreakdown[label] || 0) + amount;
      }
    }
    const conceptIeps = {};
    for (const concept of getNodes(doc, "Concepto")) {
      for (const traslado of descendantTaxNodes(concept, ["Traslado"])) {
        const amount = numAttr(traslado, "Importe");
        if (attr(traslado, "Impuesto") === "003" && amount > 0) {
          const label = formatIEPSRate(attr(traslado, "TasaOCuota"), attr(traslado, "TipoFactor"));
          conceptIeps[label] = (conceptIeps[label] || 0) + amount;
        }
      }
    }
    if (ieps === 0 || Object.keys(iepsBreakdown).length === 0) {
      for (const [rate, amount] of Object.entries(conceptIeps)) { iepsBreakdown[rate] = (iepsBreakdown[rate] || 0) + amount; ieps += amount; }
    }
    for (const retention of globalTaxNodes.filter((node) => localName(node) === "Retencion")) {
      if (attr(retention, "Impuesto") === "002") ivaRetenido += numAttr(retention, "Importe");
    }
    if (ivaRetenido === 0) {
      for (const concept of getNodes(doc, "Concepto")) for (const retention of descendantTaxNodes(concept, ["Retencion"])) if (attr(retention, "Impuesto") === "002") ivaRetenido += numAttr(retention, "Importe");
    }
    const relationNodes = directChildren(comprobante, "CfdiRelacionados");
    const cfdiRelations = relationNodes.map((node) => ({
      type: attr(node, "TipoRelacion"),
      uuids: directChildren(node, "CfdiRelacionado").map((related) => attr(related, "UUID")).filter(Boolean),
    }));
    const cfdiRelacionado = getNodes(doc, "CfdiRelacionado").map((node) => attr(node, "UUID")).filter(Boolean).join(", ");
    facturas.push({
      uuid, tipo, serieFolio, emisor: nombreEmisor, receptor: nombreReceptor, fecha,
      formaPago: describePaymentForm(formaPagoCode), formaPagoCode, metodoPago, moneda, subtotal, descuento,
      iva0, baseIva0, iva16, baseIva16, taxRates, taxBaseKnown, total,
      rawAmounts: { total: attr(comprobante, "Total"), subtotal: attr(comprobante, "SubTotal"), discount: attr(comprobante, "Descuento") || "0" },
      taxDetails, taxDetailsSource,
      taxObjectCodes: getNodes(doc, "Concepto").map((concept) => attr(concept, "ObjetoImp")),
      tipoRelacion: cfdiRelations[0]?.type || "", cfdiRelations, cfdiRelacionado,
      rfcEmisor, rfcReceptor, nombreEmisor, nombreReceptor, fileName, ivaRetenido, ieps, iepsBreakdown,
    });
    for (const concept of getNodes(doc, "Concepto")) {
      let conceptIva0 = 0; let conceptBaseIva0 = 0; let conceptIva16 = 0; let conceptBaseIva16 = 0; let conceptIeps = 0;
      const conceptIepsBreakdown = {};
      for (const traslado of descendantTaxNodes(concept, ["Traslado"])) {
        const tax = attr(traslado, "Impuesto"); const rate = attr(traslado, "TasaOCuota");
        const factor = attr(traslado, "TipoFactor"); const amount = numAttr(traslado, "Importe");
        const parsedRate = numericTaxRate(rate);
        if (tax === "002" && parsedRate !== null && Math.abs(parsedRate) < Number.EPSILON) { conceptIva0 += amount; conceptBaseIva0 += numAttr(traslado, "Base"); }
        else if (tax === "002" && parsedRate !== null && Math.abs(parsedRate - 0.16) < Number.EPSILON) { conceptIva16 += amount; conceptBaseIva16 += numAttr(traslado, "Base"); }
        else if (tax === "003" && amount > 0) {
          conceptIeps += amount;
          const label = formatIEPSRate(rate, factor);
          conceptIepsBreakdown[label] = (conceptIepsBreakdown[label] || 0) + amount;
        }
      }
      conceptos.push({
        uuid, tipo, moneda, emisor: nombreEmisor, fecha, claveProdServ: attr(concept, "ClaveProdServ"),
        descripcion: attr(concept, "Descripcion"), cantidad: numAttr(concept, "Cantidad"),
        unidad: attr(concept, "ClaveUnidad"), valorUnitario: numAttr(concept, "ValorUnitario"),
        descuento: numAttr(concept, "Descuento"), importe: numAttr(concept, "Importe"), iva0: conceptIva0, baseIva0: conceptBaseIva0, iva16: conceptIva16, baseIva16: conceptBaseIva16,
        serieFolio, ieps: conceptIeps, iepsBreakdown: conceptIepsBreakdown,
      });
    }
  }
  return { pagos, facturas, conceptos };
}

export async function parseFiles(files) {
  const selected = Array.from(files || []);
  if (!selected.length) throw new Error("Selecciona al menos un archivo XML o ZIP.");
  if (selected.length > MAX_XML_FILES) throw new Error(`Puedes cargar hasta ${MAX_XML_FILES.toLocaleString("es-MX")} archivos por análisis.`);
  if (selected.some((file) => file.size > MAX_UPLOAD_BYTES)) throw new Error("Cada archivo debe pesar 100 MB o menos.");
  const result = { pagos: [], facturas: [], conceptos: [] };
  let xmlCount = 0; let totalInflated = 0;
  const addXml = (text, name) => {
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > MAX_XML_BYTES) throw new Error("Un XML supera el límite de 5 MB.");
    totalInflated += bytes;
    if (totalInflated > MAX_TOTAL_XML_BYTES) throw new Error("El contenido XML extraído supera el límite total de 1 GB.");
    xmlCount += 1;
    if (xmlCount > MAX_XML_FILES) throw new Error(`El ZIP contiene más de ${MAX_XML_FILES.toLocaleString("es-MX")} XML.`);
    const parsed = parsearXML(text, name);
    result.pagos.push(...parsed.pagos);
    result.facturas.push(...parsed.facturas);
    result.conceptos.push(...parsed.conceptos);
  };
  for (const file of selected) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xml")) {
      addXml(await file.text(), file.name);
    } else if (lower.endsWith(".zip")) {
      // JSZip no acepta objetos File-like que solo exponen arrayBuffer();
      // el Worker CFDI usa precisamente esa representación para no transferir
      // File/Blob. Entregar el ArrayBuffer también funciona con File nativos.
      const zipInput = typeof file.arrayBuffer === "function" ? await file.arrayBuffer() : file;
      const zip = await JSZip.loadAsync(zipInput, { checkCRC32: false });
      const xmlEntries = Object.entries(zip.files).filter(([name, entry]) => !entry.dir && name.toLowerCase().endsWith(".xml"));
      if (xmlEntries.length + xmlCount > MAX_XML_FILES) throw new Error(`El ZIP y los archivos seleccionados superan el límite de ${MAX_XML_FILES.toLocaleString("es-MX")} XML.`);
      for (const [entryName, entry] of xmlEntries) {
        const declaredSize = entry._data?.uncompressedSize;
        if (Number.isFinite(declaredSize) && declaredSize > MAX_XML_BYTES) throw new Error("Un XML dentro del ZIP supera el límite de 5 MB.");
        const text = await entry.async("text");
        addXml(text, entryName.split("/").pop() || "comprobante.xml");
      }
    } else {
      throw new Error("Formato no admitido. Usa archivos .xml o .zip.");
    }
  }
  if (!xmlCount) throw new Error("No se encontraron archivos XML dentro de la selección.");
  if (!result.pagos.length && !result.facturas.length) throw new Error("No se encontraron CFDI de ingreso, egreso o pagos reconocidos.");
  return result;
}

export { enriquecerPagosConFacturas } from "./relations.js";

export const parserLimits = Object.freeze({ maxUploadBytes: MAX_UPLOAD_BYTES, maxXmlBytes: MAX_XML_BYTES, maxTotalXmlBytes: MAX_TOTAL_XML_BYTES, maxXmlFiles: MAX_XML_FILES });
