import test from "node:test";
import assert from "node:assert/strict";
import { buildBankSourceSnapshot, buildCfdiSourceSnapshot, CapabilityExpiredError, createSourceCapabilityBroker } from "../src/app/source-capabilities.js";

const analysis = {
  facturas: [{
    uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", fecha: "2026-10-01", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB",
    moneda: "MXN", metodoPago: "PPD", formaPagoCode: "99", rawAmounts: { total: "116.00", subtotal: "100.00", discount: "0.00" },
    taxDetails: [{ kind: "transfer", tax: "002", factor: "Tasa", rate: "0.16", base: "100.00", amount: "16.00" }],
    xml: "no debe viajar",
  }],
  pagos: [{
    uuid: "22222222-2222-4222-8222-222222222222", tipo: "P", fechaPago: "2026-10-10", docRelacionado: "11111111-1111-4111-8111-111111111111",
    moneda: "MXN", monedaPago: "MXN", formaPagoCode: "03", montoPago: "116.00", numParcialidad: "1", paymentIndex: 1, relatedIndex: 1,
    rawAmounts: { paid: "116.00", prior: "116.00", remaining: "0.00" }, taxDetails: [],
  }],
};

test("crea snapshots distintos y mínimos por destino", () => {
  const diot = buildCfdiSourceSnapshot(analysis, "diot");
  const journal = buildCfdiSourceSnapshot(analysis, "journal");
  assert.equal(diot.analysis.facturas.length, 1);
  assert.equal(diot.analysis.pagos.length, 0);
  assert.equal(journal.analysis.pagos.length, 1);
  assert.equal(diot.sourceIds.length, 1);
  assert.equal(journal.sourceIds.length, 2);
  assert.equal(JSON.stringify(diot).includes("no debe viajar"), false);
  assert.match(diot.sourceIds[0], /^cfdi-source:invoice:/);
});

test("requiere acción explícita y consume una lease una sola vez", () => {
  const broker = createSourceCapabilityBroker();
  broker.registerSourceProvider("cfdi", ({ target }) => buildCfdiSourceSnapshot(analysis, target));
  assert.throws(() => broker.request({ target: "diot" }), /acción humana explícita/);
  const lease = broker.request({ target: "diot", explicitUserAction: true });
  assert.equal(lease.sourceCount, 1);
  const snapshot = broker.consume(lease.token, { target: "diot" });
  assert.equal(snapshot.analysis.facturas[0].uuid, analysis.facturas[0].uuid);
  assert.throws(() => broker.consume(lease.token, { target: "diot" }), CapabilityExpiredError);
});

test("rechaza destino incorrecto y expira leases al cambiar de sesión", () => {
  const broker = createSourceCapabilityBroker();
  broker.registerSourceProvider("cfdi", ({ target }) => buildCfdiSourceSnapshot(analysis, target));
  assert.throws(() => broker.request({ target: "cfdi", explicitUserAction: true }), /destino.*autorizado/i);
  const lease = broker.request({ target: "journal", explicitUserAction: true });
  const nextEpoch = broker.advanceSessionEpoch("user-change");
  assert.equal(nextEpoch, 1);
  assert.equal(broker.leaseCount, 0);
  assert.throws(() => broker.consume(lease.token, { target: "journal", sessionEpoch: 0 }), CapabilityExpiredError);
});

test("valida pertenencia y entrega solo los sourceIds pedidos", () => {
  const broker = createSourceCapabilityBroker();
  broker.registerSourceProvider("cfdi", ({ target, sourceIds }) => buildCfdiSourceSnapshot(analysis, target, { sourceIds }));
  const all = buildCfdiSourceSnapshot(analysis, "journal");
  const lease = broker.request({ target: "journal", sourceIds: [all.sourceIds[0]], explicitUserAction: true });
  const snapshot = broker.consume(lease.token, { target: "journal" });
  assert.deepEqual(snapshot.sourceIds, [all.sourceIds[0]]);
  assert.equal(snapshot.analysis.facturas.length, 1);
  assert.equal(snapshot.analysis.pagos.length, 0);
  assert.throws(() => broker.request({ target: "journal", sourceIds: ["cfdi-source:invoice:not-owned"], explicitUserAction: true }), /no pertenece/);
});

test("entrega movimientos bancarios sin el archivo original", () => {
  const movements = [{ rowNumber: 2, dateIso: "2026-10-10", amountCents: 11600, signedAmountCents: 11600, currency: "MXN", reference: "UUID-1", description: "Cobro", status: "ready", result: "suggested", confidence: "high", rawRow: ["no debe viajar"] }];
  const broker = createSourceCapabilityBroker();
  broker.registerSourceProvider("reconciliation", ({ target, sourceIds }) => buildBankSourceSnapshot(movements, target, { sourceIds }));
  const lease = broker.request({ owner: "reconciliation", target: "journal", explicitUserAction: true });
  const snapshot = broker.consume(lease.token, { target: "journal" });
  assert.equal(snapshot.bankRows.length, 1);
  assert.equal(snapshot.bankRows[0].reference, "UUID-1");
  assert.equal(JSON.stringify(snapshot).includes("no debe viajar"), false);
});
