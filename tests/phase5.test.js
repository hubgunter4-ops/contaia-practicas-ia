import test from "node:test";
import assert from "node:assert/strict";
import { DIAGNOSTIC_QUESTIONS, PROJECT_STAGES, REMOTE_AI_GATE, getAdaptiveRoute, scoreDiagnostic } from "../src/phase5.js";

test("el diagnóstico puntúa respuestas sin guardar texto", () => {
  const answers = Object.fromEntries(DIAGNOSTIC_QUESTIONS.map((question) => [question.id, question.options.find((option) => option.correct).id]));
  assert.deepEqual(scoreDiagnostic(answers), { score: 4, total: 4, percentage: 100 });
  assert.equal(Object.keys(answers).length, 4);
});

test("la ruta adaptativa recomienda fundamentos, práctica o integración", () => {
  assert.equal(getAdaptiveRoute({ score: 0 }).id, "fundamentos");
  assert.equal(getAdaptiveRoute({ score: 2 }).id, "practica");
  assert.equal(getAdaptiveRoute({ score: 4 }).id, "integrador");
});

test("el proyecto integrador tiene cinco evidencias en orden", () => {
  assert.equal(PROJECT_STAGES.length, 5);
  assert.deepEqual(PROJECT_STAGES.map((stage) => stage.number), ["01", "02", "03", "04", "05"]);
  assert.ok(PROJECT_STAGES.every((stage) => stage.task && stage.evidence));
});

test("la puerta remota explica requisitos sin habilitar proveedores", () => {
  assert.equal(REMOTE_AI_GATE.length, 6);
  assert.ok(REMOTE_AI_GATE.some((item) => /consentimiento/i.test(item)));
  assert.ok(REMOTE_AI_GATE.some((item) => /presupuesto|rate limiting/i.test(item)));
});
