import test from "node:test";
import assert from "node:assert/strict";
import { renderToolsPanel, TOOL_DEFINITIONS } from "../src/tools/panel.js";

test("el panel ofrece las herramientas fiscales con estados explícitos", () => {
  assert.equal(TOOL_DEFINITIONS.length, 5);
  assert.equal(TOOL_DEFINITIONS.find((tool) => tool.id === "cfdi")?.status, "available");
  assert.equal(TOOL_DEFINITIONS.filter((tool) => tool.status !== "available").length, 4);
});

test("el panel renderiza el perfil fiscal, las tarjetas y el aviso de control", () => {
  const html = renderToolsPanel({ notice: "Configura tu empresa" });
  assert.match(html, /Centro operativo/);
  assert.match(html, /Perfil fiscal/);
  assert.match(html, /CFDI 4\.0/);
  assert.match(html, /Monitor fiscal/);
  assert.match(html, /Configura tu empresa/);
  assert.match(html, /data-tool-action="cfdi"/);
});

test("el panel lista perfiles por cuenta y oculta parcialmente el RFC", () => {
  const html = renderToolsPanel({ workspace: {
    profiles: [
      { id: "profile-1", legal_name: "ContaIA Uno", rfc: "CID010101AB1", tax_regime: "601", active: true },
      { id: "profile-2", legal_name: "ContaIA Dos", rfc: "AAA010101AAA", active: true },
    ],
    selectedProfileId: "profile-1", connections: [], loaded: true,
  } });
  assert.match(html, /CID••••••AB1/);
  assert.doesNotMatch(html, /CID010101AB1/);
  assert.match(html, /data-tools-profile-select/);
  assert.match(html, /data-tools-ui="profile-edit"/);
  assert.match(html, /Conexiones por perfil/);
});

test("los formularios explican el tratamiento del perfil y las conexiones pendientes", () => {
  const profileHtml = renderToolsPanel({ workspace: { profileForm: {}, profiles: [], connections: [] } });
  assert.match(profileHtml, /data-tools-profile-form/);
  assert.match(profileHtml, /name="rfc"/);
  assert.match(profileHtml, /No ingreses contraseñas, e\.firma, CSD/);
  assert.match(profileHtml, /name="acknowledge" required/);

  const connectionHtml = renderToolsPanel({ workspace: {
    connectionForm: { tool_key: "accounting" }, selectedProfileId: "profile-1", connections: [], profiles: [],
  } });
  assert.match(connectionHtml, /data-tools-connection-form/);
  assert.match(connectionHtml, /No configura ni verifica una integración/);
});


test("cada herramienta muestra un SVG propio con nombre accesible", () => {
  const html = renderToolsPanel();
  const iconIds = [...html.matchAll(/class="tools-ui-icon tools-ui-icon--([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(iconIds, ["cfdi", "accounting", "payroll", "diot", "monitor"]);
  assert.equal(new Set(iconIds).size, 5);
  assert.equal((html.match(/class="tools-card-icon" role="img" aria-label=/g) || []).length, 5);
});


test("cada herramienta distingue los cinco estados de conexión por ambiente", () => {
  const html = renderToolsPanel({ workspace: {
    selectedProfileId: "profile-1",
    connections: [
      { tool_key: "cfdi", environment: "sandbox", status: "pending" },
      { tool_key: "accounting", environment: "production", status: "connected" },
      { tool_key: "payroll", environment: "sandbox", status: "degraded" },
      { tool_key: "diot", environment: "production", status: "error" },
    ],
  } });
  const expectedStates = [
    ["not_configured", "is-not-configured", "Sin configurar"],
    ["pending", "is-pending", "Pendiente"],
    ["connected", "is-connected", "Conectada"],
    ["requires_review", "is-review", "Requiere revisión"],
    ["error", "is-error", "Error"],
  ];
  for (const [key, className, label] of expectedStates) {
    assert.ok(html.includes(`data-connection-status="${key}"`), `falta estado ${key}`);
    assert.ok(html.includes(`tools-connection-status ${className}`), `falta estilo ${className}`);
    assert.ok(html.includes(label), `falta etiqueta ${label}`);
  }

  const cards = html.match(/<article class="tools-card[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, TOOL_DEFINITIONS.length);
  for (const card of cards) {
    assert.match(card, /ESTADO DE INTEGRACIÓN/);
    assert.equal((card.match(/class="tools-connection-status /g) || []).length, 2);
    assert.match(card, /data-environment="sandbox"/);
    assert.match(card, /data-environment="production"/);
  }
  assert.equal((html.match(/class="tools-connection-row" data-tool-key=/g) || []).length, 10);
});
