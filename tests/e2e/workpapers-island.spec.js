import { test, expect } from "@playwright/test";

test.describe("Papeles de trabajo IA · WP1 demo local", () => {
  test("recorre la demo ficticia, muestra fórmulas y limpia cada decisión al desmontar", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const { mountIsland } = await import("/src/workpapers/island.js");
      const { workpapersState } = await import("/src/workpapers/workspace.js");
      const shell = document.createElement("div");
      shell.className = "app-shell app-shell--fiscal";
      const host = document.createElement("div");
      host.id = "workpapers-island-test-host";
      shell.append(host);
      document.body.append(shell);
      const island = await mountIsland({ host, islandId: "workpapers", session: { epoch: 12 } });
      window.__workpapersIslandTest = { shell, host, island, workpapersState };
    });

    const demo = page.locator("#workpapers-island-test-host [data-workpapers-page]");
    await expect(demo).toContainText("Papeles de trabajo IA");
    await expect(demo).toContainText("Demo local y ficticia");
    await expect(demo).toContainText("no consulta CFDI, bancos, perfiles ni pólizas reales", { ignoreCase: true });
    await expect(demo.locator("[data-workpapers-stage]")).toHaveCount(5);
    const initialLayout = await demo.evaluate((element) => ({
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      islandOverflow: element.scrollWidth > element.clientWidth,
    }));
    expect(initialLayout).toEqual({ pageOverflow: false, islandOverflow: false });

    await demo.locator("[data-workpapers-period]").selectOption("2026-year");
    await expect(demo.locator(".workpapers-notice")).toContainText("Ejercicio 2026");

    await demo.locator('[data-workpapers-stage="1"]').click();
    await expect(demo.locator(".workpapers-rule-card")).toContainText("Separar ventas gravadas al 16%");
    await demo.locator('[data-workpapers-action="accept-rule"]').click();
    await expect(demo.locator(".workpapers-rule-state")).toContainText("Regla revisada para la demo");

    await demo.locator('[data-workpapers-stage="2"]').click();
    await expect(demo.locator(".workpapers-entry-card")).toContainText("Póliza demostrativa de ventas");
    await expect(demo.locator(".workpapers-entry-card")).toContainText("Revisión humana");

    await demo.locator('[data-workpapers-tab="sheet"]').click();
    await expect(demo.locator(".workpapers-sheet-card")).toContainText("Papel de trabajo de IVA · Ejercicio 2026");
    await expect(demo.locator(".workpapers-sheet-card code").first()).toContainText("=SUM(Detalle!F2:F5)");

    await demo.locator('[data-workpapers-tab="provenance"]').click();
    await expect(demo.locator(".workpapers-provenance")).toContainText("Cada total explica su procedencia");
    await expect(demo.locator(".workpapers-provenance")).toContainText("Cálculo local de demostración");

    await demo.locator('[data-workpapers-tab="demo"]').click();
    await demo.locator('[data-workpapers-stage="4"]').click();
    await demo.locator('[data-workpapers-action="save-paper"]').click();
    await expect(demo.locator(".workpapers-save-card")).toContainText("Confirmación de demostración");
    await expect(demo.locator(".workpapers-notice")).toContainText("No se creó ningún archivo ni se guardó información");

    const cleanup = await page.evaluate(async () => {
      const { host, island, workpapersState } = window.__workpapersIslandTest;
      await island.destroy("test-destroy");
      return {
        hostEmpty: host.innerHTML === "",
        periodId: workpapersState.periodId,
        activeTab: workpapersState.activeTab,
        stageIndex: workpapersState.stageIndex,
        ruleState: workpapersState.ruleState,
        saved: workpapersState.saved,
        notice: workpapersState.notice,
      };
    });
    expect(cleanup).toEqual({ hostEmpty: true, periodId: "2026-10", activeTab: "demo", stageIndex: 0, ruleState: "proposed", saved: false, notice: "" });
  });
});
