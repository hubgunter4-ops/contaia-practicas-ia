import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";

async function mountReconciliationWorkspace(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { bindReconciliationWorkspace, renderReconciliationWorkspace, resetReconciliationWorkspace } = await import("/src/reconciliation/workspace.js");
    resetReconciliationWorkspace();
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="reconciliation-test-host"></div></div></div>';
    const root = document.querySelector("#reconciliation-test-host");
    const analysis = {
      facturas: [{ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tipo: "I", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", total: 1250, moneda: "MXN" }],
      pagos: [],
    };
    const render = () => { root.innerHTML = renderReconciliationWorkspace({ analysis }); };
    bindReconciliationWorkspace(root, { getAnalysis: () => analysis, onUpdate: render });
    render();
  });
}

test.describe("Conciliación bancaria · frontend local", () => {
  test("mapea un CSV, muestra evidencia y un nivel de confianza sin enviar el archivo", async ({ page }) => {
    await mountReconciliationWorkspace(page);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));

    await expect(page.getByText("En preparación · sin conexión bancaria")).toBeVisible();
    await page.locator("[data-recon-file]").setInputFiles({
      name: "extracto-prueba.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Fecha;Importe;Referencia;Moneda;Descripción\n10/03/2025;1250.00;A-100;MXN;Pago de prueba", "utf8"),
    });
    await expect(page.getByText(/Archivo leído en memoria/)).toBeVisible();

    await page.locator('[data-recon-map="date"]').selectOption("0");
    await page.locator('[data-recon-map="amount"]').selectOption("1");
    await page.locator('[data-recon-map="reference"]').selectOption("2");
    await page.locator('[data-recon-map="currency"]').selectOption("3");
    await page.locator('[data-recon-setting="dateFormat"]').selectOption("dmy");
    await page.locator('[data-recon-setting="amountConvention"]').selectOption("signed");
    await page.locator('[data-recon-setting="sourceType"]').selectOption("invoices");
    await page.locator('[data-recon-run]').click();

    const row = page.locator(".recon-table tbody tr").first();
    await expect(row).toContainText("A-100");
    await expect(row).toContainText("Confianza heurística: Alta");
    await expect(row).toContainText("Referencia normalizada exacta");
    await expect(row).toContainText("Dirección bancaria pendiente de revisión");
    await expect(page.locator(".recon-privacy-banner")).toContainText("No se sube el extracto");
    expect(requests.filter((url) => /\/api\/|supabase|tutor|documents/i.test(url))).toEqual([]);
  });

  test("carga un libro XLSX real usando el bundle local de SheetJS", async ({ page }) => {
    await mountReconciliationWorkspace(page);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Fecha", "Importe", "Referencia", "Moneda"],
      [45726, 1250, "A-100", "MXN"],
    ]), "Movimientos");
    const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    await page.locator("[data-recon-file]").setInputFiles({
      name: "extracto-prueba.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await expect(page.locator("[data-recon-sheet]")).toHaveValue("Movimientos");
    await page.locator('[data-recon-map="date"]').selectOption("0");
    await page.locator('[data-recon-map="amount"]').selectOption("1");
    await page.locator('[data-recon-map="reference"]').selectOption("2");
    await page.locator('[data-recon-map="currency"]').selectOption("3");
    await page.locator('[data-recon-setting="dateFormat"]').selectOption("excel");
    await page.locator('[data-recon-setting="amountConvention"]').selectOption("signed");
    await page.locator('[data-recon-setting="sourceType"]').selectOption("invoices");
    await page.locator('[data-recon-run]').click();
    await expect(page.locator(".recon-table tbody tr").first()).toContainText("Confianza heurística: Alta");
  });

  test("el espacio de trabajo y las filas se adaptan a un viewport móvil sin desbordamiento global", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountReconciliationWorkspace(page);
    await expect(page.getByRole("heading", { name: "Conciliación bancaria" })).toBeVisible();
    await expect(page.locator(".recon-privacy-banner")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
