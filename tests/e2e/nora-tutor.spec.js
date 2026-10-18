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

async function openToolSection(page, section) {
  const menu = page.locator(".tools-menu");
  if (!(await menu.evaluate((node) => node.open))) await menu.locator("summary").click();
  await menu.locator(`[data-section="${section}"]`).click();
}

async function toggleAdvisorPanel(page) {
  const menu = page.locator(".tools-menu");
  if (!(await menu.evaluate((node) => node.open))) await menu.locator("summary").click();
  await menu.locator(".advisor-tab").click();
}

async function openFirstExercise(page, replies) {
  const requests = await mockTutor(page, replies);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await openToolSection(page, "lab");
  await page
    .getByRole("button", { name: /redacta un prompt contable útil/i })
    .first()
    .click();
  await expect(page.getByTestId("nora-panel")).toBeVisible();
  return requests;
}

function makePdfWithText(text) {
  const literal = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 14 Tf 72 720 Td (${literal}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

test.describe("Panel de Nora", () => {
  test("presenta el aula guiada con las diez clases y fases navegables", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("classroom-stage")).toContainText("Empecemos por una pregunta");
    await expect(page.locator("[data-class-module]")).toHaveCount(10);
    await page.locator(".class-menu > summary").click();
    await expect(page.locator(".class-menu-item")).toHaveCount(10);
    await expect(page.locator('[data-class-module="modulo-10"]')).toContainText("proyecto integrador");
    await expect(page.locator('[data-class-module="modulo-10"]')).toBeVisible();
    await page.locator(".class-menu > summary").click();
    await expect(page.locator(".classroom-phase-nav [data-class-phase]")).toHaveCount(5);
    await expect(page.locator(".classroom-rail")).toHaveCount(0);
    await expect(page.locator(".class-menu")).toBeVisible();
    await expect(page.locator('.classroom-phase-nav [data-class-phase="1"]')).toBeDisabled();
    await expect(page.getByRole("heading", { name: /Una acción/ })).toBeVisible();
    await expect(page.getByTestId("nora-panel")).toBeVisible();
    await expect(page.locator(".tutor-body")).toBeHidden();
    await expect(page.getByTestId("nora-toggle")).toHaveText("Asesoría");
    await expect(page.getByTestId("nora-toggle")).toHaveCSS("white-space", "nowrap");
    await expect(page.locator(".advisor-tab")).toHaveAttribute("aria-expanded", "false");
    await toggleAdvisorPanel(page);
    await expect(page.getByTestId("nora-panel")).toContainText("Aula · Activación");
    await toggleAdvisorPanel(page);
    await expect(page.locator("body")).not.toContainText(/\b(?:horas?|minutos?)\b/i);
  });

  test("prioriza la ruta de clase actual y agrupa las herramientas secundarias", async ({ page }) => {
    await page.goto("/");
    const route = page.getByTestId("classroom-primary-route");
    await expect(route).toContainText("RUTA ACTUAL · CLASE 01 DE 10 · ACTIVACIÓN");
    await expect(route).toContainText("Qué es la IA y qué es un prompt");
    await expect(page.getByTestId("classroom-persistence-status")).toContainText("Las clases confirmadas se guardan en este dispositivo");
    const startLink = route.getByRole("link", { name: /Continuar clase/ });
    await expect(startLink).toBeVisible();
    await startLink.click();
    await expect(page.locator('[data-class-module="modulo-01"] .class-menu-status')).toHaveText("En curso");
    await expect(page.locator('[data-class-module="modulo-01"] .class-menu-action')).toHaveText("Continuar clase");
    await expect(page.locator('[data-class-module="modulo-02"] .class-menu-status')).toHaveText("Siguiente");
    await expect(page.locator('[data-class-module="modulo-03"] .class-menu-status')).toHaveText("Por empezar");
    await expect(page.locator(".class-menu-popover > p")).toContainText("clase actual 01");
    await expect(page).toHaveURL(/#classroom-stage$/);
    await expect(page.locator("#classroom-stage")).toBeInViewport();

    const toolsMenu = page.locator(".tools-menu");
    await toolsMenu.locator("summary").click();
    await expect(toolsMenu.locator("[data-section]")).toHaveCount(5);
    await expect(toolsMenu.locator('[data-section="advisor"]')).toBeVisible();
    await expect(toolsMenu.locator('[data-section="cfdi"]')).toBeVisible();
    await expect(toolsMenu.locator('[data-section="lab"]')).toBeVisible();
    await expect(toolsMenu.locator('[data-section="study"]')).toBeVisible();

    await page.evaluate(() => localStorage.setItem("contaia.progress.v1", JSON.stringify({ completedModules: ["modulo-01"], completedExercises: [] })));
    await page.reload();
    await expect(route).toContainText("CLASE 02 DE 10 · ACTIVACIÓN");
    await expect(route.getByRole("link")).toHaveText(/Continuar clase/);
    await page.locator(".class-menu > summary").click();
    await expect(page.locator('[data-class-module="modulo-01"] .class-menu-status')).toHaveText("Completada");
    await expect(page.locator('[data-class-module="modulo-02"] .class-menu-status')).toHaveText("En curso");
    await expect(page.locator('[data-class-module="modulo-03"] .class-menu-status')).toHaveText("Siguiente");
    await expect(page.locator(".class-menu-popover > p")).toContainText("clase actual 02");
    await page.locator(".class-menu > summary").click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".tools-menu > summary").click();
    const menuBounds = await page.locator(".tools-menu-popover").boundingBox();
    expect(menuBounds).not.toBeNull();
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(390);
  });

  test("Continuar conserva la fase de sesión y abrir otra clase mantiene las fases bloqueadas", async ({ page }) => {
    await page.goto("/");
    const stage = page.getByTestId("classroom-stage");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 2 de 5: Concepto");

    await page.locator(".class-menu > summary").click();
    await expect(page.locator('[data-class-module="modulo-01"] .class-menu-action')).toHaveText("Continuar clase");
    await page.locator('[data-class-module="modulo-01"]').click();
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 2 de 5: Concepto");

    await page.locator(".class-menu > summary").click();
    await page.locator('[data-class-module="modulo-02"]').click();
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 1 de 5: Activación");
    await expect(page.locator('.classroom-phase-nav [data-class-phase="1"]')).toBeDisabled();
  });

  test("solo la confirmación en Cierre actualiza la ruta y al recargar reanuda la primera clase incompleta", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const stage = page.getByTestId("classroom-stage");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await stage.locator('[data-action="classroom-next-phase"]').click();
    for (let index = 0; index < 3; index += 1) {
      await stage.locator('[data-action="classroom-practice-step-done"]').click();
    }
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 4 de 5: Revisión");
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 5 de 5: Cierre");
    await expect(page.locator(".classroom-course-progress")).toContainText("0");
    await stage.locator('[data-action="classroom-complete"]').click();

    await expect(page.locator(".classroom-course-progress")).toContainText("1");
    await page.locator(".class-menu > summary").click();
    await expect(page.locator('[data-class-module="modulo-01"] .class-menu-status')).toHaveText("Completada");
    await expect(page.locator('[data-class-module="modulo-01"] .class-menu-action')).toHaveText("Revisar clase");
    await expect(page.locator('[data-class-module="modulo-02"] .class-menu-status')).toHaveText("Siguiente");

    await page.reload();
    await expect(page.getByTestId("classroom-primary-route")).toContainText("CLASE 02 DE 10");
    await expect(page.locator('.classroom-phase-nav [data-class-phase="1"]')).toBeDisabled();
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
    const primaryAction = stage.locator(".classroom-phase-controls");
    await expect(primaryAction).toBeVisible();
    expect(await primaryAction.evaluate((node) => node.previousElementSibling?.classList.contains("classroom-scene"))).toBe(true);
    expect(await primaryAction.evaluate((node) => node.nextElementSibling?.classList.contains("classroom-stage-controls"))).toBe(true);
    await expect(page.locator(".classroom-course-progress")).toContainText("CLASES COMPLETADAS");
    await expect(page.locator(".classroom-progress-explainer")).toContainText("Solo cuenta una clase cuando la confirmas en Cierre");
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 1 de 5: Activación");
    await expect(stage.locator('.classroom-phase-nav [data-class-phase="1"]')).toHaveAttribute("aria-label", /Pendiente/);
    await stage.locator('[data-action="classroom-next-phase"]').click();
    await expect(stage).toContainText("Una idea, un ejemplo");
    await expect(page.locator(".classroom-phase-explainer")).toContainText("Fase 2 de 5: Concepto");
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
    await expect(stage.locator(".classroom-action-done")).toContainText("Terminé la práctica · ir a Revisión");
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
    await toggleAdvisorPanel(page);
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
    await expect(stage.locator('[data-action="classroom-practice-step-done"]')).toContainText("Terminé esta acción · siguiente instrucción");
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
    await page.locator(".class-menu > summary").click();
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
    await toggleAdvisorPanel(page);
    await page.getByTestId("nora-input").fill("Repasemos el proyecto final");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("puntos de revisión humana");
    expect(requests[0].context).toMatchObject({ section: "course", moduleId: "modulo-10", coursePhase: "close" });
  });

  test("el selector superior lleva a una clase desde cualquier sección", async ({ page }) => {
    await page.goto("/");
    await openToolSection(page, "lab");
    await page.locator(".class-menu > summary").click();
    await page.locator('[data-class-module="modulo-02"]').click();
    await expect(page.getByTestId("classroom-stage")).toContainText("Diseño de instrucciones contables");
    await expect(page.locator(".main-shell-live")).toBeVisible();
  });

  test("abre Asesoría desde la acción contextual de una práctica", async ({ page }) => {
    await mockTutor(page);
    await page.goto("/");
    await openToolSection(page, "lab");
    await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();
    await page.locator(".advisor-practice-button").click();
    await expect(page.getByTestId("nora-panel")).toContainText("Práctica activa");
    await expect(page.getByTestId("nora-input")).toBeVisible();
  });

  test("lee TXT localmente y solo envía el texto con la pregunta escrita", async ({ page }) => {
    const requests = await mockTutor(page, ["El documento describe un caso ficticio con un total de 100."]);
    await page.goto("/");
    await toggleAdvisorPanel(page);
    await page.locator("[data-tutor-document]").setInputFiles({
      name: "caso-ficticio.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Caso ficticio: total 100; sin datos personales.", "utf8"),
    });
    await expect(page.locator(".tutor-document-ready")).toContainText("caso-ficticio.txt");
    expect(requests).toHaveLength(0);
    await page.getByTestId("nora-input").fill("Resume este documento.");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("total de 100");
    expect(requests).toHaveLength(1);
    expect(requests[0].documentText).toContain("Caso ficticio: total 100");
    expect(requests[0]).not.toHaveProperty("documentName");
    expect(requests[0].context).not.toHaveProperty("progress");
  });

  test("extrae PDF en el navegador y transmite solo texto al preguntar", async ({ page }) => {
    const requests = await mockTutor(page, ["El PDF muestra el texto de prueba."]);
    await page.goto("/");
    await toggleAdvisorPanel(page);
    await page.locator("[data-tutor-document]").setInputFiles({
      name: "ejemplo.pdf",
      mimeType: "application/pdf",
      buffer: makePdfWithText("Caso simulado: total 100"),
    });
    await expect(page.locator(".tutor-document-ready")).toContainText("ejemplo.pdf");
    expect(requests).toHaveLength(0);
    await page.getByTestId("nora-input").fill("¿Qué importe aparece en el ejemplo?");
    await page.getByTestId("nora-input").press("Enter");
    await expect(page.getByTestId("nora-log")).toContainText("texto de prueba");
    expect(requests[0].documentText).toContain("Caso simulado: total 100");
    expect(requests[0]).not.toHaveProperty("documentName");
  });

  test("el panel flotante se puede ampliar y su cuerpo permanece visible", async ({ page }) => {
    await page.goto("/");
    await toggleAdvisorPanel(page);
    const panel = page.getByTestId("nora-panel");
    const before = await panel.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
    await page.locator('[data-action="tutor-resize"][data-size="larger"]').click();
    const after = await page.getByTestId("nora-panel").evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
    expect(after.width > before.width || after.height > before.height).toBe(true);
    await expect(page.locator(".tutor-body")).toBeVisible();
  });

  test("está disponible desde el curso y puede abrirse", async ({ page }) => {
    await mockTutor(page);
    await page.goto("/");
    await expect(page.getByTestId("nora-panel")).toBeVisible();
    await page.getByTestId("nora-toggle").click();
    await expect(page.getByTestId("nora-status")).toContainText("Tutora IA activa");
    await openToolSection(page, "lab");
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
    await openToolSection(page, "lab");
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


async function mockCfdiConfig(page, config = { enabled: false }) {
  await page.route("**/api/cfdi/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) }));
}

const facturaXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-09-01T10:00:00" Serie="A" Folio="7" TipoDeComprobante="I" SubTotal="1000" Moneda="MXN" Total="1160">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR FICTICIO"/><cfdi:Receptor Rfc="BBB010101BBB" Nombre="RECEPTOR FICTICIO"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio de prueba" ValorUnitario="1000" Importe="1000"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160"><cfdi:Traslados><cfdi:Traslado Base="1000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555"/></cfdi:Complemento>
</cfdi:Comprobante>`;
const pagoXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Fecha="2026-09-02T10:00:00" TipoDeComprobante="P" SubTotal="0" Moneda="XXX" Total="0">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR FICTICIO"/><cfdi:Receptor Rfc="BBB010101BBB" Nombre="RECEPTOR FICTICIO"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="66666666-7777-8888-9999-000000000000"/><pago20:Pagos Version="2.0"><pago20:Pago FechaPago="2026-09-02T00:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="580"><pago20:DoctoRelacionado IdDocumento="11111111-2222-3333-4444-555555555555" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="1160" ImpPagado="580" ImpSaldoInsoluto="580" ObjetoImpDR="02"><pago20:ImpuestosDR><pago20:TrasladosDR><pago20:TrasladoDR BaseDR="500" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="80"/></pago20:TrasladosDR></pago20:ImpuestosDR></pago20:DoctoRelacionado></pago20:Pago></pago20:Pagos></cfdi:Complemento>
</cfdi:Comprobante>`;

test.describe("Asistente abierto de Nora", () => {
  test("abre como una vista separada, muestra Anam y envía un contexto sin currículo", async ({ page }) => {
    const requests = await mockTutor(page, ["Para una conciliación real, separa las partidas del banco y del libro, identifica las diferencias temporales y documenta cada ajuste con su soporte."]);
    await page.goto("/");
    await openToolSection(page, "advisor");

    await expect(page.getByRole("heading", { name: /resuelve tu duda con nora/i })).toBeVisible();
    await expect(page.getByTestId("open-assistant-log")).toContainText("mi base es México");
    await expect(page.locator("[data-open-anam-panel]")).toBeVisible();
    await expect(page.locator("[data-anam-placeholder]")).toBeVisible();
    await expect(page.locator("[data-anam-video]")).toBeHidden();
    await expect(page.getByTestId("open-anam-toggle")).toHaveText(/Conectar avatar Anam/);
    await expect(page.locator(".open-sources summary")).toHaveText("Fuentes oficiales de México");
    await expect(page.locator(".advisor-tab")).toHaveCount(0);

    await page.getByTestId("open-assistant-input").fill("¿Cómo organizo la conciliación de este mes?");
    await page.locator("[data-open-form] button[type=submit]").click();
    await expect(page.getByTestId("open-assistant-log")).toContainText("separa las partidas del banco y del libro");
    expect(requests).toHaveLength(1);
    expect(requests[0].context).toEqual({ section: "advisor" });
    expect(requests[0].message).toBe("¿Cómo organizo la conciliación de este mes?");
    expect(JSON.stringify(requests[0])).not.toMatch(/moduleId|coursePhase|courseInstruction|progress|privateNotes/);
  });

  test("lee el documento localmente y solo envía el texto al preguntar", async ({ page }) => {
    const requests = await mockTutor(page, ["La diferencia es de 50: el banco reporta 2500 y los libros 2450. Revisa partidas en tránsito y cargos no registrados."]);
    await page.goto("/");
    await openToolSection(page, "advisor");
    await expect(page.getByTestId("open-assistant-input")).toBeEnabled();

    await page.locator("[data-open-document]").setInputFiles({
      name: "balance-anonimizado.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Banco: 2500\nLibros: 2450\nDiferencia: 50"),
    });
    await expect(page.locator("[data-open-document-summary]")).toContainText("balance-anonimizado.txt");
    expect(requests).toHaveLength(0);

    await page.getByTestId("open-assistant-input").fill("Calcula la diferencia y sugiere qué revisar.");
    await page.locator("[data-open-form] button[type=submit]").click();
    await expect(page.getByTestId("open-assistant-log")).toContainText("La diferencia es de 50");
    expect(requests).toHaveLength(1);
    expect(requests[0].context).toEqual({ section: "advisor" });
    expect(requests[0].documentText).toContain("Banco: 2500");
    expect(requests[0].documentText).toContain("Libros: 2450");
    expect(JSON.stringify(requests[0])).not.toContain("balance-anonimizado.txt");
  });

  test("redirige una solicitud de análisis XML al módulo CFDI sin enviar el mensaje al modelo", async ({ page }) => {
    const requests = await mockTutor(page);
    await mockCfdiConfig(page);
    await page.goto("/");
    await openToolSection(page, "advisor");
    await page.getByTestId("open-assistant-input").fill("Analiza mis XML CFDI y concilia los complementos de pago.");
    await page.locator("[data-open-form] button[type=submit]").click();
    await expect(page.locator("[data-cfdi-page]")).toBeVisible();
    await expect(page.locator(".cfdi-origin-request")).toContainText("Analiza mis XML CFDI");
    expect(requests).toHaveLength(0);
  });

  test("lee XML localmente, relaciona pago y factura y comparte con Nora solo un resumen sin identificadores al enviar", async ({ page }) => {
    const requests = await mockTutor(page, ["El pago coincide con el saldo anterior: 1160 menos 580 deja 580 pendientes."]);
    await mockCfdiConfig(page);
    await page.goto("/");
    await openToolSection(page, "cfdi");
    await page.locator("[data-cfdi-files]").setInputFiles([
      { name: "factura-privada.xml", mimeType: "application/xml", buffer: Buffer.from(facturaXml) },
      { name: "pago-privado.xml", mimeType: "application/xml", buffer: Buffer.from(pagoXml) },
    ]);
    await expect(page.locator(".cfdi-metrics")).toContainText("Facturas");
    await expect(page.locator(".cfdi-metrics article").nth(0)).toContainText("1");
    await expect(page.locator(".cfdi-metrics article").nth(1)).toContainText("1 / 1");
    await page.locator('[data-cfdi-tab="payments"]').click();
    await expect(page.locator(".cfdi-table")).toContainText("Factura encontrada");
    expect(requests).toHaveLength(0);

    await page.locator("[data-cfdi-ask-nora]").click();
    await expect(page.locator("[data-open-assistant]")).toBeVisible();
    await expect(page.locator(".open-cfdi-context")).toContainText("AÚN NO ENVIADO");
    expect(requests).toHaveLength(0);
    await page.getByTestId("open-assistant-input").fill("Explica el saldo y qué revisaría después.");
    await page.locator("[data-open-form] button[type=submit]").click();
    await expect(page.getByTestId("open-assistant-log")).toContainText("1160 menos 580");
    expect(requests).toHaveLength(1);
    expect(requests[0].cfdiContext).toMatchObject({
      schemaVersion: "cfdi-summary-v1", status: "analyzed",
      counts: { invoices: 1, payments: 1, matchedPayments: 1 },
      totalsByCurrency: [{ currency: "MXN", invoiced: 1160, paid: 580, remaining: 580 }],
    });
    const serialized = JSON.stringify(requests[0]);
    for (const privateValue of [facturaXml, pagoXml, "factura-privada.xml", "pago-privado.xml", "11111111-2222-3333-4444-555555555555", "AAA010101AAA", "BBB010101BBB"]) expect(serialized).not.toContain(privateValue);
  });

  test("guía una práctica abierta sin puntuarla ni completarla hasta confirmación manual", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await openToolSection(page, "lab");
    await page.getByRole("button", { name: /redacta un prompt contable útil/i }).first().click();

    await page.getByRole("button", { name: /comprobar mi respuesta/i }).click();
    await expect(page.locator(".feedback-box")).toContainText("Estado: Intento incompleto");
    await expect(page.locator("[data-action=mark-reviewed]")).toHaveCount(0);

    await page.locator("[data-answer=prompt]").fill("ok");
    await page.getByRole("button", { name: /comprobar mi respuesta/i }).click();
    await expect(page.locator(".feedback-box")).toContainText("demasiado breve");
    await expect(page.locator("[data-action=mark-reviewed]")).toHaveCount(0);

    const draft = "Contexto: empresa ficticia. Compara movimientos. Devuelve una tabla con datos proporcionados; verifica, no inventes y señala lo que falta.";
    await page.locator("[data-answer=prompt]").fill(draft);
    await page.getByRole("button", { name: /comprobar mi respuesta/i }).click();
    await expect(page.locator(".feedback-box")).toContainText("Estado: Para revisar");
    await expect(page.locator(".feedback-box")).toContainText("Puntos fuertes");
    await expect(page.locator(".feedback-box")).toContainText("Siguiente paso");
    await expect(page.locator(".feedback-box")).toContainText("no determina si una respuesta abierta es correcta");
    await expect(page.locator(".feedback-box")).not.toContainText(/\d+\s*\/\s*\d+/);
    await expect(page.locator("[data-action=mark-reviewed]")).toBeVisible();
    await expect(page.locator(".exercise-footer")).not.toContainText("Práctica completada");

    await page.getByRole("button", { name: /pedir una pista/i }).click();
    await expect(page.locator(".hint-box")).toContainText("Pista:");
    await page.getByRole("button", { name: /ver ejemplo y comparar/i }).click();
    await expect(page.locator(".comparison-panel")).toBeVisible();
    expect(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem("contaia.progress.v1")))).toLowerCase()).not.toContain("contexto: empresa ficticia");

    await page.getByRole("button", { name: /terminé de revisar esta práctica/i }).click();
    await expect(page.locator(".exercise-footer")).toContainText("Práctica completada en esta sesión");
    const savedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem("contaia.progress.v1")));
    expect(savedProgress.completedExercises).toContain("prompt");
    expect(JSON.stringify(savedProgress)).not.toContain(draft);
  });
});
