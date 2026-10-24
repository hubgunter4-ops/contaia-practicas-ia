import { test, expect } from "@playwright/test";

test.describe("CFDI · isla y limpieza", () => {
  test("monta el workspace mediante IslandManager y limpia análisis al desmontar", async ({ page }) => {
    await page.route("**/api/cfdi/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { createIslandManager } = await import("/src/app/island-manager.js");
      const { createIslandRegistry } = await import("/src/app/island-registry.js");
      const { cfdiState } = await import("/src/cfdi/workspace.js");
      const host = document.createElement("div");
      host.id = "cfdi-island-test-host";
      document.body.append(host);
      const registry = createIslandRegistry({ cfdi: () => import("/src/cfdi/island.js") });
      const manager = createIslandManager({ host, registry });
      await manager.navigate("cfdi");
      const mounted = Boolean(host.querySelector("[data-cfdi-page]"));
      const hostBeforeUpdate = host.firstElementChild;
      await manager.navigate("cfdi");
      const sameHost = hostBeforeUpdate === host.firstElementChild;
      cfdiState.analysis = { facturas: [], pagos: [], conceptos: [], summary: { invoiceCount: 0, paymentCount: 0, conceptCount: 0, matchedPayments: 0, unmatchedPayments: 0, alerts: [], totalsByCurrency: [] } };
      await manager.clearSession("test-destroy");
      return { mounted, sameHost, emptyAfterDestroy: host.innerHTML === "", activeAfterDestroy: manager.active, analysisAfterDestroy: cfdiState.analysis, queuedAfterDestroy: cfdiState.queuedFiles.length, savedRunsAfterDestroy: cfdiState.savedRuns.length };
    });
    expect(result).toEqual({ mounted: true, sameHost: true, emptyAfterDestroy: true, activeAfterDestroy: null, analysisAfterDestroy: null, queuedAfterDestroy: 0, savedRunsAfterDestroy: 0 });
  });

  test("requiere un clic explícito para entregar un snapshot CFDI mínimo a DIOT", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { bindCfdiWorkspace, cfdiState, renderCfdiWorkspace, resetCfdiWorkspace } = await import("/src/cfdi/workspace.js");
      const { buildCfdiSourceSnapshot, createSourceCapabilityBroker } = await import("/src/app/source-capabilities.js");
      resetCfdiWorkspace();
      cfdiState.status = "ready";
      cfdiState.analysis = {
        facturas: [{ uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", fecha: "2026-10-01", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", moneda: "MXN", rawAmounts: { total: "116.00", subtotal: "100.00", discount: "0.00" }, taxDetails: [] }],
        pagos: [], conceptos: [], summary: { invoiceCount: 1, paymentCount: 0, conceptCount: 0, matchedPayments: 0, unmatchedPayments: 0, alerts: [], totalsByCurrency: [] },
      };
      document.body.innerHTML = '<div id="cfdi-handoff-test-host"></div>';
      const root = document.querySelector("#cfdi-handoff-test-host");
      const broker = createSourceCapabilityBroker();
      broker.registerSourceProvider("cfdi", ({ target }) => buildCfdiSourceSnapshot(cfdiState.analysis, target));
      let received = null;
      const render = () => { root.innerHTML = renderCfdiWorkspace(); };
      bindCfdiWorkspace(root, { onUpdate: render, onHandoffSources: (target) => { const lease = broker.request({ owner: "cfdi", target, explicitUserAction: true }); received = broker.consume(lease.token, { target }); } });
      render();
      const button = root.querySelector('[data-cfdi-handoff="diot"]');
      button.click();
      root.querySelector("[data-cfdi-reset]").click();
      const confirmation = root.querySelector(".cfdi-operation-confirmation[role='status']")?.textContent;
      return { buttonVisible: Boolean(button), target: received?.target, sourceCount: received?.sourceIds.length, hasXml: JSON.stringify(received).includes("rawXml") || JSON.stringify(received).includes("<cfdi:"), confirmation };
    });
    expect(result).toEqual({ buttonVisible: true, target: "diot", sourceCount: 1, hasXml: false, confirmation: "Resultado CFDI retirado de esta sesión local." });
  });
});
