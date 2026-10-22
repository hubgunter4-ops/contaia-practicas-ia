import { test, expect } from "@playwright/test";

async function mountCfdiTaxWorkspace(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { bindCfdiWorkspace, cfdiState, renderCfdiWorkspace } = await import("/src/cfdi/workspace.js");
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="cfdi-tax-test-host"></div></div></div>';
    const root = document.querySelector("#cfdi-tax-test-host");
    cfdiState.analysis = {
      facturas: [
        { uuid: "venta-1", tipo: "I", serieFolio: "V-1", fecha: "2026-09-01T10:00:00", rfcEmisor: "AAA010101AAA", rfcReceptor: "CLI010101BBB", nombreEmisor: "Comercio demo", nombreReceptor: "Cliente demo", moneda: "MXN", subtotal: 1000, descuento: 0, taxRates: ["0", "16"], taxBaseKnown: { zero: true, sixteen: true }, baseIva0: 400, iva0: 0, baseIva16: 600, iva16: 96, ieps: 24, iepsBreakdown: { "8%": 24 }, total: 1120 },
        { uuid: "compra-1", tipo: "I", serieFolio: "C-1", fecha: "2026-09-02T10:00:00", rfcEmisor: "PRO010101CCC", rfcReceptor: "AAA010101AAA", nombreEmisor: "Proveedor demo", nombreReceptor: "Comercio demo", moneda: "MXN", subtotal: 800, descuento: 0, taxRates: ["16"], taxBaseKnown: { zero: false, sixteen: true }, baseIva16: 800, iva16: 128, ieps: 12, iepsBreakdown: { "Cuota ($0.50)": 12 }, total: 940 },
      ],
      pagos: [], conceptos: [],
      summary: { invoiceCount: 2, paymentCount: 0, conceptCount: 0, matchedPayments: 0, unmatchedPayments: 0, duplicateUuids: 0, balanceAlerts: 0, missingInvoiceReferences: 0, overpaidLinks: 0, totalsByCurrency: [{ currency: "MXN", invoiced: 2060, paid: 0, remaining: 0 }], alerts: [] },
    };
    cfdiState.fileCount = 2;
    cfdiState.status = "ready";
    cfdiState.taxReport = null;
    cfdiState.taxReportOpen = false;
    const render = () => { root.innerHTML = renderCfdiWorkspace(); };
    bindCfdiWorkspace(root, { onUpdate: render });
    render();
  });
}

test.describe("CFDI · ventas, compras e IEPS", () => {
  test("genera reporte local por RFC con IVA 0%, 16% e IEPS", async ({ page }) => {
    await mountCfdiTaxWorkspace(page);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.locator("[data-cfdi-open-tax-report]").click();
    await page.locator("[data-cfdi-business-rfc]").fill("aaa010101aaa");
    await page.locator("[data-cfdi-tax-report]").press("Enter");

    await expect(page.locator(".cfdi-tax-report")).toContainText("Ventas y compras por impuestos");
    await expect(page.locator(".cfdi-tax-sides")).toContainText("Ventas");
    await expect(page.locator(".cfdi-tax-sides")).toContainText("Compras");
    await expect(page.locator(".cfdi-tax-rate-grid").first()).toContainText("IVA 0% · base");
    await expect(page.locator(".cfdi-tax-rate-grid").first()).toContainText("IVA 16% · base");
    await expect(page.locator(".cfdi-ieps-breakdown").first()).toContainText("Desglosar IEPS por tasa o cuota");
    expect(requests.filter((url) => /\/api\/|supabase|documents/i.test(url))).toEqual([]);
  });

  test("mantiene el reporte apilado y sin desbordamiento global en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountCfdiTaxWorkspace(page);
    await page.locator("[data-cfdi-open-tax-report]").click();
    await page.locator("[data-cfdi-business-rfc]").fill("AAA010101AAA");
    await page.locator("[data-cfdi-tax-report]").press("Enter");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.locator(".cfdi-tax-sides").evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
  });
});
