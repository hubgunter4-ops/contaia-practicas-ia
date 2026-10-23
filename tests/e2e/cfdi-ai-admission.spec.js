import { test, expect } from "@playwright/test";

test.describe("CFDI · Fase IA E2 · admisión remota", () => {
  test("el cliente envía sesión e idempotencia por headers y conserva el body mínimo del planner", async ({ page }) => {
    let observed;
    await page.route("**/api/cfdi/planner", async (route) => {
      const request = route.request();
      observed = {
        headers: request.headers(),
        body: JSON.parse(request.postData() || "{}"),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          intent: "cfdi.summary",
          toolId: "cfdi.summary",
          arguments: { scope: "all" },
          missing: [],
          requiresExplicitUserAction: false,
          humanReviewRequired: true,
        }),
      });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const { requestCfdiPlanner } = await import("/src/cfdi/ai/planner-api.js");
      return requestCfdiPlanner({
        message: "¿Qué vista local me ayuda a revisar el estado general?",
        accessToken: "session-token-fixture",
        idempotencyKey: "ai_e2-browser-12345678",
      });
    });

    expect(result.toolId).toBe("cfdi.summary");
    expect(observed.headers.authorization).toBe("Bearer session-token-fixture");
    expect(observed.headers["idempotency-key"]).toBe("ai_e2-browser-12345678");
    expect(observed.body).toEqual({ message: "¿Qué vista local me ayuda a revisar el estado general?" });
    expect(JSON.stringify(observed.body)).not.toContain("analysisRef");
    expect(JSON.stringify(observed.body)).not.toMatch(/xml|rfc|uuid|file|token/i);
  });
});
