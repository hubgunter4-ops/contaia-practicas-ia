import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/exercises.js";
import { toTutorContext } from "../src/tutor/context.js";
import { detectLocalIntent, getLocalTutorReply } from "../src/tutor/local.js";
import { getGuidedStage } from "../src/logic.js";

test("detecta solo intenciones locales explícitas", () => {
  assert.equal(detectLocalIntent("Dame una pista"), "hint");
  assert.equal(detectLocalIntent("¿Cuál es el siguiente paso?"), "next-step");
  assert.equal(detectLocalIntent("¿Por qué?"), "why");
  assert.equal(detectLocalIntent("No sé qué pide"), "restate");
  assert.equal(detectLocalIntent("hola"), "unknown");
});

test("responde con la pista del ejercicio sin revelar la solución", () => {
  const exercise = exercises.find((item) => item.id === "isr");
  const context = toTutorContext(exercise, getGuidedStage({ attempted: true }));
  const reply = getLocalTutorReply({ intent: "hint", context });
  assert.equal(reply, exercise.hint);
  assert.equal(Object.hasOwn(context, "answer"), false);
  assert.equal(Object.hasOwn(context, "solution"), false);
});

test("no revela explicación antes de la etapa permitida", () => {
  const exercise = exercises.find((item) => item.id === "reporte");
  const early = toTutorContext(exercise, "example");
  const reply = getLocalTutorReply({ intent: "why", context: early });
  assert.equal(reply.includes(exercise.solution), false);
  const revealed = toTutorContext(exercise, "compare");
  assert.equal(getLocalTutorReply({ intent: "why", context: revealed }).includes(exercise.solution), true);
});

test("el modo local no necesita fetch ni persistencia", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("red no permitida"); };
  try {
    const exercise = exercises.find((item) => item.id === "nomina");
    const context = toTutorContext(exercise, "hint");
    assert.match(getLocalTutorReply({ intent: "next-step", context }), /verificar|revisar|siguiente/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("los fallbacks permanecen prudentes para impuestos y anomalías", () => {
  const isr = exercises.find((item) => item.id === "isr");
  const analysis = exercises.find((item) => item.id === "analisis");
  const isrReply = getLocalTutorReply({ intent: "unknown", context: toTutorContext(isr, "hint") });
  const analysisReply = getLocalTutorReply({ intent: "next-step", context: toTutorContext(analysis, "hint") });
  assert.doesNotMatch(isrReply, /calcular|obligación|tasa/i);
  assert.doesNotMatch(analysisReply, /fraude|culpable/i);
});
