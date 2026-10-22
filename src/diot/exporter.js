function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function minorToDecimal(value) {
  const minor = String(value?.minor ?? "");
  const scale = Number.isInteger(value?.scale) ? value.scale : 2;
  if (!/^-?\d+$/.test(minor)) return "";
  const negative = minor.startsWith("-");
  const digits = (negative ? minor.slice(1) : minor).padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? `.${digits.slice(-scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

function exportRows(records, context, schema) {
  return records.filter((record) => !record.excluded).map((record) => [
    schema.schemaVersion,
    context.period,
    context.taxpayerType,
    context.companyRole,
    record.thirdParty?.type || "",
    record.thirdParty?.identifier || "",
    record.thirdParty?.name || "",
    record.thirdParty?.country || "",
    record.thirdParty?.nationality || "",
    record.operationType || "",
    record.category || "",
    record.currency || "",
    minorToDecimal(record.amounts?.base),
    minorToDecimal(record.amounts?.ivaTransferred),
    minorToDecimal(record.amounts?.ivaWithheld),
    record.quality || "",
    record.evidence?.uuid || "",
    record.evidence?.folio || "",
    record.evidence?.date || "",
    record.sourceId || "",
    "requires_human_review",
  ]);
}

export function buildDiotReviewCsv({ records = [], context = {}, schema, generatedAt = new Date().toISOString() } = {}) {
  const headers = [
    "schema_version", "periodo", "tipo_contribuyente", "papel_empresa", "tipo_tercero", "identificador_tercero", "nombre_tercero", "pais", "nacionalidad", "tipo_operacion_revision", "categoria_iva_revision", "moneda", "base", "iva_trasladado_reportado", "iva_retenido_reportado", "calidad_importe", "uuid", "folio", "fecha_fuente", "source_id", "estado_revision",
  ];
  const rows = exportRows(records, context, schema);
  const metadata = ["# ContaIA DIOT asistida", "# Archivo de trabajo local; no es presentación ni formato oficial del SAT.", `# Generado localmente: ${generatedAt}`, `# Esquema: ${schema.schemaVersion}`, `# Fuente del esquema: ${schema.sourceUrl || ""}`];
  return `${metadata.join("\n")}\n${headers.map(csvCell).join(",")}\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function buildDiotReviewJson({ records = [], context = {}, schema, validation, generatedAt = new Date().toISOString() } = {}) {
  return JSON.stringify({
    kind: "contaia-diot-review-v1",
    generatedAt,
    schema: { schemaVersion: schema.schemaVersion, officialCompatible: false, sourceUrl: schema.sourceUrl },
    context: { period: context.period, taxpayerType: context.taxpayerType, companyRole: context.companyRole, currency: context.currency },
    rows: records.map((record) => ({
      sourceId: record.sourceId,
      excluded: Boolean(record.excluded),
      exclusionReason: record.exclusionReason || "",
      thirdParty: record.thirdParty,
      operationType: record.operationType,
      category: record.category,
      currency: record.currency,
      amounts: {
        base: minorToDecimal(record.amounts?.base),
        ivaTransferred: minorToDecimal(record.amounts?.ivaTransferred),
        ivaWithheld: minorToDecimal(record.amounts?.ivaWithheld),
      },
      quality: record.quality,
      evidence: { uuid: record.evidence?.uuid || "", folio: record.evidence?.folio || "", date: record.evidence?.date || "", source: record.evidence?.source || "" },
    })),
    review: { errors: validation?.errors?.map(({ code, sourceId, message }) => ({ code, sourceId, message })) || [], warnings: validation?.warnings?.map(({ code, sourceId, message }) => ({ code, sourceId, message })) || [] },
  }, null, 2);
}

export function downloadLocalArtifact({ content, type, filename }) {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const href = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
  return true;
}
