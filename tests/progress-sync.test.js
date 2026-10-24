import test from "node:test";
import assert from "node:assert/strict";
import { chooseNewestProgress, extractRemoteProgress } from "../src/progress-sync.js";

test("elige el progreso remoto cuando tiene una marca temporal más reciente", () => {
  const local = { completedModules: ["modulo-01"], updatedAt: "2026-10-24T00:00:00.000Z" };
  const remote = extractRemoteProgress({ progress_data: { completedModules: ["modulo-02"] }, updated_at: "2026-10-24T00:01:00.000Z" });
  const result = chooseNewestProgress(local, remote);
  assert.equal(result.source, "remote");
  assert.deepEqual(result.progress.completedModules, ["modulo-02"]);
});

test("conserva el progreso local más reciente para subirlo a la cuenta", () => {
  const local = { completedExercises: ["prompt"], updatedAt: "2026-10-24T00:02:00.000Z" };
  const remote = { completedExercises: [], updatedAt: "2026-10-24T00:01:00.000Z" };
  const result = chooseNewestProgress(local, remote);
  assert.equal(result.source, "local");
  assert.deepEqual(result.progress.completedExercises, ["prompt"]);
});

test("normaliza una fila remota incompleta sin aceptar IDs desconocidos", () => {
  const remote = extractRemoteProgress({ progress_data: { completedModules: ["ghost"], coursePhaseIndex: 99 }, updated_at: "2026-10-24T00:01:00.000Z" });
  assert.deepEqual(remote.completedModules, []);
  assert.equal(remote.coursePhaseIndex, 4);
  assert.equal(remote.updatedAt, "2026-10-24T00:01:00.000Z");
});
