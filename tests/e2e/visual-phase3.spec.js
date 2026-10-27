import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const captureRoot = process.env.VISUAL_CAPTURE_DIR || "/tmp/contaia-visual3-captures";

async function blankHost(page, id) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((hostId) => {
    document.body.innerHTML = `<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="${hostId}"></div></div></div>`;
  }, id);
  return page.locator(`#${id}`);
}

async function mountCfdi(page) {
  const root = await blankHost(page, "visual-cfdi-host");
  await page.evaluate(async () => {
    const { bindCfdiWorkspace, cfdiState, renderCfdiWorkspace } = await import("/src/cfdi/workspace.js");
    cfdiState.analysis = {
      facturas: [
        { uuid: "venta-1", tipo: "I", serieFolio: "V-1", fecha: "2026-09-01T10:00:00", rfcEmisor: "AAA010101AAA", rfcReceptor: "CLI010101BBB", nombreEmisor: "Comercio demo", nombreReceptor: "Cliente demo", moneda: "MXN", subtotal: 1000, descuento: 0, taxRates: ["0", "16"], taxBaseKnown: { zero: true, sixteen: true }, baseIva0: 400, iva0: 0, baseIva16: 600, iva16: 96, ieps: 24, iepsBreakdown: { "8%": 24 }, total: 1120 },
        { uuid: "compra-1", tipo: "I", serieFolio: "C-1", fecha: "2026-09-02T10:00:00", rfcEmisor: "PRO010101CCC", rfcReceptor: "AAA010101AAA", nombreEmisor: "Proveedor demo", nombreReceptor: "Comercio demo", moneda: "MXN", subtotal: 800, descuento: 0, taxRates: ["16"], taxBaseKnown: { zero: false, sixteen: true }, baseIva16: 800, iva16: 128, ieps: 12, iepsBreakdown: { "Cuota ($0.50)": 12 }, total: 940 },
      ],
      pagos: [],
      conceptos: [],
      summary: { invoiceCount: 2, paymentCount: 0, conceptCount: 0, matchedPayments: 0, unmatchedPayments: 0, duplicateUuids: 0, balanceAlerts: 0, missingInvoiceReferences: 0, overpaidLinks: 0, totalsByCurrency: [{ currency: "MXN", invoiced: 2060, paid: 0, remaining: 0 }], alerts: [] },
    };
    cfdiState.fileCount = 2;
    cfdiState.status = "ready";
    cfdiState.taxReport = null;
    cfdiState.taxReportOpen = false;
    window.__visualCfdiRender = () => { document.querySelector("#visual-cfdi-host").innerHTML = renderCfdiWorkspace(); };
    bindCfdiWorkspace(document.querySelector("#visual-cfdi-host"), { onUpdate: window.__visualCfdiRender });
    window.__visualCfdiRender();
  });
  await root.locator("[data-cfdi-open-tax-report]").click();
  await root.locator("[data-cfdi-business-rfc]").fill("AAA010101AAA");
  await root.locator("[data-cfdi-tax-report]").press("Enter");
  await expect(root.locator(".cfdi-tax-report")).toBeVisible();
}

async function mountReconciliation(page) {
  const root = await blankHost(page, "visual-recon-host");
  await page.evaluate(async () => {
    const { bindReconciliationWorkspace, renderReconciliationWorkspace, resetReconciliationWorkspace } = await import("/src/reconciliation/workspace.js");
    resetReconciliationWorkspace();
    const analysis = { facturas: [{ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tipo: "I", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", total: 1250, moneda: "MXN" }], pagos: [] };
    const root = document.querySelector("#visual-recon-host");
    window.__visualReconRender = () => { root.innerHTML = renderReconciliationWorkspace({ analysis }); };
    bindReconciliationWorkspace(root, { getAnalysis: () => analysis, onUpdate: window.__visualReconRender });
    window.__visualReconRender();
  });
  await root.locator("[data-recon-file]").setInputFiles({
    name: "extracto-visual.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Fecha;Importe;Referencia;Moneda;Descripción\n10/03/2025;1250.00;A-100;MXN;Pago de prueba\n11/03/2025;400.00;A-101;MXN;Movimiento pendiente", "utf8"),
  });
  await root.locator('[data-recon-map="date"]').selectOption("0");
  await root.locator('[data-recon-map="amount"]').selectOption("1");
  await root.locator('[data-recon-map="reference"]').selectOption("2");
  await root.locator('[data-recon-map="currency"]').selectOption("3");
  await root.locator('[data-recon-setting="dateFormat"]').selectOption("dmy");
  await root.locator('[data-recon-setting="amountConvention"]').selectOption("signed");
  await root.locator('[data-recon-setting="sourceType"]').selectOption("invoices");
  await root.locator("[data-recon-run]").click();
  await expect(root.locator(".recon-table")).toBeVisible();
}

async function mountJournal(page) {
  const root = await blankHost(page, "visual-journal-host");
  await page.evaluate(async () => {
    const workspace = await import("/src/journal/workspace.js");
    workspace.resetJournalWorkspace();
    const invoice = { uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", serieFolio: "VENTA-PPD", fecha: "2026-10-01T12:00:00", moneda: "MXN", metodoPago: "PPD", formaPagoCode: "99", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", rawAmounts: { total: "1160.00", subtotal: "1000.00", discount: "0" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "1000.00", amount: "160.00" }], taxObjectCodes: ["02"] };
    const note = { uuid: "22222222-2222-4222-8222-222222222222", tipo: "E", serieFolio: "NC-1", fecha: "2026-10-04T12:00:00", moneda: "MXN", metodoPago: "PUE", formaPagoCode: "17", rfcEmisor: invoice.rfcEmisor, rfcReceptor: invoice.rfcReceptor, rawAmounts: { total: "116.00", subtotal: "100.00", discount: "0" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "100.00", amount: "16.00" }], taxObjectCodes: ["02"], cfdiRelations: [{ type: "01", uuids: [invoice.uuid] }] };
    const payment = { uuid: "33333333-3333-4333-8333-333333333333", docRelacionado: invoice.uuid, serieFolio: "REP-1", fechaPago: "2026-10-03T12:00:00", moneda: "MXN", monedaPago: "MXN", montoPago: "580.00", numParcialidad: "1", formaPagoCode: "03", objetoImpDR: "02", paymentIndex: 1, relatedIndex: 1, rfcEmisor: invoice.rfcEmisor, rfcReceptor: invoice.rfcReceptor, rawAmounts: { prior: "1160.00", paid: "580.00", remaining: "580.00" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "500.00", amount: "80.00" }] };
    const analysis = { facturas: [invoice, note], pagos: [payment] };
    const root = document.querySelector("#visual-journal-host");
    for (const [accountId, codeText] of [["VAT-PENDING", "IVA pendiente"], ["VAT-COLLECTED", "IVA cobrado"], ["SALES-DISCOUNT", "Descuentos ventas"], ["VAT-ADJUST", "Ajuste IVA"], ["SETTLEMENT", "Compensaciones"]]) workspace.journalState.catalog.accounts.push({ accountId, codeText, name: codeText, nature: "acreedora", active: true, imputable: true, currencyCode: "MXN", parentAccountId: "" });
    window.__visualJournalRender = () => { root.innerHTML = workspace.renderJournalWorkspace({ analysis }); };
    workspace.bindJournalWorkspace(root, { onUpdate: window.__visualJournalRender });
    window.__visualJournalRender();
  });
  await root.locator("[data-journal-business-rfc]").fill("AAA010101AAA");
  await root.locator("[data-journal-business-rfc]").blur();
  await root.locator("[data-journal-period]").fill("2026-10");
  await root.locator("[data-journal-period]").blur();
  for (const [role, account] of Object.entries({ sales: "401-VENTAS", receivable: "105-CLIENTES", outputVatPending: "VAT-PENDING", outputVat: "VAT-COLLECTED", "payment:03": "101-BANCO", salesDiscount: "SALES-DISCOUNT", outputVatAdjustment: "VAT-ADJUST", adjustmentSettlement: "SETTLEMENT" })) await root.locator(`[data-journal-lifecycle-account="${role}"]`).selectOption(account);
  for (const checkbox of await root.locator("[data-journal-source]").all()) await checkbox.check();
  await root.getByRole("button", { name: "Auditoría global" }).click();
  await expect(root.locator("#journal-global-audit-title")).toBeVisible();
}

async function mountDiot(page) {
  const root = await blankHost(page, "visual-diot-host");
  await page.evaluate(async () => {
    const { bindDiotWorkspace, renderDiotWorkspace, resetDiotWorkspace } = await import("/src/diot/workspace.js");
    resetDiotWorkspace();
    const analysis = { facturas: [{ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tipo: "I", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", rfcEmisor: "AAA010101AAA", nombreEmisor: "Proveedor de prueba", rfcReceptor: "BBB010101BBB", nombreReceptor: "Empresa de prueba", moneda: "MXN", subtotal: 1000, descuento: 0, iva16: 160, ivaRetenido: 0, total: 1160 }], pagos: [] };
    const root = document.querySelector("#visual-diot-host");
    window.__visualDiotRender = () => { root.innerHTML = renderDiotWorkspace({ analysis }); };
    bindDiotWorkspace(root, { onUpdate: window.__visualDiotRender });
    window.__visualDiotRender();
  });
  await root.locator("[data-diot-context='period']").fill("2025-03");
  await root.locator("[data-diot-context='taxpayerType']").selectOption("moral");
  await root.locator("[data-diot-context='companyRole']").selectOption("receiver");
  await root.locator("[data-diot-next='sources']").click();
  await root.locator("[data-diot-source]").check();
  await root.locator("[data-diot-next='classify']").click();
  await root.locator("[data-diot-use-suggestion]").click();
  await root.locator("[data-diot-field='thirdPartyType']").selectOption("national");
  await root.locator("[data-diot-field='operationType']").selectOption("goods");
  await root.locator("[data-diot-field='category']").selectOption("taxable");
  await root.locator("[data-diot-next='review']").click();
  await expect(root.locator(".diot-review-stage")).toBeVisible();
}

test("capturas comparativas de densidad por isla", async ({ page }, testInfo) => {
  // Esta evidencia móvil recorre cuatro workspaces y captura páginas completas; el resto de E2E conserva el timeout global.
  if (testInfo.project.name === "mobile-chromium") test.setTimeout(30_000);
  await mkdir(path.join(captureRoot, testInfo.project.name), { recursive: true });
  const fixtures = [
    ["cfdi", mountCfdi],
    ["reconciliation", mountReconciliation],
    ["journal-audit", mountJournal],
    ["diot", mountDiot],
  ];
  for (const [slug, mount] of fixtures) {
    await mount(page);
    if (slug === "journal-audit" && testInfo.project.name === "chromium") {
      await expect(rootOrPage(page).locator(".journal-audit-layout")).toHaveCSS("align-items", "stretch");
    }
    if (slug === "diot" && testInfo.project.name === "mobile-chromium") {
      await expect(rootOrPage(page).locator(".diot-stepper")).toHaveCSS("scroll-snap-type", /x/);
    }
    await page.screenshot({ path: path.join(captureRoot, testInfo.project.name, `${slug}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

function rootOrPage(page) {
  return page;
}
