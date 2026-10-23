import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/island-visual.css", import.meta.url), "utf8");
const frame = readFileSync(new URL("../src/app/island-frame.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

test("la fase visual 2 cubre las cuatro islas y sus grupos internos", () => {
  for (const selector of [
    ".recon-step-card",
    ".journal-audit-stage",
    ".diot-review-stage",
    ".cfdi-results",
    ".recon-summary",
    ".journal-audit-summary",
    ".diot-preview-grid",
    ".cfdi-overview-grid",
  ]) assert.match(css, new RegExp(escapeRegExp(selector)));

  assert.match(css, /island-surface-enter/);
  assert.match(css, /island-status-pulse/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("la hoja visual se carga después del marco y antes de Auth", () => {
  const frame = index.indexOf("/src/app/island-frame.css");
  const visual = index.indexOf("/src/app/island-visual.css");
  const auth = index.indexOf("/src/auth/auth.css");
  assert.ok(frame >= 0 && visual > frame && auth > visual);
});

test("las microinteracciones tienen límites táctiles y no dependen de red", () => {
  assert.match(css, /:active:not\(:disabled\)/);
  assert.match(css, /translateY\(-2px\)/);
  assert.doesNotMatch(css, /fetch\(|\/api\/|localStorage|indexedDB/);
});

test("la fase visual 4 ordena estados vacíos y su siguiente acción", () => {
  assert.match(css, /island-empty-actions/);
  assert.match(css, /island-empty-reveal/);
  assert.match(css, /\.button-primary/);
  assert.match(css, /min-height: 40px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("la fase visual 5 diferencia carga, error, éxito y foco", () => {
  for (const selector of [
    ".cfdi-processing",
    ".cfdi-parse-error",
    ".recon-error",
    ".recon-notice",
    ".journal-inline-error",
    ".diot-issue",
  ]) assert.match(css, new RegExp(escapeRegExp(selector)));

  assert.match(css, /island-feedback-spin/);
  assert.match(css, /island-feedback-settle/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("la fase visual 6 declara contraste AA, foco dual y tipografía mínima", () => {
  assert.match(styles, /--fiscal-jade-ink:\s*#126A57/);
  assert.match(styles, /--fiscal-text-secondary:\s*#355A5B/);
  assert.match(frame, /--island-focus-ring:\s*0 0 0 3px #ffffff, 0 0 0 6px var\(--island-focus-color\)/);
  assert.match(css, /outline: 2px solid var\(--island-focus-accent\)/);
  assert.match(frame, /--island-type-meta-size: 11px/);
  assert.match(frame, /--island-type-body-leading: 1\.5/);
  assert.match(css, /prefers-reduced-motion: reduce/);

  for (const [text, surface] of [
    ["#126A57", "#FFFFFF"],
    ["#355A5B", "#FFFFFF"],
    ["#126A57", "#EAF5F0"],
    ["#695516", "#FBF6DF"],
    ["#78392E", "#FFF2ED"],
  ]) {
    assert.ok(contrastRatio(text, surface) >= 4.5, `${text} sobre ${surface} debe cumplir AA`);
  }
});

test("la fase visual 7 declara un breakpoint tablet común para encabezados y acciones", () => {
  assert.match(frame, /@media \(max-width: 840px\)/);
  assert.match(frame, /grid-template-columns: minmax\(0, 1fr\);[\s\S]*?align-items: start/);
  assert.match(frame, /\.island-frame-actions \{[\s\S]*?width: 100%;[\s\S]*?justify-content: flex-start/);
});
