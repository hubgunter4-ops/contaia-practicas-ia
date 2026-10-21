import test from "node:test";
import assert from "node:assert/strict";
import { loadProfileConnections, loadToolsWorkspace, maskRfc, normalizeFiscalProfile, resetToolsWorkspace, saveToolConnection, toolsWorkspace } from "../src/tools/workspace.js";

test("normaliza el RFC y conserva únicamente los campos permitidos del perfil", () => {
  const profile = normalizeFiscalProfile({
    legal_name: "  ContaIA Demo, S.A. de C.V.  ", rfc: "cid010101ab1", tax_regime: "601",
    fiscal_zip: "01000", fiscal_email: "fiscal@example.com", phone: "5555555555", active: false,
    service_role: "must-be-dropped",
  });
  assert.deepEqual(profile, {
    legal_name: "ContaIA Demo, S.A. de C.V.", rfc: "CID010101AB1", tax_regime: "601",
    fiscal_zip: "01000", fiscal_email: "fiscal@example.com", phone: "5555555555", active: false,
  });
  assert.equal("service_role" in profile, false);
});

test("rechaza formato fiscal inválido antes de llamar a la API", () => {
  assert.throws(() => normalizeFiscalProfile({ legal_name: "Demo", rfc: "INVALIDO" }), /RFC.*formato válido/);
  assert.throws(() => normalizeFiscalProfile({ legal_name: "Demo", rfc: "CID010101AB1", fiscal_zip: "123" }), /código postal.*5 dígitos/);
  assert.throws(() => normalizeFiscalProfile({ legal_name: "Demo", rfc: "CID010101AB1", fiscal_email: "no-es-correo" }), /correo fiscal.*formato válido/);
});

test("muestra el RFC parcialmente oculto", () => {
  assert.equal(maskRfc("CID010101AB1"), "CID••••••AB1");
  assert.equal(maskRfc("AB1"), "RFC protegido");
});

test("normaliza los campos opcionales vacíos para el contrato del servidor", () => {
  const profile = normalizeFiscalProfile({ legal_name: "Demo", rfc: "CID010101AB1", fiscal_zip: "" });
  assert.equal(profile.fiscal_zip, null);
});

test("lee conexiones, alertas y vencimientos con GET autenticados y limitados al perfil", async (t) => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls = [];
  const profileId = "00000000-0000-4000-8000-000000000001";
  const resultByResource = {
    connections: [{ id: "connection-1", status: "pending" }],
    alerts: [{ id: "alert-1", status: "open", title: "No se renderiza en el resumen" }],
    deadlines: [{ id: "deadline-1", status: "pending" }],
  };
  globalThis.window = { __contaiaAuth: { client: { auth: { getSession: async () => ({ data: { session: { access_token: "test-session-token" } }, error: null }) } } } };
  globalThis.fetch = async (input, options) => {
    const url = new URL(input, "https://contaia.test");
    calls.push({ url, options });
    const resource = url.searchParams.get("resource");
    return { ok: true, json: async () => ({ resource, data: resultByResource[resource] }) };
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    Object.assign(toolsWorkspace, {
      profiles: [], connections: [], alerts: [], deadlines: [], selectedProfileId: "", loading: false,
      connectionsLoading: false, signalsLoading: false, signalsError: "", saving: false, loaded: false,
      error: "", notice: "", profileForm: null, connectionForm: null,
    });
  });

  await loadProfileConnections(profileId);

  assert.deepEqual(calls.map(({ url }) => url.searchParams.get("resource")).sort(), ["alerts", "connections", "deadlines"]);
  for (const { url, options } of calls) {
    assert.equal(url.searchParams.get("profileId"), profileId);
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, "Bearer test-session-token");
  }
  assert.deepEqual(toolsWorkspace.connections, resultByResource.connections);
  assert.deepEqual(toolsWorkspace.alerts, resultByResource.alerts);
  assert.deepEqual(toolsWorkspace.deadlines, resultByResource.deadlines);
  assert.equal(toolsWorkspace.signalsLoading, false);
  assert.equal(toolsWorkspace.signalsError, "");
});

test("si falla una lectura de alertas no se presenta un resumen como si estuviera vacío", async (t) => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = { __contaiaAuth: { client: { auth: { getSession: async () => ({ data: { session: { access_token: "test-session-token" } }, error: null }) } } } };
  globalThis.fetch = async (input) => {
    const resource = new URL(input, "https://contaia.test").searchParams.get("resource");
    if (resource === "alerts") return { ok: false, json: async () => ({ error: "No se pudo leer" }) };
    return { ok: true, json: async () => ({ data: [] }) };
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    Object.assign(toolsWorkspace, {
      profiles: [], connections: [], alerts: [], deadlines: [], selectedProfileId: "", loading: false,
      connectionsLoading: false, signalsLoading: false, signalsError: "", saving: false, loaded: false,
      error: "", notice: "", profileForm: null, connectionForm: null,
    });
  });

  await loadProfileConnections("00000000-0000-4000-8000-000000000002");

  assert.match(toolsWorkspace.signalsError, /No se pudieron consultar/);
  assert.equal(toolsWorkspace.signalsLoading, false);
  assert.deepEqual(toolsWorkspace.connections, []);
});

test("resetToolsWorkspace elimina también alertas y vencimientos privados en memoria", () => {
  Object.assign(toolsWorkspace, {
    profiles: [{ id: "profile-1" }], connections: [{ id: "connection-1" }], alerts: [{ id: "alert-1" }],
    deadlines: [{ id: "deadline-1" }], selectedProfileId: "profile-1", signalsLoading: true, signalsError: "error",
  });

  resetToolsWorkspace();

  assert.deepEqual(toolsWorkspace.profiles, []);
  assert.deepEqual(toolsWorkspace.connections, []);
  assert.deepEqual(toolsWorkspace.alerts, []);
  assert.deepEqual(toolsWorkspace.deadlines, []);
  assert.equal(toolsWorkspace.selectedProfileId, "");
  assert.equal(toolsWorkspace.signalsLoading, false);
  assert.equal(toolsWorkspace.signalsError, "");
});

test("una recarga fallida no deja visibles datos privados de un workspace anterior", async (t) => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = { __contaiaAuth: { client: { auth: { getSession: async () => ({ data: { session: { access_token: "test-session-token" } }, error: null }) } } } };
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "No se pudo consultar el perfil" }) });
  Object.assign(toolsWorkspace, {
    profiles: [{ id: "old-profile" }], connections: [{ id: "old-connection" }], alerts: [{ id: "old-alert" }],
    deadlines: [{ id: "old-deadline" }], selectedProfileId: "old-profile", loaded: true,
  });
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    resetToolsWorkspace();
  });

  await loadToolsWorkspace();

  assert.deepEqual(toolsWorkspace.profiles, []);
  assert.deepEqual(toolsWorkspace.connections, []);
  assert.deepEqual(toolsWorkspace.alerts, []);
  assert.deepEqual(toolsWorkspace.deadlines, []);
  assert.equal(toolsWorkspace.selectedProfileId, "");
  assert.equal(toolsWorkspace.loading, false);
  assert.match(toolsWorkspace.error, /No se pudo consultar el perfil/);
});

test("el guardado tardío de una conexión no cambia al perfil que se seleccionó después", async (t) => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const profileA = "00000000-0000-4000-8000-000000000003";
  const profileB = "00000000-0000-4000-8000-000000000004";
  let finishPost;
  let postStarted;
  const started = new Promise((resolve) => { postStarted = resolve; });
  globalThis.window = { __contaiaAuth: { client: { auth: { getSession: async () => ({ data: { session: { access_token: "test-session-token" } }, error: null }) } } } };
  globalThis.fetch = async (_input, options) => {
    assert.equal(options.method, "POST");
    postStarted();
    return new Promise((resolve) => { finishPost = resolve; });
  };
  Object.assign(toolsWorkspace, { selectedProfileId: profileA, connections: [], connectionForm: { tool_key: "accounting", environment: "sandbox" } });
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    resetToolsWorkspace();
  });

  const save = saveToolConnection({ tool_key: "accounting", environment: "sandbox" });
  await started;
  toolsWorkspace.selectedProfileId = profileB;
  finishPost({ ok: true, json: async () => ({ data: { id: "connection-1" } }) });

  assert.equal(await save, true);
  assert.equal(toolsWorkspace.selectedProfileId, profileB);
});
