import { test, expect } from "@playwright/test";

test.describe("Experiencia pública de ContaIA", () => {
  test("la portada presenta las tres rutas públicas y no monta el aula antigua", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/ContaIA/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/IA práctica para\s+tu trabajo contable\./);
    await expect(page.locator(".public-header .public-nav")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Explorar herramientas CFDI/ })).toHaveAttribute("href", "/descripcion/cfdi");
    await expect(page.getByRole("link", { name: /Explorar el Asistente abierto/ })).toHaveAttribute("href", "/descripcion/asistente");
    await expect(page.getByRole("link", { name: /Explorar el curso/ })).toHaveAttribute("href", "/descripcion/curso");
    await expect(page.locator(".public-card")).toHaveCount(3);
    await expect(page.locator("[data-testid=classroom-stage], .classroom-content, .classroom-scene")).toHaveCount(0);
  });

  test("las preguntas frecuentes describen el alcance actual de CFDI, Anam y el curso", async ({ page }) => {
    await page.goto("/");

    const cfdiFaq = page.locator(".public-faq-item").filter({ hasText: "¿Qué se puede realizar con CFDI?" });
    await cfdiFaq.locator("summary").click();
    await expect(cfdiFaq).toContainText("El procesamiento del XML ocurre localmente en tu navegador");
    await expect(cfdiFaq).toContainText("No es una validación ante el SAT");

    const anamFaq = page.locator(".public-faq-item").filter({ hasText: "¿Cómo se integra Anam en el aprendizaje?" });
    await anamFaq.locator("summary").click();
    await expect(anamFaq).toContainText("acompañamiento opcional con voz y video");
    await expect(anamFaq).toContainText("solo cuando tú lo decides");

    const courseFaq = page.locator(".public-faq-item").filter({ hasText: "¿Cómo puedo aprender?" });
    await courseFaq.locator("summary").click();
    await expect(courseFaq).toContainText("diez módulos semanales y 40 horas");
  });

  test("las fichas públicas muestran información y CTA correspondiente a cada ruta", async ({ page }) => {
    const features = [
      { path: "/descripcion/cfdi", heading: "Analiza tus comprobantes. Con criterio y control.", cta: "Crear cuenta y explorar CFDI", destination: "cfdi" },
      { path: "/descripcion/asistente", heading: "Conversa con Nora sobre tus dudas contables.", cta: "Crear cuenta y explorar el asistente", destination: "asistente" },
      { path: "/descripcion/curso", heading: "Aprende IA aplicada a la práctica contable.", cta: "Crear cuenta y empezar el curso", destination: "curso" },
    ];

    for (const feature of features) {
      await page.goto(feature.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(feature.heading);
      await expect(page.getByRole("region", { name: "Detalles de la ruta" })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(feature.cta) })).toHaveAttribute("href", `/registro?destino=${feature.destination}`);
      await expect(page.getByRole("link", { name: /Volver a ContaIA/ })).toHaveAttribute("href", "/");
      await expect(page.locator("[data-testid=classroom-stage], .classroom-content")).toHaveCount(0);
    }
  });

  test("la ruta histórica de Anam redirige su descripción al Asistente abierto", async ({ page }) => {
    await page.goto("/descripcion/anam");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Conversa con Nora sobre tus dudas contables.");
    await expect(page.getByRole("link", { name: /Crear cuenta y explorar el asistente/ })).toHaveAttribute("href", "/registro?destino=asistente");
  });

  test("el formulario de interés solicita correo y una ruta antes del registro", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#public-lead-email")).toHaveAttribute("type", "email");
    await expect(page.locator("#public-lead-email")).toHaveAttribute("required", "");
    await expect(page.locator('[data-interest-form] input[type="radio"]')).toHaveCount(3);
    await expect(page.getByRole("button", { name: /Continuar con mi correo/ })).toBeVisible();
  });

  test("el CTA de una ficha envía al registro con su destino", async ({ page }) => {
    await page.goto("/descripcion/cfdi");
    await page.getByRole("link", { name: /Crear cuenta y explorar CFDI/ }).click();

    await expect(page).toHaveURL(/\/registro\?destino=cfdi$/);
    await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
  });

  test("la portada abre el diálogo de acceso privado", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    const dialog = page.getByRole("dialog", { name: "Continúa donde lo dejaste." });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Correo o alias")).toBeVisible();
    await expect(dialog.getByLabel("Contraseña")).toBeVisible();
  });

  test("el registro directo ofrece los campos básicos sin abrir el aula", async ({ page }) => {
    await page.goto("/registro?destino=curso");

    await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.locator("[data-register-form]")).toBeVisible();
    await expect(page.locator("[data-testid=classroom-stage], .classroom-content")).toHaveCount(0);
  });
});
