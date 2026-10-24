import { test, expect } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function renderTools(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    document.body.innerHTML = `
      <div class="app-shell app-shell--platform app-shell--fiscal">
        <aside class="sidebar" aria-label="Navegación fiscal"></aside>
        <div class="main-shell">
          <header class="topbar"><span class="breadcrumb"><strong>ContaIA Herramientas</strong></span></header>
          <div id="tools-host"></div>
        </div>
      </div>`;
    const { renderToolsPanel } = await import("/src/tools/panel.js");
    document.querySelector("#tools-host").innerHTML = renderToolsPanel({
      notice: "",
      workspace: { profiles: [], connections: [], alerts: [], deadlines: [], loaded: false, loading: false, error: "", notice: "" },
    });
  });
  return page.locator(".app-shell--fiscal:has(.tools-page)");
}

test.describe("Paleta de plataforma en Herramientas", () => {
  for (const viewport of viewports) {
    test(`conserva jerarquía y contraste en ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const shell = await renderTools(page);
      await expect(shell.locator(".tools-page")).toBeVisible();
      const colors = await shell.evaluate((root) => {
        const read = (selector) => getComputedStyle(root.querySelector(selector)).backgroundColor;
        return {
          sidebar: getComputedStyle(root.querySelector(".sidebar")).background,
          topbar: read(".topbar"),
          canvas: getComputedStyle(root).backgroundColor,
          card: read(".tools-card"),
          primary: getComputedStyle(root.querySelector(".button-primary")).backgroundColor,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(colors.sidebar).toContain("rgb(11, 42, 85)");
      if (viewport.width > 760) expect(colors.sidebar).toContain("rgb(7, 29, 61)");
      expect(colors.topbar).toBe(viewport.width <= 760 ? "rgb(7, 29, 61)" : "rgb(11, 42, 85)");
      expect(colors.canvas).toBe("rgb(243, 246, 251)");
      expect(colors.card).toBe("rgb(255, 255, 255)");
      expect(colors.primary).toBe("rgb(18, 102, 201)");
      expect(colors.documentWidth).toBeLessThanOrEqual(colors.viewportWidth);
    });
  }
});

async function renderIndividualTool(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    document.body.innerHTML = `
      <div class="app-shell app-shell--platform app-shell--fiscal">
        <aside class="sidebar" aria-label="Navegación fiscal"></aside>
        <div class="main-shell">
          <header class="topbar"><span class="breadcrumb"><strong>ContaIA Herramientas</strong></span></header>
          <main class="content diot-page">
            <div id="tool-header"></div>
            <section class="diot-stage"><button class="button button-primary">Acción principal</button></section>
          </main>
        </div>
      </div>`;
    const { renderToolHeader } = await import("/src/tools/tool-shell.js");
    document.querySelector("#tool-header").outerHTML = renderToolHeader({
      id: "theme-check",
      eyebrow: "CONTAIA HERRAMIENTAS",
      title: "Herramienta individual",
      description: "Prueba del tema de plataforma.",
      statusLabel: "Lista",
      statusKind: "ready",
    });
  });
  return page.locator(".app-shell--fiscal:has(.tool-shell-header):not(:has(.tools-page))");
}

test.describe("Paleta de plataforma en páginas individuales", () => {
  for (const viewport of viewports) {
    test(`aplica la paleta y conserva el ancho en ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const shell = await renderIndividualTool(page);
      await expect(shell.locator(".diot-page")).toBeVisible();
      await expect.poll(() => shell.locator(".button-primary").evaluate((button) => getComputedStyle(button).backgroundColor)).toBe("rgb(18, 102, 201)");
      const colors = await shell.evaluate((root) => {
        const read = (selector) => getComputedStyle(root.querySelector(selector)).backgroundColor;
        return {
          sidebar: getComputedStyle(root.querySelector(".sidebar")).background,
          topbar: read(".topbar"),
          canvas: getComputedStyle(root).backgroundColor,
          header: read(".tool-shell-header"),
          panel: read(".diot-stage"),
          primary: getComputedStyle(root.querySelector(".button-primary")).backgroundColor,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(colors.sidebar).toContain("rgb(11, 42, 85)");
      expect(colors.topbar).toBe(viewport.width <= 760 ? "rgb(7, 29, 61)" : "rgb(11, 42, 85)");
      expect(colors.canvas).toBe("rgb(243, 246, 251)");
      expect(colors.header).toBe("rgb(255, 255, 255)");
      expect(colors.panel).toBe("rgb(255, 255, 255)");
      expect(colors.primary).toBe("rgb(18, 102, 201)");
      expect(colors.documentWidth).toBeLessThanOrEqual(colors.viewportWidth);
    });
  }
});
