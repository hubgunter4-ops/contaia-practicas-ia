import { test, expect } from "@playwright/test";

async function mount(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const workspace = await import("/src/journal/workspace.js");
    workspace.resetJournalWorkspace();
    const invoice = { uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", serieFolio: "VENTA-PPD", fecha: "2026-10-01T12:00:00", moneda: "MXN", metodoPago: "PPD", formaPagoCode: "99", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", rawAmounts: { total: "1160.00", subtotal: "1000.00", discount: "0" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "1000.00", amount: "160.00" }], taxObjectCodes: ["02"] };
    const note = { uuid: "22222222-2222-4222-8222-222222222222", tipo: "E", serieFolio: "NC-1", fecha: "2026-10-04T12:00:00", moneda: "MXN", metodoPago: "PUE", formaPagoCode: "17", rfcEmisor: invoice.rfcEmisor, rfcReceptor: invoice.rfcReceptor, rawAmounts: { total: "116.00", subtotal: "100.00", discount: "0" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "100.00", amount: "16.00" }], taxObjectCodes: ["02"], cfdiRelations: [{ type: "01", uuids: [invoice.uuid] }] };
    const payment = { uuid: "33333333-3333-4333-8333-333333333333", docRelacionado: invoice.uuid, serieFolio: "REP-1", fechaPago: "2026-10-03T12:00:00", moneda: "MXN", monedaPago: "MXN", montoPago: "580.00", numParcialidad: "1", formaPagoCode: "03", objetoImpDR: "02", paymentIndex: 1, relatedIndex: 1, rfcEmisor: invoice.rfcEmisor, rfcReceptor: invoice.rfcReceptor, rawAmounts: { prior: "1160.00", paid: "580.00", remaining: "580.00" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "500.00", amount: "80.00" }] };
    const analysis = { facturas: [invoice, note], pagos: [payment] };
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell"><div id="audit-host"></div></div></div>';
    const host = document.querySelector("#audit-host");
    const render = () => { host.innerHTML = workspace.renderJournalWorkspace({ analysis }); };
    for (const [accountId, codeText] of [["VAT-PENDING", "IVA pendiente"], ["VAT-COLLECTED", "IVA cobrado"], ["SALES-DISCOUNT", "Descuentos ventas"], ["VAT-ADJUST", "Ajuste IVA"], ["SETTLEMENT", "Compensaciones"]]) {
      workspace.journalState.catalog.accounts.push({ accountId, codeText, name: codeText, nature: "acreedora", active: true, imputable: true, currencyCode: "MXN", parentAccountId: "" });
    }
    workspace.bindJournalWorkspace(host, { onUpdate: render });
    render();
    window.__auditHarness = { workspace, render };
  });
}

async function configureAndSelect(page) {
  await page.locator("[data-journal-business-rfc]").fill("AAA010101AAA");
  await page.locator("[data-journal-business-rfc]").blur();
  await page.locator("[data-journal-period]").fill("2026-10");
  await page.locator("[data-journal-period]").blur();
  for (const [role, account] of Object.entries({ sales: "401-VENTAS", receivable: "105-CLIENTES", outputVatPending: "VAT-PENDING", outputVat: "VAT-COLLECTED", "payment:03": "101-BANCO", salesDiscount: "SALES-DISCOUNT", outputVatAdjustment: "VAT-ADJUST", adjustmentSettlement: "SETTLEMENT" })) {
    await page.locator(`[data-journal-lifecycle-account="${role}"]`).selectOption(account);
  }
  for (const checkbox of await page.locator("[data-journal-source]").all()) await checkbox.check();
}

test("audita global y parcial, exige aplicación humana de E y descarga evidencia local", async ({ page }) => {
  await mount(page);
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await configureAndSelect(page);

  await page.getByRole("button", { name: "Auditoría global" }).click();
  await expect(page.locator("#journal-global-audit-title")).toContainText("Revisión de ciclo CFDI");
  const creditFinding = page.locator(".journal-audit-finding").filter({ hasText: "Nota de crédito sin decisión de aplicación local" });
  await expect(creditFinding).toHaveCount(1);
  await creditFinding.locator("[data-journal-finding]").click();
  await expect(page.locator(".journal-finding-detail")).toContainText("Acción sugerida");
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-audit-export]").click(),
  ]);
  expect(download[0].suggestedFilename()).toMatch(/^contaia-revision-ciclo-cfdi-2026-10\.xlsx$/);

  await page.getByRole("button", { name: "Auditoría parcial" }).click();
  await page.locator("[data-audit-filter-form] select[name='type']").selectOption("E");
  await page.locator("[data-audit-filter-form]").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#journal-partial-audit-title")).toContainText("Filtra sin alterar");
  await expect(page.locator(".journal-audit-summary")).toContainText("Fuentes");

  await page.getByRole("button", { name: "Notas de crédito" }).click();
  await expect(page.locator("#journal-adjustment-title")).toContainText("Notas de crédito con aplicación humana");
  await page.locator("[data-credit-note-form] select[name='application']").selectOption("compensation");
  await page.locator("[data-credit-note-form] textarea[name='note']").fill("Compensación confirmada para esta revisión local.");
  await page.locator("[data-credit-note-form]").evaluate((form) => form.requestSubmit());
  await page.locator("[data-journal-generate-adjustments]").click();
  await expect(page.locator(".journal-draft-item")).toHaveCount(3);
  await page.locator(".journal-draft-item").nth(1).click();
  await expect(page.locator(".journal-draft-detail")).toContainText("issuer_credit_note");
  await expect(page.locator(".journal-lines")).toContainText("Compensación confirmada localmente");
  expect(requests.filter((url) => /\/api\/|supabase/i.test(url))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
