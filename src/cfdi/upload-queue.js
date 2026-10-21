export const MAX_BATCH_FILES = 100;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function validateCfdiUploadFile(file) {
  const name = String(file?.name ?? "");
  const extension = name.split(".").pop()?.toLowerCase();
  const size = Number(file?.size);
  if (!name || !["xml", "zip"].includes(extension)) {
    return { valid: false, format: extension ? extension.toUpperCase() : "—", reason: "Formato no admitido; usa XML o ZIP." };
  }
  if (!Number.isFinite(size) || size < 0) {
    return { valid: false, format: extension.toUpperCase(), reason: "No se pudo leer el tamaño del archivo." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { valid: false, format: extension.toUpperCase(), reason: "Supera el máximo de 20 MB por archivo." };
  }
  return { valid: true, format: extension.toUpperCase(), reason: "" };
}

export function addCfdiFilesToQueue(currentFiles, incomingFiles) {
  const existing = Array.isArray(currentFiles) ? currentFiles : [];
  const incoming = Array.from(incomingFiles || []);
  const available = Math.max(0, MAX_BATCH_FILES - existing.length);
  const added = incoming.slice(0, available);
  return { files: [...existing, ...added], skipped: incoming.length - added.length };
}

export function reviewCfdiQueue(files) {
  const items = Array.from(files || []).map((file, index) => ({ file, index, ...validateCfdiUploadFile(file) }));
  const totalBytes = items.reduce((total, item) => total + (Number.isFinite(Number(item.file?.size)) ? Number(item.file.size) : 0), 0);
  const validCount = items.filter((item) => item.valid).length;
  return {
    items,
    totalBytes,
    validCount,
    invalidCount: items.length - validCount,
    canAnalyze: items.length > 0 && items.length <= MAX_BATCH_FILES && validCount === items.length,
  };
}

export function formatCfdiFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "Tamaño desconocido";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}
