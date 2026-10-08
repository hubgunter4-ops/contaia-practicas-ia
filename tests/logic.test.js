import test from "node:test";
import assert from "node:assert/strict";
import { calculateDifference, evaluateChoice, getGuidedStage, scoreRubric } from "../src/logic.js";
import { PROMPT_RUBRIC, exercises } from "../src/exercises.js";

test("la rúbrica reconoce un prompt contable con contexto, tarea, formato y verificación", () => {
  const prompt = "Actúa como contador. Contexto: empresa ficticia. Compara los datos proporcionados y devuelve una tabla. Verifica en fuente oficial, no inventes y señala lo que falta.";
  const result = scoreRubric(prompt, PROMPT_RUBRIC);
  assert.equal(result.score, 6);
  assert.equal(result.total, 6);
  assert.ok(result.checklist.every((criterion) => criterion.met));
});

test("la rúbrica vacía no acredita criterios", () => {
  const result = scoreRubric("", PROMPT_RUBRIC);
  assert.equal(result.score, 0);
  assert.equal(result.total, 6);
});

test("la evaluación distingue falta de selección, acierto y error", () => {
  const exercise = exercises.find((item) => item.id === "clasificacion");
  assert.equal(evaluateChoice("", exercise).status, "missing");
  assert.equal(evaluateChoice("gasto", exercise).status, "correct");
  assert.equal(evaluateChoice("ingreso", exercise).status, "incorrect");
});

test("la diferencia de balanza conserva signo y centavos", () => {
  assert.equal(calculateDifference(86500, 84500), 2000);
  assert.equal(calculateDifference(125.55, 100.2), 25.35);
  assert.equal(calculateDifference("no-numérico", 100), null);
});

test("cada práctica ofrece una pista y una respuesta modelo o explicación", () => {
  assert.equal(exercises.length, 9);
  for (const exercise of exercises) {
    assert.ok(exercise.hint, `${exercise.id} necesita una pista`);
    assert.ok(exercise.solution || exercise.explanation, `${exercise.id} necesita solución o explicación`);
  }
});

test("la práctica avanza por intento, pista, ejemplo y comparación", () => {
  assert.equal(getGuidedStage({ attempted: false, hintSeen: false, solutionSeen: false }), "attempt");
  assert.equal(getGuidedStage({ attempted: true, hintSeen: false, solutionSeen: false }), "hint");
  assert.equal(getGuidedStage({ attempted: true, hintSeen: true, solutionSeen: false }), "example");
  assert.equal(getGuidedStage({ attempted: true, hintSeen: true, solutionSeen: true }), "compare");
});

test("una pista o solución sin intento no adelanta la etapa", () => {
  assert.equal(getGuidedStage({ attempted: false, hintSeen: true, solutionSeen: true }), "attempt");
  assert.equal(getGuidedStage({ attempted: true, hintSeen: false, solutionSeen: true }), "hint");
});
