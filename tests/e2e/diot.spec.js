import { test, expect } from "@playwright/test";

async function mountDiotWorkspace(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { bindDiotWorkspace, renderDiotWorkspace, resetDiotWorkspace } = await import("/src/diot/workspace.js");
    resetDiotWorkspace();
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="diot-test-host"></div></div></div>';
    const root = document.querySelector("#diot-test-host");
    const analysis = { facturas: [{ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tipo: "I", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", rfcEmisor: "AAA010101AAA", nombreEmisor: "Proveedor de prueba", rfcReceptor: "BBB010101BBB", nombreReceptor: "Empresa de prueba", moneda: "MXN", subtotal: 1000, descuento: 0, iva16: 160, ivaRetenido: 0, total: 1160 }], pagos: [] };
    const render = () => { root.innerHTML = renderDiotWorkspace({ analysis }); };
    bindDiotWorkspace(root, { onUpdate: render });
    render();
  });
}

async function completePreparation(page) {
  await page.locator("[data-diot-context='period']").fill("2025-03");
  await page.locator("[data-diot-context='taxpayerType']").selectOption("moral");
  await page.locator("[data-diot-context='companyRole']").selectOption("receiver");
  await page.locator("[data-diot-next='sources']").click();
  await page.locator("[data-diot-source]").check();
  await page.locator("[data-diot-next='classify']").click();
  await page.locator("[data-diot-use-suggestion]").click();
  await page.locator("[data-diot-field='thirdPartyType']").selectOption("national");
  await page.locator("[data-diot-field='operationType']").selectOption("goods");
  await page.locator("[data-diot-field='category']").selectOption("taxable");
  await page.locator("[data-diot-next='review']").click();
}

test.describe("DIOT asistida · frontend local", () => {
  test("prepara una fila CFDI, exige revisión y descarga CSV local sin afirmar presentación", async ({ page }) => {
    await mountDiotWorkspace(page);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));

    await expect(page.getByRole("heading", { name: "DIOT asistida" })).toBeVisible();
    await expect(page.locator("[data-diot-page]")).toContainText("Prepara, revisa y descarga; no presenta declaraciones");
    await completePreparation(page);

    await expect(page.locator(".diot-review-stage")).toContainText("Los importes provienen del análisis numérico actual");
    await page.locator("[data-diot-ack]").check();
    await page.locator("[data-diot-next='download']").click();
    await expect(page.locator("[data-diot-download='csv']")).toBeEnabled();
    await expect(page.locator("[data-diot-download='csv']")).toContainText("Descargar para revisar");
    await expect(page.getByText("Formato oficial compatible · no disponible")).toBeDisabled();

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-diot-download='csv']").click(),
    ]).then(([artifact]) => artifact);
    expect(download.suggestedFilename()).toMatch(/^diot-revision-2025-03-diot-review-cfdi-v1\.csv$/);
    const stream = await download.createReadStream();
    let content = "";
    for await (const chunk of stream) content += chunk.toString();
    expect(content).toContain("Archivo de trabajo local; no es presentación");
    expect(content).toContain("AAA010101AAA");
    expect(content).not.toContain("<cfdi:Comprobante");
    expect(requests.filter((url) => /\/api\/|supabase|documents/i.test(url))).toEqual([]);
  });

  test("abre Nora dentro de DIOT sin pedir fuentes ni enviar una solicitud", async ({ page }) => {
    await mountDiotWorkspace(page);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.locator("[data-diot-assistant-toggle]").click();
    await expect(page.locator("#diot-assistant-body")).toBeVisible();
    await expect(page.locator("#diot-assistant-body")).toContainText("no recibe RFC, XML, importes, terceros, filas ni archivos automáticamente");
    expect(await page.locator("[data-diot-page]").count()).toBe(1);
    expect(requests.filter((url) => /\/api\/|supabase|documents/i.test(url))).toEqual([]);
  });

  test("muestra tarjetas y controles sin desbordamiento global en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountDiotWorkspace(page);
    await completePreparation(page);
    await page.locator(".diot-stepper [data-diot-step='classify']").click();
    await expect(page.locator(".diot-row")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
