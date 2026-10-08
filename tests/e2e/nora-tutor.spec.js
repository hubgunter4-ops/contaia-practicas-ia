import { test, expect } from "@playwright/test";

async function openFirstExercise(page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /laboratorio práctico/i }).click();
  await page
    .getByRole("button", { name: /redacta un prompt contable útil/i })
    .first()
    .click();
  await expect(page.getByTestId("nora-panel")).toBeVisible();
}

test.describe("Panel de Nora", () => {
  test("presenta una guía específica para cada uno de los diez módulos", async ({ page }) => {
    await page.goto("/");
    const guides = page.locator("[data-testid^='module-nora-']");

    await expect(guides).toHaveCount(10);
    await expect(guides.first()).toContainText("NORA · GUÍA DEL MÓDULO");
    await expect(guides.first()).toContainText("Aprende primero");
    await expect(guides.first()).toContainText("Prompt");
    await expect(guides.first()).toContainText("Ejemplo sencillo");
    await expect(guides.first()).toContainText("Herramientas para practicar");
    await expect(guides.first()).toContainText("NotebookLM");
    await expect(guides.first()).toContainText("Claude");
    await expect(guides.first()).toContainText("datos ficticios");
    await expect(guides.first()).toContainText("Ruta en 3 pasos");
    await expect(guides.first()).toContainText("Pregunta de control");
    await expect(guides.first()).toContainText("Evidencia de salida");
    await expect(guides.first()).toContainText("Contexto que puedes aportar");
    await expect(guides.first()).toContainText("Debe contener");
    await expect(guides.first()).toContainText("No se sube a ContaIA");
  });

  test("ofrece diagnóstico inicial y permite elegir una ruta", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByTestId("onboarding")).toBeVisible();
    await page.getByLabel(/voy empezando/i).check();
    await page.getByTestId("onboarding").getByRole("button", { name: /elegir mi ruta/i }).click();
    await expect(page.getByTestId("onboarding-complete")).toContainText("Voy empezando");
  });

  test("permite consultar un concepto y ver a Nora demostrarlo", async ({ page }) => {
    await page.goto("/");
    const firstGuide = page.locator("[data-testid='module-nora-modulo-01']");
    await firstGuide.getByRole("button", { name: /Prompt/i }).click();
    await expect(firstGuide.locator(".glossary-definition")).toContainText("Prompt");

    await firstGuide.getByRole("button", { name: /Nora demuestra/i }).click();
    await expect(page.getByTestId("module-demo-modulo-01")).toContainText("Antes");
    await expect(page.getByTestId("module-demo-modulo-01")).toContainText("Después");
  });

  test("abre el índice del glosario y muestra definición, ejemplo y comprobación", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("glossary-index").getByRole("button", { name: /glosario contextual/i }).click();
    await expect(page.getByTestId("glossary-index").locator(".glossary-index-entry")).toHaveCount(28);
    await page.getByTestId("glossary-index").getByRole("button", { name: "Prompt" }).click();
    const selected = page.locator(".glossary-index-selected");
    await expect(selected).toContainText("Prompt");
    await expect(selected).toContainText("Ejemplo:");
    await expect(selected).toContainText("Comprueba:");
  });

  test("aparece cerrado y puede abrirse", async ({ page }) => {
    await openFirstExercise(page);

    const toggle = page.getByTestId("nora-toggle");
    const body = page.locator(".tutor-body");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(body).toBeHidden();

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
    await expect(page.getByTestId("nora-log")).toContainText("Empieza con una pregunta breve");
  });

  test("responde una solicitud de pista localmente", async ({ page }) => {
    await openFirstExercise(page);
    await page.getByTestId("nora-toggle").click();

    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");

    await expect(page.getByTestId("nora-log")).toContainText("Incluye contexto");
    await expect(page.getByTestId("nora-log")).toContainText("Dame una pista");
    await expect(page.getByTestId("nora-message")).toHaveCount(2);
  });

  test("no realiza llamadas a proveedores ni a una API de tutor", async ({ page }) => {
    const forbiddenRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/openai\.com|anthropic\.com|\/api\/tutor/i.test(url)) forbiddenRequests.push(url);
    });

    await openFirstExercise(page);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-form").getByRole("button", { name: /enviar/i }).click();

    await expect(page.getByTestId("nora-log")).toContainText("Incluye contexto");
    expect(forbiddenRequests).toEqual([]);
  });

  test("limpia el historial al cambiar de ejercicio", async ({ page }) => {
    await openFirstExercise(page);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Incluye contexto");

    await page.getByRole("button", { name: /siguiente práctica/i }).click();

    await expect(page.getByTestId("nora-panel")).toBeVisible();
    await expect(page.getByTestId("nora-log")).not.toContainText("Incluye contexto");
    await expect(page.getByTestId("nora-log")).toContainText("Empieza con una pregunta breve");
  });

  test("conserva el historial al volver a renderizar el mismo ejercicio", async ({ page }) => {
    await openFirstExercise(page);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Incluye contexto");

    await page.getByRole("button", { name: /comprobar mi respuesta/i }).click();

    await expect(page.getByTestId("nora-log")).toContainText("Incluye contexto");
  });

  test("no persiste el historial del tutor después de recargar", async ({ page }) => {
    await openFirstExercise(page);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Incluye contexto");

    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storageKeys.some((key) => /tutor|nora|chat/i.test(key))).toBe(false);

    await page.reload();
    await page.getByRole("button", { name: /laboratorio práctico/i }).click();
    await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();
    await page.getByTestId("nora-toggle").click();

    await expect(page.getByTestId("nora-log")).not.toContainText("Incluye contexto");
    await expect(page.getByTestId("nora-log")).toContainText("Empieza con una pregunta breve");
  });

  test("mantiene atributos accesibles en el panel", async ({ page }) => {
    await openFirstExercise(page);
    const toggle = page.getByTestId("nora-toggle");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", /tutor-panel-/);

    await toggle.click();
    const log = page.getByTestId("nora-log");
    await expect(log).toHaveAttribute("role", "log");
    await expect(log).toHaveAttribute("aria-live", "polite");
  });

  test("activa la voz solo después de una acción explícita", async ({ page }) => {
    await page.addInitScript(() => {
      const spoken = [];
      class MockUtterance {
        constructor(text) { this.text = text; }
      }
      window.__noraSpeech = spoken;
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: MockUtterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          speaking: false,
          pending: false,
          getVoices: () => [{ lang: "es-MX", name: "Voz de prueba" }],
          speak: (utterance) => spoken.push(utterance.text),
          cancel: () => {},
        },
      });
    });

    await openFirstExercise(page);
    const voiceButton = page.getByTestId("nora-voice");
    await expect(voiceButton).toHaveAttribute("aria-pressed", "false");

    await voiceButton.click();
    await expect(page.getByTestId("nora-voice")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");

    await expect.poll(() => page.evaluate(() => window.__noraSpeech)).toContainEqual(
      expect.stringContaining("Incluye contexto")
    );
  });
});
