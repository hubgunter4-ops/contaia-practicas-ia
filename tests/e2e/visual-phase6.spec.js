import { test, expect } from "@playwright/test";

async function blankHost(page, id) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((hostId) => {
    document.body.innerHTML = `<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="${hostId}"></div></div></div>`;
  }, id);
  return page.locator(`#${id}`);
}

async function renderIsland(page, kind, mode = "feedback") {
  const id = `visual-a11y-${kind}-${mode}`;
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

function parseRgb(value) {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? channels.slice(0, 3).map((channel) => channel / 255) : null;
}

function channelLuminance(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(text, surface) {
  const textLuminance = (0.2126 * channelLuminance(text[0])) + (0.7152 * channelLuminance(text[1])) + (0.0722 * channelLuminance(text[2]));
  const surfaceLuminance = (0.2126 * channelLuminance(surface[0])) + (0.7152 * channelLuminance(surface[1])) + (0.0722 * channelLuminance(surface[2]));
  return (Math.max(textLuminance, surfaceLuminance) + 0.05) / (Math.min(textLuminance, surfaceLuminance) + 0.05);
}

const feedbackSelectors = {
  cfdi: ".cfdi-processing li",
  reconciliation: ".recon-error",
  journal: ".journal-inline-note[role=status]",
  diot: ".diot-source-note[role=status]",
};

test("las cuatro islas conservan foco visible, contraste AA, densidad legible y no desbordan", async ({ page }) => {
  for (const kind of Object.keys(feedbackSelectors)) {
    const root = await renderIsland(page, kind);
    await expect(root.locator("main")).toBeVisible();

    const metrics = await root.locator(feedbackSelectors[kind]).first().evaluate((element) => {
      let surface = element;
      let background = "rgba(0, 0, 0, 0)";
      while (surface && background === "rgba(0, 0, 0, 0)") {
        const computed = getComputedStyle(surface);
        background = computed.backgroundColor;
        if (background !== "rgba(0, 0, 0, 0)") break;
        surface = surface.parentElement;
      }
      const computed = getComputedStyle(element);
      return {
        color: computed.color,
        background,
        fontSize: Number.parseFloat(computed.fontSize),
        lineHeight: computed.lineHeight === "normal" ? 0 : Number.parseFloat(computed.lineHeight),
      };
    });
    const textRgb = parseRgb(metrics.color);
    const surfaceRgb = parseRgb(metrics.background);
    expect(textRgb, `${kind}: color computado`).not.toBeNull();
    expect(surfaceRgb, `${kind}: superficie computada`).not.toBeNull();
    expect(contrastRatio(textRgb, surfaceRgb), `${kind}: contraste`).toBeGreaterThanOrEqual(4.5);
    expect(metrics.fontSize, `${kind}: tamaño tipográfico`).toBeGreaterThanOrEqual(11);
    expect(metrics.lineHeight / metrics.fontSize, `${kind}: interlineado`).toBeGreaterThanOrEqual(1.3);

    const focusRoot = await renderIsland(page, kind, "focus");
    await expect(focusRoot.locator("main")).toBeVisible();
    const hostId = await focusRoot.getAttribute("id");
    await page.evaluate(() => {
      const sentinel = document.createElement("button");
      sentinel.type = "button";
      sentinel.setAttribute("aria-label", "Inicio de auditoría de teclado");
      sentinel.style.cssText = "position:fixed;left:-10000px;width:1px;height:1px;opacity:0";
      document.body.prepend(sentinel);
      sentinel.focus();
    });
    let focusedInside = false;
    let focusStyles = null;
    for (let attempt = 0; attempt < 40 && !focusedInside; attempt += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate((hostId) => {
        const host = document.querySelector(`#${hostId}`);
        const active = document.activeElement;
        if (!host?.contains(active)) return { inside: false };
        const computed = getComputedStyle(active);
        return {
          inside: true,
          outlineWidth: Number.parseFloat(computed.outlineWidth),
          outlineStyle: computed.outlineStyle,
          outlineOffset: Number.parseFloat(computed.outlineOffset),
        };
      }, hostId);
      focusedInside = state.inside;
      if (focusedInside) focusStyles = state;
    }
    expect(focusedInside, `${kind}: debe existir un control navegable`).toBe(true);
    expect(focusStyles.outlineStyle, `${kind}: estilo de foco`).not.toBe("none");
    expect(focusStyles.outlineWidth, `${kind}: ancho de foco`).toBeGreaterThanOrEqual(2);
    expect(focusStyles.outlineOffset, `${kind}: separación de foco`).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${kind}: overflow horizontal`).toBe(true);
  }
});
