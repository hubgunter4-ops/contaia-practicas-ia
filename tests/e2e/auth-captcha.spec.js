import { expect, test } from "@playwright/test";

const sitekey = "10000000-ffff-ffff-ffff-000000000001";
const authConfig = {
  enabled: true,
  url: "https://rjdhfajtttejskhuplzq.supabase.co",
  publishableKey: "sb_publishable_1234567890_abcdefghijklmnop",
  hcaptchaSitekey: sitekey,
};

async function prepareCaptchaPage(page, path, { expectWidget = true } = {}) {
  await page.addInitScript(() => {
    window.__testHcaptchaCallback = null;
    window.hcaptcha = {
      render(_host, options) {
        window.__testHcaptchaCallback = options.callback;
        return 1;
      },
      reset() {},
    };
  });
  await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
  await page.route("**/api/cfdi/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authConfig) }));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(async () => {
    const { authState } = await import("/src/auth/client.js");
    return authState.ready === true && Boolean(window.__contaiaAuth?.client);
  });
  if (expectWidget) await expect(page.locator("[data-hcaptcha-widget]")).toBeVisible();
}

async function setCaptchaToken(page, token) {
  await page.waitForFunction(() => typeof window.__testHcaptchaCallback === "function");
  await page.evaluate((value) => window.__testHcaptchaCallback?.(value), token);
}

test("registro envía el captchaToken dentro de las opciones de Supabase", async ({ page }) => {
  await prepareCaptchaPage(page, "/registro");
  await page.evaluate(async () => {
    const { setAuthClient } = await import("/src/auth/client.js");
    window.__testSignUpOptions = null;
    setAuthClient({ auth: {
      signUp: async (options) => {
        window.__testSignUpOptions = options;
        return { data: { session: null }, error: null };
      },
    } }, null);
  });
  await setCaptchaToken(page, "signup-one-time-token");
  await page.getByLabel("Correo electrónico").fill("signup-captcha@test.local");
  await page.getByLabel("Contraseña", { exact: true }).fill("ContaIA-test-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cuenta creada" })).toBeVisible();
  const options = await page.evaluate(() => window.__testSignUpOptions.options);
  expect(options.captchaToken).toBe("signup-one-time-token");
  expect(new URL(options.emailRedirectTo).pathname).toBe("/confirmar-correo");
});

test("inicio de sesión reenvía el captchaToken al endpoint auth sin persistirlo en la UI", async ({ page }) => {
  const requests = [];
  await page.route("**/api/auth", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: { access_token: "access", refresh_token: "refresh" } }) });
  });
  await prepareCaptchaPage(page, "/", { expectWidget: false });
  await page.evaluate(async () => {
    const { setAuthClient, authState } = await import("/src/auth/client.js");
    setAuthClient({ auth: { setSession: async () => ({ error: null }) } }, null);
    authState.open = true;
    document.dispatchEvent(new CustomEvent("contaia:auth-updated", { detail: { user: null } }));
  });
  await expect(page.locator("[data-auth-panel] [data-hcaptcha-widget]")).toBeVisible();
  await setCaptchaToken(page, "signin-one-time-token");
  await page.locator("[data-auth-panel] #auth-identifier").fill("signin-captcha@test.local");
  await page.locator("[data-auth-panel] #auth-password").fill("ContaIA-test-123");
  await page.locator("[data-auth-panel] [data-auth-form] button[type=submit]").click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].captchaToken).toBe("signin-one-time-token");
  await expect(page.locator("body")).not.toContainText("signin-one-time-token");
});

test("recuperación envía captchaToken en las opciones de resetPasswordForEmail", async ({ page }) => {
  await prepareCaptchaPage(page, "/recuperar-contrasena");
  await page.evaluate(async () => {
    const { setAuthClient } = await import("/src/auth/client.js");
    window.__testRecoveryRequest = null;
    setAuthClient({ auth: {
      resetPasswordForEmail: async (email, options) => {
        window.__testRecoveryRequest = { email, options };
        return { error: null };
      },
    } }, null);
  });
  await setCaptchaToken(page, "recovery-one-time-token");
  await page.getByLabel("Correo electrónico").fill("recovery-captcha@test.local");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Si existe una cuenta" })).toBeVisible();
  const request = await page.evaluate(() => window.__testRecoveryRequest);
  expect(request.email).toBe("recovery-captcha@test.local");
  expect(request.options.captchaToken).toBe("recovery-one-time-token");
  expect(new URL(request.options.redirectTo).pathname).toBe("/recuperar-contrasena");
  await expect(page.locator("body")).not.toContainText("recovery-one-time-token");
});
