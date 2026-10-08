import assert from "node:assert/strict";
import test from "node:test";
import { createStudyItems, sanitizeStudyNote, searchStudyItems } from "../src/study-db.js";

const catalog = {
  modules: [{ id: "modulo-01", week: 1, title: "Qué es la IA", focus: "Fundamentos de IA", outcome: "Explicar un prompt", guide: { opening: "Aprende primero." } }],
  exercises: [{ id: "prompt", category: "Fundamentos", kind: "prompt", title: "Redacta un prompt", intro: "Practica prompts", scenario: "Caso ficticio" }],
  glossary: [{ term: "Prompt", definition: "Una instrucción", example: "Pide una tabla", check: "¿Qué falta?" }],
};

test("crea fichas de módulos, prácticas y conceptos con destinos navegables", () => {
  const items = createStudyItems(catalog);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.kind), ["module", "practice", "concept"]);
  assert.deepEqual(items[0].destination, { section: "course", moduleId: "modulo-01" });
  assert.deepEqual(items[1].destination, { section: "lab", exerciseId: "prompt" });
  assert.deepEqual(items[2].destination, { section: "course", glossaryTerm: "Prompt" });
});

test("busca por título, contenido y tipo sin devolver fichas irrelevantes", () => {
  const items = createStudyItems(catalog);
  assert.deepEqual(searchStudyItems(items, "prompt").map((item) => item.id), ["concept:Prompt", "practice:prompt", "module:modulo-01"]);
  assert.deepEqual(searchStudyItems(items, "prompt", "concept").map((item) => item.id), ["concept:Prompt"]);
  assert.equal(searchStudyItems(items, "inexistente").length, 0);
  assert.equal(searchStudyItems(items).length, 3);
});

test("depura notas vacías, limita longitud y valida el elemento de origen", () => {
  const validIds = new Set(["module:modulo-01"]);
  assert.equal(sanitizeStudyNote({ itemId: "module:otro", content: "No" }, validIds), null);
  assert.equal(sanitizeStudyNote({ itemId: "module:modulo-01", content: "   " }, validIds), null);
  const note = sanitizeStudyNote({ itemId: "module:modulo-01", content: "x".repeat(2100), updatedAt: 123 }, validIds);
  assert.equal(note.content.length, 2000);
  assert.equal(note.updatedAt, 123);
  assert.equal(note.id, "note:module:modulo-01");
});
