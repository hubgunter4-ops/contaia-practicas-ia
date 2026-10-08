import { test, expect } from "@playwright/test";

async function configureClipboard(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedCourseVideoBrief = text; } },
    });
  });
}

test.describe("videos de sesión NotebookLM → Synthesia", () => {
  test("presenta la integración del módulo y copia un briefing sin exponer respuestas", async ({ page }) => {
    await configureClipboard(page);
    await page.goto("/");
    const card = page.getByTestId("course-video-module-modulo-01");

    await expect(card).toContainText("Video en preparación");
    await expect(card).toContainText("NOTEBOOKLM → SYNTHESIA");
    await expect(card.getByRole("link", { name: /abrir notebooklm/i })).toHaveAttribute("target", "_blank");
    await expect(card.locator("iframe")).toHaveCount(0);

    await card.getByRole("button", { name: /copiar briefing para notebooklm/i }).click();
    await expect(card.locator("[data-video-brief-status]")).toContainText("Briefing copiado");
    const brief = await page.evaluate(() => window.__copiedCourseVideoBrief);
    expect(brief).toContain("Qué es la IA y qué es un prompt");
    expect(brief).toContain("SYNTHESIA");
    expect(brief).not.toContain("Actúa como auxiliar contable. En el contexto de una microempresa ficticia");
  });

  test("cada práctica ofrece su brief contextual y no inserta un video no aprobado", async ({ page }) => {
    await configureClipboard(page);
    await page.goto("/");
    await page.getByRole("button", { name: /laboratorio práctico/i }).click();
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

test("explica si el navegador deniega la copia del briefing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("clipboard denied"); } },
    });
  });
  await page.goto("/");
  const card = page.getByTestId("course-video-module-modulo-01");
  await card.getByRole("button", { name: /copiar briefing para notebooklm/i }).click();
  await expect(card.locator("[data-video-brief-status]")).toContainText("No se pudo copiar");
});
