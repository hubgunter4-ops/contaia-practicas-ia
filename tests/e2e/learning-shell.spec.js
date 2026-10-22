import { test, expect } from "@playwright/test";

test.describe("ContaIA Aprende · integración de isla", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
  });

  test("monta Aula y Estudio en la isla, conserva progreso visual y desmonta al abrir Herramientas", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      setAuthClient({ signOut: async () => ({}) }, { id: "11111111-1111-4111-8111-111111111111", email: "island@test.local" });
    });

    await expect(page.locator("[data-learning-island-host] [data-learning-island]")).toBeVisible();
    await page.locator(".classroom-phase-next").click();
    await expect(page.locator('[data-class-phase="1"]')).toHaveClass(/is-active/);

    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="study"]')?.click());
    await expect(page.locator("[data-learning-island-host] [data-study-search]")).toBeVisible();
    await expect(page.locator("[data-study-search]")).toHaveAttribute("value", "");

    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="tools"]')?.click());
    await expect(page.locator("[data-learning-island-host]")).toHaveCount(0);
    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="course"]')?.click());
    await expect(page.locator("[data-learning-island-host] [data-learning-island]")).toBeVisible();
  });
});
