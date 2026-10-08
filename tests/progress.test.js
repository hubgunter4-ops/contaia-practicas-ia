import test from "node:test";
import assert from "node:assert/strict";
import { courseModules } from "../src/course.js";
import { exercises } from "../src/exercises.js";
import { createPortfolioMarkdown, loadProgress, PROGRESS_STORAGE_KEY, saveProgress } from "../src/progress.js";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) { return key === PROGRESS_STORAGE_KEY ? value : null; },
    setItem(key, next) { if (key === PROGRESS_STORAGE_KEY) value = next; },
  };
}

test("guarda y recupera solo módulos y prácticas completados", () => {
  const storage = memoryStorage();
  const progress = { completedModules: ["modulo-01"], completedExercises: ["prompt"] };
  assert.equal(saveProgress(progress, storage), true);
  assert.deepEqual(loadProgress(storage), progress);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY))), ["completedModules", "completedExercises"]);
});

test("elimina IDs desconocidos y duplicados al guardar y leer", () => {
  const storage = memoryStorage();
  assert.equal(saveProgress({ completedModules: ["modulo-01", "ghost", "modulo-01"], completedExercises: ["prompt", "ghost"] }, storage), true);
  assert.deepEqual(loadProgress(storage), { completedModules: ["modulo-01"], completedExercises: ["prompt"] });
});

test("JSON corrupto produce progreso vacío y no detiene la aplicación", () => {
  assert.deepEqual(loadProgress(memoryStorage("{")), { completedModules: [], completedExercises: [] });
});

test("un almacenamiento que lanza errores falla de forma controlada", () => {
  const broken = { getItem() { throw new Error("sin acceso"); }, setItem() { throw new Error("sin espacio"); } };
  assert.deepEqual(loadProgress(broken), { completedModules: [], completedExercises: [] });
  assert.equal(saveProgress({ completedModules: ["modulo-01"], completedExercises: [] }, broken), false);
});

test("el portafolio incluye estados e IDs válidos, pero excluye texto y selecciones", () => {
  const privateText = "RESPUESTA_PRIVADA_NO_EXPORTAR";
  const markdown = createPortfolioMarkdown({
    completedModules: ["modulo-01", "unknown"],
    completedExercises: ["prompt"],
    answers: { prompt: privateText },
    selections: { isr: "opcion-privada" },
  }, courseModules, exercises, "2026-10-07T12:00:00.000Z");

  assert.match(markdown, /\[x\] Módulo 1: Fundamentos de IA y criterio profesional/);
  assert.match(markdown, /\[x\] Redacta un prompt contable útil/);
  assert.match(markdown, /1 de 10 módulos/);
  assert.doesNotMatch(markdown, new RegExp(privateText));
  assert.doesNotMatch(markdown, /opcion-privada/);
});
