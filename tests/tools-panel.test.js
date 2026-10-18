import test from "node:test";
import assert from "node:assert/strict";
import { renderToolsPanel, TOOL_DEFINITIONS } from "../src/tools/panel.js";

test("el panel ofrece las herramientas fiscales con estados explícitos", () => {
  assert.equal(TOOL_DEFINITIONS.length, 5);
  assert.equal(TOOL_DEFINITIONS.find((tool) => tool.id === "cfdi")?.status, "available");
  assert.equal(TOOL_DEFINITIONS.filter((tool) => tool.status !== "available").length, 4);
});

test("el panel renderiza el perfil fiscal, las tarjetas y el aviso de control", () => {
  const html = renderToolsPanel({ notice: "Configura tu empresa" });
  assert.match(html, /Centro operativo/);
  assert.match(html, /Perfil fiscal/);
  assert.match(html, /CFDI 4\.0/);
  assert.match(html, /Monitor fiscal/);
  assert.match(html, /Configura tu empresa/);
  assert.match(html, /data-tool-action="cfdi"/);
});
