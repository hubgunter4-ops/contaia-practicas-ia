import test from "node:test";
import assert from "node:assert/strict";
import { COURSE, courseModules, courseSessionFlow } from "../src/course.js";

test("las diez sesiones del curso mantienen el orden curricular del plan", () => {
  assert.equal(courseModules.length, 10);
  assert.deepEqual(courseModules.map(({ week }) => week), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(courseModules.map(({ id }) => id), Array.from({ length: 10 }, (_, index) => `modulo-${String(index + 1).padStart(2, "0")}`));
});

test("cada sesión repite la secuencia guiada de 15/35/80/40/10 minutos", () => {
  assert.deepEqual(courseSessionFlow.map(({ minutes }) => minutes), [15,35,80,40,10]);
  assert.ok(courseSessionFlow.every(({ title, description }) => title && description));
  assert.equal(courseSessionFlow.reduce((total, { minutes }) => total + minutes, 0), 180);
  assert.equal(COURSE.guidedHoursPerWeek, 3);
});

test("la práctica independiente de 60 minutos queda separada de la sesión guiada", () => {
  assert.equal(COURSE.independentHoursPerWeek, 1);
  assert.equal(COURSE.hours, 40);
  assert.equal(COURSE.weeks, 10);
});
