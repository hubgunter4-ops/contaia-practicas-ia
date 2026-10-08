import test from "node:test";
import assert from "node:assert/strict";
import { requestTutorReply, loadTutorConfig } from "../src/tutor/api.js";

const sse = (frames) => new Response(new ReadableStream({
  start(controller) {
    for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
    controller.close();
  },
}), { headers: { "content-type": "text/event-stream" } });

const event = (name, payload) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;

test("el cliente transmite fragmentos SSE y devuelve la respuesta completa", async () => {
  const tokens = [];
  const reply = await requestTutorReply({
    message: "¿Por dónde empiezo?",
    context: { section: "course", moduleId: "modulo-01" },
    provider: "openai",
    onToken: (token) => tokens.push(token),
    fetchImpl: async () => sse([event("token", { text: "Primero " }), event("token", { text: "observa." }), event("done", {})]),
  });
  assert.equal(reply, "Primero observa.");
  assert.deepEqual(tokens, ["Primero ", "observa."]);
});

test("el cliente informa errores de API y no genera respuestas locales de sustitución", async () => {
  await assert.rejects(
    requestTutorReply({ message: "hola", context: { section: "course", moduleId: "modulo-01" }, fetchImpl: async () => new Response(JSON.stringify({ error: "IA sin configurar" }), { status: 503, headers: { "content-type": "application/json" } }) }),
    /IA sin configurar/
  );
  await assert.rejects(
    requestTutorReply({ message: "hola", context: { section: "course", moduleId: "modulo-01" }, fetchImpl: async () => sse([event("error", { error: "flujo interrumpido" })]) }),
    /flujo interrumpido/
  );
});

test("la configuración solo muestra proveedores habilitados", async () => {
  const config = await loadTutorConfig({
    fetchImpl: async () => new Response(JSON.stringify({ providers: [{ id: "openai", label: "OpenAI", model: "model-x" }], defaultProvider: "openai" }), { headers: { "content-type": "application/json" } }),
  });
  assert.equal(config.defaultProvider, "openai");
  assert.equal(config.providers.length, 1);
});
