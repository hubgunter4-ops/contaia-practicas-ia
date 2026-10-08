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
  }
});

test("las guías de Nora conservan el foco de cada semana", () => {
  const fiscal = courseModules.find((module) => module.id === "modulo-09");
  const governance = courseModules.find((module) => module.id === "modulo-10");
  assert.match(fiscal.guide.opening, /fiscal|régimen|periodo/i);
  assert.match(governance.guide.checkpoint, /evidencia|inesperado|IA/i);
});
