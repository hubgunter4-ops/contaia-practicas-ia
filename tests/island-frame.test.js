import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToolHeader } from "../src/tools/tool-shell.js";

const css = readFileSync(new URL("../src/app/island-frame.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("el marco compartido declara tokens de layout, estados y motion", () => {
  for (const token of [
    "--island-space-1",
    "--island-max-width",
    "--island-gutter",
    "--island-radius-md",
    "--island-shadow",
    "--island-motion-fast",
    "--island-motion-standard",
    "--island-motion-ease",
    "--island-focus-ring",
  ]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(css, /\[data-island-frame="header"\]/);
  assert.match(css, /\.island-frame-status\.is-ready/);
  assert.match(css, /\.island-frame-status\.is-attention/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("renderToolHeader expone el marco sin alterar acciones ni estados", () => {
  const markup = renderToolHeader({
    id: "test-island",
    eyebrow: "TEST",
    title: "Marco común",
    description: "Descripción de prueba",
    statusLabel: "Listo",
    statusKind: "ready",
    actions: [{ label: "Continuar", section: "tools", primary: true }],
  });
  assert.match(markup, /class="tool-shell-header [^"]*"/);
  assert.match(markup, /data-island-frame="header"/);
  assert.match(markup, /class="tool-shell-copy island-frame-copy"/);
  assert.match(markup, /class="tool-shell-actions island-frame-actions"/);
  assert.match(markup, /island-frame-status is-ready/);
  assert.match(markup, /data-island-status="ready"/);
  assert.match(markup, /tool-shell-action island-frame-action/);
  assert.match(markup, /data-section="tools"/);
});

test("el HTML carga el marco común después de los estilos de las islas", () => {
  assert.match(index, /<link rel="stylesheet" href="\/src\/app\/island-frame\.css" \/>/);
  assert.ok(index.indexOf("/src/diot/diot.css") < index.indexOf("/src/app/island-frame.css"));
});
