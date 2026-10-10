export const MAX_DOCUMENT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARS = 14_000;

const extensionOf = (name) => String(name ?? "").toLowerCase().split(".").pop();
const cleanText = (text) => String(text ?? "")
  .replace(/\r\n?/g, "\n")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .trim();

function boundedResult(name, text, pageCount = null) {
  const cleaned = cleanText(text);
  const truncated = cleaned.length > MAX_DOCUMENT_TEXT_CHARS;
  const content = cleaned.slice(0, MAX_DOCUMENT_TEXT_CHARS);
  if (!content) throw new Error("El documento no contiene texto legible.");
  return { name, text: content, chars: content.length, truncated, pageCount };
}

export async function extractDocumentText(file, { pdfjsLoader = () => import("pdfjs-dist/build/pdf.mjs") } = {}) {
  if (!file || typeof file.name !== "string" || typeof file.size !== "number") {
    throw new TypeError("Selecciona un archivo para consultar.");
  }
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_DOCUMENT_FILE_BYTES) throw new Error("El archivo supera el límite de 8 MB.");

  const extension = extensionOf(file.name);
  if (!["pdf", "txt", "csv"].includes(extension)) {
    throw new Error("Formato no compatible. Elige un PDF, TXT o CSV.");
  }

  if (extension === "txt" || extension === "csv") {
    if (typeof file.text !== "function") throw new Error("No se pudo leer el texto del archivo.");
    return boundedResult(file.name, await file.text());
  }

  if (typeof file.arrayBuffer !== "function") throw new Error("No se pudo leer el archivo PDF.");
  const pdfjs = await pdfjsLoader();
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
  let pdf;
  try {
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    const chunks = [];
    let length = 0;
    let truncated = false;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ");
      const section = pageText ? `\n[ Página ${pageNumber} ]\n${pageText}` : "";
      if (!section) continue;
      const remaining = MAX_DOCUMENT_TEXT_CHARS - length;
      if (section.length > remaining) {
        chunks.push(section.slice(0, remaining));
        truncated = true;
        break;
      }
      chunks.push(section);
      length += section.length;
      if (length >= MAX_DOCUMENT_TEXT_CHARS) {
        truncated = pageNumber < pdf.numPages;
        break;
      }
    }
    const result = boundedResult(file.name, chunks.join(""), pdf.numPages);
    return { ...result, truncated: result.truncated || truncated };
  } catch (error) {
    if (error instanceof Error && /no contiene texto legible/.test(error.message)) throw error;
    throw new Error("No se pudo leer el PDF. Si es escaneado, esta versión no incluye OCR.");
  } finally {
    await pdf?.destroy?.().catch?.(() => {});
  }
}
