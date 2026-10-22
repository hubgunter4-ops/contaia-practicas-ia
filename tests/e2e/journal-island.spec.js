import { test, expect } from "@playwright/test";

test.describe("Pólizas y Auditoría · isla y limpieza", () => {
  test("monta con una capacidad CFDI explícita y limpia fuentes, auditoría y Nora al destruir", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { createIslandManager } = await import("/src/app/island-manager.js");
      const { createIslandRegistry } = await import("/src/app/island-registry.js");
      const { buildBankSourceSnapshot, buildCfdiSourceSnapshot } = await import("/src/app/source-capabilities.js");
      const { journalState } = await import("/src/journal/workspace.js");
      const host = document.createElement("div");
      host.id = "journal-island-test-host";
      document.body.append(host);
      const analysis = { facturas: [{ uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", serieFolio: "A-1", fecha: "2026-10-10", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", moneda: "MXN", rawAmounts: { total: "116.00" } }], pagos: [] };
      const snapshot = buildCfdiSourceSnapshot(analysis, "journal");
      const bankSnapshot = buildBankSourceSnapshot([{ rowNumber: 2, dateIso: "2026-10-10", amountCents: 11600, signedAmountCents: 11600, currency: "MXN", reference: "BANK-1", description: "Cobro", status: "ready", result: "suggested", confidence: "high" }]);
      let consumed = 0;
      let bankConsumed = 0;
      const registry = createIslandRegistry({ journal: () => import("/src/journal/island.js") });
      const manager = createIslandManager({
        host,
        registry,
        capabilitiesFor: () => ({ consumeSourceHandoff: () => { consumed += 1; return snapshot; }, consumeBankHandoff: () => { bankConsumed += 1; return bankSnapshot; } }),
      });
      await manager.navigate("journal");
      const mounted = Boolean(host.querySelector("[data-journal-page]"));
      const sourceCount = host.querySelectorAll("[data-journal-source]").length;
      await host.querySelector("[data-journal-assistant-toggle]")?.click();
      const assistantOpen = Boolean(host.querySelector("#journal-assistant-body"));
      await manager.clearSession("test-destroy");
      return { mounted, sourceCount, assistantOpen, consumed, bankConsumed, emptyAfterDestroy: host.innerHTML === "", sourcesAfterDestroy: journalState.sources.length, draftsAfterDestroy: journalState.drafts.length, messagesAfterDestroy: journalState.assistant.messages.length };
    });
    expect(result).toEqual({ mounted: true, sourceCount: 2, assistantOpen: true, consumed: 1, bankConsumed: 1, emptyAfterDestroy: true, sourcesAfterDestroy: 0, draftsAfterDestroy: 0, messagesAfterDestroy: 1 });
  });
});
