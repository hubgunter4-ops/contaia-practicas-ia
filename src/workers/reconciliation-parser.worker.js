import { parseCsvText, readBankFile } from "../reconciliation/parser.js";

function decodeBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error("El buffer bancario no es válido.");
  return new TextDecoder().decode(buffer);
}

function asLocalFile(entry) {
  const buffer = entry?.buffer;
  return {
    name: String(entry.name || "extracto.csv"),
    size: Number(entry.size) || buffer?.byteLength || 0,
    async text() { return decodeBuffer(buffer); },
    async arrayBuffer() { return buffer; },
  };
}

function safeResult(parsed) {
  return {
    kind: parsed.kind,
    delimiter: parsed.delimiter || "",
    text: parsed.kind === "csv" ? parsed.text : "",
    sheetNames: Array.isArray(parsed.sheetNames) ? parsed.sheetNames : [],
    sheets: parsed.sheets || {},
    rawRows: parsed.rawRows || [],
  };
}

function safeError(error) {
  return {
    errorCode: "bank_parse_error",
    errorMessage: String(error?.message || "No se pudo leer el extracto local.").slice(0, 300),
  };
}

self.onmessage = async ({ data }) => {
  if (data?.type !== "parse") return;
  const requestId = data.requestId;
  try {
    const operation = data.payload?.operation || "file";
    let result;
    if (operation === "csv-delimiter") {
      const text = decodeBuffer(data.payload.buffer);
      const delimiter = data.payload.delimiter || ",";
      result = { kind: "csv", delimiter, text, sheetNames: [], sheets: {}, rawRows: parseCsvText(text, delimiter) };
    } else {
      const entry = data.payload?.file;
      const parsed = await readBankFile(asLocalFile(entry), { delimiter: data.payload?.delimiter || "auto" });
      result = safeResult(parsed);
    }
    self.postMessage({ type: "result", requestId, sessionEpoch: data.sessionEpoch, result });
  } catch (error) {
    self.postMessage({ type: "error", requestId, sessionEpoch: data.sessionEpoch, ...safeError(error) });
  } finally {
    self.close();
  }
};
