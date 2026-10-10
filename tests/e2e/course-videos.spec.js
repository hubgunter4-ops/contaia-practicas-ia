import { test, expect } from "@playwright/test";

async function configureClipboard(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedCourseVideoBrief = text; } },
    });
  });
}

test.describe("apoyos audiovisuales opcionales", () => {
  test("el aula guiada no presenta una tarjeta de video para cada clase", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("classroom-stage")).toBeVisible();
    await expect(page.locator("[data-testid^='course-video-module-']")).toHaveCount(0);
  });

  test("cada práctica ofrece su brief contextual y no inserta un video no aprobado", async ({ page }) => {
    await configureClipboard(page);
    await page.goto("/");
    await page.locator('[data-section="lab"]').first().click();
    await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();
    const card = page.getByTestId("course-video-exercise-prompt");

    await expect(card).toContainText("Apoyo para la práctica: Redacta un prompt contable útil");
    await expect(card).toContainText("Video en preparación");
    await expect(card.locator("iframe")).toHaveCount(0);
    await card.getByRole("button", { name: /copiar briefing para notebooklm/i }).click();
    await expect(card.locator("[data-video-brief-status]")).toContainText("Briefing copiado");
    const brief = await page.evaluate(() => window.__copiedCourseVideoBrief);
    expect(brief).toContain("TAREA RELACIONADA: Redacta un prompt contable útil");
    expect(brief).not.toContain("No inventes registros; señala cualquier dato faltante");
  });
});

test("explica si el navegador deniega la copia del briefing de práctica", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("clipboard denied"); } },
    });
  });
  await page.goto("/");
  await page.locator('[data-section="lab"]').first().click();
  await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();
  const card = page.getByTestId("course-video-exercise-prompt");
  await card.getByRole("button", { name: /copiar briefing para notebooklm/i }).click();
  await expect(card.locator("[data-video-brief-status]")).toContainText("No se pudo copiar");
});
