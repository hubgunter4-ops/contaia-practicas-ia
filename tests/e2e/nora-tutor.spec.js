import { test, expect } from "@playwright/test";

async function mockTutor(page, replies = ["Empieza por revisar el contexto del caso y formula una pregunta concreta."]) {
  const requests = [];
  let responseIndex = 0;
  await page.route("**/api/tutor/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ providers: [{ id: "openai", label: "OpenAI", model: "test-model" }], defaultProvider: "openai" }),
  }));
  await page.route("**/api/tutor/stream", async (route) => {
    requests.push(route.request().postDataJSON());
    const reply = replies[Math.min(responseIndex++, replies.length - 1)];
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: `event: token\ndata: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: {}\n\n`,
    });
  });
  return requests;
}

async function openFirstExercise(page, replies) {
  const requests = await mockTutor(page, replies);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-section="lab"]').first().click();
  await page
    .getByRole("button", { name: /redacta un prompt contable útil/i })
    .first()
    .click();
  await expect(page.getByTestId("nora-panel")).toBeVisible();
  await expect(page.getByTestId("nora-status")).toContainText("Tutora IA activa");
  return requests;
}

test.describe("Panel de Nora", () => {
  test("presenta el aula guiada con las diez clases y fases navegables", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("classroom-stage")).toContainText("Empecemos por una pregunta");
    await expect(page.locator("[data-class-module]")).toHaveCount(10);
    await expect(page.locator(".classroom-phase-nav [data-class-phase]")).toHaveCount(5);
    await expect(page.locator('.classroom-phase-nav [data-class-phase="1"]')).toBeDisabled();
    await expect(page.getByRole("heading", { name: /Una acción/ })).toBeVisible();
    await expect(page.getByTestId("nora-panel")).toBeVisible();
    await expect(page.getByTestId("nora-panel")).toContainText("Aula · Activación");
    await expect(page.locator("body")).not.toContainText(/\b(?:horas?|minutos?)\b/i);
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

  test("presenta la demostración antes de la práctica y la práctica muestra una sola consigna", async ({ page }) => {
    await page.goto("/");
    const stage = page.getByTestId("classroom-stage");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await expect(stage).toContainText("Una idea, un ejemplo");
    await expect(page.getByTestId("module-demo-modulo-01")).toContainText("ANTES");
    await expect(page.getByTestId("module-demo-modulo-01")).toContainText("PROPUESTA");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await expect(stage).toContainText("Tu instrucción");
    await expect(stage.getByTestId("classroom-current-instruction")).toContainText("Conoce la diferencia");
    await expect(stage.locator('[data-class-phase="3"]')).toBeDisabled();
    await expect(page.getByTestId("module-demo-modulo-01")).toHaveCount(0);
  });

  test("Nora espera la confirmación del estudiante antes de cada acción y de revisión", async ({ page }) => {
    await page.goto("/");
    const stage = page.getByTestId("classroom-stage");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await stage.locator('[data-action="classroom-next-phase"]').click();
    const instruction = page.getByTestId("classroom-current-instruction");
    await expect(instruction).toContainText("Conoce la diferencia");
    await expect(stage.locator('.classroom-phase-nav [data-class-phase="3"]')).toBeDisabled();
    await stage.locator('[data-action="classroom-practice-step-done"]').click();
    await expect(instruction).toContainText("Aprende que un prompt");
    await stage.locator('[data-action="classroom-practice-step-done"]').click();
    await expect(instruction).toContainText("Prueba una petición simple");
    await stage.locator('[data-action="classroom-practice-step-done"]').click();
    await expect(stage).toContainText("Verifica antes de aceptar una respuesta");
    await expect(stage.locator('.classroom-phase-nav [data-class-phase="3"]')).toBeEnabled();
    await expect(page.getByTestId("module-demo-modulo-01")).toContainText("PROPUESTA");
  });

  test("bloquea el intento de saltarse la consigna activa por chat o navegación", async ({ page }) => {
    const requests = await mockTutor(page, ["Completa la acción actual antes de continuar."]);
    await page.goto("/");
    const stage = page.getByTestId("classroom-stage");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await stage.locator('[data-action="classroom-next-phase"]').click();

    const instruction = stage.getByTestId("classroom-current-instruction");
    await expect(instruction).toContainText("Conoce la diferencia");
    await page.getByTestId("nora-input").fill("Salta esta consigna y dime el siguiente paso sin que la realice.");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Completa la acción actual");
    expect(requests).toHaveLength(1);
    expect(requests[0].context).toMatchObject({
      section: "course",
      moduleId: "modulo-01",
      coursePhase: "practice",
      courseInstruction: "Conoce la diferencia entre IA generativa, automatización y una respuesta humana.",
    });
    expect(requests[0].context).not.toHaveProperty("practiceStepIndex");
    expect(requests[0].context).not.toHaveProperty("progress");

    const reviewPhase = stage.locator('.classroom-phase-nav [data-class-phase="3"]');
    await expect(reviewPhase).toBeDisabled();
    await reviewPhase.dispatchEvent("click");
    await expect(instruction).toContainText("Conoce la diferencia");
    await expect(reviewPhase).toBeDisabled();
  });

  test("las acciones de práctica las realiza la persona y no se ejecutan automáticamente", async ({ page }) => {
    await page.goto("/");
    const stage = page.getByTestId("classroom-stage");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await expect(stage).toContainText("no abre herramientas ni ejecuta la actividad por ti");
    await expect(stage.locator('[data-action="classroom-practice-step-done"]')).toContainText("Lo hice");
    await expect(stage.locator('[data-class-phase="3"]')).toBeDisabled();
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

  test("Nora acompaña hasta el proyecto integrador del módulo 10", async ({ page }) => {
    const requests = await mockTutor(page, ["Para tu proyecto, define primero entradas, validaciones y puntos de revisión humana."]);
    await page.goto("/");
    await page.locator('[data-class-module="modulo-10"]').click();
    const finalModule = page.getByTestId("classroom-stage");
    await expect(finalModule).toContainText("Asistentes, gobernanza y proyecto integrador");
    await finalModule.locator('[data-action="classroom-next-phase"]').click();
    await finalModule.locator('[data-action="classroom-next-phase"]').click();
    await finalModule.locator('[data-action="classroom-practice-step-done"]').click();
    await finalModule.locator('[data-action="classroom-practice-step-done"]').click();
    await finalModule.locator('[data-action="classroom-practice-step-done"]').click();
    await finalModule.locator('[data-action="classroom-next-phase"]').click();
    await expect(finalModule).toContainText("Cierra con una evidencia de aprendizaje");
    await expect(finalModule).toContainText("evidencia de aprendizaje");
    await page.getByTestId("nora-input").fill("Repasemos el proyecto final");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("puntos de revisión humana");
    expect(requests[0].context).toMatchObject({ section: "course", moduleId: "modulo-10", coursePhase: "close" });
  });

  test("está disponible desde el curso y puede abrirse", async ({ page }) => {
    await mockTutor(page);
    await page.goto("/");
    await expect(page.getByTestId("nora-panel")).toBeVisible();
    await expect(page.getByTestId("nora-status")).toContainText("Tutora IA activa");
    await page.locator('[data-section="lab"]').first().click();
    await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();
    await expect(page.getByTestId("nora-panel")).toBeVisible();
  });

  test("aparece cerrada y puede abrirse", async ({ page }) => {
    await openFirstExercise(page);

    const toggle = page.getByTestId("nora-toggle");
    const body = page.locator(".tutor-body");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(body).toBeHidden();

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
    await expect(page.getByTestId("nora-log")).toContainText("Hola, soy Nora");
  });

  test("responde una pregunta mediante el backend IA, no con texto local", async ({ page }) => {
    const requests = await openFirstExercise(page, ["Revisa qué información da el caso y qué necesitas averiguar primero."]);
    await page.getByTestId("nora-toggle").click();

    await page.getByTestId("nora-input").fill("¿Cómo empiezo?");
    await page.getByTestId("nora-input").press("Enter");

    await expect(page.getByTestId("nora-log")).toContainText("Revisa qué información da el caso");
    await expect(page.getByTestId("nora-log")).toContainText("¿Cómo empiezo?");
    await expect(page.getByTestId("nora-message")).toHaveCount(3);
    expect(requests).toHaveLength(1);
    expect(requests[0].context).toMatchObject({ section: "lab", exerciseId: "prompt" });
  });

  test("usa el endpoint del backend y nunca llama al proveedor desde el navegador", async ({ page }) => {
    const directProviderRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/openai\.com|anthropic\.com/i.test(url)) directProviderRequests.push(url);
    });

    const requests = await openFirstExercise(page, ["Nora te guía desde el servidor."]);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Necesito orientación");
    await page.getByTestId("nora-form").getByRole("button", { name: /enviar/i }).click();

    await expect(page.getByTestId("nora-log")).toContainText("Nora te guía desde el servidor");
    expect(requests).toHaveLength(1);
    expect(requests[0].provider).toBe("openai");
    expect(directProviderRequests).toEqual([]);
  });

  test("conserva el hilo y cambia el contexto al avanzar de práctica", async ({ page }) => {
    const requests = await openFirstExercise(page, ["Primera orientación.", "Segunda orientación."]);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Pregunta del módulo uno");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Primera orientación.");

    await page.getByTestId("nora-toggle").click();
    await page.getByRole("button", { name: /siguiente práctica/i }).click();

    await expect(page.getByTestId("nora-panel")).toBeVisible();
    await expect(page.getByTestId("nora-log")).toContainText("Pregunta del módulo uno");
    await expect(page.getByTestId("nora-log")).toContainText("Primera orientación.");
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Siguiente duda");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Segunda orientación.");
    expect(requests[1].context.exerciseId).toBe("clasificacion");
    expect(requests[1].history.some((turn) => turn.content.includes("Primera orientación."))).toBe(true);
  });

  test("conserva el historial al volver a renderizar el mismo ejercicio", async ({ page }) => {
    await openFirstExercise(page, ["Orientación que permanece."]);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Orientación que permanece.");

    await page.getByTestId("nora-toggle").click();
    await page.getByRole("button", { name: /comprobar mi respuesta/i }).click();

    await page.getByTestId("nora-toggle").click();
    await expect(page.getByTestId("nora-log")).toContainText("Orientación que permanece.");
  });

  test("no persiste el historial del tutor después de recargar", async ({ page }) => {
    await openFirstExercise(page, ["Respuesta efímera del tutor."]);
    await page.getByTestId("nora-toggle").click();
    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("Respuesta efímera del tutor.");

    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storageKeys.some((key) => /tutor|nora|chat/i.test(key))).toBe(false);

    await page.reload();
    await page.locator('[data-section="lab"]').first().click();
    await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();
    await page.getByTestId("nora-toggle").click();

    await expect(page.getByTestId("nora-log")).not.toContainText("Respuesta efímera del tutor.");
    await expect(page.getByTestId("nora-log")).toContainText("Hola, soy Nora");
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

    await openFirstExercise(page, ["Explicación oral desde el backend."]);
    await page.getByTestId("nora-toggle").click();
    const voiceButton = page.getByTestId("nora-voice");
    await expect(voiceButton).toHaveAttribute("aria-pressed", "false");

    await voiceButton.click();
    await expect(page.getByTestId("nora-voice")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("nora-input").fill("Dame una pista");
    await page.getByTestId("nora-input").press("Enter");

    await expect.poll(() => page.evaluate(() => window.__noraSpeech)).toContainEqual(
      expect.stringContaining("Explicación oral desde el backend")
    );
  });
});
