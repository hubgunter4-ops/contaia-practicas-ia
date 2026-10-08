import test from "node:test";
import assert from "node:assert/strict";
import { configuredProviders, validateTutorInput } from "../src/tutor/server.js";

const gatewayEnv = {
  AI_GATEWAY_OPENAI_API_KEY: "gateway-openai-secret-test",
  AI_GATEWAY_OPENAI_MODEL: "openai/gpt-test",
  AI_GATEWAY_ANTHROPIC_API_KEY: "gateway-anthropic-secret-test",
  AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/claude-test",
  AI_PROVIDER_DEFAULT: "anthropic",
};

test("la configuración publica OpenAI y Anthropic de Gateway, pero nunca claves", () => {
  const config = configuredProviders(gatewayEnv);
  assert.deepEqual(config, {
    providers: [
      { id: "openai", label: "OpenAI", model: "openai/gpt-test" },
      { id: "anthropic", label: "Claude", model: "anthropic/claude-test" },
    ],
    defaultProvider: "anthropic",
  });
  assert.equal(JSON.stringify(config).includes("gateway-"), false);
});

test("sin claves Gateway no ofrece proveedores ni un modo local", () => {
  assert.deepEqual(configuredProviders({}), { providers: [], defaultProvider: "" });
});

test("las claves directas de los proveedores ya no habilitan el tutor", () => {
  assert.deepEqual(configuredProviders({
    OPENAI_API_KEY: "direct-openai-key",
    OPENAI_MODEL: "openai/gpt-test",
    ANTHROPIC_API_KEY: "direct-anthropic-key",
    ANTHROPIC_MODEL: "anthropic/claude-test",
  }), { providers: [], defaultProvider: "" });
});

test("solo habilita modelos con el prefijo del proveedor que les corresponde", () => {
  const config = configuredProviders({
    AI_GATEWAY_OPENAI_API_KEY: "openai-key",
    AI_GATEWAY_OPENAI_MODEL: "anthropic/claude-test",
    AI_GATEWAY_ANTHROPIC_API_KEY: "anthropic-key",
    AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/claude-test",
    AI_PROVIDER_DEFAULT: "openai",
  });
  assert.deepEqual(config.providers, [{ id: "anthropic", label: "Claude", model: "anthropic/claude-test" }]);
  assert.equal(config.defaultProvider, "anthropic");
});

test("valida módulo canónico y descarta progreso y notas del navegador", () => {
  const input = validateTutorInput({
    message: "¿Qué significa un prompt?",
    provider: "openai",
    context: { section: "course", moduleId: "modulo-01", progress: "no enviar", notes: "privadas" },
    history: [{ role: "user", content: "Hola" }, { role: "assistant", content: "Hola" }],
  }, gatewayEnv);
  assert.equal(input.module.id, "modulo-01");
  assert.match(input.module.title, /prompt/i);
  assert.equal(Object.hasOwn(input, "progress"), false);
  assert.equal(Object.hasOwn(input, "notes"), false);
  assert.equal(JSON.stringify(input.module).includes("no enviar"), false);
  assert.equal(input.history.length, 2);
});

test("la solución de práctica solo se incorpora en la etapa de comparación", () => {
  const attempt = validateTutorInput({
    message: "Necesito ayuda",
    provider: "openai",
    context: { section: "lab", exerciseId: "prompt", stage: "attempt" },
  }, gatewayEnv);
  assert.ok(attempt.exercise.question);
  assert.equal(Object.hasOwn(attempt.exercise, "solution"), false);
  const comparison = validateTutorInput({
    message: "Quiero comparar",
    provider: "openai",
    context: { section: "lab", exerciseId: "prompt", stage: "compare" },
  }, gatewayEnv);
  assert.ok(comparison.exercise.solution);
});

test("rechaza mensajes fuera de límites, IDs inválidos y rutas sin clave Gateway", () => {
  assert.throws(() => validateTutorInput({ message: "  " }, gatewayEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "x".repeat(2001) }, gatewayEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "hola", context: { section: "course", moduleId: "bogus" } }, gatewayEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "hola", provider: "openai", context: { section: "lab", exerciseId: "missing" } }, gatewayEnv), { status: 400 });
  assert.throws(() => validateTutorInput({ message: "hola", provider: "openai", context: { section: "course", moduleId: "modulo-01" } }, {
    AI_GATEWAY_ANTHROPIC_API_KEY: "only-anthropic",
    AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/claude-test",
  }), { status: 503 });
});

test("acota y sanea el historial antes de enviarlo a AI Gateway", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: String(index).repeat(1500) }));
  const input = validateTutorInput({ message: "siguiente", provider: "openai", context: { section: "course", moduleId: "modulo-02" }, history }, gatewayEnv);
  assert.equal(input.history.length, 8);
  assert.ok(input.history.every((turn) => turn.content.length <= 1200));
});
