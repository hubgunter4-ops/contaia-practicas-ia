import test from "node:test";
import assert from "node:assert/strict";
import { courseModules } from "../src/course.js";
import { buildClassroomScene, CLASSROOM_PHASES } from "../src/classroom.js";

test("el aula ofrece las cinco fases didácticas en un orden estable", () => {
  assert.deepEqual(CLASSROOM_PHASES.map(({ id }) => id), ["activate", "concept", "practice", "review", "close"]);
  assert.ok(CLASSROOM_PHASES.every(({ label, short }) => label && short));
});

test("cada módulo puede renderizar una escena con texto y narración para cada fase", () => {
  for (const module of courseModules) {
    for (let phaseIndex = 0; phaseIndex < CLASSROOM_PHASES.length; phaseIndex += 1) {
      const scene = buildClassroomScene(module, phaseIndex);
      assert.equal(scene.phase.id, CLASSROOM_PHASES[phaseIndex].id, `${module.id} fase ${phaseIndex}`);
      assert.ok(scene.title, `${module.id} debe tener un título de escena`);
      assert.ok(scene.lead, `${module.id} debe tener una introducción`);
      assert.ok(scene.narration, `${module.id} debe tener texto narrable`);
      assert.equal(/\b\d+\s*(?:horas?|h|minutos?|min)\b/i.test(`${scene.title} ${scene.lead} ${scene.narration}`), false, `${module.id} no debe exponer duraciones en la escena`);
    }
  }
});

test("limita índices de fase fuera de rango a la primera o última escena", () => {
  assert.equal(buildClassroomScene(courseModules[0], -5).phase.id, "activate");
  assert.equal(buildClassroomScene(courseModules.at(-1), 99).phase.id, "close");
});

test("rechaza construir una escena sin módulo", () => {
  assert.throws(() => buildClassroomScene(null), /módulo/);
});
