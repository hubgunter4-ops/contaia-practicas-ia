import test from "node:test";
import assert from "node:assert/strict";
import { buildPremiumPlanModel, buildPlanUsageMeters, normalizePlanSnapshot, renderPremiumPlanPanel } from "../src/tools/premium-ux.js";

test("la UI cae a Free ante un entitlement no verificado", () => {
  const snapshot = normalizePlanSnapshot({ plan: "premium", status: "active", source: "localStorage", verified: false });
  assert.equal(snapshot.plan, "free");
  assert.equal(snapshot.source, "fallback_free");
  assert.equal(snapshot.verified, false);
});

test("la UI solo muestra Premium con respuesta server-side verificada", () => {
  const snapshot = normalizePlanSnapshot({ plan: "premium", status: "active", source: "server", verified: true, usageAvailable: true });
  assert.equal(snapshot.plan, "premium");
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.usageAvailable, true);
});

test("los medidores no inventan uso cuando no hay entitlement verificable", () => {
  const meters = buildPlanUsageMeters();
  assert.equal(meters.length, 3);
  assert.ok(meters.every((meter) => meter.currentLabel === "Uso no disponible" && meter.status === "informational"));
});

test("el modelo Free comunica que Premium sigue pendiente", () => {
  const model = buildPremiumPlanModel();
  assert.equal(model.plan, "free");
  assert.equal(model.statusLabel, "Premium pendiente de activación");
  assert.match(model.description, /sin activar pagos/i);
});

test("el panel informativo no ofrece checkout ni guarda un plan en HTML", () => {
  const html = renderPremiumPlanPanel();
  assert.match(html, /data-premium-plan="free"/);
  assert.match(html, /data-tools-ui="premium-info"/);
  assert.match(html, /data-tools-ui="premium-dismiss"/);
  assert.doesNotMatch(html, /stripe|checkout|payment|token|entitlement=/i);
});
