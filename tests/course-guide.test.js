import test from "node:test";
import assert from "node:assert/strict";
import { courseModules } from "../src/course.js";

test("los diez módulos tienen una guía completa de Nora", () => {
  assert.equal(courseModules.length, 10);
  for (const module of courseModules) {
    assert.ok(module.guide, `${module.id} necesita guía de Nora`);
    assert.ok(module.guide.opening, `${module.id} necesita apertura`);
    assert.equal(module.guide.steps.length, 3, `${module.id} debe tener tres pasos`);
    assert.ok(module.guide.steps.every(Boolean), `${module.id} tiene pasos vacíos`);
    assert.ok(module.guide.checkpoint, `${module.id} necesita pregunta de control`);
    assert.ok(module.guide.deliverable, `${module.id} necesita evidencia de salida`);
    assert.ok(module.teachFirst, `${module.id} necesita fundamentos previos`);
    assert.ok(module.teachFirst.why, `${module.id} necesita explicar por qué importa`);
    assert.equal(module.teachFirst.concepts.length, 3, `${module.id} debe enseñar tres conceptos`);
    assert.ok(module.teachFirst.concepts.every(([term, meaning]) => term && meaning), `${module.id} tiene conceptos incompletos`);
    assert.ok(module.teachFirst.example, `${module.id} necesita un ejemplo sencillo`);
    assert.ok(module.toolkit?.length >= 2, `${module.id} necesita al menos dos herramientas opcionales`);
    assert.ok(module.toolkit.every((tool) => tool.name && tool.activity && tool.guardrail && tool.url), `${module.id} tiene una actividad de herramienta incompleta`);
    assert.ok(module.demonstration, `${module.id} necesita una demostración`);
    assert.ok(module.demonstration.before && module.demonstration.after && module.demonstration.why, `${module.id} tiene una demostración incompleta`);
    assert.ok(module.context, `${module.id} necesita contexto documental`);
    assert.ok(module.context.documents.length >= 1, `${module.id} necesita indicar qué documento llevar`);
    assert.ok(module.context.mustContain.length >= 3, `${module.id} necesita campos mínimos`);
    assert.ok(module.context.format && module.context.protect, `${module.id} necesita formato y protección`);
  }
});

test("las guías de Nora conservan el foco de cada semana", () => {
  const fiscal = courseModules.find((module) => module.id === "modulo-09");
  const governance = courseModules.find((module) => module.id === "modulo-10");
  assert.match(fiscal.guide.opening, /fiscal|régimen|periodo/i);
  assert.match(governance.guide.checkpoint, /evidencia|inesperado|IA/i);
});

test("el primer módulo enseña prompt antes de pedir que se diseñe uno", () => {
  const first = courseModules[0];
  assert.equal(first.title, "Qué es la IA y qué es un prompt");
  assert.ok(first.teachFirst.concepts.some(([term]) => term === "Prompt"));
  assert.match(first.teachFirst.example, /prompt/i);
  assert.match(first.guide.steps[1], /prompt/i);
});

test("el recorrido integra las tres herramientas sin convertirlas en dependencias", () => {
  const names = new Set(courseModules.flatMap((module) => module.toolkit.map((tool) => tool.name)));
  assert.deepEqual(names, new Set(["NotebookLM", "Claude", "n8n"]));
  for (const module of courseModules) {
    assert.ok(module.toolkit.every((tool) => tool.guardrail.length > 20 && /[.!?]$/.test(tool.guardrail)));
  }
});
