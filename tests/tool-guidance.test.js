import test from "node:test";
import assert from "node:assert/strict";
import { renderToolGuidance } from "../src/tools/tool-shell.js";
import { renderCfdiWorkspace, resetCfdiWorkspace } from "../src/cfdi/workspace.js";
import { renderDiotWorkspace, resetDiotWorkspace } from "../src/diot/workspace.js";
import { renderJournalWorkspace, resetJournalWorkspace } from "../src/journal/workspace.js";
import { renderReconciliationWorkspace, resetReconciliationWorkspace } from "../src/reconciliation/workspace.js";
import { renderWorkpapersWorkspace, resetWorkpapersWorkspace } from "../src/workpapers/workspace.js";

test("la guía común anuncia estado, siguiente paso, pendientes y límites con HTML escapado", () => {
  const html = renderToolGuidance({
    state: "<estado>",
    nextStep: "Siguiente paso seguro",
    pending: ["Falta revisión"],
    boundary: "No reemplaza la revisión humana.",
  });
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /&lt;estado&gt;/);
  assert.match(html, /Siguiente paso seguro/);
  assert.match(html, /Falta revisión/);
  assert.match(html, /No reemplaza la revisión humana/);
  assert.doesNotMatch(html, /<estado>/);
});

test("las cinco herramientas muestran progreso y límites contextuales", () => {
  resetCfdiWorkspace();
  resetDiotWorkspace();
  resetJournalWorkspace();
  resetReconciliationWorkspace();
  resetWorkpapersWorkspace();

  const pages = [
    renderCfdiWorkspace(),
    renderDiotWorkspace(),
    renderJournalWorkspace(),
    renderReconciliationWorkspace(),
    renderWorkpapersWorkspace(),
  ];
  for (const html of pages) {
    assert.match(html, /class="tool-guidance"/);
    assert.match(html, /Estado actual/);
    assert.match(html, /Siguiente paso/);
    assert.match(html, /Alcance/);
  }

  assert.match(pages[0], /Volver a Herramientas/);
  assert.match(pages[1], /paso 01 de 5/);
  assert.match(pages[2], /Fuentes pendientes/);
  assert.match(pages[3], /Archivo pendiente/);
  assert.match(pages[4], /Paso 1 de 5/);
});
