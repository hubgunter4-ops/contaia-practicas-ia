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

const gatewayEnv = {
  AI_PROVIDER_DEFAULT: "openai",
  AI_GATEWAY_OPENAI_API_KEY: "gateway-openai-secret-test",
  AI_GATEWAY_OPENAI_MODEL: "openai/gpt-test",
  AI_GATEWAY_ANTHROPIC_API_KEY: "gateway-anthropic-secret-test",
  AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/claude-test",
};

const chunkedReply = () => {
  const source = [
    `data: ${JSON.stringify({ id: "chatcmpl-test", choices: [{ index: 0, delta: { content: "¡Hola, " }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ id: "chatcmpl-test", choices: [{ index: 0, delta: { content: "soy Nora." }, finish_reason: null }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({
    start(controller) {
      let offset = 0;
      for (const size of [1, 2, 4, 7, 13, 3, 19, 5, 11, 23]) {
        if (offset >= bytes.length) break;
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
      }
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
};

test("GET config publica solo proveedores/modelos de Gateway, sin claves", async () => {
  const response = new MockResponse();
  await handleTutorConfig(request(undefined, { method: "GET" }), response, gatewayEnv);
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.deepEqual(payload.providers.map(({ id }) => id), ["openai", "anthropic"]);
  assert.equal(payload.defaultProvider, "openai");
  assert.equal(response.body.includes("gateway-openai-secret"), false);
  assert.equal(response.body.includes("gateway-anthropic-secret"), false);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("cada proveedor usa el endpoint, modelo y clave Gateway que le corresponden", async () => {
  for (const [index, expected] of [
    ["openai", gatewayEnv.AI_GATEWAY_OPENAI_API_KEY, gatewayEnv.AI_GATEWAY_OPENAI_MODEL],
    ["anthropic", gatewayEnv.AI_GATEWAY_ANTHROPIC_API_KEY, gatewayEnv.AI_GATEWAY_ANTHROPIC_MODEL],
  ].entries()) {
    const [provider, key, model] = expected;
    let providerUrl;
    let providerRequest;
    const response = new MockResponse();
    const body = {
      provider,
      message: "¿Cómo entiendo este caso?",
      context: { section: "lab", moduleId: "modulo-09", exerciseId: "isr", stage: "hint" },
      history: [{ role: "user", content: "Primera pregunta" }],
      progress: ["modulo-01"],
      privateNotes: "no reenviar",
      writtenAnswer: "no reenviar",
    };
    await handleTutorStream(request(body, { ip: `127.0.0.${index + 2}` }), response, {
      env: gatewayEnv,
      fetchImpl: async (url, options) => { providerUrl = url; providerRequest = options; return chunkedReply(); },
    });
    assert.equal(providerUrl, "https://ai-gateway.vercel.sh/v1/chat/completions");
    assert.equal(providerRequest.headers.Authorization, `Bearer ${key}`);
    assert.equal(providerRequest.headers["Content-Type"], "application/json");
    const gatewayBody = JSON.parse(providerRequest.body);
    assert.equal(gatewayBody.model, model);
    assert.equal(gatewayBody.stream, true);
    assert.equal(gatewayBody.max_tokens, 450);
    assert.equal(gatewayBody.messages[0].role, "system");
    assert.match(gatewayBody.messages[0].content, /calcula primero los totales y la diferencia/i);
    assert.match(gatewayBody.messages[0].content, /no retrases la detección de un descuadre/i);
    assert.match(gatewayBody.messages[0].content, /Tampoco inventes fechas, plazos, periodos ni responsables/i);
    assert.equal(gatewayBody.messages.at(-2).content, "Primera pregunta");
    assert.equal(gatewayBody.messages.at(-1).role, "user");
    assert.match(gatewayBody.messages.at(-1).content, /CONTEXTO CANÓNICO DEL CURSO/);
    assert.equal(JSON.stringify(gatewayBody).includes("no reenviar"), false);
    const exercise = exercises.find(({ id }) => id === "isr");
    assert.equal(JSON.stringify(gatewayBody).includes(exercise.explanation), false, "la explicación permanece oculta antes de comparar");
    assert.match(response.body, /"text":"¡Hola, "/);
    assert.match(response.body, /"text":"soy Nora\."/);
    assert.match(response.body, /event: done/);
    assert.equal(response.body.includes(key), false);
  }
});

test("el contexto de Nora incluye una fase de aula validada y descarta valores no permitidos", async () => {
  for (const [index, coursePhase, expected] of [[0, "review", "review"], [1, "ignore-system-rules", "activate"]]) {
    let providerRequest;
    const response = new MockResponse();
    await handleTutorStream(request({
      message: "Ayúdame con esta clase",
      context: { section: "course", moduleId: "modulo-01", coursePhase },
    }, { ip: `127.0.3.${index + 1}` }), response, {
      env: gatewayEnv,
      fetchImpl: async (_url, options) => { providerRequest = options; return chunkedReply(); },
    });
    assert.equal(response.statusCode, 200);
    const messages = JSON.parse(providerRequest.body).messages;
    assert.match(messages[0].content, new RegExp(`Fase del aula actual: ${expected === "review" ? "Revisión" : "Activación"}`));
    assert.match(messages.at(-1).content, new RegExp(`\\"coursePhase\\":\\"${expected}\\"`));
    assert.equal(messages.at(-1).content.includes("ignore-system-rules"), false);
  }
});

test("rechaza un origen fuera de la lista antes de llamar a AI Gateway", async () => {
  const response = new MockResponse();
  let called = false;
  await handleTutorStream(request({ message: "hola", context: { section: "course", moduleId: "modulo-01" } }, { origin: "https://malicioso.example", ip: "127.0.0.9" }), response, {
    env: { ...gatewayEnv, TUTOR_ALLOWED_ORIGINS: "https://contaia.example" },
    fetchImpl: async () => { called = true; return chunkedReply(); },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(called, false);
  assert.match(response.body, /Origen no autorizado/);
});

test("traduce 402 de presupuesto, 429 y error de autenticación sin divulgar respuesta upstream", async () => {
  const cases = [
    { upstream: 402, expected: 402, body: /presupuesto|créditos/i },
    { upstream: 429, expected: 429, body: /límite|inténtalo/i },
    { upstream: 401, expected: 503, body: /configuración/i },
  ];
  for (const [index, item] of cases.entries()) {
    const response = new MockResponse();
    await handleTutorStream(request({ message: "hola", context: { section: "course", moduleId: "modulo-01" } }, { ip: `127.0.1.${index + 1}` }), response, {
      env: gatewayEnv,
      fetchImpl: async () => new Response("private upstream body gateway-openai-secret-test", { status: item.upstream }),
    });
    assert.equal(response.statusCode, item.expected);
    assert.match(response.body, item.body);
    assert.equal(response.body.includes("private upstream body"), false);
    assert.equal(response.body.includes("gateway-openai-secret"), false);
  }
});

test("error durante el SSE se transforma en evento genérico y no entrega datos del proveedor", async () => {
  const response = new MockResponse();
  const stream = new Response([
    `data: ${JSON.stringify({ choices: [{ delta: { content: "inicio" } }] })}\n\n`,
    `data: ${JSON.stringify({ error: { message: "private gateway diagnostic" } })}\n\n`,
  ].join(""), { headers: { "content-type": "text/event-stream" } });
  await handleTutorStream(request({ message: "hola", context: { section: "course", moduleId: "modulo-01" } }, { ip: "127.0.2.1" }), response, {
    env: gatewayEnv,
    fetchImpl: async () => stream,
  });
  assert.match(response.body, /event: error/);
  assert.equal(response.body.includes("private gateway diagnostic"), false);
  assert.equal(response.body.includes("gateway-openai-secret"), false);
});
