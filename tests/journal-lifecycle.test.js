import test from "node:test";
import assert from "node:assert/strict";
import { buildJournalSources } from "../src/journal/sources.js";
import { generateLifecycleDrafts, mergeLifecycleDrafts } from "../src/journal/journal-events.js";

const BUSINESS_RFC = "AAA010101AAA";
const CUSTOMER_RFC = "BBB010101BBB";
const PERIOD = "2026-10";
const COMPANY_ID = "company-local-1";

const accounts = {
  sales: "acct-sales",
  purchases: "acct-purchases",
  receivable: "acct-receivable",
  payable: "acct-payable",
  outputVat: "acct-output-vat",
  outputVatPending: "acct-output-vat-pending",
  inputVat: "acct-input-vat",
  inputVatPending: "acct-input-vat-pending",
  paymentForms: { "01": "acct-cash", "03": "acct-bank" },
};

const catalog = {
  version: 17,
  companyLocalId: COMPANY_ID,
  accounts: [
    ["acct-sales", "401-VENTAS"],
    ["acct-purchases", "501-COMPRAS"],
    ["acct-receivable", "105-CLIENTES"],
    ["acct-payable", "201-PROVEEDORES"],
    ["acct-output-vat", "208-IVA-TRASLADADO"],
    ["acct-output-vat-pending", "209-IVA-TRASLADADO-PENDIENTE"],
    ["acct-input-vat", "118-IVA-ACREDITABLE"],
    ["acct-input-vat-pending", "119-IVA-ACREDITABLE-PENDIENTE"],
    ["acct-cash", "101-CAJA"],
    ["acct-bank", "102-BANCOS"],
  ].map(([accountId, codeText]) => ({
    accountId,
    codeText,
    name: codeText,
    nature: "deudora",
    parentAccountId: "",
    active: true,
    imputable: true,
    currencyCode: "MXN",
  })),
};

const iva16 = () => ({ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "1000.00", amount: "160.00" });
const paymentIva16 = (amount = "80.00") => ({ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "500.00", amount });

function fixtureUuid(value) {
  const text = String(value || "");
  if (!text.trim() || /^[0-9a-f-]{36}$/i.test(text)) return text;
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return `${hash.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function invoice(overrides = {}) {
  const item = {
    uuid: "INV-1",
    tipo: "I",
    metodoPago: "PUE",
    formaPagoCode: "03",
    rfcEmisor: BUSINESS_RFC,
    rfcReceptor: CUSTOMER_RFC,
    fecha: "2026-10-01T10:00:00-06:00",
    moneda: "MXN",
    rawAmounts: { subtotal: "1000.00", discount: "0", total: "1160.00" },
    taxDetails: [iva16()],
    ...overrides,
  };
  item.uuid = fixtureUuid(item.uuid);
  if (item.cfdiRelacionado) item.cfdiRelacionado = item.cfdiRelacionado.split(",").map(fixtureUuid).join(",");
  return item;
}

function payment(overrides = {}) {
  const item = {
    uuid: "PAY-1",
    docRelacionado: "INV-1",
    fechaPago: "2026-10-02T10:00:00-06:00",
    moneda: "MXN",
    monedaPago: "MXN",
    formaPagoCode: "03",
    paymentIndex: 1,
    relatedIndex: 1,
    numParcialidad: "1",
    objetoImpDR: "02",
    montoPago: "580.00",
    rawAmounts: { prior: "1160.00", paid: "580.00", remaining: "580.00" },
    taxDetails: [paymentIva16()],
    rfcEmisor: BUSINESS_RFC,
    rfcReceptor: CUSTOMER_RFC,
    ...overrides,
  };
  item.uuid = fixtureUuid(item.uuid);
  item.docRelacionado = fixtureUuid(item.docRelacionado);
  return item;
}

function sourcesFor(facturas = [], pagos = []) {
  return buildJournalSources({ analysis: { facturas, pagos } });
}

function generate({ facturas = [], pagos = [], selectedSourceIds, businessRfc = BUSINESS_RFC, companyLocalId = COMPANY_ID, period = PERIOD, configuredAccounts = accounts, configuredCatalog = catalog, creditNoteApplications = {} } = {}) {
  const sources = sourcesFor(facturas, pagos);
  const applications = typeof creditNoteApplications === "function" ? creditNoteApplications(sources) : creditNoteApplications;
  return {
    sources,
    drafts: generateLifecycleDrafts({
      sources,
      selectedSourceIds: selectedSourceIds || sources.map((source) => source.sourceId),
      businessRfc,
      companyLocalId,
      period,
      accounts: configuredAccounts,
      catalog: configuredCatalog,
      creditNoteApplications: applications,
    }),
  };
}

function onlyDraft(result, index = 0) {
  assert.equal(result.drafts.length > index, true, "se esperaba el borrador solicitado");
  return result.drafts[index];
}

function errorMatching(draft, matcher) {
  return draft.errors.some((error) => matcher.test(error));
}

function assertNoErrors(draft) {
  assert.deepEqual(draft.errors, []);
  assert.deepEqual(draft.validation.errors, []);
}

function line(draft, amountSource) {
  const found = draft.lines.find((entry) => entry.amountSource === amountSource);
  assert.ok(found, `falta la línea ${amountSource}`);
  return found;
}

function linesBySource(draft) {
  return Object.fromEntries(draft.lines.map((entry) => [entry.amountSource, entry]));
}

test("buildJournalSources conserva un cfdi independiente y la identidad de factura/pago", () => {
  const original = invoice();
  const sources = sourcesFor([original], [payment()]);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].kind, "invoice");
  assert.equal(sources[1].kind, "payment");
  assert.notStrictEqual(sources[0].cfdi, original);
  assert.deepEqual(sources[0].cfdi, original);
  assert.equal(sources[0].cfdi.rawAmounts.total, "1160.00");
  assert.equal(sources[0].amount.minor, "116000");
  assert.equal(sources[1].amount.minor, "58000");
});

test("genera venta PUE con transferencia, base e IVA cobrado en importes exactos", () => {
  const draft = onlyDraft(generate({ facturas: [invoice()] }));
  assertNoErrors(draft);
  assert.equal(draft.eventKind, "sale_cash");
  assert.equal(draft.ruleId, "sale_cash-v1");
  assert.deepEqual(Object.keys(linesBySource(draft)).sort(), ["outputVat", "payment:03", "sales"]);
  assert.equal(line(draft, "payment:03").side, "debit");
  assert.equal(line(draft, "payment:03").amount.minor, "116000");
  assert.equal(line(draft, "sales").side, "credit");
  assert.equal(line(draft, "sales").amount.minor, "100000");
  assert.equal(line(draft, "outputVat").amount.minor, "16000");
  assert.equal(line(draft, "outputVat").amount.quality, "source_decimal_exact");
});

test("genera compra PUE con IVA acreditable y cuenta bancaria de pago", () => {
  const draft = onlyDraft(generate({ facturas: [invoice({ uuid: "PUR-1", rfcEmisor: CUSTOMER_RFC, rfcReceptor: BUSINESS_RFC })] }));
  assertNoErrors(draft);
  assert.equal(draft.companySide, "receiver");
  assert.equal(draft.eventKind, "purchase_cash");
  assert.equal(line(draft, "purchases").side, "debit");
  assert.equal(line(draft, "purchases").amount.minor, "100000");
  assert.equal(line(draft, "inputVat").side, "debit");
  assert.equal(line(draft, "inputVat").amount.minor, "16000");
  assert.equal(line(draft, "payment:03").side, "credit");
  assert.equal(line(draft, "payment:03").amount.minor, "116000");
});

test("genera venta PPD a clientes e IVA pendiente sin reconocer cobro", () => {
  const draft = onlyDraft(generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })] }));
  assertNoErrors(draft);
  assert.equal(draft.eventKind, "sale_credit");
  assert.equal(line(draft, "receivable").side, "debit");
  assert.equal(line(draft, "receivable").amount.minor, "116000");
  assert.equal(line(draft, "outputVatPending").amount.minor, "16000");
  assert.equal(draft.lines.some((entry) => entry.amountSource === "outputVat"), false);
});

test("genera compra PPD a proveedores e IVA pendiente de pago", () => {
  const draft = onlyDraft(generate({ facturas: [invoice({ uuid: "PUR-PPD", metodoPago: "PPD", formaPagoCode: "99", rfcEmisor: CUSTOMER_RFC, rfcReceptor: BUSINESS_RFC })] }));
  assertNoErrors(draft);
  assert.equal(draft.eventKind, "purchase_credit");
  assert.equal(line(draft, "purchases").amount.minor, "100000");
  assert.equal(line(draft, "inputVatPending").amount.minor, "16000");
  assert.equal(line(draft, "payable").side, "credit");
  assert.equal(line(draft, "payable").amount.minor, "116000");
});

test("REP emitido liquida sin re-reconocer venta y reclasifica IVA pendiente", () => {
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })], pagos: [payment()] });
  const draft = onlyDraft(result, 1);
  assertNoErrors(draft);
  assert.equal(draft.eventKind, "customer_collection");
  assert.equal(draft.sources[0].eventKind, "payment_settlement_candidate");
  assert.equal(draft.sources[1].eventKind, "relation_evidence_only");
  assert.equal(line(draft, "payment:03").side, "debit");
  assert.equal(line(draft, "receivable").side, "credit");
  assert.equal(line(draft, "receivable").amount.minor, "58000");
  assert.equal(line(draft, "outputVatPending").side, "debit");
  assert.equal(line(draft, "outputVat").side, "credit");
  assert.equal(draft.lines.some((entry) => ["sales", "purchases"].includes(entry.amountSource)), false);
  assert.equal(draft.lines.some((entry) => entry.concept === "Venta · base neta, sin duplicar pago"), false);
});

test("REP recibido liquida sin re-reconocer compra y reclasifica IVA pendiente", () => {
  const inv = invoice({ uuid: "PUR-REP", metodoPago: "PPD", formaPagoCode: "99", rfcEmisor: CUSTOMER_RFC, rfcReceptor: BUSINESS_RFC });
  const rep = payment({ uuid: "PAY-PUR", docRelacionado: "PUR-REP", rfcEmisor: CUSTOMER_RFC, rfcReceptor: BUSINESS_RFC });
  const draft = onlyDraft(generate({ facturas: [inv], pagos: [rep] }), 1);
  assertNoErrors(draft);
  assert.equal(draft.eventKind, "supplier_payment");
  assert.equal(line(draft, "payable").side, "debit");
  assert.equal(line(draft, "payment:03").side, "credit");
  assert.equal(line(draft, "inputVat").side, "debit");
  assert.equal(line(draft, "inputVatPending").side, "credit");
  assert.equal(draft.lines.some((entry) => ["sales", "purchases"].includes(entry.amountSource)), false);
});

test("acepta IVA 0%, exento y factura mixta sin inventar impuesto", () => {
  const cases = [
    { uuid: "ZERO", rawAmounts: { subtotal: "1000.00", discount: "0", total: "1000.00" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.000000", base: "1000.00", amount: "0.00" }] },
    { uuid: "EXEMPT", rawAmounts: { subtotal: "1000.00", discount: "0", total: "1000.00" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Exento", rate: "", base: "1000.00" }] },
    { uuid: "MIXED", rawAmounts: { subtotal: "1000.00", discount: "0", total: "1096.00" }, taxDetails: [
      { kind: "transfer", tax: "002", factor: "Tasa", rate: "0.000000", base: "400.00", amount: "0.00" },
      { kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "600.00", amount: "96.00" },
    ] },
  ];
  for (const fixture of cases) {
    const draft = onlyDraft(generate({ facturas: [invoice(fixture)] }));
    assertNoErrors(draft);
    assert.equal(draft.lines.some((entry) => entry.amountSource === "outputVat"), fixture.uuid === "MIXED");
    if (fixture.uuid === "MIXED") assert.equal(line(draft, "outputVat").amount.minor, "9600");
  }
});

test("bloquea ausencia de UUID original y forma de pago utilizable", () => {
  const draft = onlyDraft(generate({ facturas: [invoice({ uuid: "", formaPagoCode: "" })] }));
  assert.equal(errorMatching(draft, /Falta UUID original/), true);
  assert.equal(errorMatching(draft, /Forma de pago no soportada/), true);
});

test("bloquea método de pago ausente y PPD sin forma 99", () => {
  const missingMethod = onlyDraft(generate({ facturas: [invoice({ metodoPago: "" })] }));
  assert.equal(errorMatching(missingMethod, /Método de pago ausente/), true);
  const ppdWrongForm = onlyDraft(generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "03" })] }));
  assert.equal(errorMatching(ppdWrongForm, /PPD requiere/), true);
});

test("bloquea RFC ambiguo, periodo inválido y evento fuera del periodo", () => {
  const ambiguous = onlyDraft(generate({ facturas: [invoice({ rfcReceptor: BUSINESS_RFC })], businessRfc: BUSINESS_RFC }));
  assert.equal(errorMatching(ambiguous, /RFC de empresa.*ambigüedad/), true);
  const invalid = onlyDraft(generate({ facturas: [invoice()], businessRfc: "RFC-INVALIDO", period: "2026-13" }));
  assert.equal(errorMatching(invalid, /empresa y periodo/), true);
  assert.equal(errorMatching(invalid, /RFC de empresa/), true);
  assert.equal(errorMatching(invalid, /fuera del periodo/), true);
});

test("bloquea la cuenta ausente aunque el asiento conserve importes exactos", () => {
  const configuredAccounts = { ...accounts, outputVat: "" };
  const draft = onlyDraft(generate({ facturas: [invoice()], configuredAccounts }));
  assert.equal(errorMatching(draft, /Configura la cuenta outputVat/), true);
  assert.equal(draft.lines.some((entry) => entry.accountId === "" && entry.amountSource === "outputVat"), true);
  assert.equal(draft.validation.errors.some((error) => /sin cuenta|no existe/.test(error)), true);
});

test("mantiene CFDI E en revisión hasta tener relación y aplicación humana, y bloquea impuestos no soportados", () => {
  const adjustmentResult = generate({ facturas: [
    invoice(),
    invoice({ uuid: "E-1", tipo: "E", cfdiRelations: [{ type: "01", uuids: [fixtureUuid("INV-1")] }] }),
  ] });
  const adjustment = onlyDraft(adjustmentResult, 1);
  assert.equal(errorMatching(adjustment, /Elige la aplicación humana/), true);
  assert.equal(errorMatching(adjustment, /Solo CFDI I/), false);

  const retention = onlyDraft(generate({ facturas: [invoice({ uuid: "RET-1", taxDetails: [iva16(), { kind: "retention", tax: "001", factor: "Tasa", rate: "0.100000", base: "1000.00", amount: "100.00" }] })] }));
  assert.equal(errorMatching(retention, /Retenciones o impuestos distintos/), true);

  const ieps = onlyDraft(generate({ facturas: [invoice({ uuid: "IEPS-1", taxDetails: [iva16(), { kind: "transfer", tax: "003", factor: "Tasa", rate: "0.080000", base: "1000.00", amount: "80.00" }], rawAmounts: { subtotal: "1000.00", discount: "0", total: "1240.00" } })] }));
  assert.equal(errorMatching(ieps, /Retenciones o impuestos distintos/), true);
});

test("genera una nota de crédito emitida solo con relación, aplicación y cuentas explícitas", () => {
  const configuredAccounts = { ...accounts, salesDiscount: "acct-sales-discount", outputVatAdjustment: "acct-output-vat-adjustment", adjustmentSettlement: "acct-adjustment-settlement" };
  const additions = [["acct-sales-discount", "409-DESCUENTOS-VENTAS"], ["acct-output-vat-adjustment", "208-AJUSTE-IVA-TRASLADADO"], ["acct-adjustment-settlement", "205-COMPENSACIONES"]]
    .map(([accountId, codeText]) => ({ accountId, codeText, name: codeText, nature: "acreedora", parentAccountId: "", active: true, imputable: true, currencyCode: "MXN" }));
  const configuredCatalog = { ...catalog, accounts: [...catalog.accounts, ...additions] };
  const result = generate({ facturas: [
    invoice(),
    invoice({ uuid: "E-APPLY-1", tipo: "E", rawAmounts: { subtotal: "100.00", discount: "0", total: "116.00" }, taxDetails: [{ ...iva16(), base: "100.00", amount: "16.00" }], cfdiRelations: [{ type: "01", uuids: [fixtureUuid("INV-1")] }] }),
  ], configuredAccounts, configuredCatalog, creditNoteApplications: (sources) => ({ [sources[1].sourceId]: { application: "compensation", note: "Compensación confirmada localmente." } }) });
  const adjustment = onlyDraft(result, 1);
  assertNoErrors(adjustment);
  assert.equal(adjustment.eventKind, "issuer_credit_note");
  assert.equal(adjustment.adjustmentApplication, "compensation");
  assert.deepEqual(Object.keys(linesBySource(adjustment)).sort(), ["adjustmentSettlement", "outputVatAdjustment", "salesDiscount"]);
  assert.equal(line(adjustment, "salesDiscount").side, "debit");
  assert.equal(line(adjustment, "adjustmentSettlement").side, "credit");
  assert.equal(line(adjustment, "adjustmentSettlement").amount.minor, "11600");
});

test("bloquea moneda extranjera sin convertirla automáticamente", () => {
  const draft = onlyDraft(generate({ facturas: [invoice({ moneda: "USD" })] }));
  assert.equal(errorMatching(draft, /Solo MXN/), true);
  assert.equal(draft.lines.length, 3);
  assert.equal(draft.validation.errors.some((error) => /Solo MXN/.test(error)), true);
});

test("bloquea REP sin factura relacionada en las fuentes", () => {
  const draft = onlyDraft(generate({ pagos: [payment()] }));
  assert.equal(errorMatching(draft, /factura I relacionada única/), true);
  assert.equal(draft.sourceRefs.length, 1);
  assert.equal(draft.lines.some((entry) => ["sales", "purchases"].includes(entry.amountSource)), false);
});

test("bloquea REP ligado a factura PUE y también marca doble liquidación", () => {
  const result = generate({ facturas: [invoice()], pagos: [payment()] });
  const invoiceDraft = onlyDraft(result);
  const paymentDraft = onlyDraft(result, 1);
  assert.equal(errorMatching(invoiceDraft, /Factura PUE con complemento/), true);
  assert.equal(errorMatching(paymentDraft, /no PPD.*doble cobro/), true);
});

test("bloquea REP con RFC o papel que no coincide con la factura", () => {
  const result = generate({
    facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })],
    pagos: [payment({ rfcEmisor: "CCC010101CCC", rfcReceptor: CUSTOMER_RFC })],
  });
  const draft = onlyDraft(result, 1);
  assert.equal(errorMatching(draft, /RFC y papel de empresa/), true);
});

test("bloquea facturas duplicadas y conserva el conflicto en cada ocurrencia", () => {
  const result = generate({ facturas: [invoice(), invoice({ fecha: "2026-10-03T10:00:00-06:00" })] });
  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts.every((draft) => errorMatching(draft, /Ocurrencia CFDI duplicada/)), true);
  assert.equal(result.drafts[0].eventKey, result.drafts[1].eventKey);
});

test("distingue dos DoctoRelacionado del mismo UUID por ordinal de pago", () => {
  const first = payment({ uuid: "REP-1", montoPago: "1160.00", paymentIndex: 1, relatedIndex: 1 });
  const second = payment({ uuid: "REP-1", montoPago: "1160.00", docRelacionado: "INV-2", paymentIndex: 1, relatedIndex: 2 });
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" }), invoice({ uuid: "INV-2", metodoPago: "PPD", formaPagoCode: "99" })], pagos: [first, second] });
  const paymentDrafts = result.drafts.slice(2);
  assert.equal(paymentDrafts.length, 2);
  assert.notEqual(paymentDrafts[0].eventKey, paymentDrafts[1].eventKey);
  assert.equal(paymentDrafts.every((draft) => !errorMatching(draft, /Ocurrencia CFDI duplicada|Parcialidad repetida/)), true);
  assert.equal(paymentDrafts.every((draft) => draft.validation.errors.length === 0), true);
});

test("bloquea una cadena de parcialidades cuyo saldo anterior no coincide", () => {
  const first = payment({ uuid: "CHAIN-1", relatedIndex: 1, numParcialidad: "1", rawAmounts: { prior: "1160.00", paid: "580.00", remaining: "580.00" } });
  const second = payment({ uuid: "CHAIN-2", relatedIndex: 2, numParcialidad: "2", rawAmounts: { prior: "500.00", paid: "500.00", remaining: "0.00" }, fechaPago: "2026-10-03T10:00:00-06:00" });
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })], pagos: [first, second] });
  assert.equal(errorMatching(onlyDraft(result, 2), /cadena de saldos/), true);
});

test("bloquea pagos acumulados que exceden el total de la factura", () => {
  const first = payment({ uuid: "OVER-1", relatedIndex: 1, numParcialidad: "1", rawAmounts: { prior: "1160.00", paid: "700.00", remaining: "460.00" } });
  const second = payment({ uuid: "OVER-2", relatedIndex: 2, numParcialidad: "2", rawAmounts: { prior: "460.00", paid: "500.00", remaining: "-40.00" }, fechaPago: "2026-10-03T10:00:00-06:00" });
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })], pagos: [first, second] });
  const draft = onlyDraft(result, 2);
  assert.equal(errorMatching(draft, /Saldo anterior menos pagado|pagos acumulados exceden/), true);
});

test("merge es idempotente, conserva aprobado y no muta el snapshot previo", () => {
  const result = generate({ facturas: [invoice()] });
  const generated = onlyDraft(result);
  const existing = [{ ...generated, status: "approved", approvedAt: "2026-10-22T00:00:00.000Z", evidenceSnapshot: structuredClone(generated.evidenceSnapshot) }];
  const before = structuredClone(existing);
  const regenerated = onlyDraft(generate({ facturas: [invoice()] }));
  const merged = mergeLifecycleDrafts(existing, [regenerated]);

  assert.deepEqual(merged, existing);
  assert.equal(merged[0].status, "approved");
  assert.equal(merged[0].approvedAt, "2026-10-22T00:00:00.000Z");
  assert.deepEqual(existing, before);
});

test("merge conserva la revisión aprobada aunque cambie la generación", () => {
  const first = onlyDraft(generate({ facturas: [invoice()] }));
  const existing = { ...first, status: "approved", approvedAt: "2026-10-22T00:00:00.000Z" };
  const changed = onlyDraft(generate({ facturas: [invoice({ rawAmounts: { subtotal: "900.00", discount: "0", total: "1044.00" }, taxDetails: [{ ...iva16(), base: "900.00", amount: "144.00" }] })] }));
  assert.notEqual(existing.generationKey, changed.generationKey);
  const merged = mergeLifecycleDrafts([existing], [changed]);
  assert.equal(merged[0].status, "review");
  assert.equal(merged[0].revision, 2);
  assert.equal(merged[0].generationKey, changed.generationKey);
  assert.equal(merged[0].approvedAt, "");
  assert.equal(merged[0].previousRevision.status, "approved");
  assert.equal(merged[0].previousRevision.approvedAt, existing.approvedAt);
});

test("la generación y sus snapshots no mutan las fuentes originales", () => {
  const sources = sourcesFor([invoice()], []);
  const before = structuredClone(sources);
  const draft = onlyDraft(generate({ facturas: [invoice()] }));
  draft.evidenceSnapshot[0].rawAmounts.total = "9999.99";
  draft.evidenceSnapshot[0].taxDetails[0].amount = "0.01";
  draft.accountsSnapshot.sales = "mutated-after-generation";

  assert.deepEqual(sources, before);
  assert.equal(sources[0].cfdi.rawAmounts.total, "1160.00");
  assert.equal(sources[0].cfdi.taxDetails[0].amount, "160.00");
});


test("bloquea REP cuya distribución no coincide con Monto original", () => {
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })], pagos: [payment({ montoPago: "600.00" })] });
  assert.equal(errorMatching(onlyDraft(result, 1), /Monto del Pago/), true);
});

test("bloquea IVA acumulado REP superior a la factura aunque el asiento cuadre", () => {
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })], pagos: [payment({ taxDetails: [paymentIva16("170.00")] })] });
  assert.equal(errorMatching(onlyDraft(result, 1), /IVA aplicado en complementos superior/), true);
  assert.equal(onlyDraft(result, 1).validation.canApprove, false);
});

test("bloquea cuenta configurada pero inactiva", () => {
  const inactiveCatalog = structuredClone(catalog);
  inactiveCatalog.accounts.find((account) => account.accountId === accounts.sales).active = false;
  const draft = onlyDraft(generate({ facturas: [invoice()], configuredCatalog: inactiveCatalog }));
  assert.ok(draft.validation.errors.some((error) => /inactiva/.test(error)));
  assert.equal(draft.validation.canApprove, false);
});

test("IVA a cero no admite impuesto positivo ni una precisión redondeada", () => {
  const draft = onlyDraft(generate({ facturas: [invoice({ rawAmounts: { subtotal: "1000.001", discount: "0", total: "1160.001" } })] }));
  assert.ok(draft.errors.some((error) => /decimal original/.test(error)));
  assert.equal(draft.validation.canApprove, false);
});


test("una factura no seleccionada no entra al snapshot del complemento", () => {
  const sources = sourcesFor([invoice({ metodoPago: "PPD", formaPagoCode: "99" })], [payment()]);
  const drafts = generateLifecycleDrafts({ sources, selectedSourceIds: [sources[1].sourceId], businessRfc: BUSINESS_RFC, companyLocalId: COMPANY_ID, period: PERIOD, accounts, catalog });
  assert.equal(drafts.length, 1);
  assert.deepEqual(drafts[0].sourceRefs, [sources[1].sourceId]);
  assert.equal(drafts[0].evidenceSnapshot.length, 1);
  assert.ok(drafts[0].errors.some((error) => /fuera del alcance/.test(error)));
  assert.equal(drafts[0].validation.canApprove, false);
});

test("sin desglose no se presume IVA cero; no objeto requiere evidencia original", () => {
  const noTaxes = invoice({ rawAmounts: { subtotal: "1000.00", discount: "0", total: "1000.00" }, taxDetails: [] });
  const unknown = onlyDraft(generate({ facturas: [noTaxes] }));
  assert.ok(unknown.errors.some((error) => /no se presume IVA cero/.test(error)));
  const supported = onlyDraft(generate({ facturas: [{ ...noTaxes, taxObjectCodes: ["01"] }] }));
  assertNoErrors(supported);
  assert.equal(supported.lines.length, 2);
});

test("reordenar documentos relacionados no cambia la identidad de su fuente", () => {
  const first = payment({ docRelacionado: "INV-1", relatedIndex: 1 });
  const second = payment({ docRelacionado: "INV-2", relatedIndex: 2 });
  const original = sourcesFor([], [first, second]);
  const reordered = sourcesFor([], [second, first]);
  assert.equal(original[0].sourceId, reordered[1].sourceId);
  assert.equal(original[1].sourceId, reordered[0].sourceId);
});


test("un UUID vacío, blanco o malformado no alcanza aprobación", () => {
  for (const uuid of ["", "   ", "not-a-uuid"]) {
    const item = invoice();
    item.uuid = uuid;
    const draft = onlyDraft(generate({ facturas: [item] }));
    assert.ok(draft.errors.some((error) => /UUID original válido/.test(error)));
    assert.equal(draft.validation.canApprove, false);
  }
});

test("bases e impuestos DR deben explicar el importe pagado, no solo cuadrar el asiento", () => {
  const result = generate({ facturas: [invoice({ metodoPago: "PPD", formaPagoCode: "99" })], pagos: [payment({ taxDetails: [iva16()] })] });
  const draft = onlyDraft(result, 1);
  assert.ok(draft.errors.some((error) => /bases e impuestos DR no explican/.test(error)));
  assert.equal(draft.validation.canApprove, false);
});
