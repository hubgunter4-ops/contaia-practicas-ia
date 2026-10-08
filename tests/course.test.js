import test from "node:test";
import assert from "node:assert/strict";
import { COURSE, courseModules } from "../src/course.js";
import { exercises } from "../src/exercises.js";

test("el curso tiene diez módulos semanales y suma las 40 horas previstas", () => {
  assert.equal(COURSE.weeks, 10);
  assert.equal(courseModules.length, 10);
  assert.equal(new Set(courseModules.map((module) => module.id)).size, 10);
  assert.equal(courseModules.reduce((sum, module) => sum + module.hours, 0), COURSE.hours);
  assert.ok(courseModules.every((module, index) => module.week === index + 1));
});

test("cada módulo enlaza solo prácticas existentes y al menos una actividad", () => {
  const knownExerciseIds = new Set(exercises.map((exercise) => exercise.id));
  for (const module of courseModules) {
    assert.ok(module.title && module.focus && module.outcome, `${module.id} necesita contenido didáctico`);
    assert.ok(module.exerciseIds.length > 0, `${module.id} necesita una práctica vinculada`);
    for (const exerciseId of module.exerciseIds) {
      assert.ok(knownExerciseIds.has(exerciseId), `${module.id} enlaza una práctica inexistente: ${exerciseId}`);
    }
  }
});

test("solo los módulos 1 y 2 declaran paquetes didácticos publicados", () => {
  assert.deepEqual(courseModules.filter((module) => module.materialPath).map((module) => module.id), ["modulo-01", "modulo-02"]);
  for (const module of courseModules.filter((item) => item.materialPath)) {
    assert.match(module.materialPath, /^\/docs\/curso\/modulo-0[12]\/README\.md$/);
  }
});
