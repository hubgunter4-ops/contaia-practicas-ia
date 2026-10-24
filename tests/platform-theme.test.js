import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const theme = readFileSync(new URL("../src/app/platform-theme.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

const themeLink = "/src/app/platform-theme.css";

test("el tema de plataforma se carga después de las hojas específicas", () => {
  const auth = index.indexOf("/src/auth/auth.css");
  const platform = index.indexOf(themeLink);
  assert.ok(auth >= 0 && platform > auth);
});

test("Herramientas conserva su paleta y sus vistas fiscales", () => {
  assert.match(theme, /\.app-shell--fiscal:has\(\.tools-page\)/);
  assert.match(theme, /--tools-navy:\s*#0b2a55/);
  assert.match(theme, /--tools-blue:\s*#1266c9/);
  assert.match(theme, /--tools-canvas:\s*#f3f6fb/);
  assert.match(theme, /\.tools-card/);
  assert.match(theme, /\.tools-connection-status\.is-connected/);
  assert.match(theme, /:has\(\.tool-shell-header\):not\(:has\(\.tools-page\)\)/);
  for (const page of ["cfdi-page", "diot-page", "journal-page", "recon-page", "workpapers-page"]) {
    assert.match(theme, new RegExp(`\\.${page}`));
  }
});

test("la identidad visual de Herramientas se comparte en las vistas internas autenticadas", () => {
  assert.match(main, /class="app-shell app-shell--platform \$\{fiscalTheme\}"/);
  assert.match(theme, /\.app-shell--platform:not\(\.app-shell--fiscal\) \.topbar/);
  assert.match(theme, /\.app-shell--platform:not\(\.app-shell--fiscal\) \.sidebar/);
  assert.match(theme, /\.app-shell--platform:not\(\.app-shell--fiscal\):has\(\.classroom-content\)/);
  assert.match(theme, /\.app-shell--platform:not\(\.app-shell--fiscal\) \.mobile-bottom-nav/);
});

test("la landing, el registro y la autenticación pública quedan fuera del tema de aplicación", () => {
  assert.match(styles, /\.public-landing/);
  assert.doesNotMatch(theme, /\.public-|\.auth-/);
  assert.doesNotMatch(theme, /(^|\n)body\s*\{/);
  assert.doesNotMatch(theme, /(^|\n):root\s*\{/);
  assert.ok(main.indexOf("if (!currentUser())") < main.indexOf('class="app-shell app-shell--platform'));
});

test("el tema conserva foco visible y movimiento reducido", () => {
  assert.match(theme, /:focus-visible/);
  assert.match(theme, /prefers-reduced-motion: reduce/);
  assert.match(theme, /0 0 0 3px #ffffff, 0 0 0 6px var\(--tools-blue\)/);
});
