import { test, expect } from "@playwright/test";

test.describe("DIOT asistida · isla y limpieza", () => {
  test("monta con handoff CFDI explícito y limpia la preparación al destruir", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { createIslandManager } = await import("/src/app/island-manager.js");
      const { createIslandRegistry } = await import("/src/app/island-registry.js");
      const { buildCfdiSourceSnapshot } = await import("/src/app/source-capabilities.js");
      const { diotState } = await import("/src/diot/workspace.js");
      const host = document.createElement("div");
      host.id = "diot-island-test-host";
      document.body.append(host);
      const analysis = { facturas: [{ uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", serieFolio: "A-1", fecha: "2026-10-10", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", moneda: "MXN", rawAmounts: { total: "116.00", subtotal: "100.00" } }], pagos: [] };
      const snapshot = buildCfdiSourceSnapshot(analysis, "diot");
      let consumed = 0;
      const registry = createIslandRegistry({ diot: () => import("/src/diot/island.js") });
      const manager = createIslandManager({
        host,
        registry,
        capabilitiesFor: () => ({ consumeCfdiHandoff: () => { consumed += 1; return snapshot; } }),
      });
      await manager.navigate("diot");
      const mounted = Boolean(host.querySelector("[data-diot-page]"));
      const sourceCount = host.querySelectorAll("[data-diot-source]").length;
      await host.querySelector("[data-diot-assistant-toggle]")?.click();
      const assistantOpen = Boolean(host.querySelector("#diot-assistant-body"));
      await manager.clearSession("test-destroy");
      return { mounted, sourceCount, assistantOpen, consumed, emptyAfterDestroy: host.innerHTML === "", handoffAfterDestroy: diotState.handoffAnalysis, sourcesAfterDestroy: diotState.sources.length, messagesAfterDestroy: diotState.assistant.messages.length };
    });
    expect(result).toEqual({ mounted: true, sourceCount: 1, assistantOpen: true, consumed: 1, emptyAfterDestroy: true, handoffAfterDestroy: null, sourcesAfterDestroy: 0, messagesAfterDestroy: 1 });
  });
});
