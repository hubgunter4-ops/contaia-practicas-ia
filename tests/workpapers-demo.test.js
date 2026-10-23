import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkpapersDemo, WORKPAPER_DEMO_PERIODS, WORKPAPER_DEMO_TYPES, WORKPAPERS_DEMO_VERSION } from "../src/workpapers/demo-data.js";
import { renderWorkpapersWorkspace, resetWorkpapersWorkspace, workpapersState } from "../src/workpapers/workspace.js";

test("la demo de papeles de trabajo usa valores ficticios deterministas por periodo", () => {
  const october = buildWorkpapersDemo("2026-10");
  const annual = buildWorkpapersDemo("2026-year");
  assert.equal(october.version, WORKPAPERS_DEMO_VERSION);
  assert.equal(october.isFictitious, true);
  assert.equal(october.period.label, "Octubre 2026");
  assert.equal(annual.period.label, "Ejercicio 2026");
  assert.notEqual(october.metrics[0].value, annual.metrics[0].value);
  assert.equal(october.sources.length, 3);
  assert.equal(october.workbook.rows.length, 3);
  assert.equal(october.provenance.length, 3);
  assert.ok(WORKPAPER_DEMO_PERIODS.some(({ id }) => id === october.period.id));
  assert.equal(WORKPAPER_DEMO_TYPES.length, 3);
});

test("los artefactos demo muestran fórmulas y procedencia sin identificadores fiscales", () => {
  const demo = buildWorkpapersDemo();
  const serialized = JSON.stringify(demo);
  assert.match(serialized, /=SUM\(Detalle!F2:F5\)/);
  assert.match(serialized, /requiere revisión humana/i);
  assert.doesNotMatch(serialized, /<cfdi:Comprobante|\b[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2,3}\b|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("el workspace representa demo, periodos, regla, hoja, procedencia y propuesta de planes", () => {
  resetWorkpapersWorkspace();
  let html = renderWorkpapersWorkspace();
  assert.match(html, /Papeles de trabajo IA/);
  assert.match(html, /DEMO INTERACTIVA · DATOS FICTICIOS/);
  assert.match(html, /Sin fuentes reales ni IA remota/);
  assert.match(html, /data-workpapers-period/);
  assert.match(html, /data-workpapers-stage="0"/);
  assert.match(html, /data-workpapers-tab="sheet"/);
  assert.match(html, /no consulta CFDI, bancos, perfiles ni pólizas reales/i);

  workpapersState.activeTab = "provenance";
  html = renderWorkpapersWorkspace();
  assert.match(html, /Cada total explica su procedencia/);
  assert.match(html, /Resumen!F7/);

  workpapersState.activeTab = "plans";
  html = renderWorkpapersWorkspace();
  assert.match(html, /Sin pagos en esta fase/);
  assert.match(html, /Requiere E2–E6 y WP2–WP5/);
});

test("el reset borra decisiones y confirmaciones efímeras de la demo", () => {
  Object.assign(workpapersState, { periodId: "2026-year", activeTab: "sheet", stageIndex: 4, ruleState: "accepted", refreshCount: 3, saved: true, notice: "temporal" });
  resetWorkpapersWorkspace();
  assert.deepEqual(workpapersState, { periodId: "2026-10", activeTab: "demo", stageIndex: 0, ruleState: "proposed", refreshCount: 0, saved: false, notice: "" });
});
