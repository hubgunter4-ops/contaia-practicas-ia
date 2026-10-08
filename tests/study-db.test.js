import assert from "node:assert/strict";
import test from "node:test";
import { createStudyItems, sanitizeStudyNote, searchStudyItems } from "../src/study-db.js";
import { KNOWLEDGE_ITEMS } from "../src/knowledge-data.js";

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

test("integra conocimiento externo con procedencia y sin instrucciones activas", () => {
  assert.equal(KNOWLEDGE_ITEMS.length, 956);
  assert.equal(KNOWLEDGE_ITEMS.filter((item) => item.id.includes("llm-eval-contable")).length, 50);
  assert.equal(KNOWLEDGE_ITEMS.filter((item) => item.id.includes("ai-prompt-database")).length, 3);
  assert.equal(KNOWLEDGE_ITEMS.filter((item) => item.id.includes("contaduria-mx")).length, 903);
  assert.ok(KNOWLEDGE_ITEMS.every((item) => item.kind === "knowledge" && item.source?.license && item.destination?.url.startsWith("https://")));
  assert.ok(KNOWLEDGE_ITEMS.every((item) => !/ignore\s+(all|previous)|system\s+message|javascript\s*:|<\s*script/i.test(`${item.title} ${item.summary} ${item.body}`)));
  const items = createStudyItems({ knowledge: KNOWLEDGE_ITEMS });
  assert.equal(items.length, KNOWLEDGE_ITEMS.length);
  assert.equal(searchStudyItems(items, "México", "knowledge").length, 903);
});
