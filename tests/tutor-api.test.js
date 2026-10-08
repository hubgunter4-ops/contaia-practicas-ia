import test from "node:test";
import assert from "node:assert/strict";
import { configuredProviders, validateTutorInput } from "../src/tutor/server.js";

const providerEnv = {
  OPENAI_API_KEY: "secret-openai-test",
  OPENAI_MODEL: "model-test",
  ANTHROPIC_API_KEY: "secret-anthropic-test",
  ANTHROPIC_MODEL: "claude-test",
  AI_PROVIDER_DEFAULT: "anthropic",
};

test("la configuración publica proveedores y modelos, nunca claves", () => {
  const config = configuredProviders(providerEnv);
  assert.deepEqual(config.providers.map(({ id }) => id), ["openai", "anthropic"]);
  assert.equal(config.defaultProvider, "anthropic");
  assert.equal(JSON.stringify(config).includes("secret-"), false);
});

test("sin credenciales no ofrece un modo local de demostración", () => {
  const config = configuredProviders({});
  assert.deepEqual(config, { providers: [], defaultProvider: "" });
});

test("valida módulo canónico y descarta datos de progreso y notas del navegador", () => {
  const input = validateTutorInput({
    message: "¿Qué significa un prompt?",
    provider: "openai",
    context: { section: "course", moduleId: "modulo-01", progress: "no enviar", notes: "privadas" },
    history: [{ role: "user", content: "Hola" }, { role: "assistant", content: "Hola" }],
  }, providerEnv);
  assert.equal(input.module.id, "modulo-01");
  assert.match(input.module.title, /prompt/i);
  assert.equal(Object.hasOwn(input, "progress"), false);
  assert.equal(Object.hasOwn(input, "notes"), false);
  assert.equal(JSON.stringify(input.module).includes("no enviar"), false);
  assert.equal(input.history.length, 2);
});

test("el contexto de práctica omite la solución hasta autorizar la comparación", () => {
  const attempt = validateTutorInput({
    message: "Necesito ayuda",
    provider: "openai",
    context: { section: "lab", exerciseId: "prompt", stage: "attempt" },
  }, providerEnv);
  assert.ok(attempt.exercise.question);
  assert.equal(Object.hasOwn(attempt.exercise, "solution"), false);
  const comparison = validateTutorInput({
    message: "Quiero comparar",
    provider: "openai",
    context: { section: "lab", exerciseId: "prompt", stage: "compare" },
  }, providerEnv);
  assert.ok(comparison.exercise.solution);
});

test("rechaza mensajes fuera de límites, IDs inválidos y proveedores no configurados", () => {
  assert.throws(() => validateTutorInput({ message: "  " }, providerEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "x".repeat(2001) }, providerEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "hola", context: { section: "course", moduleId: "bogus" } }, providerEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "hola", provider: "openai", context: { section: "lab", exerciseId: "missing" } }, providerEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "hola", provider: "anthropic", context: { section: "course", moduleId: "modulo-01" } }, { OPENAI_API_KEY: "x", OPENAI_MODEL: "m" }), { status: 503 });
});

test("acota y sanea el historial antes de enviarlo al proveedor", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: String(index).repeat(1500) }));
  const input = validateTutorInput({ message: "siguiente", provider: "openai", context: { section: "course", moduleId: "modulo-02" }, history }, providerEnv);
  assert.equal(input.history.length, 8);
  assert.ok(input.history.every((turn) => turn.content.length <= 1200));
});
