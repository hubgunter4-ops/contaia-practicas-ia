import { createWorkerBridge, SessionExpiredError } from "../app/worker-bridge.js";
import { MAX_BANK_ROWS, MAX_HEADER_SCAN_ROWS } from "./parser.js";
import { buildReconciliationRows, normalizeBankRows, summarizeReconciliationRows } from "./matching.js";
import { renderNoraContextCard, renderToolHeader } from "../tools/tool-shell.js";

const DEFAULT_MAPPING = Object.freeze({ date: "", amount: "", reference: "", currency: "", description: "", direction: "" });
const DEFAULT_SETTINGS = Object.freeze({ dateFormat: "", decimalMark: ".", amountConvention: "", defaultCurrency: "", sourceType: "", dateToleranceDays: 3 });
const PAGE_SIZE = 100;
const FILTER_OPTIONS = Object.freeze([
  ["all", "Todos"], ["suggested", "Candidatas"], ["difference", "Diferencias"],
  ["ambiguous", "Ambiguas"], ["unmatched", "Sin candidato"], ["invalid", "Revisar datos"],
]);
const FIELD_DEFINITIONS = Object.freeze([
  ["date", "Fecha del movimiento", true], ["amount", "Importe del movimiento", true],
  ["reference", "Referencia", false], ["currency", "Moneda (columna)", false],
  ["description", "Descripción", false], ["direction", "Cargo/abono", false],
]);

const emptyState = () => ({
  fileName: "", fileSize: 0, fileKind: "", delimiter: ",", csvText: "", sheets: {}, sheetNames: [], sheetName: "", rawRows: [],
  headerRow: 0, headers: [], mapping: { ...DEFAULT_MAPPING }, settings: { ...DEFAULT_SETTINGS },
  loading: false, error: "", notice: "", movements: [], results: [], analyzed: false, filter: "all", visibleRows: PAGE_SIZE,
  dropActive: false, loadToken: 0,
});
export const reconciliationState = emptyState();
const reconciliationParserBridge = createWorkerBridge({ epochProvider: () => reconciliationState.loadToken });
let activeReconciliationParseController = null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

export function resetReconciliationWorkspace() {
  const nextToken = (Number(reconciliationState.loadToken) || 0) + 1;
  activeReconciliationParseController?.abort("workspace-reset");
  activeReconciliationParseController = null;
  reconciliationParserBridge.cancelAll("workspace-reset");
  Object.assign(reconciliationState, emptyState(), { loadToken: nextToken });
}

function selectedRows() {
  const headerIndex = Math.max(0, Math.min(MAX_HEADER_SCAN_ROWS - 1, Number(reconciliationState.headerRow) || 0));
  const headers = Array.isArray(reconciliationState.rawRows[headerIndex]) ? reconciliationState.rawRows[headerIndex] : [];
  const rows = reconciliationState.rawRows.slice(headerIndex + 1).filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""));
  return { headers: headers.map((cell) => String(cell ?? "").trim()), rows };
}

function mappingSelect(field, label, required, headers, selected) {
  const selectedIndex = selected === "" || selected === null || selected === undefined ? -1 : Number(selected);
  const options = headers.map((header, index) => {
    const display = header || `Columna ${index + 1}`;
    const duplicates = headers.slice(0, index).filter((item) => item === header).length;
    return `<option value="${index}" ${selectedIndex === index ? "selected" : ""}>${escapeHtml(display)}${duplicates ? ` · columna ${index + 1}` : ""}</option>`;
  }).join("");
  return `<label class="recon-field recon-field--${escapeHtml(field)}" for="recon-map-${escapeHtml(field)}"><span>${escapeHtml(label)}${required ? " *" : ""}</span><select id="recon-map-${escapeHtml(field)}" data-recon-map="${escapeHtml(field)}" ${required ? "required" : ""}><option value="">${required ? "Selecciona una columna" : "No usar"}</option>${options}</select></label>`;
}

function renderSettings() {
  const { settings } = reconciliationState;
  return `<div class="recon-form-grid">
    <label class="recon-field" for="recon-date-format"><span>Formato de fecha *</span><select id="recon-date-format" data-recon-setting="dateFormat" required><option value="">Selecciona…</option><option value="dmy" ${settings.dateFormat === "dmy" ? "selected" : ""}>Día / mes / año</option><option value="mdy" ${settings.dateFormat === "mdy" ? "selected" : ""}>Mes / día / año</option><option value="ymd" ${settings.dateFormat === "ymd" ? "selected" : ""}>Año / mes / día</option><option value="excel" ${settings.dateFormat === "excel" ? "selected" : ""}>Fecha ISO o serial de Excel</option></select></label>
    <label class="recon-field" for="recon-decimal-mark"><span>Separador decimal *</span><select id="recon-decimal-mark" data-recon-setting="decimalMark"><option value="." ${settings.decimalMark === "." ? "selected" : ""}>Punto · 1,234.56</option><option value="," ${settings.decimalMark === "," ? "selected" : ""}>Coma · 1.234,56</option></select></label>
    <label class="recon-field" for="recon-amount-convention"><span>Convención del signo *</span><select id="recon-amount-convention" data-recon-setting="amountConvention" required><option value="">Selecciona…</option><option value="signed" ${settings.amountConvention === "signed" ? "selected" : ""}>El importe ya usa signo (+ / −)</option><option value="credit-positive" ${settings.amountConvention === "credit-positive" ? "selected" : ""}>Los abonos son positivos</option><option value="debit-positive" ${settings.amountConvention === "debit-positive" ? "selected" : ""}>Los cargos son positivos</option></select><small>El signo se normaliza para mostrarlo, pero no se compara contra el rol fiscal en este corte.</small></label>
    <label class="recon-field" for="recon-default-currency"><span>Moneda por defecto *</span><input id="recon-default-currency" data-recon-setting="defaultCurrency" value="${escapeHtml(settings.defaultCurrency)}" maxlength="3" pattern="[A-Za-z]{3}" placeholder="MXN" autocomplete="off" ${reconciliationState.mapping.currency !== "" ? "disabled" : "required"}/><small>Obligatoria si no mapeas una columna de moneda; código ISO de tres letras.</small></label>
    <label class="recon-field" for="recon-source-type"><span>Fuente CFDI en memoria *</span><select id="recon-source-type" data-recon-setting="sourceType" required><option value="">Selecciona…</option><option value="invoices" ${settings.sourceType === "invoices" ? "selected" : ""}>Facturas (${Number(reconciliationState.sourceInvoiceCount) || 0})</option><option value="payments" ${settings.sourceType === "payments" ? "selected" : ""}>Pagos CFDI (${Number(reconciliationState.sourcePaymentCount) || 0})</option><option value="both" ${settings.sourceType === "both" ? "selected" : ""}>Facturas y pagos</option></select></label>
    <label class="recon-field" for="recon-date-tolerance"><span>Ventana de fecha *</span><div class="recon-input-suffix"><input id="recon-date-tolerance" data-recon-setting="dateToleranceDays" type="number" min="0" max="31" step="1" value="${escapeHtml(settings.dateToleranceDays)}"/><span>días</span></div><small>±3 días es una propuesta inicial ajustable, no una regla fiscal.</small></label>
  </div>`;
}

function renderColumnMapping() {
  if (!reconciliationState.rawRows.length) return `<p class="recon-inline-note">Carga un extracto para elegir sus columnas.</p>`;
  const { headers, rows } = selectedRows();
  const headerOptions = Array.from({ length: Math.min(MAX_HEADER_SCAN_ROWS, Math.max(1, reconciliationState.rawRows.length - 1)) }, (_, index) => `<option value="${index}" ${index === reconciliationState.headerRow ? "selected" : ""}>Fila ${index + 1}${headers.length && index === reconciliationState.headerRow ? ` · ${escapeHtml(headers.filter(Boolean).slice(0, 3).join(" · "))}` : ""}</option>`).join("");
  const mapping = reconciliationState.mapping;
  const canMap = headers.filter(Boolean).length > 0;
  return `<section class="recon-mapping" aria-labelledby="recon-map-title"><div class="recon-section-title"><div><p class="eyebrow">02 · CONFIGURA LA LECTURA</p><h2 id="recon-map-title">Relaciona las columnas del archivo</h2></div><span class="recon-row-pill">${rows.length.toLocaleString("es-MX")} filas bajo encabezado</span></div>
    <label class="recon-field recon-header-row" for="recon-header-row"><span>Fila de encabezados</span><select id="recon-header-row" data-recon-header-row>${headerOptions}</select></label>
    ${canMap ? `<div class="recon-form-grid recon-column-grid">${FIELD_DEFINITIONS.map(([field, label, required]) => mappingSelect(field, label, required, headers, mapping[field])).join("")}</div>` : `<p class="recon-inline-error" role="alert">La fila elegida no contiene encabezados legibles; selecciona otra fila.</p>`}
    <details class="recon-preview"><summary>Vista previa local · primeras 4 filas</summary><div class="recon-preview-scroll"><table><thead><tr>${headers.map((header, index) => `<th scope="col">${escapeHtml(header || `Columna ${index + 1}`)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 4).map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>
  </section>`;
}

function renderSummary(summary) {
  const cards = [
    ["Movimientos leídos", summary.total, "total"],
    ["Candidatas", summary.suggested, "suggested"],
    ["Diferencias", summary.difference, "difference"],
    ["Ambiguas / sin candidato", summary.ambiguous + summary.unmatched + summary.invalid, "review"],
  ];
  return `<section class="recon-summary" aria-label="Resumen de la revisión">${cards.map(([label, value, kind]) => `<article class="recon-summary-card recon-summary-card--${kind}"><span>${escapeHtml(label)}</span><b>${Number(value).toLocaleString("es-MX")}</b></article>`).join("")}</section>`;
}

function resultLabel(result) {
  return ({ suggested: "Candidata · revisar", difference: "Diferencia", ambiguous: "Ambigua", unmatched: "Sin candidato", invalid: "Revisar datos" })[result] || "Pendiente";
}

function resultClass(result) {
  return ({ suggested: "is-suggested", difference: "is-difference", ambiguous: "is-ambiguous", unmatched: "is-unmatched", invalid: "is-invalid" })[result] || "";
}

function confidenceLabel(confidence) {
  return ({ high: "Alta", medium: "Media", low: "Baja", none: "Sin sugerencia" })[confidence] || "Sin sugerencia";
}

function formatMoney(cents, currency) {
  if (!Number.isSafeInteger(cents)) return "—";
  try { return new Intl.NumberFormat("es-MX", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100); }
  catch { return `${currency || ""} ${(cents / 100).toFixed(2)}`.trim(); }
}

function compactReference(value) {
  const text = String(value ?? "");
  return text.length > 20 ? `${text.slice(0, 9)}…${text.slice(-7)}` : text || "—";
}

function renderCandidate(candidate, movement) {
  if (!candidate) return `<span class="recon-no-candidate">Sin candidato para los filtros actuales</span>`;
  const delta = candidate.amountDifferenceCents ? formatMoney(candidate.amountDifferenceCents, movement.currency) : "$0.00";
  return `<div class="recon-candidate"><b>${escapeHtml(candidate.kind)} · ${escapeHtml(candidate.label)}</b><span>${escapeHtml(formatMoney(candidate.amountCents, candidate.currency))} · ${escapeHtml(candidate.dateIso)}</span><small>Diferencia de importe: ${escapeHtml(delta)} · ${candidate.daysApart === null ? "fecha no comparable" : `${candidate.daysApart} día(s)`}</small></div>`;
}

function renderEvidence(row) {
  if (!row.evidence?.length) return "—";
  return `<ul class="recon-evidence">${row.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderResultRow(row) {
  const candidate = row.candidates?.[0];
  const alternatives = row.candidates?.length > 1 ? `<details class="recon-alternatives"><summary>${row.candidates.length} candidatos posibles</summary>${row.candidates.map((item) => renderCandidate(item, row)).join("")}</details>` : renderCandidate(candidate, row);
  return `<tr class="${resultClass(row.result)}" data-recon-result="${escapeHtml(row.result)}">
    <td data-label="Fila / fecha"><span class="recon-row-number">Fila ${row.rowNumber}</span><b>${escapeHtml(row.dateIso || "Fecha sin normalizar")}</b></td>
    <td data-label="Movimiento"><b class="recon-amount">${escapeHtml(formatMoney(row.amountCents, row.currency))}</b><small>${escapeHtml(row.currency || "Moneda sin identificar")} · ${row.amountCents < 0 ? "cargo/signo −" : "abono/signo +"}</small><small title="Referencia original">Ref.: ${escapeHtml(compactReference(row.reference))}</small></td>
    <td data-label="Candidato CFDI">${alternatives}</td>
    <td data-label="Evidencia">${renderEvidence(row)}</td>
    <td data-label="Estado"><span class="recon-state ${resultClass(row.result)}">${escapeHtml(resultLabel(row.result))}</span><span class="recon-confidence">Confianza heurística: ${escapeHtml(confidenceLabel(row.confidence))}</span><small class="recon-confidence-note">No es probabilidad. Dirección bancaria pendiente de revisión.</small></td>
    <td data-label="Datos originales"><details class="recon-original"><summary>Ver fila</summary><dl><dt>Fecha interpretada</dt><dd>${escapeHtml(row.dateIso || "No válida")}</dd><dt>Importe con signo</dt><dd>${escapeHtml(formatMoney(row.signedAmountCents, row.currency))}</dd><dt>Referencia</dt><dd>${escapeHtml(row.reference || "Sin referencia")}</dd><dt>Descripción</dt><dd>${escapeHtml(row.description || "Sin descripción")}</dd>${row.reasons?.length ? `<dt>Validación</dt><dd>${row.reasons.map(escapeHtml).join(" ")}</dd>` : ""}</dl></details></td>
  </tr>`;
}

function renderResults() {
  const { results, filter, visibleRows } = reconciliationState;
  if (!reconciliationState.analyzed) {
    const analysis = reconciliationState.analysisPresent;
    return `<section class="recon-results-empty" aria-label="Tabla de coincidencias"><div class="recon-empty-mark" aria-hidden="true">↔</div><h2>La tabla se llena con sugerencias revisables</h2><p>${analysis ? "Completa los campos requeridos y genera sugerencias. Los candidatos solo se calculan en este navegador." : "Carga primero un análisis CFDI en esta pestaña y vuelve aquí. Sin fuente válida, no se calcula ni se muestra un cero engañoso."}</p>${analysis ? "" : `<div class="island-empty-actions"><button type="button" class="button button-primary" data-section="cfdi">Abrir Analizador CFDI <span aria-hidden="true">→</span></button></div>`}</section>`;
  }
  const summary = summarizeReconciliationRows(results);
  const filtered = filter === "all" ? results : results.filter((row) => row.result === filter);
  const shown = filtered.slice(0, visibleRows);
  return `<section class="recon-results" aria-labelledby="recon-results-title">${renderSummary(summary)}<div class="recon-results-heading"><div><p class="eyebrow">03 · REVISIÓN HUMANA</p><h2 id="recon-results-title">Candidatos a coincidencia</h2><p>Una sugerencia no confirma una conciliación ni modifica un CFDI.</p></div><div class="recon-results-actions"><label class="recon-filter" for="recon-filter"><span>Mostrar</span><select id="recon-filter" data-recon-filter>${FILTER_OPTIONS.map(([value, label]) => `<option value="${value}" ${filter === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><button type="button" class="button button-quiet recon-handoff" data-recon-handoff="journal" ${results.length ? "" : "disabled"}>Usar movimientos revisados en Pólizas</button></div></div>
    <div class="recon-table-wrap"><table class="recon-table"><thead><tr><th scope="col">Movimiento</th><th scope="col">Importe y referencia</th><th scope="col">Candidato CFDI</th><th scope="col">Evidencia</th><th scope="col">Estado y confianza</th><th scope="col">Detalle</th></tr></thead><tbody>${shown.length ? shown.map(renderResultRow).join("") : `<tr><td colspan="6" class="recon-no-results">No hay filas para este filtro.</td></tr>`}</tbody></table></div>${filtered.length > shown.length ? `<button type="button" class="button button-quiet recon-more" data-recon-more>Mostrar ${Math.min(PAGE_SIZE, filtered.length - shown.length)} filas más (${filtered.length - shown.length} restantes)</button>` : ""}
    <p class="recon-review-note"><b>Revisión pendiente:</b> el prototipo no contrasta el signo con el rol del emisor/receptor ni confirma enlaces. Verifica manualmente dirección, parcialidades, comisiones y reversas antes de concluir.</p>
  </section>`;
}

function canGenerate(analysisPresent) {
  const { rawRows, mapping, settings } = reconciliationState;
  const { rows } = selectedRows();
  return Boolean(
    rawRows.length && rows.length && analysisPresent
    && Number.isInteger(Number(mapping.date)) && mapping.date !== ""
    && Number.isInteger(Number(mapping.amount)) && mapping.amount !== ""
    && settings.dateFormat && settings.amountConvention && settings.sourceType
    && (mapping.currency !== "" || /^[A-Z]{3}$/.test(settings.defaultCurrency.trim().toUpperCase()))
    && rows.length <= MAX_BANK_ROWS,
  );
}

export function renderReconciliationWorkspace({ analysis = null } = {}) {
  const invoiceCount = Array.isArray(analysis?.facturas) ? analysis.facturas.length : 0;
  const paymentCount = Array.isArray(analysis?.pagos) ? analysis.pagos.length : 0;
  reconciliationState.analysisPresent = invoiceCount + paymentCount > 0;
  reconciliationState.sourceInvoiceCount = invoiceCount;
  reconciliationState.sourcePaymentCount = paymentCount;
  const availableSource = reconciliationState.analysisPresent;
  const { headers, rows } = selectedRows();
  const startRows = reconciliationState.rawRows.length ? rows : [];
  const canAnalyze = canGenerate(availableSource);
  const header = renderToolHeader({
    id: "bank-reconciliation",
    eyebrow: "CONTAIA HERRAMIENTAS · MOVIMIENTOS LOCALES",
    title: "Conciliación bancaria",
    description: "Carga un extracto, mapea sus columnas y revisa posibles relaciones con facturas o pagos CFDI. El archivo no se envía ni conecta una cuenta bancaria.",
    statusLabel: "En preparación · sin conexión bancaria",
    statusKind: "info",
    className: "recon-header",
    actions: [{ label: "Volver a Herramientas", section: "tools", arrow: false }, { label: "Abrir CFDI", section: "cfdi", arrow: false }],
  });
  const fileStatus = reconciliationState.loading ? "Leyendo archivo local…" : reconciliationState.fileName ? `${escapeHtml(reconciliationState.fileName)} · ${formatBytes(reconciliationState.fileSize)} · ${reconciliationState.rawRows.length.toLocaleString("es-MX")} filas detectadas` : "Ningún archivo seleccionado";
  const delimiterMarkup = reconciliationState.fileKind === "csv" ? `<label class="recon-field recon-delimiter" for="recon-delimiter"><span>Separador CSV</span><select id="recon-delimiter" data-recon-delimiter>${[[",", "Coma (,)"] , [";", "Punto y coma (;)"], ["\t", "Tabulación"], ["|", "Barra vertical (|)"]].map(([value, label]) => `<option value="${escapeHtml(value)}" ${reconciliationState.delimiter === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>` : "";
  const sheetMarkup = reconciliationState.fileKind === "excel" && reconciliationState.sheetNames.length ? `<label class="recon-field recon-sheet" for="recon-sheet"><span>Hoja del libro</span><select id="recon-sheet" data-recon-sheet>${reconciliationState.sheetNames.map((name) => `<option value="${escapeHtml(name)}" ${name === reconciliationState.sheetName ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>` : "";
  const sourceMessage = !availableSource ? `<p class="recon-source-warning" role="status">No hay un análisis CFDI en memoria. Puedes cargar y revisar el archivo, pero no se generarán candidatos hasta analizar CFDI en esta pestaña.</p>` : `<p class="recon-source-ok" role="status">Fuente en memoria: ${invoiceCount} factura(s) · ${paymentCount} pago(s). No se consulta ni carga el historial.</p>`;
  const error = reconciliationState.error ? `<p class="recon-error" role="alert">${escapeHtml(reconciliationState.error)}</p>` : "";
  const notice = reconciliationState.notice ? `<p class="recon-notice" role="status">${escapeHtml(reconciliationState.notice)}</p>` : "";
  const oversizeRows = startRows.length > MAX_BANK_ROWS;
  return `<main id="contenido" class="content recon-page" data-reconciliation-page tabindex="-1">
    ${header}
    <section class="recon-privacy-banner" aria-label="Privacidad de la conciliación"><span aria-hidden="true">◉</span><p><b>Procesamiento local.</b> Hasta 8 MiB y ${MAX_BANK_ROWS.toLocaleString("es-MX")} movimientos por archivo. No se sube el extracto, no se guarda en la cuenta ni se envía a Nora. Quitar el archivo o cambiar/cerrar sesión limpia los datos temporales.</p></section>
    <section class="recon-step-card" aria-labelledby="recon-upload-title"><div class="recon-section-title"><div><p class="eyebrow">01 · CARGA CONTROLADA</p><h2 id="recon-upload-title">Importa un extracto</h2></div><span class="recon-formats">.CSV · .XLSX · .XLS</span></div>
      <div class="recon-dropzone ${reconciliationState.dropActive ? "is-dragging" : ""}" data-recon-drop><input id="recon-file" type="file" data-recon-file accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" ${reconciliationState.loading ? "disabled" : ""}/><label for="recon-file"><span class="recon-upload-icon" aria-hidden="true">↑</span><b>${reconciliationState.loading ? "Leyendo en este navegador…" : reconciliationState.fileName ? "Cambiar archivo" : "Selecciona o arrastra CSV / Excel"}</b><small>El contenido se procesa aquí, sin carga a un servidor. ${escapeHtml(fileStatus)}</small></label>${reconciliationState.fileName ? `<button type="button" class="recon-remove-file" data-recon-clear-file ${reconciliationState.loading ? "disabled" : ""}>Quitar archivo</button>` : ""}</div>
      <div class="recon-file-options">${delimiterMarkup}${sheetMarkup}</div>${error}${notice}${reconciliationState.fileKind === "excel" && !reconciliationState.sheetNames.length ? `<p class="recon-inline-error" role="alert">No se encontraron hojas de cálculo legibles.</p>` : ""}
    </section>
    <section class="recon-step-card" aria-labelledby="recon-map-stage-title"><div class="recon-section-title"><div><p class="eyebrow">02 · MAPEO EXPLÍCITO</p><h2 id="recon-map-stage-title">Indica qué significa cada columna</h2></div><span class="recon-required-hint">* requerido</span></div>
      ${renderColumnMapping()}
      ${renderSettings()}
      ${sourceMessage}
      <div class="recon-run-actions"><button type="button" class="button button-primary" data-recon-run ${canAnalyze && !oversizeRows && !reconciliationState.loading ? "" : "disabled"}>Generar sugerencias locales <span aria-hidden="true">→</span></button><span>Se comparan moneda, importe absoluto, fecha y referencia exacta. El signo requiere revisión humana.</span></div>
    </section>
    ${renderResults()}
    ${renderNoraContextCard({ eyebrow: "NORA · PRIVACIDAD", title: "El archivo permanece en esta pestaña", description: "Puedes preguntar a Nora cómo elegir formato de fecha, moneda o convención de signo. Abre el asistente por separado y explica solo el parámetro; esta pantalla no comparte extracto, filas, descripciones ni referencias.", actionLabel: "Abrir Asistente sin adjuntar datos", avatarState: "ready", className: "recon-nora-card" })}
    <footer class="recon-disclaimer"><b>Alcance del prototipo</b><p>Una candidata no es conciliación confirmada. La herramienta no conecta bancos, no realiza asientos, no lee historial guardado y no sustituye la revisión contable. La dirección, importes parciales, comisiones y movimientos agregados quedan para validación manual.</p></footer>
  </main>`;
}

function resetComparison() {
  reconciliationState.analyzed = false;
  reconciliationState.results = [];
  reconciliationState.movements = [];
  reconciliationState.visibleRows = PAGE_SIZE;
  reconciliationState.filter = "all";
}

function updateHeaderRows() {
  const { headers } = selectedRows();
  reconciliationState.headers = headers;
  reconciliationState.mapping = { ...DEFAULT_MAPPING };
  resetComparison();
}

function useRawRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("El archivo debe contener encabezados y al menos un movimiento.");
  if (rows.length > MAX_BANK_ROWS + MAX_HEADER_SCAN_ROWS) throw new Error(`El archivo supera el máximo de ${MAX_BANK_ROWS.toLocaleString("es-MX")} movimientos y filas de encabezado permitidas.`);
  reconciliationState.rawRows = rows;
  reconciliationState.headerRow = 0;
  updateHeaderRows();
}

async function fileBuffer(file, signal) {
  if (signal?.aborted) throw signal.reason || new Error("Lectura cancelada.");
  if (typeof file?.arrayBuffer === "function") return file.arrayBuffer();
  if (typeof file?.text === "function") return new TextEncoder().encode(await file.text()).buffer;
  throw new Error("El archivo no puede leerse localmente.");
}

async function loadFile(file, onUpdate) {
  const token = reconciliationState.loadToken + 1;
  activeReconciliationParseController?.abort("new-file");
  reconciliationParserBridge.cancelAll("new-file");
  const controller = new AbortController();
  activeReconciliationParseController = controller;
  Object.assign(reconciliationState, emptyState(), { loading: true, loadToken: token });
  onUpdate();
  try {
    const buffer = await fileBuffer(file, controller.signal);
    const parsed = await reconciliationParserBridge.run("reconciliation", {
      operation: "file",
      delimiter: "auto",
      file: { name: String(file.name || "Extracto"), size: Number(file.size) || buffer.byteLength, buffer },
    }, { signal: controller.signal, sessionEpoch: token, transfer: [buffer] });
    if (token !== reconciliationState.loadToken) return;
    reconciliationState.fileName = String(file.name || "Extracto");
    reconciliationState.fileSize = Number(file.size) || 0;
    reconciliationState.fileKind = parsed.kind;
    reconciliationState.csvText = parsed.kind === "csv" ? parsed.text : "";
    reconciliationState.delimiter = parsed.delimiter || ",";
    reconciliationState.sheets = parsed.sheets || {};
    reconciliationState.sheetNames = parsed.sheetNames || [];
    reconciliationState.sheetName = reconciliationState.sheetNames[0] || "";
    useRawRows(parsed.kind === "excel" ? reconciliationState.sheets[reconciliationState.sheetName] : parsed.rawRows);
    reconciliationState.notice = "Archivo leído en memoria. Revisa la hoja, fila de encabezados y columnas antes de generar sugerencias.";
  } catch (error) {
    if (token !== reconciliationState.loadToken) return;
    if (controller.signal.aborted || error instanceof SessionExpiredError || error?.name === "AbortError") return;
    reconciliationState.error = error instanceof Error ? error.message : "No se pudo leer este archivo.";
    reconciliationState.fileName = "";
    reconciliationState.fileSize = 0;
    reconciliationState.fileKind = "";
    reconciliationState.sheets = {};
    reconciliationState.sheetNames = [];
    reconciliationState.sheetName = "";
    reconciliationState.rawRows = [];
    reconciliationState.headers = [];
    reconciliationState.mapping = { ...DEFAULT_MAPPING };
    resetComparison();
  } finally {
    if (token === reconciliationState.loadToken) {
      reconciliationState.loading = false;
      if (activeReconciliationParseController === controller) activeReconciliationParseController = null;
      onUpdate();
    }
  }
}

async function parseSelectedCsv(delimiter, onUpdate) {
  const token = reconciliationState.loadToken + 1;
  reconciliationState.loadToken = token;
  activeReconciliationParseController?.abort("delimiter-change");
  reconciliationParserBridge.cancelAll("delimiter-change");
  const controller = new AbortController();
  activeReconciliationParseController = controller;
  reconciliationState.loading = true;
  onUpdate();
  try {
    const buffer = new TextEncoder().encode(reconciliationState.csvText).buffer;
    const parsed = await reconciliationParserBridge.run("reconciliation", { operation: "csv-delimiter", delimiter, buffer }, { signal: controller.signal, sessionEpoch: token, transfer: [buffer] });
    if (token !== reconciliationState.loadToken) return;
    reconciliationState.delimiter = delimiter;
    useRawRows(parsed.rawRows);
    reconciliationState.error = "";
    reconciliationState.notice = "Delimitador aplicado. Confirma de nuevo la fila de encabezados y el mapeo.";
  } catch (error) {
    if (token !== reconciliationState.loadToken || controller.signal.aborted || error instanceof SessionExpiredError || error?.name === "AbortError") return;
    reconciliationState.error = error instanceof Error ? error.message : "No se pudo volver a leer el CSV.";
  } finally {
    if (token === reconciliationState.loadToken) {
      reconciliationState.loading = false;
      if (activeReconciliationParseController === controller) activeReconciliationParseController = null;
      onUpdate();
    }
  }
}

function runComparison(analysis, onUpdate) {
  if (!analysis || !reconciliationState.analysisPresent) {
    reconciliationState.error = "No hay un análisis CFDI válido en memoria. Abre el Analizador CFDI en esta pestaña y vuelve aquí.";
    onUpdate();
    return;
  }
  const { headers, rows } = selectedRows();
  const settings = { ...reconciliationState.settings, firstDataRowNumber: reconciliationState.headerRow + 2 };
  const mapping = Object.fromEntries(Object.entries(reconciliationState.mapping).map(([key, value]) => [key, value === "" ? "" : Number(value)]));
  const missingRequired = ["date", "amount"].filter((key) => !Number.isInteger(mapping[key]));
  if (missingRequired.length || !settings.dateFormat || !settings.amountConvention || !settings.sourceType || (mapping.currency === "" && !/^[A-Z]{3}$/.test(settings.defaultCurrency.trim().toUpperCase()))) {
    reconciliationState.error = "Completa el mapeo de fecha e importe, el formato de fecha, el signo, la fuente CFDI y la moneda requerida antes de comparar.";
    onUpdate();
    return;
  }
  if (rows.length > MAX_BANK_ROWS) {
    reconciliationState.error = `El extracto contiene más de ${MAX_BANK_ROWS.toLocaleString("es-MX")} movimientos; filtra el periodo en tu archivo y vuelve a cargarlo.`;
    onUpdate();
    return;
  }
  const movements = normalizeBankRows(rows, headers, mapping, settings);
  reconciliationState.movements = movements;
  reconciliationState.results = buildReconciliationRows(movements, analysis, settings);
  reconciliationState.analyzed = true;
  reconciliationState.filter = "all";
  reconciliationState.visibleRows = PAGE_SIZE;
  reconciliationState.error = "";
  reconciliationState.notice = "Sugerencias preparadas localmente. No se confirmó, guardó ni envió ningún vínculo.";
  onUpdate();
}

export function bindReconciliationWorkspace(app, { getAnalysis = () => null, onUpdate = () => {}, onHandoffSources = () => {}, cleanupScope = null } = {}) {
  const listenerController = cleanupScope?.addAbortController();
  const listenerOptions = listenerController ? { signal: listenerController.signal } : undefined;
  app.addEventListener("change", (event) => {
    const fileInput = event.target.closest?.("[data-recon-file]");
    if (fileInput) {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void loadFile(file, onUpdate);
      return;
    }
    if (event.target.matches("[data-recon-delimiter]")) { void parseSelectedCsv(event.target.value, onUpdate); return; }
    if (event.target.matches("[data-recon-sheet]")) {
      const sheetName = event.target.value;
      if (!Object.hasOwn(reconciliationState.sheets, sheetName)) return;
      reconciliationState.sheetName = sheetName;
      useRawRows(reconciliationState.sheets[sheetName]);
      reconciliationState.error = "";
      onUpdate();
      return;
    }
    if (event.target.matches("[data-recon-header-row]")) {
      reconciliationState.headerRow = Number(event.target.value) || 0;
      updateHeaderRows();
      reconciliationState.error = "";
      onUpdate();
      return;
    }
    const mappingSelect = event.target.closest?.("[data-recon-map]");
    if (mappingSelect) {
      reconciliationState.mapping[mappingSelect.dataset.reconMap] = mappingSelect.value;
      resetComparison();
      reconciliationState.error = "";
      onUpdate();
      return;
    }
    const setting = event.target.closest?.("[data-recon-setting]");
    if (setting) {
      const key = setting.dataset.reconSetting;
      reconciliationState.settings[key] = key === "dateToleranceDays" ? Math.max(0, Math.min(31, Number(setting.value) || 0)) : setting.value;
      if (key === "defaultCurrency") reconciliationState.settings.defaultCurrency = setting.value.trim().toUpperCase();
      resetComparison();
      reconciliationState.error = "";
      onUpdate();
      return;
    }
    if (event.target.matches("[data-recon-filter]")) {
      reconciliationState.filter = FILTER_OPTIONS.some(([value]) => value === event.target.value) ? event.target.value : "all";
      reconciliationState.visibleRows = PAGE_SIZE;
      onUpdate();
    }
  }, listenerOptions);

  app.addEventListener("click", (event) => {
    if (event.target.closest("[data-recon-clear-file]")) {
      resetReconciliationWorkspace();
      onUpdate();
      app.querySelector("[data-recon-file]")?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-recon-run]")) { runComparison(getAnalysis(), onUpdate); return; }
    if (event.target.closest("[data-recon-handoff]")) { onHandoffSources(); return; }
    if (event.target.closest("[data-recon-more]")) {
      reconciliationState.visibleRows += PAGE_SIZE;
      onUpdate();
    }
  }, listenerOptions);

  app.addEventListener("dragover", (event) => {
    if (!event.target.closest?.("[data-recon-drop]")) return;
    event.preventDefault();
    reconciliationState.dropActive = true;
    event.target.closest("[data-recon-drop]").classList.add("is-dragging");
  }, listenerOptions);
  app.addEventListener("dragleave", (event) => {
    const zone = event.target.closest?.("[data-recon-drop]");
    if (zone && !zone.contains(event.relatedTarget)) {
      reconciliationState.dropActive = false;
      zone.classList.remove("is-dragging");
    }
  }, listenerOptions);
  app.addEventListener("drop", (event) => {
    const zone = event.target.closest?.("[data-recon-drop]");
    if (!zone) return;
    event.preventDefault();
    reconciliationState.dropActive = false;
    zone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadFile(file, onUpdate);
  }, listenerOptions);
}
