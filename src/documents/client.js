export const MAX_DOCUMENT_FILE_BYTES = 8 * 1024 * 1024;

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  return btoa(binary);
}

export async function processDocumentFile(file, instruction, { fetchImpl = fetch, signal } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Adjunta un archivo para procesarlo.");
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_DOCUMENT_FILE_BYTES) throw new Error("El archivo supera el límite de 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const response = await fetchImpl("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ instruction: String(instruction || "").trim(), file: { name: String(file.name).slice(0, 160), type: file.type || "", base64: toBase64(bytes) } }),
    signal,
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error("La API de documentos devolvió una respuesta inválida."); }
  if (!response.ok) throw new Error(payload?.error || "No se pudo procesar el documento.");
  return payload;
}

export function downloadDocumentArtifact(artifact) {
  if (!artifact?.base64 || !artifact?.name) throw new Error("El archivo generado no está disponible.");
  const binary = atob(artifact.base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: artifact.mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
