import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const captureRoot = process.env.VISUAL_CAPTURE_DIR || "/tmp/contaia-visual4-captures";
const captureStage = process.env.VISUAL_CAPTURE_STAGE || "after";

async function blankHost(page, id) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((hostId) => {
    document.body.innerHTML = `<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="${hostId}"></div></div></div>`;
  }, id);
  return page.locator(`#${id}`);
}

async function renderEmpty(page, kind) {
  const id = `visual-empty-${kind}`;
  const root = await blankHost(page, id);
  await page.evaluate(async ({ hostId, view }) => {
    const host = document.querySelector(`#${hostId}`);
    if (view === "cfdi") {
      const workspace = await import("/src/cfdi/workspace.js");
      workspace.resetCfdiWorkspace();
      host.innerHTML = workspace.renderCfdiWorkspace();
      return;
    }
    if (view === "reconciliation") {
      const workspace = await import("/src/reconciliation/workspace.js");
      workspace.resetReconciliationWorkspace();
      host.innerHTML = workspace.renderReconciliationWorkspace({ analysis: null });
      return;
    }
    if (view === "journal") {
      const workspace = await import("/src/journal/workspace.js");
      workspace.resetJournalWorkspace();
      host.innerHTML = workspace.renderJournalWorkspace({ analysis: null, bankRows: [] });
      return;
    }
    const workspace = await import("/src/diot/workspace.js");
    workspace.resetDiotWorkspace();
    workspace.diotState.activeStep = "sources";
    host.innerHTML = workspace.renderDiotWorkspace({ analysis: null });
  }, { hostId: id, view: kind });
  return root;
}

test("captura base de estados vacíos y acciones actuales", async ({ page }, testInfo) => {
  const directory = path.join(captureRoot, testInfo.project.name, captureStage);
  await mkdir(directory, { recursive: true });
  for (const kind of ["cfdi", "reconciliation", "journal", "diot"]) {
    const root = await renderEmpty(page, kind);
    await expect(root.locator("main")).toBeVisible();
    if (kind === "cfdi") {
      await expect(root.locator(".tool-shell-actions .button-primary")).toHaveCount(1);
    } else {
      await expect(root.locator(".island-empty-actions .button-primary")).toHaveCount(1);
      await expect(root.locator(".island-empty-actions .button-primary")).toBeVisible();
    }
    await page.screenshot({ path: path.join(directory, `${kind}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
