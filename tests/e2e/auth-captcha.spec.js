import { expect, test } from "@playwright/test";

const sitekey = "1x00000000000000000000AA";
const turnstileScriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const authConfig = {
  enabled: true,
  url: "https://rjdhfajtttejskhuplzq.supabase.co",
  publishableKey: "sb_publishable_1234567890_abcdefghijklmnop",
  captchaProvider: "turnstile",
  captchaSitekey: sitekey,
};

async function prepareCaptchaPage(page, path, { expectWidget = true, configOverrides = {} } = {}) {
  await page.addInitScript(() => {
    window.__testTurnstileCallback = null;
    window.__testTurnstileExpiredCallback = null;
    window.__testTurnstileErrorCallback = null;
    window.__testTurnstileResetCount = 0;
    window.__testTurnstileRenderCount = 0;
    window.__testTurnstileScriptUrl = "";
  });
  await page.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
  body: `window.__testTurnstileScriptUrl = document.currentScript?.src || "";
window.turnstile = {
  render(_host, options) {
    window.__testTurnstileRenderCount += 1;
    window.__testTurnstileCallback = options.callback;
    window.__testTurnstileExpiredCallback = options["expired-callback"];
    window.__testTurnstileErrorCallback = options["error-callback"];
    return "test-widget";
  },
  reset() { window.__testTurnstileResetCount += 1; }
};`,
  }));
  await page.route("**/api/tutor/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, providers: [] }) }));
  await page.route("**/api/cfdi/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...authConfig, ...configOverrides }) }));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(async () => {
    const { authState } = await import("/src/auth/client.js");
    return authState.ready === true && Boolean(window.__contaiaAuth?.client);
  });
  if (expectWidget) {
    await expect(page.locator("[data-captcha-widget]")).toBeVisible();
    await page.waitForFunction(() => typeof window.__testTurnstileCallback === "function");
    expect(await page.evaluate(() => window.__testTurnstileScriptUrl)).toBe(turnstileScriptUrl);
  }
}

async function setCaptchaToken(page, token) {
  await page.waitForFunction(() => typeof window.__testTurnstileCallback === "function");
  await page.evaluate((value) => window.__testTurnstileCallback?.(value), token);
}

async function expectCaptchaClearedAndReset(page) {
  const token = await page.evaluate(async () => (await import("/src/auth/client.js")).authState.captchaToken);
  expect(token).toBe("");
  expect(await page.evaluate(() => window.__testTurnstileResetCount)).toBeGreaterThan(0);
}

test("registro envía el token Turnstile dentro de las opciones de Supabase y lo borra después", async ({ page }) => {
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
  await expect(page.locator("body")).not.toContainText("signup-one-time-token");
  await expectCaptchaClearedAndReset(page);
});

test("inicio de sesión reenvía el token Turnstile al endpoint Auth y lo borra después", async ({ page }) => {
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
  await expect(page.locator("[data-auth-panel] [data-captcha-widget]")).toBeVisible();
  await setCaptchaToken(page, "signin-one-time-token");
  await page.locator("[data-auth-panel] #auth-identifier").fill("signin-captcha@test.local");
  await page.locator("[data-auth-panel] #auth-password").fill("ContaIA-test-123");
  await page.locator("[data-auth-panel] [data-auth-form] button[type=submit]").click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].captchaToken).toBe("signin-one-time-token");
  await expect(page.locator("body")).not.toContainText("signin-one-time-token");
  await expectCaptchaClearedAndReset(page);
});

test("recuperación envía el token Turnstile a Supabase y lo borra después", async ({ page }) => {
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
  const activityBeforeRequest = await page.evaluate(() => window.__testTurnstileRenderCount + window.__testTurnstileResetCount);
  await page.getByLabel("Correo electrónico").fill("recovery-captcha@test.local");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Si existe una cuenta" })).toBeVisible();
  const request = await page.evaluate(() => window.__testRecoveryRequest);
  expect(request.email).toBe("recovery-captcha@test.local");
  expect(request.options.captchaToken).toBe("recovery-one-time-token");
  expect(new URL(request.options.redirectTo).pathname).toBe("/recuperar-contrasena");
  await expect(page.locator("body")).not.toContainText("recovery-one-time-token");
  const token = await page.evaluate(async () => (await import("/src/auth/client.js")).authState.captchaToken);
  expect(token).toBe("");
  await expect(page.locator("[data-captcha-widget]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__testTurnstileRenderCount + window.__testTurnstileResetCount)).toBeGreaterThan(activityBeforeRequest);
});

test("la expiración del desafío borra el token y bloquea el registro hasta resolverlo de nuevo", async ({ page }) => {
  await prepareCaptchaPage(page, "/registro");
  await page.evaluate(async () => {
    const { setAuthClient } = await import("/src/auth/client.js");
    window.__testSignUpCalls = 0;
    setAuthClient({ auth: {
      signUp: async () => {
        window.__testSignUpCalls += 1;
        return { data: { session: null }, error: null };
      },
    } }, null);
  });
  await setCaptchaToken(page, "token-that-expires");
  await page.evaluate(() => window.__testTurnstileExpiredCallback?.());
  const token = await page.evaluate(async () => (await import("/src/auth/client.js")).authState.captchaToken);
  expect(token).toBe("");
  await page.getByLabel("Correo electrónico").fill("expired-captcha@test.local");
  await page.getByLabel("Contraseña", { exact: true }).fill("ContaIA-test-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.locator(".auth-message.is-error")).toHaveText("Completa la verificación de seguridad para continuar.");
  expect(await page.evaluate(() => window.__testSignUpCalls)).toBe(0);
});

test("una sitekey hCaptcha heredada no habilita el widget sin proveedor explícito", async ({ page }) => {
  await prepareCaptchaPage(page, "/registro", {
    expectWidget: false,
    configOverrides: {
      captchaProvider: "",
      captchaSitekey: "",
      hcaptchaSitekey: "fake-hcaptcha-sitekey-1234567890",
    },
  });
  await expect(page.locator("[data-captcha-widget]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__testTurnstileScriptUrl)).toBe("");
});
