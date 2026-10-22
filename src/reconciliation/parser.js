export const MAX_BANK_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_BANK_ROWS = 5_000;
export const MAX_HEADER_SCAN_ROWS = 20;
const XLSX_VENDOR_URL = "/vendor/reconciliation-xlsx.js";

function validateFile(file) {
  if (!file || typeof file !== "object") throw new Error("Selecciona un archivo CSV o Excel.");
  if (!file.size) throw new Error("El archivo está vacío.");
  if (file.size > MAX_BANK_FILE_BYTES) throw new Error("El archivo supera el límite de 8 MiB.");
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (!["csv", "xlsx", "xls"].includes(extension)) throw new Error("Formato no admitido. Elige CSV, XLSX o XLS.");
  return extension;
}

function pushRow(rows, row, maxRows) {
  rows.push(row);
  if (rows.length > maxRows + MAX_HEADER_SCAN_ROWS) {
    throw new Error(`El extracto supera el límite de ${MAX_BANK_ROWS.toLocaleString("es-MX")} filas.`);
  }
}

export function parseCsvText(text, delimiter = ",", { maxRows = MAX_BANK_ROWS } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("El CSV no contiene filas para leer.");
  if (![",", ";", "\t", "|"] .includes(delimiter)) throw new Error("El delimitador seleccionado no es válido.");
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"' && field.length === 0) { quoted = true; continue; }
    if (character === delimiter) { row.push(field.trim()); field = ""; continue; }
    if (character === "\n" || character === "\r") {
      row.push(field.trim());
      if (row.some((cell) => String(cell).trim())) pushRow(rows, row, maxRows);
      row = []; field = "";
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      continue;
    }
    field += character;
  }
  if (quoted) throw new Error("El CSV tiene una comilla sin cerrar. Revisa su estructura antes de volver a cargarlo.");
  row.push(field.trim());
  if (row.some((cell) => String(cell).trim())) pushRow(rows, row, maxRows);
  if (rows.length < 2) throw new Error("El CSV debe incluir una fila de encabezados y al menos un movimiento.");
  if (rows[0].length < 2) throw new Error("No se detectaron columnas suficientes. Revisa el delimitador del CSV.");
  return rows;
}

export function detectCsvDelimiter(text) {
  const candidates = [",", ";", "\t", "|"];
  const sample = String(text || "").replace(/^\uFEFF/, "").slice(0, 32_000);
  const counts = candidates.map((delimiter) => {
    const rows = parseCsvSample(sample, delimiter);
    if (!rows.length) return { delimiter, score: 0 };
    const frequency = new Map();
    for (const columns of rows) frequency.set(columns, (frequency.get(columns) || 0) + 1);
    const consistent = Math.max(...frequency.values()) / rows.length;
    const width = Math.min(20, Math.max(...rows));
    return { delimiter, score: width > 1 ? consistent * width : 0 };
  });
  counts.sort((left, right) => right.score - left.score);
  return counts[0]?.score > 0 ? counts[0].delimiter : ",";
}

function parseCsvSample(text, delimiter) {
  const widths = [];
  let quoted = false;
  let width = 1;
  for (let index = 0; index < text.length && widths.length < 25; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') index += 1;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === delimiter) width += 1;
    else if (character === "\n" || character === "\r") {
      widths.push(width);
      width = 1;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    }
  }
  if (width > 1) widths.push(width);
  return widths;
}

export async function readBankCsvFile(file, delimiter = "auto") {
  const extension = validateFile(file);
  if (extension !== "csv") throw new Error("Este archivo no es CSV.");
  const text = await file.text();
  const selectedDelimiter = delimiter === "auto" ? detectCsvDelimiter(text) : delimiter;
  return { kind: "csv", delimiter: selectedDelimiter, text, sheetNames: [], rawRows: parseCsvText(text, selectedDelimiter) };
}

export async function readBankWorkbook(file, { loadXlsx = () => import(XLSX_VENDOR_URL) } = {}) {
  const extension = validateFile(file);
  if (!["xlsx", "xls"].includes(extension)) throw new Error("Este archivo no es Excel.");
  const xlsx = await loadXlsx();
  const read = xlsx.read || xlsx.default?.read;
  const utils = xlsx.utils || xlsx.default?.utils;
  if (typeof read !== "function" || !utils) throw new Error("No se pudo iniciar el lector local de Excel.");
  const workbook = read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true, sheetRows: MAX_BANK_ROWS + MAX_HEADER_SCAN_ROWS + 1 });
  const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
  if (!sheetNames.length) throw new Error("El libro de Excel no contiene hojas visibles para leer.");
  const sheets = {};
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = sheet?.["!ref"] && utils.decode_range ? utils.decode_range(sheet["!ref"]) : null;
    if (range && range.e.r + 1 > MAX_BANK_ROWS + MAX_HEADER_SCAN_ROWS) {
      throw new Error(`La hoja «${sheetName}» supera el límite de ${MAX_BANK_ROWS.toLocaleString("es-MX")} filas.`);
    }
    const rows = utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
    if (rows.length > MAX_BANK_ROWS + MAX_HEADER_SCAN_ROWS) throw new Error(`La hoja «${sheetName}» supera el límite de filas permitido.`);
    sheets[sheetName] = rows.map((row) => Array.isArray(row) ? row.map((cell) => cell instanceof Date ? cell.toISOString() : cell) : []);
  }
  return { kind: "excel", workbook, sheetNames, sheets, rawRows: sheets[sheetNames[0]] || [], delimiter: "" };
}

export async function readBankFile(file, options = {}) {
  const extension = validateFile(file);
  return extension === "csv"
    ? readBankCsvFile(file, options.delimiter || "auto")
    : readBankWorkbook(file, { loadXlsx: options.loadXlsx });
}
