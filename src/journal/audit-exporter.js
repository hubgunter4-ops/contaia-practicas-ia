const text = (value) => value === null || value === undefined ? "" : String(value);
const datePart = (value) => text(value).slice(0, 19);

const FINDING_HEADERS = ["Regla", "Severidad", "Estado", "Mensaje", "Motivo", "Esperado", "Observado", "Acción recomendada", "Documento", "UUID", "Relacionado(s)", "Evidencia", "Decisión local"];
const DOCUMENT_HEADERS = ["ID fuente", "UUID", "Tipo", "Documento", "Fecha", "Moneda", "Papel", "Relación", "Origen"];
const SUMMARY_HEADERS = ["Campo", "Valor", "Nota"];

function summaryRows(audit) {
  const scope = audit?.scope || {};
  const summary = audit?.summary || {};
  return [
    ["ContaIA · Reporte de revisión de ciclo CFDI"],
    ["Trabajo local; contiene identificadores y relaciones si estaban en las fuentes. No es auditoría certificada, validación SAT, declaración ni acuse."],
    [],
    SUMMARY_HEADERS,
    ["Generado", new Date().toISOString(), "Generado en este navegador"],
    ["Política", audit?.policy?.version || "cfdi-audit-local-v1", audit?.policy?.label || "Reglas locales"],
    ["Alcance", `${scope.sourceCount || 0} fuentes · ${scope.documentCount || 0} documentos · ${scope.paymentCount || 0} pagos · ${scope.adjustmentCount || 0} ajustes`, "No se mezclan fuentes fuera de la selección"],
    ["Empresa", scope.businessRfc || "No confirmada", "RFC usado solo en la revisión local"],
    ["Periodo", scope.period || "No confirmado", "Periodo del alcance"],
    ["Bloqueos", summary.bySeverity?.blocking || 0, "Hallazgos abiertos"],
    ["Altos", summary.bySeverity?.high || 0, "Hallazgos abiertos"],
    ["Revisiones", summary.bySeverity?.review || 0, "Hallazgos abiertos"],
    ["Información", summary.bySeverity?.info || 0, "Hallazgos abiertos"],
    ["Fuera de alcance", summary.outOfScopeCount || 0, "Relaciones existentes excluidas por filtros"],
    ["Reglas aplicadas", (scope.rulesApplied || []).join(" · "), "Política local versionada"],
  ];
}

function findingRow(finding) {
  return [
    text(finding.code), text(finding.severity), text(finding.status), text(finding.message), text(finding.reason), text(finding.expected), text(finding.observed), text(finding.recommendedAction),
    text(finding.source?.label), text(finding.source?.uuid), (finding.related || []).map((entry) => `${entry.label} · ${entry.uuid}`).join(" | "),
    (finding.evidenceRefs || []).map((entry) => `${entry.origin}${entry.reference ? ` · ${entry.reference}` : ""}`).join(" | "), text(finding.decisionNote),
  ];
}

function documentRow(document) {
  return [text(document.sourceId), text(document.uuid), text(document.type), text(document.label), datePart(document.date), text(document.currency), text(document.role), text(document.relation), text(document.source)];
}

export function buildAuditReportSpec(audit, { generatedAt = new Date().toISOString() } = {}) {
  const period = audit?.scope?.period || "revision";
  const findings = Array.isArray(audit?.findings) ? audit.findings : [];
  const documents = Array.isArray(audit?.documents) ? audit.documents : [];
  return {
    fileName: `contaia-revision-ciclo-cfdi-${period}.xlsx`,
    generatedAt,
    sheets: [
      { name: "Resumen", headerRow: 4, widths: [28, 42, 74], rows: summaryRows({ ...audit, generatedAt }) },
      { name: "Hallazgos", headerRow: 1, widths: [22, 14, 18, 52, 52, 34, 34, 54, 28, 38, 60, 50, 42], rows: [FINDING_HEADERS, ...findings.map(findingRow)] },
      { name: "Documentos", headerRow: 1, widths: [42, 38, 12, 28, 20, 14, 14, 42, 34], rows: [DOCUMENT_HEADERS, ...documents.map(documentRow)] },
      { name: "Evidencia", headerRow: 1, widths: [22, 42, 38, 60, 54], rows: [["Regla", "Documento", "Origen", "Referencia", "Relación"], ...findings.flatMap((finding) => (finding.evidenceRefs || []).map((evidence) => [finding.code, finding.source?.uuid || finding.source?.label, evidence.origin, evidence.reference, (finding.related || []).map((entry) => entry.uuid || entry.label).join(" | ")]))] },
    ],
  };
}

function columnName(index) {
  let value = index + 1; let result = "";
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}

function decorate(sheet, spec) {
  sheet["!cols"] = spec.widths.map((wch) => ({ wch }));
  const headers = spec.rows[spec.headerRow - 1] || [];
  const end = columnName(Math.max(0, headers.length - 1));
  if (headers.length && spec.rows.length) { sheet["!autofilter"] = { ref: `A${spec.headerRow}:${end}${spec.rows.length}` }; sheet["!freeze"] = { xSplit: 0, ySplit: spec.headerRow }; }
  headers.forEach((_, index) => { const cell = sheet[`${columnName(index)}${spec.headerRow}`]; if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "123B43" } } }; });
}

export function buildAuditWorkbook(xlsx, spec) {
  const utils = xlsx?.utils || xlsx?.default?.utils;
  if (!utils?.book_new || !utils?.aoa_to_sheet || !utils?.book_append_sheet) throw new Error("No se pudo iniciar el generador local del reporte de auditoría.");
  const workbook = utils.book_new();
  for (const sheetSpec of spec.sheets || []) { const sheet = utils.aoa_to_sheet(sheetSpec.rows); decorate(sheet, sheetSpec); utils.book_append_sheet(workbook, sheet, sheetSpec.name); }
  workbook.Props = { Title: "ContaIA · Reporte de revisión de ciclo CFDI", Subject: "Revisión local no oficial", Author: "ContaIA", Comments: "No es una auditoría certificada ni una validación SAT." };
  return workbook;
}

export function buildAuditWorkbookDownload(xlsx, spec) {
  const write = xlsx?.write || xlsx?.default?.write;
  if (typeof write !== "function") throw new Error("No se pudo iniciar la descarga XLSX local.");
  return write(buildAuditWorkbook(xlsx, spec), { bookType: "xlsx", type: "array", compression: true });
}

export const __test = { summaryRows, findingRow, documentRow };
