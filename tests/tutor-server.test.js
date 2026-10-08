import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { handleTutorConfig, handleTutorStream } from "../src/tutor/server.js";
import { exercises } from "../src/exercises.js";

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.statusCode = 0;
    this.chunks = [];
    this.headersSent = false;
    this.writableEnded = false;
    this.destroyed = false;
  }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value));
    this.headersSent = true;
  }
  flushHeaders() { this.headersSent = true; }
  write(chunk) { this.chunks.push(String(chunk)); return true; }
  end(chunk = "") { if (chunk) this.chunks.push(String(chunk)); this.writableEnded = true; }
  get body() { return this.chunks.join(""); }
}

function request(body, { method = "POST", origin, ip = "127.0.0.2" } = {}) {
  return { method, body, headers: { ...(origin ? { origin } : {}) }, socket: { remoteAddress: ip } };
}

const openAiEnv = {
  AI_PROVIDER_DEFAULT: "openai",
  OPENAI_API_KEY: "test-secret-never-return-this",
  OPENAI_MODEL: "gpt-test",
};

const chunkedReply = () => new Response([
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hola, " })}\n\n`,
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "soy Nora." })}\n\n`,
  `data: ${JSON.stringify({ type: "response.completed" })}\n\n`,
].join(""), { headers: { "content-type": "text/event-stream" } });

test("GET config publica el proveedor permitido, pero nunca su clave", async () => {
  const response = new MockResponse();
  await handleTutorConfig(request(undefined, { method: "GET" }), response, openAiEnv);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { providers: [{ id: "openai", label: "OpenAI", model: "gpt-test" }], defaultProvider: "openai" });
  assert.equal(response.body.includes("test-secret"), false);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("POST stream transmite SSE y solo reenvía mensaje, historial y contexto canónico permitido", async () => {
  let providerRequest;
  const response = new MockResponse();
  const body = {
    provider: "openai",
    message: "¿Cómo entiendo este caso?",
    context: { section: "lab", moduleId: "modulo-09", exerciseId: "isr", stage: "hint" },
    history: [{ role: "user", content: "Primera pregunta" }],
    progress: ["modulo-01"],
    privateNotes: "no reenviar",
    writtenAnswer: "no reenviar",
  };
  await handleTutorStream(request(body), response, {
    env: openAiEnv,
    fetchImpl: async (_url, options) => { providerRequest = options; return chunkedReply(); },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/event-stream/);
  assert.match(response.body, /"text":"Hola, "/);
  assert.match(response.body, /"text":"soy Nora\."/);
  assert.match(response.body, /event: done/);
  assert.equal(response.body.includes("test-secret"), false);
  assert.equal(providerRequest.headers.Authorization, `Bearer ${openAiEnv.OPENAI_API_KEY}`);
  const providerBody = JSON.parse(providerRequest.body);
  assert.equal(providerBody.model, "gpt-test");
  assert.equal(JSON.stringify(providerBody).includes("no reenviar"), false);
  const exercise = exercises.find(({ id }) => id === "isr");
  assert.equal(JSON.stringify(providerBody).includes(exercise.explanation), false, "la explicación permanece oculta antes de comparar");
  assert.ok(JSON.stringify(providerBody).includes("Primera pregunta"));
});

test("rechaza un origen fuera de la lista antes de llamar al proveedor", async () => {
  const response = new MockResponse();
  let called = false;
  await handleTutorStream(request({ message: "hola", context: { section: "course", moduleId: "modulo-01" } }, { origin: "https://malicioso.example", ip: "127.0.0.3" }), response, {
    env: { ...openAiEnv, TUTOR_ALLOWED_ORIGINS: "https://contaia.example" },
    fetchImpl: async () => { called = true; return chunkedReply(); },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(called, false);
  assert.match(response.body, /Origen no autorizado/);
});

test("si el proveedor responde con error, devuelve un mensaje genérico sin exponer su cuerpo", async () => {
  const response = new MockResponse();
  await handleTutorStream(request({ message: "hola", context: { section: "course", moduleId: "modulo-01" } }, { ip: "127.0.0.4" }), response, {
    env: openAiEnv,
    fetchImpl: async () => new Response("secret provider diagnostic", { status: 429 }),
  });
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.includes("secret provider diagnostic"), false);
  assert.equal(response.body.includes("test-secret"), false);
});
