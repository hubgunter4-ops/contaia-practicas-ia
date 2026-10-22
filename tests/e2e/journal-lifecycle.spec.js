import { test, expect } from "@playwright/test";

async function mount(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const workspace = await import("/src/journal/workspace.js");
    workspace.resetJournalWorkspace();
    const invoice = { uuid: "11111111-1111-1111-1111-111111111111", tipo: "I", serieFolio: "VENTA-PPD", fecha: "2026-10-01T12:00:00", moneda: "MXN", metodoPago: "PPD", formaPagoCode: "99", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", rawAmounts: { total: "1160.00", subtotal: "1000.00", discount: "0" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "1000.00", amount: "160.00" }] };
    const payment = { uuid: "22222222-2222-2222-2222-222222222222", docRelacionado: invoice.uuid, serieFolio: "REP-1", fechaPago: "2026-10-02T12:00:00", moneda: "MXN", monedaPago: "MXN", montoPago: "580.00", numParcialidad: "1", formaPagoCode: "03", objetoImpDR: "02", paymentIndex: 1, relatedIndex: 1, rfcEmisor: invoice.rfcEmisor, rfcReceptor: invoice.rfcReceptor, rawAmounts: { prior: "1160.00", paid: "580.00", remaining: "580.00" }, taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.160000", base: "500.00", amount: "80.00" }] };
    const analysis = { facturas: [invoice], pagos: [payment] };
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell"><div id="lifecycle-host"></div></div></div>';
    const host = document.querySelector("#lifecycle-host");
    const render = () => { host.innerHTML = workspace.renderJournalWorkspace({ analysis }); };
    // Cuentas ficticias disponibles, pero ninguna asignación del motor se precarga.
    for (const [accountId, name] of [["VAT-PENDING", "IVA pendiente"], ["VAT-COLLECTED", "IVA cobrado"]]) {
      workspace.journalState.catalog.accounts.push({ accountId, codeText: accountId, name, nature: "acreedora", active: true, imputable: true, currencyCode: "MXN", parentAccountId: "" });
    }
    workspace.bindJournalWorkspace(host, { onUpdate: render });
    render();
    window.__lifecycleHarness = { workspace, render, analysis };
  });
}

async function configure(page) {
  await page.locator("[data-journal-business-rfc]").fill("AAA010101AAA");
  await page.locator("[data-journal-period]").fill("2026-10");
  for (const [role, account] of Object.entries({ sales: "401-VENTAS", receivable: "105-CLIENTES", outputVatPending: "VAT-PENDING", outputVat: "VAT-COLLECTED", "payment:03": "101-BANCO" })) {
    await page.locator(`[data-journal-lifecycle-account="${role}"]`).selectOption(account);
  }
}

test("genera PPD y REP separados, requiere configuración y no duplica revisiones", async ({ page }) => {
  await mount(page);
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.locator("[data-journal-source]").nth(0).check();
  await page.locator("[data-journal-source]").nth(1).check();
  await page.locator("[data-journal-generate]").click();
  await expect(page.locator(".journal-draft-detail")).toContainText("Configura la cuenta");
  await expect(page.locator("[data-journal-approve]")).toBeDisabled();
  await configure(page);
  await page.locator("[data-journal-source]").nth(0).check();
  await page.locator("[data-journal-source]").nth(1).check();
  await page.locator("[data-journal-generate]").click();
  await expect(page.locator(".journal-draft-item")).toHaveCount(2);
  await expect(page.locator(".journal-draft-detail")).toContainText("sale_credit");
  await expect(page.locator(".journal-lines")).toContainText("Venta · base neta");
  await page.locator(".journal-draft-item").nth(1).click();
  await expect(page.locator(".journal-draft-detail")).toContainText("customer_collection");
  await expect(page.locator(".journal-lines tbody tr")).toHaveCount(4);
  await expect(page.locator(".journal-lines")).toContainText("Liquidación de Clientes");
  await expect(page.locator(".journal-lines")).toContainText("Reclasificación IVA pendiente");
  await expect(page.locator("[data-journal-approve]")).toBeDisabled();
  await page.locator("[data-journal-ack]").check();
  await page.locator("[data-journal-approve]").click();
  await expect(page.locator(".journal-approved-note")).toContainText("No se contabilizó");
  await page.locator("[data-journal-generate]").click();
  await expect(page.locator(".journal-draft-item")).toHaveCount(2);
  const state = await page.evaluate(() => {
    const drafts = window.__lifecycleHarness.workspace.journalState.drafts;
    return drafts.map((draft) => ({ status: draft.status, revision: draft.revision }));
  });
  expect(state[1].status).toBe("approved");
  await page.locator("[data-journal-assistant-toggle]").click();
  await expect(page.locator("#journal-assistant-body")).toBeVisible();
  expect(requests.filter((url) => /\/api\/|supabase/i.test(url))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("cambiar periodo bloquea propuestas sin heredar aprobación ni dejar abierta Nora", async ({ page }) => {
  await mount(page);
  await configure(page);
  await page.locator("[data-journal-source]").nth(0).check();
  await page.locator("[data-journal-generate]").click();
  await page.locator("[data-journal-ack]").check();
  await expect(page.locator("[data-journal-approve]")).toBeEnabled();
  await page.locator("[data-journal-assistant-toggle]").click();
  await page.locator("[data-journal-period]").fill("2026-11");
  await expect(page.locator("[data-journal-approve]")).toBeDisabled();
  await expect(page.locator(".journal-draft-detail")).toContainText("El contexto o las cuentas cambiaron");
  await expect(page.locator("#journal-assistant-body")).toHaveCount(0);
});
