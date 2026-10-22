import { test, expect } from "@playwright/test";

test.describe("Conciliación · isla y limpieza", () => {
  test("monta una isla, conserva el host durante updates y limpia al destruir", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { createIslandManager } = await import("/src/app/island-manager.js");
      const { createIslandRegistry } = await import("/src/app/island-registry.js");
      const { reconciliationState } = await import("/src/reconciliation/workspace.js");
      const host = document.createElement("div");
      host.id = "island-test-host";
      document.body.append(host);
      const registry = createIslandRegistry({ reconciliation: () => import("/src/reconciliation/island.js") });
      const manager = createIslandManager({
        host,
        registry,
        capabilitiesFor: () => ({ getAnalysis: () => ({ facturas: [{ uuid: "11111111-1111-4111-8111-111111111111", total: 100, moneda: "MXN" }], pagos: [] }) }),
      });
      await manager.navigate("reconciliation");
      const mounted = Boolean(host.querySelector("[data-reconciliation-page]"));
      const hostBeforeUpdate = host.firstElementChild;
      await manager.navigate("reconciliation");
      const sameHost = hostBeforeUpdate === host.firstElementChild;
      await manager.clearSession("test-destroy");
      return { mounted, sameHost, emptyAfterDestroy: host.innerHTML === "", activeAfterDestroy: manager.active, stateFile: reconciliationState.fileName, stateRows: reconciliationState.rawRows.length };
    });
    expect(result).toEqual({ mounted: true, sameHost: true, emptyAfterDestroy: true, activeAfterDestroy: null, stateFile: "", stateRows: 0 });
  });
});
