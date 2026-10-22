import { test, expect } from "@playwright/test";

const DESTINATIONS = [
  { slug: "curso", finalSelector: "[data-learning-island-host] [data-learning-island]" },
  { slug: "cfdi", finalSelector: "[data-cfdi-island-host] [data-cfdi-page]" },
  { slug: "asistente", finalSelector: "[data-open-assistant]" },
];

for (const destination of DESTINATIONS) {
  test(`recuperación conserva destino ${destination.slug}`, async ({ page }) => {
    await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
    await page.route("**/api/cfdi/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) }));
    await page.goto(`/recuperar-contrasena?destino=${destination.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(async () => {
      const { authState } = await import("/src/auth/client.js");
      return authState.ready === true;
    });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      window.__testRecoveryRequest = null;
      setAuthClient({
        auth: {
          resetPasswordForEmail: async (email, options) => {
            window.__testRecoveryRequest = { email, options };
            return { error: null };
          },
        },
      }, null);
    });
    await page.getByLabel("Correo electrónico").fill(`recovery-${destination.slug}@test.local`);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Si existe una cuenta" })).toBeVisible();

    const request = await page.evaluate(() => window.__testRecoveryRequest);
    expect(request.email).toBe(`recovery-${destination.slug}@test.local`);
    const redirect = new URL(request.options.redirectTo);
    expect(redirect.pathname).toBe("/recuperar-contrasena");
    expect(redirect.searchParams.get("destino")).toBe(destination.slug);

    await page.evaluate(async () => {
      const { authState } = await import("/src/auth/client.js");
      window.__testPasswordUpdate = null;
      window.__contaiaAuth.client.auth.updateUser = async (payload) => {
        window.__testPasswordUpdate = payload;
        return { error: null };
      };
      authState.recoveryMode = true;
      authState.recoveryComplete = false;
      authState.message = "";
      authState.error = false;
      document.dispatchEvent(new CustomEvent("contaia:auth-updated", { detail: { user: { id: "11111111-1111-4111-8111-111111111111" } } }));
    });
    await expect(page.getByText("ENLACE VERIFICADO")).toBeVisible();
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("ContaIA-new-123");
    await page.getByLabel("Confirma tu nueva contraseña", { exact: true }).fill("ContaIA-new-123");
    await page.getByRole("button", { name: "Actualizar contraseña" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Contraseña actualizada" })).toBeVisible();
    expect(await page.evaluate(() => window.__testPasswordUpdate)).toEqual({ password: "ContaIA-new-123" });
    await expect(page.getByRole("link", { name: /Continuar a ContaIA/ })).toHaveAttribute("href", `/?destino=${destination.slug}`);

    await page.goto(`/?destino=${destination.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(async () => {
      const { authState } = await import("/src/auth/client.js");
      return authState.ready === true;
    });
    await page.evaluate(async () => {
      const { setAuthClient } = await import("/src/auth/client.js");
      const user = { id: "11111111-1111-4111-8111-111111111111", email: "recovery@test.local" };
      setAuthClient({ auth: {
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ unsubscribe() {} }),
      } }, user);
    });
    await expect(page.locator(destination.finalSelector)).toBeVisible();
  });
}
