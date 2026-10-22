import { test, expect } from "@playwright/test";

const DESTINATIONS = [
  { slug: "curso", finalSelector: "[data-learning-island-host] [data-learning-island]" },
  { slug: "cfdi", finalSelector: "[data-cfdi-island-host] [data-cfdi-page]" },
  { slug: "asistente", finalSelector: "[data-open-assistant]" },
];

for (const destination of DESTINATIONS) {
  test(`registro → confirmación → ${destination.slug}`, async ({ page }) => {
    await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
    await page.route("**/api/cfdi/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) }));

    await page.goto(`/registro?destino=${destination.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(async () => {
      const { authState } = await import("/src/auth/client.js");
      return authState.ready === true;
    });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      window.__testSignUpOptions = null;
      setAuthClient({
        auth: {
          signUp: async (options) => {
            window.__testSignUpOptions = options;
            return { data: { session: null }, error: null };
          },
        },
      }, null);
    });
    await page.getByLabel("Correo electrónico").fill(`redirect-${destination.slug}@test.local`);
    await page.getByLabel("Contraseña", { exact: true }).fill("ContaIA-test-123");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Cuenta creada" })).toBeVisible();

    const signUpOptions = await page.evaluate(() => window.__testSignUpOptions);
    expect(new URL(signUpOptions.options.emailRedirectTo).pathname).toBe("/confirmar-correo");
    expect(new URL(signUpOptions.options.emailRedirectTo).searchParams.get("destino")).toBe(destination.slug);

    await page.goto(`/confirmar-correo?destino=${destination.slug}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      setAuthClient({ auth: {} }, { id: "11111111-1111-4111-8111-111111111111", email: "confirmed@test.local" });
    });
    await expect(page.getByRole("heading", { name: "Correo confirmado" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continuar a ContaIA/ })).toHaveAttribute("href", `/?destino=${destination.slug}`);

    await page.goto(`/?destino=${destination.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(async () => {
      const { authState } = await import("/src/auth/client.js");
      return authState.ready === true;
    });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      const user = { id: "11111111-1111-4111-8111-111111111111", email: "confirmed@test.local" };
      setAuthClient({ auth: {
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ unsubscribe() {} }),
      } }, user);
    });
    await expect(page.locator(destination.finalSelector)).toBeVisible();
  });
}
