import test from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, findGlossaryEntry } from "../src/glossary.js";
import { courseModules } from "../src/course.js";

test("el glosario cubre todos los conceptos que aparecen en los módulos", () => {
  const terms = new Set(GLOSSARY.map((entry) => entry.term));
  const moduleTerms = new Set(courseModules.flatMap((module) => module.teachFirst.concepts.map(([term]) => term)));
  for (const term of moduleTerms) assert.ok(terms.has(term), `falta la definición de ${term}`);
  assert.equal(terms.size, GLOSSARY.length);
});

test("cada entrada del glosario explica, ejemplifica y propone una comprobación", () => {
  for (const entry of GLOSSARY) {
    assert.ok(entry.term && entry.definition && entry.example && entry.check);
    assert.ok(findGlossaryEntry(entry.term) === entry);
  }
});

test("el término Prompt tiene contexto para principiantes", () => {
  const prompt = findGlossaryEntry("Prompt");
  assert.match(prompt.definition, /instrucción|petición/i);
  assert.match(prompt.example, /analiza|datos/i);
  assert.match(prompt.check, /tarea|contexto|resultado/i);
});
