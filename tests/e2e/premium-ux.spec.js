import { test, expect } from "@playwright/test";

test.describe("E6 · UX Free/Premium", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
    await page.route("**/api/tools/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }));
  });

  test("muestra el plan Free informativo y no abre checkout", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      setAuthClient({ signOut: async () => ({}) }, { id: "11111111-1111-4111-8111-111111111111", email: "premium@test.local" });
    });
    const mobileTools = page.locator('.mobile-bottom-nav [data-section="tools"]');
    if (await mobileTools.isVisible()) {
      await mobileTools.click();
    } else {
      await page.locator('summary[aria-label="Abrir herramientas"]').click();
      await page.locator('.tools-menu-popover [data-section="tools"]').click();
    }
    const plan = page.locator("[data-premium-plan]");
    await expect(plan).toBeVisible();
    await expect(plan).toHaveAttribute("data-premium-plan", "free");
    await expect(plan).toContainText("Premium pendiente de activación");
    await expect(plan).toContainText("Uso no disponible");
    await plan.locator('[data-tools-ui="premium-info"]').click();
    await expect(page.locator('.tools-notice[role="status"]')).toContainText("Premium aún está en preparación");
    await expect(page.locator("[data-premium-plan] a")).toHaveCount(0);
    await expect(page.locator("[data-premium-plan]")).not.toContainText(/checkout|stripe|data-payment/i);
    await plan.locator('[data-tools-ui="premium-dismiss"]').click();
    await expect(page.locator('.tools-notice[role="status"]')).toContainText("Continúas con el plan Free");
  });
});
