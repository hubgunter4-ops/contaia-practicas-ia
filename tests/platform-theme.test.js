import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const theme = readFileSync(new URL("../src/app/platform-theme.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const themeLink = "/src/app/platform-theme.css";

test("el tema de plataforma se carga después de las hojas específicas", () => {
  const auth = index.indexOf("/src/auth/auth.css");
  const platform = index.indexOf(themeLink);
  assert.ok(auth >= 0 && platform > auth);
});

test("la paleta nueva queda limitada al shell de Herramientas", () => {
  assert.match(theme, /\.app-shell--fiscal:has\(\.tools-page\)/);
  assert.match(theme, /--tools-navy:\s*#0b2a55/);
  assert.match(theme, /--tools-blue:\s*#1266c9/);
  assert.match(theme, /--tools-canvas:\s*#f3f6fb/);
  assert.match(theme, /\.tools-card/);
  assert.match(theme, /\.tools-connection-status\.is-connected/);
  assert.doesNotMatch(theme, /\.public-|\.auth-|\.classroom-content/);
});

test("la referencia visual pública no se modifica por el tema de Herramientas", () => {
  assert.match(styles, /\.public-landing/);
  assert.doesNotMatch(theme, /(^|\n)body\s*\{/);
  assert.doesNotMatch(theme, /(^|\n):root\s*\{/);
});

test("el tema conserva foco visible y movimiento reducido", () => {
  assert.match(theme, /:focus-visible/);
  assert.match(theme, /prefers-reduced-motion: reduce/);
  assert.match(theme, /0 0 0 3px #ffffff, 0 0 0 6px var\(--tools-blue\)/);
});
