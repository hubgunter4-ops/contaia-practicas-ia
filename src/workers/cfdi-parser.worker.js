import { parseFiles } from "/vendor/cfdi-parser.js";

function asLocalFile(entry) {
  const buffer = entry?.buffer;
  if (!(buffer instanceof ArrayBuffer)) throw new Error("El buffer CFDI no es válido.");
  const name = String(entry.name || "comprobante.xml");
  return {
    name,
    size: Number(entry.size) || buffer.byteLength,
    async text() { return new TextDecoder().decode(buffer); },
    async arrayBuffer() { return buffer; },
  };
}

function safeError(error) {
  return {
    errorCode: error?.name === "AbortError" ? "aborted" : "parse_error",
    errorMessage: String(error?.message || "No se pudo analizar el lote CFDI.").slice(0, 300),
  };
}

self.onmessage = async ({ data }) => {
  if (data?.type !== "parse") return;
  const requestId = data.requestId;
  try {
    const entries = Array.isArray(data.payload?.files) ? data.payload.files : [];
    self.postMessage({ type: "progress", requestId, progress: { processed: 0, total: entries.length } });
    const result = await parseFiles(entries.map(asLocalFile));
    self.postMessage({ type: "result", requestId, sessionEpoch: data.sessionEpoch, result });
  } catch (error) {
    const failure = safeError(error);
    self.postMessage({ type: "error", requestId, sessionEpoch: data.sessionEpoch, ...failure });
  } finally {
    self.close();
  }
};
