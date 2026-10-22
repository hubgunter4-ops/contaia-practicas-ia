import { test, expect } from "@playwright/test";

async function measure(page, name, action, ready) {
  const mark = `learning-${name}-${Date.now()}`;
  await page.evaluate((markName) => performance.mark(`${markName}-start`), mark);
  await action();
  await ready();
  return page.evaluate((markName) => {
    performance.mark(`${markName}-end`);
    performance.measure(markName, `${markName}-start`, `${markName}-end`);
    const entry = performance.getEntriesByName(markName).at(-1);
    return Number((entry?.duration || 0).toFixed(2));
  }, mark);
}

test.describe("ContaIA Aprende · presupuesto de isla", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
  });

  test("mantiene presupuestos de montaje, actualización y navegación", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const mountMs = await measure(
      page,
      "mount",
      () => page.evaluate(async () => {
        const { setAuthClient } = await import("/src/auth/client.js");
        setAuthClient({ signOut: async () => ({}) }, { id: "11111111-1111-4111-8111-111111111111", email: "performance@test.local" });
      }),
      () => expect(page.locator("[data-learning-island-host] [data-learning-island]")).toBeVisible(),
    );

    const updateMs = await measure(
      page,
      "update",
      async () => {
        await page.evaluate(() => {
          const host = document.querySelector("[data-learning-island-host]");
          if (host) host.dataset.performanceToken = "host-stable";
        });
        await page.locator(".classroom-phase-next").click();
      },
      () => expect(page.locator('[data-class-phase="1"]')).toHaveClass(/is-active/),
    );
    await expect(page.locator('[data-learning-island-host][data-performance-token="host-stable"]')).toHaveCount(1);

    const navigationMs = await measure(
      page,
      "navigation",
      () => page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="study"]')?.click()),
      () => expect(page.locator("[data-learning-island-host] [data-study-search]")).toBeVisible(),
    );

    process.stdout.write(`[learning-performance] ${JSON.stringify({ mountMs, updateMs, navigationMs })}\n`);
    expect(mountMs, "el montaje educativo debe quedar dentro del presupuesto de transición").toBeLessThan(2500);
    expect(updateMs, "una actualización local debe completar dentro del presupuesto de interacción").toBeLessThan(500);
    expect(navigationMs, "la navegación entre vistas educativas debe completar la transición").toBeLessThan(2500);
  });
});
