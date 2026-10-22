import { test, expect } from "@playwright/test";

test.describe("Aprende · isla educativa", () => {
  test("mantiene el host al actualizar, delega eventos y limpia listeners al destruir", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { createIslandManager } = await import("/src/app/island-manager.js");
      const { createIslandRegistry } = await import("/src/app/island-registry.js");
      const host = document.createElement("div");
      host.id = "learning-island-test-host";
      document.body.append(host);
      let updateCount = 0;
      let eventCount = 0;
      let cleanupCount = 0;
      let renderedValue = 0;
      const registry = createIslandRegistry({ course: () => import("/src/learn/island.js") });
      const manager = createIslandManager({
        host,
        registry,
        capabilitiesFor: () => ({
          renderContent: () => `<main data-learning-test><button type="button" data-learning-action>Avance ${renderedValue}</button></main>`,
          onEvent: (type, event) => { if (type === "click" && event.target.closest("[data-learning-action]")) eventCount += 1; },
          onDestroy: () => { cleanupCount += 1; },
        }),
      });
      await manager.navigate("course");
      const rootBefore = host.firstElementChild;
      await host.querySelector("[data-learning-action]").click();
      renderedValue = 1;
      manager.update();
      updateCount += 1;
      const labelAfterUpdate = host.textContent.trim();
      const hostStable = host.id === "learning-island-test-host" && host.firstElementChild?.matches("[data-learning-island]");
      await manager.clearSession("test-destroy");
      host.dispatchEvent(new Event("click", { bubbles: true }));
      return { mounted: Boolean(rootBefore?.matches("[data-learning-island]")), hostStable, labelAfterUpdate, eventCount, updateCount, cleanupCount, emptyAfterDestroy: host.innerHTML === "", activeAfterDestroy: manager.active };
    });
    expect(result).toEqual({ mounted: true, hostStable: true, labelAfterUpdate: "Avance 1", eventCount: 1, updateCount: 1, cleanupCount: 1, emptyAfterDestroy: true, activeAfterDestroy: null });
  });
});
