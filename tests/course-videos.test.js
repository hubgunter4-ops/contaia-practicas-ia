import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoBrief, getApprovedSynthesiaEmbed, resolveCourseVideo } from "../src/course-videos.js";
import { courseModules, courseSessionFlow } from "../src/course.js";
import { exercises } from "../src/exercises.js";

const module = courseModules[0];
const exercise = exercises[0];

test("el briefing NotebookLM describe la sesión en español sin incorporar datos de estudiante ni la solución", () => {
  const brief = buildVideoBrief({ module, exercise });
  assert.match(brief, new RegExp(module.title));
  assert.match(brief, new RegExp(module.outcome));
  for (const phase of courseSessionFlow) assert.ok(brief.includes(phase.title));
  assert.ok(brief.includes(exercise.title));
  assert.ok(brief.includes("datos ficticios"));
  assert.ok(brief.includes("SYNTHESIA"));
  assert.ok(!brief.includes(exercise.solution));
  assert.ok(!brief.includes("respuestas del estudiante"));
});

test("el briefing sigue siendo válido cuando una práctica no tiene solución ni escenario", () => {
  const brief = buildVideoBrief({ module, exercise: { id: "ejemplo", title: "Actividad breve", intro: "Practica el concepto." } });
  assert.ok(brief.includes("Actividad breve"));
  assert.ok(brief.includes("Practica el concepto."));
  assert.ok(!brief.includes("undefined"));
});

test("solo acepta un iframe aprobado del reproductor oficial de Synthesia", () => {
  const entry = { approved: true, embedUrl: "https://share.synthesia.io/embeds/videos/123e4567-e89b-12d3-a456-426614174000?language=es", title: "Sesión 1" };
  assert.equal(getApprovedSynthesiaEmbed(entry), entry.embedUrl);
  assert.equal(getApprovedSynthesiaEmbed({ ...entry, approved: false }), null);
  assert.equal(getApprovedSynthesiaEmbed({ ...entry, embedUrl: "http://share.synthesia.io/embeds/videos/id" }), null);
  assert.equal(getApprovedSynthesiaEmbed({ ...entry, embedUrl: "https://share.synthesia.io.evil.test/embeds/videos/id" }), null);
  assert.equal(getApprovedSynthesiaEmbed({ ...entry, embedUrl: "https://share.synthesia.io/videos/id" }), null);
  assert.equal(getApprovedSynthesiaEmbed({ ...entry, embedUrl: `${entry.embedUrl}&autoplay=1` }), null);
  assert.equal(getApprovedSynthesiaEmbed({ ...entry, embedUrl: `${entry.embedUrl.split("?")[0]}?language=en` }), null);
  assert.equal(getApprovedSynthesiaEmbed(null), null);
});

test("resuelve videos por módulo y por tarea, pero oculta entradas no aprobadas o inválidas", () => {
  const catalog = {
    modules: { "modulo-01": { approved: true, embedUrl: "https://share.synthesia.io/embeds/videos/mod-1", title: "Sesión 1" } },
    exercises: { prompt: { approved: false, embedUrl: "https://share.synthesia.io/embeds/videos/task-1", title: "Práctica" } },
  };
  assert.equal(resolveCourseVideo("module", "modulo-01", catalog)?.title, "Sesión 1");
  assert.equal(resolveCourseVideo("exercise", "prompt", catalog), null);
  assert.equal(resolveCourseVideo("module", "desconocido", catalog), null);
  assert.equal(resolveCourseVideo("arbitrary", "modulo-01", catalog), null);
});
