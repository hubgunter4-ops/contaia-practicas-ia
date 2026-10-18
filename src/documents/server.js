import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARS = 14_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 12;
const rateBuckets = new Map();
const MIME = {
  xml: "application/xml",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const SUPPORTED = new Set(Object.keys(MIME));
const ACTIONS = new Set(["read", "repair", "generate"]);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const extensionOf = (name) => String(name || "").toLowerCase().split(".").pop();
const cleanText = (value) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const escapeXml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const boundedText = (value) => {
  const text = cleanText(value);
  if (!text) throw fail("El documento no contiene texto legible.");
  return { text: text.slice(0, MAX_DOCUMENT_TEXT_CHARS), truncated: text.length > MAX_DOCUMENT_TEXT_CHARS };
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  response.end(JSON.stringify(payload));
}

function originAllowed(request, env) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  const protocol = request.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || (request.socket?.encrypted ? "https" : "http");
  const sameOrigin = origin === `${protocol}://${request.headers.host}`;
  const allowed = String(env.TUTOR_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
  return sameOrigin || allowed || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
}

function withinRateLimit(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.socket?.remoteAddress) || "unknown";
  const now = Date.now();
  const previous = rateBuckets.get(ip);
  if (!previous || now - previous.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (previous.count >= RATE_LIMIT) return false;
  previous.count += 1;
  return true;
}

async function readJson(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += Buffer.byteLength(chunk);
    if (total > MAX_BODY_BYTES) throw fail("La solicitud supera el límite de 12 MB.", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw fail("El cuerpo de la solicitud no contiene JSON válido."); }
}

function decodeFile(file) {
  if (!file || typeof file !== "object" || typeof file.name !== "string" || typeof file.base64 !== "string") throw fail("Adjunta un archivo válido.");
  const extension = extensionOf(file.name);
  if (!SUPPORTED.has(extension)) throw fail("Formato no compatible. Usa XML, CSV, XLSX, PDF o DOCX.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) || file.base64.length > Math.ceil(MAX_DOCUMENT_BYTES * 4 / 3) + 8) throw fail("El archivo codificado no es válido o supera 8 MB.", 413);
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length) throw fail("El archivo está vacío.");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw fail("El archivo supera el límite de 8 MB.", 413);
  return { name: file.name.slice(0, 160), extension, bytes };
}

function detectAction(instruction, explicit) {
  if (ACTIONS.has(explicit)) return explicit;
  const text = String(instruction || "");
  if (/\b(repara|reparar|corrige|corregir|arregla|arreglar|limpia|normaliza)\b/i.test(text)) return "repair";
  if (/\b(genera|generar|crea|crear|elabora|elaborar|exporta|exportar)\b/i.test(text)) return "generate";
  return "read";
}

function inferExtension(instruction, fallback = "docx") {
  const match = String(instruction || "").toLowerCase().match(/\b(xml|csv|xlsx|excel|pdf|docx|word)\b/);
  if (!match) return fallback;
  return match[1] === "excel" ? "xlsx" : match[1] === "word" ? "docx" : match[1];
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => Array.from({ length: width }, (_, index) => csvEscape(row[index] ?? "")).join(",")).join("\n") + "\n";
}

function xmlToText(xml) {
  return boundedText(String(xml).replace(/<\!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " "));
}

async function readDocx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("word/document.xml");
  if (!entry) throw fail("El DOCX no contiene word/document.xml.");
  const xml = await entry.async("string");
  const text = xml.replace(/<w:tab\s*\/?\s*>/g, "\t").replace(/<w:br\s*\/?\s*>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, "$1");
  return boundedText(text.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n"));
}

async function readPdf(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true }).promise;
    const chunks = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ");
      if (pageText) chunks.push(`[ Página ${pageNumber} ]\n${pageText}`);
    }
    const result = boundedText(chunks.join("\n"));
    return { ...result, pageCount: pdf.numPages };
  } catch (error) {
    if (error?.status) throw error;
    throw fail("No se pudo leer el PDF. Los PDF escaneados requieren OCR externo.");
  } finally { await pdf?.destroy?.().catch?.(() => {}); }
}

async function readSpreadsheet(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true, cellNF: true });
  const sections = workbook.SheetNames.slice(0, 20).map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }).slice(0, 500);
    return `## Hoja: ${name}\n${rows.map((row) => row.map((cell) => String(cell ?? "")).join(" | ")).join("\n")}`;
  });
  return { ...boundedText(sections.join("\n\n")), sheetCount: workbook.SheetNames.length };
}

async function readDocument(document) {
  if (document.extension === "xml") return { ...xmlToText(document.bytes.toString("utf8")), format: "xml" };
  if (document.extension === "csv") return { ...boundedText(parseCsv(document.bytes.toString("utf8")).map((row) => row.join(" | ")).join("\n")), format: "csv" };
  if (document.extension === "xlsx") return { ...(await readSpreadsheet(document.bytes)), format: "xlsx" };
  if (document.extension === "pdf") return { ...(await readPdf(document.bytes)), format: "pdf" };
  if (document.extension === "docx") return { ...(await readDocx(document.bytes)), format: "docx" };
  throw fail("Formato no compatible.");
}

function repairXml(source) {
  let xml = source.toString("utf8").replace(/^\uFEFF/, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  xml = xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/gi, "&amp;");
  const validation = XMLValidator.validate(xml);
  if (validation === true) return Buffer.from(xml, "utf8");
  try {
    const parsed = new XMLParser({ ignoreAttributes: false, preserveOrder: false, trimValues: false }).parse(xml);
    const rebuilt = new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: false }).build(parsed);
    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${rebuilt}\n`, "utf8");
  } catch { throw fail("El XML no pudo repararse automáticamente; conserva el original y revisa la etiqueta indicada."); }
}

async function repairDocument(document) {
  if (document.extension === "xml") return repairXml(document.bytes);
  if (document.extension === "csv") return Buffer.from(rowsToCsv(parseCsv(document.bytes.toString("utf8"))), "utf8");
  if (document.extension === "xlsx") {
    const workbook = XLSX.read(document.bytes, { type: "buffer" });
    return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  }
  if (document.extension === "pdf") return Buffer.from(await PDFDocument.load(document.bytes, { ignoreEncryption: true }).then((pdf) => pdf.save()));
  if (document.extension === "docx") {
    const zip = await JSZip.loadAsync(document.bytes);
    const xml = zip.file("word/document.xml");
    if (!xml) throw fail("El DOCX no contiene word/document.xml.");
    const content = await xml.async("string");
    zip.file("word/document.xml", content.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/gi, "&amp;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));
    return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  throw fail("Formato no compatible.");
}

function textLines(text) { return cleanText(text).split("\n").flatMap((line) => line.match(/.{1,95}/g) || [""]).slice(0, 500); }

function createDocx(text) {
  const paragraphs = textLines(text).map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function generateDocument(extension, instruction, sourceText = "") {
  const content = cleanText(sourceText || instruction);
  if (!content) throw fail("Incluye una instrucción o contenido para generar el documento.");
  if (extension === "xml") return { bytes: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<contaia-document><content>${escapeXml(content)}</content></contaia-document>`, "utf8"), mime: MIME.xml };
  if (extension === "csv") return { bytes: Buffer.from(rowsToCsv([["Contenido"], [content]]), "utf8"), mime: MIME.csv };
  if (extension === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const rows = content.includes("\n") ? parseCsv(content) : [["Contenido"], [content]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Contenido");
    return { bytes: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), mime: MIME.xlsx };
  }
  if (extension === "docx") return { bytes: await createDocx(content), mime: MIME.docx };
  if (extension === "pdf") {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([612, 792]);
    let y = 750;
    for (const line of textLines(content)) {
      if (y < 48) { page = pdf.addPage([612, 792]); y = 750; }
      page.drawText(line, { x: 48, y, size: 10, font, color: rgb(0.12, 0.12, 0.12) });
      y -= 15;
    }
    return { bytes: Buffer.from(await pdf.save()), mime: MIME.pdf };
  }
  throw fail("Formato de salida no compatible.");
}

function safeOutputName(name, action, extension) {
  const base = String(name || "documento").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "documento";
  return `${base}-${action === "repair" ? "reparado" : "generado"}.${extension}`;
}

export async function handleDocuments(request, response, env = process.env) {
  if (!originAllowed(request, env)) return sendJson(response, 403, { error: "Origen no autorizado." });
  if (request.method === "OPTIONS") { response.writeHead(204, { "Cache-Control": "no-store", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" }); return response.end(); }
  if (request.method !== "POST") return sendJson(response, 405, { error: "Método no permitido." });
  if (!withinRateLimit(request)) return sendJson(response, 429, { error: "Hay demasiadas operaciones de documentos desde esta conexión; espera unos minutos." });
  try {
    const body = await readJson(request);
    if (!body || typeof body.instruction !== "string" || body.instruction.trim().length > 4_000) throw fail("La instrucción es obligatoria y debe tener hasta 4,000 caracteres.");
    const action = detectAction(body.instruction, body.action);
    let document = body.file ? decodeFile(body.file) : null;
    if (action !== "generate" && !document) throw fail("Adjunta un XML, CSV, XLSX, PDF o DOCX para esta operación.");
    if (action === "generate" && !document) {
      const extension = inferExtension(body.instruction, "docx");
      const output = await generateDocument(extension, body.instruction);
      if (output.bytes.length > MAX_DOCUMENT_BYTES) throw fail("El archivo generado supera el límite de 8 MB.", 413);
      return sendJson(response, 200, { action, result: { kind: "file", name: safeOutputName("documento", action, extension), mime: output.mime, bytes: output.bytes.length, base64: output.bytes.toString("base64") } });
    }
    if (action === "read") {
      const result = await readDocument(document);
      return sendJson(response, 200, { action, input: { name: document.name, format: document.extension }, result: { kind: "text", ...result } });
    }
    if (action === "repair") {
      const bytes = await repairDocument(document);
      if (bytes.length > MAX_DOCUMENT_BYTES) throw fail("El archivo reparado supera el límite de 8 MB.", 413);
      return sendJson(response, 200, { action, input: { name: document.name, format: document.extension }, result: { kind: "file", name: safeOutputName(document.name, action, document.extension), mime: MIME[document.extension], bytes: bytes.length, base64: bytes.toString("base64") } });
    }
    const source = document ? await readDocument(document) : null;
    const extension = inferExtension(body.instruction, document?.extension || "docx");
    const output = await generateDocument(extension, body.instruction, source?.text || "");
    if (output.bytes.length > MAX_DOCUMENT_BYTES) throw fail("El archivo generado supera el límite de 8 MB.", 413);
    return sendJson(response, 200, { action, input: document ? { name: document.name, format: document.extension } : null, result: { kind: "file", name: safeOutputName(document?.name || "documento", action, extension), mime: output.mime, bytes: output.bytes.length, base64: output.bytes.toString("base64") } });
  } catch (error) {
    return sendJson(response, Number.isInteger(error?.status) ? error.status : 500, { error: error?.status ? error.message : "No se pudo procesar el documento." });
  }
}

export const __test = { detectAction, inferExtension, parseCsv, rowsToCsv, repairXml, escapeXml };
