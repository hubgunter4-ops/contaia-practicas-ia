import JSZip from "jszip";
import { MAX_BATCH_FILES, MAX_UPLOAD_BYTES } from "./upload-queue.js";

const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 25 * 1024 * 1024;
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
function getNodes(parent, name) { return Array.from(parent?.getElementsByTagNameNS?.("*", name) ?? []); }
function getNode(parent, name) { return getNodes(parent, name)[0] ?? null; }
function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function parsearXML(xmlText, fileName = "") {
  if (typeof DOMParser === "undefined") throw new Error("Este navegador no puede analizar XML localmente.");
  if (typeof xmlText !== "string" || !xmlText.trim() || xmlText.length > MAX_XML_BYTES) throw new Error("El XML está vacío o supera el límite permitido.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) throw new Error("El XML contiene declaraciones DTD/ENTITY no admitidas por seguridad.");
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (getNodes(doc, "parsererror").length || doc.documentElement?.localName === "parsererror") throw new Error("No se pudo leer un XML CFDI válido.");
  const comprobante = getNode(doc, "Comprobante") || doc.documentElement;
  if (!comprobante?.localName?.includes("Comprobante")) throw new Error("El archivo no contiene un nodo Comprobante CFDI.");

  const tipo = attr(comprobante, "TipoDeComprobante");
  const serieFolio = [attr(comprobante, "Serie"), attr(comprobante, "Folio")].filter(Boolean).join("-");
  const fecha = attr(comprobante, "Fecha");
  const formaPago = attr(comprobante, "FormaPago");
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
    for (const pagoNode of getNodes(doc, "Pago")) {
      const fechaPago = attr(pagoNode, "FechaPago");
      const forma = describePaymentForm(attr(pagoNode, "FormaDePagoP"));
      const monedaPago = attr(pagoNode, "MonedaP") || "Sin moneda indicada";
      for (const related of getNodes(pagoNode, "DoctoRelacionado")) {
        const impPagado = numAttr(related, "ImpPagado");
        let baseIVA16 = 0; let iva16 = 0; let ivaRetenido = 0; let ieps = 0;
        const iepsBreakdown = {};
        for (const traslado of getNodes(related, "TrasladoDR")) {
          const tax = attr(traslado, "ImpuestoDR") || attr(traslado, "Impuesto");
          const rate = attr(traslado, "TasaOCuotaDR") || attr(traslado, "TasaOCuota");
          const factor = attr(traslado, "TipoFactorDR") || attr(traslado, "TipoFactor");
          const amount = numAttr(traslado, "ImporteDR") || numAttr(traslado, "Importe");
          if (tax === "002" && ["0.160000", "0.16"].includes(rate)) {
            baseIVA16 += numAttr(traslado, "BaseDR") || numAttr(traslado, "Base");
            iva16 += amount;
          } else if (tax === "003" && amount > 0) {
            ieps += amount;
            const label = formatIEPSRate(rate, factor);
            iepsBreakdown[label] = (iepsBreakdown[label] || 0) + amount;
          }
        }
        for (const retention of getNodes(related, "RetencionDR")) {
          if ((attr(retention, "ImpuestoDR") || attr(retention, "Impuesto")) === "002") {
            ivaRetenido += numAttr(retention, "ImporteDR") || numAttr(retention, "Importe");
          }
        }
        pagos.push({
          uuid, serieFolio, emisor: nombreEmisor, receptor: nombreReceptor, fechaPago, formaPago: forma,
          docRelacionado: attr(related, "IdDocumento"), saldoAnterior: numAttr(related, "ImpSaldoAnt"),
          impPagado, saldoInsoluto: numAttr(related, "ImpSaldoInsoluto"), baseIVA16, iva16,
          exento: Math.max(0, impPagado - (baseIVA16 + iva16 + ieps - ivaRetenido)), rfcEmisor, rfcReceptor,
          nombreEmisor, nombreReceptor, fileName, ivaRetenido, ieps, iepsBreakdown, fechaEmision: fecha,
          moneda: attr(related, "MonedaDR") || monedaPago,
        });
      }
    }
  } else if (tipo === "I" || tipo === "E") {
    const subtotal = numAttr(comprobante, "SubTotal");
    const descuento = numAttr(comprobante, "Descuento");
    let iva16 = 0; let ieps = 0; let ivaRetenido = 0;
    const iepsBreakdown = {};
    for (const traslado of getNodes(doc, "Traslado")) {
      const isGlobal = traslado.parentElement?.parentElement?.localName?.includes("Comprobante") || traslado.parentElement?.localName?.includes("Impuestos");
      if (!isGlobal) continue;
      const tax = attr(traslado, "Impuesto");
      const rate = attr(traslado, "TasaOCuota");
      const factor = attr(traslado, "TipoFactor");
      const amount = numAttr(traslado, "Importe");
      if (tax === "002" && ["0.160000", "0.16"].includes(rate)) iva16 += amount;
      else if (tax === "003" && amount > 0) {
        ieps += amount;
        const label = formatIEPSRate(rate, factor);
        iepsBreakdown[label] = (iepsBreakdown[label] || 0) + amount;
      }
    }
    if (iva16 === 0) {
      for (const concept of getNodes(doc, "Concepto")) {
        for (const traslado of getNodes(concept, "Traslado")) {
          if (attr(traslado, "Impuesto") === "002" && ["0.160000", "0.16"].includes(attr(traslado, "TasaOCuota"))) iva16 += numAttr(traslado, "Importe");
        }
      }
    }
    const conceptIeps = {};
    for (const concept of getNodes(doc, "Concepto")) {
      for (const traslado of getNodes(concept, "Traslado")) {
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
    for (const retention of getNodes(doc, "Retencion")) {
      const isGlobal = retention.parentElement?.parentElement?.localName?.includes("Comprobante") || retention.parentElement?.localName?.includes("Impuestos");
      if (isGlobal && attr(retention, "Impuesto") === "002") ivaRetenido += numAttr(retention, "Importe");
    }
    if (ivaRetenido === 0) {
      for (const concept of getNodes(doc, "Concepto")) for (const retention of getNodes(concept, "Retencion")) if (attr(retention, "Impuesto") === "002") ivaRetenido += numAttr(retention, "Importe");
    }
    const cfdiRelacionado = getNodes(doc, "CfdiRelacionado").map((node) => attr(node, "UUID")).filter(Boolean).join(", ");
    facturas.push({
      uuid, tipo, serieFolio, emisor: nombreEmisor, receptor: nombreReceptor, fecha,
      formaPago: describePaymentForm(formaPago), metodoPago, moneda, subtotal, descuento, iva16, total,
      cfdiRelacionado, rfcEmisor, rfcReceptor, nombreEmisor, nombreReceptor, fileName, ivaRetenido, ieps, iepsBreakdown,
    });
    for (const concept of getNodes(doc, "Concepto")) {
      let conceptIva16 = 0; let conceptIeps = 0;
      const conceptIepsBreakdown = {};
      for (const traslado of getNodes(concept, "Traslado")) {
        const tax = attr(traslado, "Impuesto"); const rate = attr(traslado, "TasaOCuota");
        const factor = attr(traslado, "TipoFactor"); const amount = numAttr(traslado, "Importe");
        if (tax === "002" && ["0.160000", "0.16"].includes(rate)) conceptIva16 += amount;
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
        descuento: numAttr(concept, "Descuento"), importe: numAttr(concept, "Importe"), iva16: conceptIva16,
        serieFolio, ieps: conceptIeps, iepsBreakdown: conceptIepsBreakdown,
      });
    }
  }
  return { pagos, facturas, conceptos };
}

export async function parseFiles(files) {
  const selected = Array.from(files || []);
  if (!selected.length) throw new Error("Selecciona al menos un archivo XML o ZIP.");
  if (selected.length > 100) throw new Error("Puedes cargar hasta 100 archivos por análisis.");
  if (selected.some((file) => file.size > MAX_UPLOAD_BYTES)) throw new Error("Cada archivo debe pesar 20 MB o menos.");
  const result = { pagos: [], facturas: [], conceptos: [] };
  let xmlCount = 0; let totalInflated = 0;
  const addXml = (text, name) => {
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > MAX_XML_BYTES) throw new Error("Un XML supera el límite de 5 MB.");
    totalInflated += bytes;
    if (totalInflated > MAX_TOTAL_XML_BYTES) throw new Error("El contenido XML extraído supera el límite total de 25 MB.");
    xmlCount += 1;
    if (xmlCount > MAX_XML_FILES) throw new Error("El ZIP contiene más de 100 XML.");
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
      const zip = await JSZip.loadAsync(file, { checkCRC32: false });
      const xmlEntries = Object.entries(zip.files).filter(([name, entry]) => !entry.dir && name.toLowerCase().endsWith(".xml"));
      if (xmlEntries.length + xmlCount > MAX_XML_FILES) throw new Error("El ZIP y los archivos seleccionados superan el límite de 100 XML.");
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

export function enriquecerPagosConFacturas(pagos, facturas) {
  const invoices = new Map();
  for (const factura of facturas) if (factura.uuid) invoices.set(factura.uuid.toLowerCase().trim(), factura);
  return pagos.map((pago) => {
    const linked = invoices.get(String(pago.docRelacionado || "").toLowerCase().trim());
    if (!linked) {
      if (pago.baseIVA16 === 0 && pago.iva16 === 0 && pago.impPagado > 0) {
        const baseIVA16 = round2(pago.impPagado / 1.16);
        return { ...pago, baseIVA16, iva16: round2(pago.impPagado - baseIVA16), exento: 0, estimatedTax: true, relationStatus: "unmatched" };
      }
      return { ...pago, relationStatus: "unmatched" };
    }
    const proportion = linked.total > 0 ? pago.impPagado / linked.total : 0;
    const baseIVA16 = round2((linked.subtotal - (linked.descuento || 0)) * proportion);
    const iva16 = round2(linked.iva16 * proportion);
    const ivaRetenido = round2((linked.ivaRetenido || 0) * proportion);
    const ieps = round2((linked.ieps || 0) * proportion);
    const iepsBreakdown = {};
    for (const [rate, amount] of Object.entries(linked.iepsBreakdown || {})) {
      const scaled = round2(amount * proportion);
      if (scaled > 0) iepsBreakdown[rate] = scaled;
    }
    return {
      ...pago, baseIVA16, iva16, ivaRetenido, ieps,
      exento: Math.max(0, round2(pago.impPagado - (baseIVA16 + iva16 + ieps - ivaRetenido))),
      iepsBreakdown: Object.keys(pago.iepsBreakdown || {}).length ? pago.iepsBreakdown : iepsBreakdown,
      relationStatus: "matched", linkedInvoiceTotal: linked.total,
    };
  });
}

export const parserLimits = Object.freeze({ maxUploadBytes: MAX_UPLOAD_BYTES, maxXmlBytes: MAX_XML_BYTES, maxTotalXmlBytes: MAX_TOTAL_XML_BYTES, maxXmlFiles: MAX_XML_FILES });
