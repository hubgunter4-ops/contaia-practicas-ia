import test from "node:test";
import assert from "node:assert/strict";
import { renderToolsPanel, TOOL_DEFINITIONS } from "../src/tools/panel.js";

test("el panel ofrece las herramientas fiscales con estados explícitos", () => {
  assert.equal(TOOL_DEFINITIONS.length, 6);
  assert.equal(TOOL_DEFINITIONS.find((tool) => tool.id === "cfdi")?.availability, "ready");
  assert.equal(TOOL_DEFINITIONS.find((tool) => tool.id === "reconciliation")?.availability, "preparation");
  assert.equal(TOOL_DEFINITIONS.filter((tool) => tool.availability !== "ready").length, 5);
  assert.ok(TOOL_DEFINITIONS.every((tool) => tool.description && tool.actionLabel && tool.detail));
});

test("el panel renderiza el perfil fiscal, las tarjetas y el aviso de control", () => {
  const html = renderToolsPanel({ notice: "Configura tu empresa" });
  assert.match(html, /Herramientas fiscales con claridad/);
  assert.match(html, /class="tool-shell-header tools-dashboard-header"/);
  assert.doesNotMatch(html, /class="tool-shell-header tools-hero"/);
  assert.match(html, /Perfil fiscal/);
  assert.match(html, /CFDI 4\.0/);
  assert.match(html, /Monitor fiscal/);
  assert.match(html, /Configura tu empresa/);
  assert.match(html, /data-tool-action="cfdi"/);
  assert.match(html, /Selecciona un perfil/);
  assert.match(html, /Leer archivos de apoyo/);
  assert.match(html, /data-section="advisor"/);
  assert.match(html, /nora-idle\.webp/);
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

test("bloquea el selector de perfil mientras se guarda una operación", () => {
  const html = renderToolsPanel({ workspace: {
    profiles: [
      { id: "profile-1", legal_name: "ContaIA Uno", rfc: "CID010101AB1", active: true },
      { id: "profile-2", legal_name: "ContaIA Dos", rfc: "AAA010101AAA", active: true },
    ],
    selectedProfileId: "profile-1", connections: [], saving: true,
  } });
  assert.match(html, /data-tools-profile-select disabled/);
});

test("los formularios explican el tratamiento del perfil y las conexiones pendientes", () => {
  const profileHtml = renderToolsPanel({ workspace: { profileForm: {}, profiles: [], connections: [] } });
  assert.match(profileHtml, /data-tools-profile-form/);
  assert.match(profileHtml, /data-tool-shell="fiscal-profile"/);
  assert.match(profileHtml, /<h2 id="tools-profile-form-title">Configura un perfil fiscal<\/h2>/);
  assert.match(profileHtml, /tools-module-nora/);
  assert.match(profileHtml, /name="rfc"/);
  assert.match(profileHtml, /No ingreses contraseñas, e\.firma, CSD/);
  assert.match(profileHtml, /name="acknowledge" required/);

  const connectionHtml = renderToolsPanel({ workspace: {
    connectionForm: { tool_key: "accounting" }, selectedProfileId: "profile-1", connections: [], profiles: [],
  } });
  assert.match(connectionHtml, /data-tools-connection-form/);
  assert.match(connectionHtml, /data-tool-shell="connection-record"/);
  assert.match(connectionHtml, /<h2 id="tools-connection-form-title">Registro de Contabilidad<\/h2>/);
  assert.match(connectionHtml, /Sin configurar · pruebas/);
  assert.match(connectionHtml, /tools-module-nora/);
  assert.match(connectionHtml, /No configura ni verifica una integración/);

  const connectedRecordHtml = renderToolsPanel({ workspace: {
    connectionForm: { tool_key: "cfdi", environment: "production" },
    selectedProfileId: "profile-1", connections: [{ tool_key: "cfdi", environment: "production", status: "connected" }], profiles: [],
  } });
  assert.match(connectedRecordHtml, /Conectada · producción/);
  assert.match(connectedRecordHtml, /confirma su estado con el proveedor/);
});


test("cada herramienta muestra un SVG propio con nombre accesible", () => {
  const html = renderToolsPanel();
  const cards = [...html.matchAll(/<article class="tools-card[\s\S]*?<\/article>/g)].map(([card]) => card);
  const iconIds = cards.map((card) => card.match(/class="tools-ui-icon tools-ui-icon--([a-z]+)"/)?.[1]);
  assert.deepEqual(iconIds, ["cfdi", "accounting", "reconciliation", "payroll", "diot", "monitor"]);
  assert.equal(new Set(iconIds).size, 6);
  assert.equal((html.match(/class="tools-card-icon" role="img" aria-label=/g) || []).length, 6);
  assert.match(html, /tools-ui-icon--folder/);
});


test("cada herramienta distingue los cinco estados de conexión por ambiente", () => {
  const html = renderToolsPanel({ workspace: {
    selectedProfileId: "profile-1",
    connections: [
      { tool_key: "cfdi", environment: "sandbox", status: "pending" },
      { tool_key: "accounting", environment: "production", status: "connected" },
      { tool_key: "payroll", environment: "sandbox", status: "degraded" },
      { tool_key: "monitor", environment: "production", status: "error" },
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
    if (card.includes('data-tool-card="reconciliation"') || card.includes('data-tool-card="diot"')) {
      assert.match(card, card.includes('data-tool-card="diot"') ? /PREPARACIÓN DIOT/ : /CONEXIÓN BANCARIA/);
      assert.match(card, card.includes('data-tool-card="diot"') ? /No conecta al SAT/ : /Sin conexión · archivos locales/);
      assert.doesNotMatch(card, /data-environment="production"|data-connection-status="connected"/);
      continue;
    }
    assert.match(card, /ESTADO DE INTEGRACIÓN/);
    assert.equal((card.match(/class="tools-connection-status /g) || []).length, 2);
    assert.match(card, /data-environment="sandbox"/);
    assert.match(card, /data-environment="production"/);
  }
  assert.equal((html.match(/class="tools-connection-row" data-tool-key=/g) || []).length, 8);
});

test("el resumen cuenta estados guardados sin exponer títulos de alertas o vencimientos", () => {
  const html = renderToolsPanel({ workspace: {
    profiles: [{ id: "profile-1", legal_name: "Cuenta Demo", active: true }],
    selectedProfileId: "profile-1", connections: [],
    alerts: [
      { status: "open", title: "ALERTA_PRIVADA" },
      { status: "in_review", detail: "DETALLE_PRIVADO" },
      { status: "resolved", title: "ALERTA_RESUELTA" },
    ],
    deadlines: [
      { status: "pending", title: "VENCIMIENTO_PRIVADO" },
      { status: "overdue" },
      { status: "completed" },
    ],
  } });
  assert.match(html, /4 asunto\(s\) requieren atención/);
  assert.match(html, /1 alerta\(s\) abierta\(s\) · 1 en revisión · 1 vencimiento\(s\) pendiente\(s\) · 1 marcado\(s\) vencido\(s\)\./);
  assert.doesNotMatch(html, /ALERTA_PRIVADA|DETALLE_PRIVADO|VENCIMIENTO_PRIVADO/);
});

test("un error de lectura no se presenta como cero alertas o vencimientos", () => {
  const html = renderToolsPanel({ workspace: {
    profiles: [{ id: "profile-1", legal_name: "Cuenta Demo", active: true }],
    selectedProfileId: "profile-1", connections: [], alerts: [], deadlines: [], signalsError: "error de consulta",
  } });
  assert.match(html, /Consulta incompleta/);
  assert.match(html, /no se asumen valores en cero/);
});
