import { test, expect } from "@playwright/test";

test.describe("CFDI · Fase IA B · panel local", () => {
  test("monta el panel, ejecuta una consulta determinista y limpia el artefacto al desmontar", async ({ page }) => {
    await page.route("**/api/cfdi/config", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false }),
    }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const { cfdiState } = await import("/src/cfdi/workspace.js");
      const { mountIsland } = await import("/src/cfdi/island.js");
      cfdiState.analysis = {
        facturas: [{
          uuid: "11111111-1111-4111-8111-111111111111",
          tipo: "I",
          fecha: "2026-10-01",
          rfcEmisor: "AAA010101AAA",
          rfcReceptor: "BBB010101BBB",
          moneda: "MXN",
          total: 116,
        }],
        pagos: [],
        conceptos: [],
        summary: {
          invoiceCount: 1,
          paymentCount: 0,
          conceptCount: 0,
          matchedPayments: 0,
          unmatchedPayments: 0,
          balanceAlerts: 0,
          missingInvoiceReferences: 0,
          overpaidLinks: 0,
          duplicateUuids: 1,
          totalsByCurrency: [{ currency: "MXN", invoiced: 116, paid: 0, remaining: 116 }],
          alerts: [{ code: "duplicate_uuid", count: 1, severity: "review" }],
        },
      };
      cfdiState.status = "ready";
      cfdiState.fileCount = 1;
      const host = document.createElement("div");
      host.id = "cfdi-ai-panel-test-host";
      document.body.append(host);
      const noraCalls = [];
      const island = await mountIsland({
        host,
        islandId: "cfdi",
        session: { epoch: 7 },
        capabilities: {
          getAnalysis: () => cfdiState.analysis,
          onAskNora: (safeContext, message) => noraCalls.push({ safeContext, message }),
        },
      });
      window.__cfdiAiPanelTest = { host, island, cfdiState, noraCalls };
    });

    const panel = page.locator("#cfdi-ai-panel-test-host .cfdi-ai-query");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("CONSULTA LOCAL · SIN IA REMOTA");
    await panel.locator('[data-cfdi-ai-quick-id="alerts"]').click();
    await expect(panel.locator(".cfdi-ai-result")).toContainText("Resultado listo; requiere revisión humana");
    await expect(panel.locator(".cfdi-ai-result")).toContainText("UUID de factura repetido");
    await expect(panel.locator(".cfdi-ai-result")).not.toContainText("AAA010101AAA");
    await expect(panel.locator(".cfdi-ai-result")).not.toContainText("11111111-1111-4111-8111-111111111111");
    await expect(panel.locator(".cfdi-ai-result")).toContainText("revisión humana requerida");

    await panel.locator("#cfdi-ai-message").fill("Revisa los pagos y complementos");
    await panel.locator('[data-cfdi-ai-form] button[type="submit"]').click();
    await expect(panel.locator(".cfdi-ai-result")).toContainText("Relacionados");
    await expect(panel.locator(".cfdi-ai-result")).toContainText("Sin vínculo");

    await panel.locator("[data-cfdi-ai-explain]").click();
    await expect(panel.locator(".cfdi-ai-confirm")).toContainText("resumen numérico");
    await expect(panel.locator("[data-cfdi-ai-explain-form] button[type=submit]")).toBeDisabled();
    expect(await page.evaluate(() => window.__cfdiAiPanelTest.noraCalls.length)).toBe(0);
    await panel.locator('[name="confirmSafeContext"]').check();
    await expect(panel.locator("[data-cfdi-ai-explain-form] button[type=submit]")).toBeEnabled();
    await panel.locator("[data-cfdi-ai-explain-form] button[type=submit]").click();
    await expect(panel.locator(".cfdi-ai-confirm")).toHaveCount(0);
    const noraPayload = await page.evaluate(() => window.__cfdiAiPanelTest.noraCalls[0]);
    expect(noraPayload.message).toContain("interpretar este resultado");
    expect(noraPayload.safeContext.schemaVersion).toBe("cfdi-summary-v1");
    expect(JSON.stringify(noraPayload.safeContext)).not.toContain("AAA010101AAA");
    expect(JSON.stringify(noraPayload.safeContext)).not.toContain("11111111-1111-4111-8111-111111111111");

    const cleanup = await page.evaluate(async () => {
      const { host, island, cfdiState } = window.__cfdiAiPanelTest;
      await island.destroy("test-destroy");
      return { hostEmpty: host.innerHTML === "", aiResult: cfdiState.aiResult, aiQuery: cfdiState.aiQuery, aiBusy: cfdiState.aiBusy };
    });
    expect(cleanup).toEqual({ hostEmpty: true, aiResult: null, aiQuery: "", aiBusy: false });
  });

  test("consulta el planner solo para una petición fuera del router y ejecuta el plan local validado", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const { cfdiState } = await import("/src/cfdi/workspace.js");
      const { mountIsland } = await import("/src/cfdi/island.js");
      cfdiState.analysis = {
        facturas: [{ uuid: "11111111-1111-4111-8111-111111111111", tipo: "I", fecha: "2026-10-01", rfcEmisor: "AAA010101AAA", rfcReceptor: "BBB010101BBB", moneda: "MXN", total: 116 }],
        pagos: [],
        conceptos: [],
        summary: { invoiceCount: 1, paymentCount: 0, conceptCount: 0, matchedPayments: 0, unmatchedPayments: 0, balanceAlerts: 0, missingInvoiceReferences: 0, overpaidLinks: 0, duplicateUuids: 1, totalsByCurrency: [{ currency: "MXN", invoiced: 116, paid: 0, remaining: 116 }], alerts: [{ code: "duplicate_uuid", count: 1, severity: "review" }] },
      };
      cfdiState.status = "ready";
      cfdiState.fileCount = 1;
      const host = document.createElement("div");
      host.id = "cfdi-ai-planner-test-host";
      document.body.append(host);
      const plannerCalls = [];
      const island = await mountIsland({
        host,
        islandId: "cfdi",
        session: { epoch: 9 },
        capabilities: {
          getAnalysis: () => cfdiState.analysis,
          onCfdiPlanner: async (request) => {
            plannerCalls.push(request);
            return { intent: "cfdi.summary", toolId: "cfdi.summary", arguments: { scope: "all" }, missing: [], requiresExplicitUserAction: false, humanReviewRequired: true };
          },
        },
      });
      window.__cfdiAiPlannerTest = { host, island, plannerCalls };
    });
    const panel = page.locator("#cfdi-ai-planner-test-host .cfdi-ai-query");
    await expect(panel).toBeVisible();
    await panel.locator("#cfdi-ai-message").fill("¿Qué vista puede ayudarme a revisar el estado general?");
    await panel.locator('[data-cfdi-ai-form] button[type="submit"]').click();
    await expect(panel.locator(".cfdi-ai-result")).toContainText("Resultado listo; requiere revisión humana");
    await expect(panel.locator(".cfdi-ai-stat-grid")).toContainText("Facturas");
    const plannerInput = await page.evaluate(() => window.__cfdiAiPlannerTest.plannerCalls[0]);
    expect(plannerInput.schemaVersion).toBe("cfdi-planner-request-v1");
    expect(JSON.stringify(plannerInput)).not.toContain("analysisRef");
    expect(JSON.stringify(plannerInput)).not.toContain("AAA010101AAA");
    await page.evaluate(async () => window.__cfdiAiPlannerTest.island.destroy("test-destroy"));
  });
});
