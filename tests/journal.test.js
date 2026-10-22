import test from "node:test";
import assert from "node:assert/strict";
import { createJournalCatalog } from "../src/journal/catalog.js";
import { normalizeMoney, formatMinor } from "../src/journal/money.js";
import { buildJournalSources } from "../src/journal/sources.js";
import { DEFAULT_JOURNAL_RULES, generateJournalDraft } from "../src/journal/rules.js";
import { validateJournalDraft } from "../src/journal/validation.js";
import { renderJournalWorkspace, resetJournalWorkspace, journalState } from "../src/journal/workspace.js";

test("conserva importes decimales exactos y etiqueta números derivados", () => {
  assert.deepEqual(normalizeMoney("1,250.00", "MXN"), { minor: "125000", scale: 2, currency: "MXN", quality: "source_decimal_exact" });
  assert.equal(normalizeMoney(1250, "MXN")?.quality, "derived_from_number");
  assert.equal(formatMinor({ minor: "125000", scale: 2 }, "MXN"), "$1,250.00");
});

test("convierte CFDI en fuentes locales sin guardar ni inferir el papel de la empresa", () => {
  const sources = buildJournalSources({ analysis: { facturas: [{ uuid: "uuid-1", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", total: 1250, moneda: "MXN" }], pagos: [{ uuid: "pago-1", fechaPago: "2025-03-11", impPagado: 1250, moneda: "MXN", relationStatus: "matched" }] } });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].kind, "invoice");
  assert.equal(sources[0].amount.minor, "125000");
  assert.equal(sources[0].companySide, "unknown");
  assert.equal(sources[1].kind, "payment");
});

test("genera factura de ingreso con dos partidas y bloquea hasta confirmar emisor", () => {
  const [source] = buildJournalSources({ analysis: { facturas: [{ uuid: "uuid-1", serieFolio: "A-100", fecha: "2025-03-10", total: 1250, moneda: "MXN" }] } });
  const rule = DEFAULT_JOURNAL_RULES.find((item) => item.ruleId === "invoice-sale-example");
  const draft = generateJournalDraft({ rule, selectedSources: [source], companyLocalId: "company-local", companySide: "unknown", period: "2025-03" });
  assert.equal(draft.lines.length, 2);
  assert.ok(draft.errors.some((error) => /papel de la empresa/.test(error)));
  const acknowledged = { ...draft, companySide: "issuer", errors: draft.errors.filter((error) => !/papel de la empresa/.test(error)), warningsAcknowledged: true };
  const validation = validateJournalDraft(acknowledged, createJournalCatalog("company-local"));
  assert.ok(validation.errors.some((error) => /modo Ciclo CFDI/.test(error)));
  assert.equal(validation.totalsByCurrency[0].difference, "0");
  assert.equal(validation.canApprove, false);
});

test("un cobro con movimiento y pago de distinto importe queda bloqueado por diferencia exacta", () => {
  const sources = buildJournalSources({
    analysis: { pagos: [{ uuid: "pago-1", fechaPago: "2025-03-11", impPagado: 1000, moneda: "MXN" }] },
    bankRows: [{ rowNumber: 2, dateIso: "2025-03-11", signedAmountCents: 99000, currency: "MXN", status: "ready", reference: "P-1" }],
  });
  const rule = DEFAULT_JOURNAL_RULES.find((item) => item.ruleId === "payment-collection-example");
  const draft = generateJournalDraft({ rule, selectedSources: sources, companyLocalId: "company-local", companySide: "issuer", cashDirection: "incoming", period: "2025-03" });
  const validation = validateJournalDraft({ ...draft, warningsAcknowledged: true }, createJournalCatalog("company-local"));
  assert.ok(validation.errors.some((error) => /no cuadra/.test(error)));
  assert.equal(validation.canApprove, false);
});

test("una cuenta desactivada invalida nuevas propuestas pero no borra el catálogo", () => {
  const catalog = createJournalCatalog("company-local");
  catalog.accounts.find((account) => account.accountId === "105-CLIENTES").active = false;
  const source = buildJournalSources({ analysis: { facturas: [{ uuid: "uuid-1", total: 100, moneda: "MXN" }] } })[0];
  const rule = DEFAULT_JOURNAL_RULES.find((item) => item.ruleId === "invoice-sale-example");
  const draft = generateJournalDraft({ rule, selectedSources: [source], companyLocalId: "company-local", companySide: "issuer" });
  const validation = validateJournalDraft({ ...draft, warningsAcknowledged: true }, catalog);
  assert.ok(validation.errors.some((error) => /inactiva/.test(error)));
  assert.equal(catalog.accounts.length, 5);
});

test("el workspace comunica revisión humana, borradores locales y ayuda sin adjuntos", () => {
  resetJournalWorkspace();
  const html = renderJournalWorkspace({ analysis: { facturas: [{ uuid: "uuid-1", serieFolio: "A-100", fecha: "2025-03-10", total: 1250, moneda: "MXN" }] } });
  assert.match(html, /Pólizas contables sugeridas/);
  assert.match(html, /Trabajo local de esta sesión/);
  assert.match(html, /Catálogo de cuentas/);
  assert.match(html, /Nora · Asistente abierto/);
  assert.equal(journalState.sources.length, 1);
});
