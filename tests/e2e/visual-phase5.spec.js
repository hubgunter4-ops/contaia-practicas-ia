import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const captureRoot = process.env.VISUAL_CAPTURE_DIR || "/tmp/contaia-visual5-captures";
const captureStage = process.env.VISUAL_CAPTURE_STAGE || "after";

async function blankHost(page, id) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((hostId) => {
    document.body.innerHTML = `<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="${hostId}"></div></div></div>`;
  }, id);
  return page.locator(`#${id}`);
}

async function renderFeedback(page, kind) {
  const id = `visual-feedback-${kind}`;
  const root = await blankHost(page, id);
  await page.evaluate(async ({ hostId, view }) => {
    const host = document.querySelector(`#${hostId}`);
    if (view === "cfdi") {
      const workspace = await import("/src/cfdi/workspace.js");
      workspace.resetCfdiWorkspace();
      workspace.cfdiState.status = "processing";
      host.innerHTML = workspace.renderCfdiWorkspace();
      return;
    }
    if (view === "reconciliation") {
      const workspace = await import("/src/reconciliation/workspace.js");
      workspace.resetReconciliationWorkspace();
      workspace.reconciliationState.error = "Completa el mapeo antes de comparar.";
      host.innerHTML = workspace.renderReconciliationWorkspace({ analysis: null });
      return;
    }
    if (view === "journal") {
      const workspace = await import("/src/journal/workspace.js");
      workspace.resetJournalWorkspace();
      workspace.journalState.notice = "Borrador creado en memoria. Requiere revisión humana.";
      host.innerHTML = workspace.renderJournalWorkspace({ analysis: null, bankRows: [] });
      return;
    }
    const workspace = await import("/src/diot/workspace.js");
    workspace.resetDiotWorkspace();
    workspace.diotState.activeStep = "download";
    workspace.diotState.notice = "Archivo CSV generado localmente para revisión.";
    host.innerHTML = workspace.renderDiotWorkspace({ analysis: null });
  }, { hostId: id, view: kind });
  return root;
}

test("captura feedback de carga, error y confirmación por isla", async ({ page }, testInfo) => {
  const directory = path.join(captureRoot, testInfo.project.name, captureStage);
  await mkdir(directory, { recursive: true });
  for (const kind of ["cfdi", "reconciliation", "journal", "diot"]) {
    const root = await renderFeedback(page, kind);
    await expect(root.locator("main")).toBeVisible();
    if (kind === "cfdi") {
      await expect(root.locator(".cfdi-processing")).toBeVisible();
    } else if (kind === "reconciliation") {
      await expect(root.locator(".recon-error")).toBeVisible();
    } else if (kind === "journal") {
      await expect(root.locator(".journal-inline-note[role=status]")).toBeVisible();
    } else {
      await expect(root.locator(".diot-source-note[role=status]")).toBeVisible();
    }
    await page.screenshot({ path: path.join(directory, `${kind}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
