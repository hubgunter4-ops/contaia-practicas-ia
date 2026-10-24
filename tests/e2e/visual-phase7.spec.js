import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 820, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function blankHost(page, id) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((hostId) => {
    document.body.innerHTML = `<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="${hostId}"></div></div></div>`;
  }, id);
  return page.locator(`#${id}`);
}

async function renderIsland(page, kind, mode) {
  const id = `visual-responsive-${kind}-${mode}`;
  const root = await blankHost(page, id);
  await page.evaluate(async ({ hostId, view, renderMode }) => {
    const host = document.querySelector(`#${hostId}`);
    if (view === "cfdi") {
      const workspace = await import("/src/cfdi/workspace.js");
      workspace.resetCfdiWorkspace();
      if (renderMode === "feedback") workspace.cfdiState.status = "processing";
      host.innerHTML = workspace.renderCfdiWorkspace();
      return;
    }
    if (view === "reconciliation") {
      const workspace = await import("/src/reconciliation/workspace.js");
      workspace.resetReconciliationWorkspace();
      if (renderMode === "feedback") workspace.reconciliationState.error = "Completa el mapeo antes de comparar.";
      host.innerHTML = workspace.renderReconciliationWorkspace({ analysis: null });
      return;
    }
    if (view === "journal") {
      const workspace = await import("/src/journal/workspace.js");
      workspace.resetJournalWorkspace();
      if (renderMode === "feedback") workspace.journalState.notice = "Borrador creado en memoria. Requiere revisión humana.";
      host.innerHTML = workspace.renderJournalWorkspace({ analysis: null, bankRows: [] });
      return;
    }
    const workspace = await import("/src/diot/workspace.js");
    workspace.resetDiotWorkspace();
    if (renderMode === "feedback") {
      workspace.diotState.activeStep = "download";
      workspace.diotState.notice = "Archivo CSV generado localmente para revisión.";
    }
    host.innerHTML = workspace.renderDiotWorkspace({ analysis: null });
  }, { hostId: id, view: kind, renderMode: mode });
  return root;
}

async function measureLayout(page, root) {
  return page.evaluate((hostId) => {
    const host = document.querySelector(`#${hostId}`);
    const viewport = document.documentElement.clientWidth;
    const visible = [...host.querySelectorAll("*")].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const overflowingElements = visible
      .map((element) => ({
        element,
        selector: element.className || element.tagName,
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
      }))
      .filter(({ element, right, width }) => {
        if (!(width > 0 && right > viewport + 1)) return false;
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== host) {
          const style = getComputedStyle(ancestor);
          if (["auto", "scroll"].includes(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      })
      .map(({ selector, right, width }) => ({ selector, right, width }))
      .slice(0, 8);
    const header = host.querySelector('[data-island-frame="header"], .tool-shell-header, .cfdi-hero, .recon-header, .journal-header, .diot-header');
    const actions = host.querySelector('.island-frame-actions, .tool-shell-actions');
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: viewport,
      overflowingElements,
      header: rect(header),
      actions: rect(actions),
      main: rect(host.querySelector("main")),
    };
  }, await root.getAttribute("id"));
}

test("la matriz responsive conserva jerarquía, acciones y ancho visible en las cuatro islas", async ({ page }, testInfo) => {
  const captureRoot = testInfo.outputPath("visual-phase7-evidencia");
  const evidence = [];
  await mkdir(captureRoot, { recursive: true });
  for (const viewport of viewports) await mkdir(path.join(captureRoot, viewport.name), { recursive: true });
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const kind of ["cfdi", "reconciliation", "journal", "diot"]) {
      for (const mode of ["empty", "feedback"]) {
        const root = await renderIsland(page, kind, mode);
        await expect(root.locator("main")).toBeVisible();
        const metrics = await measureLayout(page, root);
        expect(metrics.documentWidth, `${viewport.name}/${kind}/${mode}: overflow global`).toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.overflowingElements, `${viewport.name}/${kind}/${mode}: elementos fuera del viewport`).toEqual([]);
        expect(metrics.main?.width, `${viewport.name}/${kind}/${mode}: ancho de isla`).toBeLessThanOrEqual(viewport.width);
        if (metrics.header) expect(metrics.header.right, `${viewport.name}/${kind}/${mode}: encabezado`).toBeLessThanOrEqual(viewport.width + 1);
        if (metrics.actions) expect(metrics.actions.right, `${viewport.name}/${kind}/${mode}: acciones`).toBeLessThanOrEqual(viewport.width + 1);
        evidence.push({ ...viewport, kind, mode, metrics });
        await page.screenshot({
          path: path.join(captureRoot, viewport.name, `${kind}-${mode}.png`),
          fullPage: true,
        });
      }
    }
  }
  await writeFile(path.join(captureRoot, "manifest.json"), `${JSON.stringify({ viewports, evidence }, null, 2)}\n`);
});
