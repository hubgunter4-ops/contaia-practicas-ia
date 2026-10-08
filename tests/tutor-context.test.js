import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/exercises.js";
import { MAX_LENGTHS, toTutorContext } from "../src/tutor/context.js";

test("los nueve ejercicios producen contexto didáctico válido", () => {
  for (const exercise of exercises) {
    const context = toTutorContext(exercise, "attempt");
    assert.equal(context.id, exercise.id);
    assert.equal(context.kind, exercise.kind);
    assert.ok(context.title);
    assert.ok(context.stage);
    assert.equal(context.modelExplanation, "");
    assert.equal(Object.hasOwn(context, "answer"), false);
    assert.equal(Object.hasOwn(context, "solution"), false);
  }
});

test("el contexto no expone claves ni texto de respuesta antes de revelar", () => {
  const exercise = exercises.find((item) => item.id === "clasificacion");
  const context = toTutorContext(exercise, "hint");
  assert.equal(context.hasModelExplanation, true);
  assert.equal(context.modelExplanation, "");
  assert.equal(Object.hasOwn(context, "answer"), false);
  assert.equal(Object.hasOwn(context, "choices"), false);
});

test("la explicación modelo solo aparece en la etapa de comparación", () => {
  const exercise = exercises.find((item) => item.id === "reporte");
  assert.equal(toTutorContext(exercise, "example").modelExplanation, "");
  assert.equal(toTutorContext(exercise, "compare").modelExplanation, exercise.solution);
});

test("los campos opcionales faltantes y textos largos tienen fallback seguro", () => {
  const context = toTutorContext({ id: "x", kind: "quiz", title: "  título ", hint: "x".repeat(900) }, "attempt");
  assert.equal(context.title, "título");
  assert.equal(context.hint.length, MAX_LENGTHS.hint);
  assert.equal(context.scenario, "");
  assert.deepEqual(context.rubricLabels, []);
});
