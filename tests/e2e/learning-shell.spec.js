import { test, expect } from "@playwright/test";

async function expectNoHorizontalOverflow(page, section) {
  const metrics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return { element, selector: `${element.tagName.toLowerCase()}.${String(element.className || "").trim().replace(/\\s+/g, ".")}`, right: Math.round(rect.right), width: Math.round(rect.width), display: style.display, overflowX: style.overflowX };
      })
      .filter(({ right, width, display }) => width > 0 && display !== "none" && right > viewportWidth + 1)
      .map(({ selector, right, width, overflowX }) => ({ selector, right, width, overflowX }))
      .slice(0, 12);
    return { documentWidth: document.documentElement.scrollWidth, viewportWidth, offenders };
  });
  expect(metrics.documentWidth, `${section}: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewportWidth);
}

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
    await expect(page.locator(".app-shell")).toHaveClass(/app-shell--platform/);
    for (const width of [390, 820, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await expectNoHorizontalOverflow(page, `Aula ${width}px`);
    }
    await page.locator(".classroom-phase-next").click();
    await expect(page.locator('[data-class-phase="1"]')).toHaveClass(/is-active/);

    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="study"]')?.click());
    await expect(page.locator("[data-learning-island-host] [data-study-search]")).toBeVisible();
    await expect(page.locator("[data-study-search]")).toHaveAttribute("value", "");
    for (const width of [390, 820, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await expectNoHorizontalOverflow(page, `Estudio ${width}px`);
    }

    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="advisor"]')?.click());
    await expect(page.locator(".open-assistant-content")).toBeVisible();
    for (const width of [390, 820, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await expectNoHorizontalOverflow(page, `Asistente abierto ${width}px`);
    }

    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="tools"]')?.click());
    await expect(page.locator("[data-learning-island-host]")).toHaveCount(0);
    await expect(page.locator(".tools-page")).toBeVisible();
    for (const width of [390, 820, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await expectNoHorizontalOverflow(page, `Herramientas ${width}px`);
    }
    await page.evaluate(() => document.querySelector('.mobile-nav-item[data-section="course"]')?.click());
    await expect(page.locator("[data-learning-island-host] [data-learning-island]")).toBeVisible();
  });
});
