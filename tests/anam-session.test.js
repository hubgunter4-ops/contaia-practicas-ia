import test from "node:test";
import assert from "node:assert/strict";
import { handleAnamSession } from "../src/tutor/anam-session.js";

const env = {
  ANAM_API_KEY: "server-only-test-key",
  ANAM_AVATAR_ID: "123e4567-e89b-42d3-a456-426614174000",
  ANAM_VOICE_ID: "223e4567-e89b-42d3-a456-426614174000",
};

function request({ method = "POST", ip = "192.0.2.70", origin = "https://contaia.example" } = {}) {
  return {
    method,
    headers: { host: "contaia.example", origin, "x-forwarded-proto": "https", "x-forwarded-for": ip },
    socket: {},
  };
}

function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(body = "") { this.body = body; },
  };
}

test("devuelve únicamente el token temporal y crea la sesión Custom LLM con config de servidor", async () => {
  let outbound;
  const res = response();
  await handleAnamSession(request({ ip: "192.0.2.71" }), res, {
    env,
    fetchImpl: async (url, init) => {
      outbound = { url, init };
      return { ok: true, json: async () => ({ sessionToken: "short-lived-test-token", expiresIn: 3600 }) };
    },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { sessionToken: "short-lived-test-token" });
  assert.equal(res.headers["Cache-Control"], "no-store, private");
  assert.equal(outbound.url, "https://api.anam.ai/v1/auth/session-token");
  assert.equal(outbound.init.headers.Authorization, `Bearer ${env.ANAM_API_KEY}`);
  assert.deepEqual(JSON.parse(outbound.init.body), {
    personaConfig: {
      name: "Nora",
      avatarId: env.ANAM_AVATAR_ID,
      voiceId: env.ANAM_VOICE_ID,
      llmId: "CUSTOMER_CLIENT_V1",
      languageCode: "es",
      skipGreeting: true,
    },
    sessionOptions: { sessionReplay: { enableSessionReplay: false } },
  });
});

test("no revela credenciales cuando falta la configuración del servidor", async () => {
  const res = response();
  await handleAnamSession(request({ ip: "192.0.2.72" }), res, { env: {} });
  assert.equal(res.status, 503);
  assert.doesNotMatch(res.body, /server-only-test-key|ANAM_API_KEY/);
});

test("rechaza otros orígenes y métodos sin llamar a Anam", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("No debe llamarse"); };
  const denied = response();
  await handleAnamSession(request({ ip: "192.0.2.73", origin: "https://attacker.example" }), denied, { env, fetchImpl });
  assert.equal(denied.status, 403);
  const method = response();
  await handleAnamSession(request({ method: "GET", ip: "192.0.2.74" }), method, { env, fetchImpl });
  assert.equal(method.status, 405);
  assert.equal(calls, 0);
});

test("oculta el error upstream de Anam y su cuerpo", async () => {
  const res = response();
  await handleAnamSession(request({ ip: "192.0.2.75" }), res, {
    env,
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => "secret provider detail" }),
  });
  assert.equal(res.status, 502);
  assert.doesNotMatch(res.body, /secret provider detail|server-only-test-key/);
});
