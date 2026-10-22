import { test, expect } from "@playwright/test";

async function mountJournalWorkspace(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { bindJournalWorkspace, renderJournalWorkspace, resetJournalWorkspace } = await import("/src/journal/workspace.js");
    resetJournalWorkspace();
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="journal-test-host"></div></div></div>';
    const root = document.querySelector("#journal-test-host");
    const analysis = { facturas: [{ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", serieFolio: "A-100", fecha: "2025-03-10T12:00:00", total: 1250, moneda: "MXN" }], pagos: [] };
    const render = () => { root.innerHTML = renderJournalWorkspace({ analysis }); };
    bindJournalWorkspace(root, { onUpdate: render });
    render();
  });
}

test.describe("Pólizas sugeridas · frontend local", () => {
  test("genera una simulación manual pero no elude el ciclo CFDI sin originales", async ({ page }) => {
    await mountJournalWorkspace(page);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));

    await expect(page.getByRole("heading", { name: "Pólizas contables sugeridas" })).toBeVisible();
    await page.locator("[data-journal-source]").check();
    await page.locator("[data-journal-generation-mode]").selectOption("manual");
    await page.locator("[data-journal-company-side]").selectOption("issuer");
    await page.locator("[data-journal-period]").fill("2025-03");
    await page.locator("[data-journal-generate]").click();

    await expect(page.locator(".journal-draft-detail")).toContainText("Total cargos");
    await expect(page.locator(".journal-draft-detail")).toContainText("Diferencia");
    await expect(page.locator(".journal-draft-detail .journal-status.is-review")).toContainText("Requiere revisión");
    await expect(page.locator("[data-journal-approve]")).toBeDisabled();

    await page.locator("[data-journal-ack]").check();
    await expect(page.locator("[data-journal-approve]")).toBeDisabled();
    await expect(page.locator(".journal-draft-detail")).toContainText("modo Ciclo CFDI");
    await expect(page.locator(".journal-disclaimer")).toContainText("No constituyen determinación fiscal");
    expect(requests.filter((url) => /\/api\/|supabase|documents/i.test(url))).toEqual([]);
  });

  test("abre el asistente contextual sin cambiar de herramienta y no provoca una solicitud", async ({ page }) => {
    await mountJournalWorkspace(page);
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.locator("[data-journal-assistant-toggle]").click();
    await expect(page.locator("#journal-assistant-body")).toBeVisible();
    await expect(page.locator("#journal-assistant-body")).toContainText("no recibe CFDI");
    expect(await page.locator("[data-journal-page]").count()).toBe(1);
    expect(requests.filter((url) => /\/api\/|supabase|documents/i.test(url))).toEqual([]);
  });

  test("mantiene la revisión sin desbordamiento global en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountJournalWorkspace(page);
    await expect(page.getByRole("heading", { name: "Pólizas contables sugeridas" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
