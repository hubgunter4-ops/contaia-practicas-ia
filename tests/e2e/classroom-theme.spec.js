import { expect, test } from "@playwright/test";

const LOCAL_ORIGIN = "http://127.0.0.1:3000";
const COLORS = {
  ivory: "rgb(245, 244, 236)",
  petroleum: "rgb(18, 59, 67)",
  jade: "rgb(20, 125, 104)",
  jadeToken: "rgb(22, 134, 111)",
  white: "rgb(255, 255, 255)",
};

const hostMarkup = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/">ContaIA</a>
      <nav class="section-tabs" aria-label="Secciones">
        <button class="section-tab is-active" type="button"><b>01</b><span>Aprende</span></button>
        <button class="section-tab" type="button"><b>02</b><span>Herramientas</span></button>
      </nav>
    </header>
    <div class="main-shell main-shell-live">
      <div id="classroom-theme-test-host"></div>
    </div>
    <nav class="mobile-bottom-nav" aria-label="Navegación móvil">
      <button class="mobile-nav-item is-active" type="button"><span>⌂</span><small>Aula</small></button>
      <button class="mobile-nav-item" type="button"><span>□</span><small>Práctica</small></button>
      <button class="mobile-nav-item" type="button"><span>?</span><small>Nora</small></button>
    </nav>
  </div>`;

const onboardingStates = `
  <section class="onboarding-card" data-testid="classroom-theme-state-fixture" aria-labelledby="theme-state-title">
    <h2 id="theme-state-title">Revisión del caso ficticio</h2>
    <div class="feedback-box feedback-revise" data-state="review" role="status">
      <p class="feedback-status-label">Estado: Para revisar</p>
      <p>La evidencia disponible requiere una comprobación profesional.</p>
    </div>
    <div class="feedback-box feedback-neutral" data-state="error" role="status">
      <p class="feedback-status-label">Estado: Error de validación</p>
      <p>Falta una fuente; no se puede aceptar la respuesta todavía.</p>
    </div>
  </section>`;

async function mountHost(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
  }, hostMarkup);
}

async function renderScene(page, phaseIndex, highestUnlockedPhase, includeOnboarding = false) {
  await page.evaluate(async ({ phaseIndex: nextPhase, highestUnlockedPhase: unlocked, onboarding }) => {
    const [{ renderClassroom }, { courseModules }, { exercises }] = await Promise.all([
      import("/src/classroom.js"),
      import("/src/course.js"),
      import("/src/exercises.js"),
    ]);
    const module = courseModules[0];
    document.querySelector("#classroom-theme-test-host").innerHTML = renderClassroom({
      modules: courseModules,
      exercises,
      state: {
        activeModuleId: module.id,
        coursePhaseIndex: nextPhase,
        highestUnlockedPhase: unlocked,
        practiceStepIndex: 0,
        completedModules: new Set(),
        tutor: { avatarState: "idle", voiceEnabled: false },
        storageWarning: "",
      },
      onboarding,
      assetPath: (file) => `/assets/nora/${file}`,
      avatarLabel: "Nora está lista.",
      voiceSupported: false,
    });
  }, { phaseIndex, highestUnlockedPhase, onboarding: includeOnboarding ? onboardingStates : "" });
}

function parseRgb(value) {
  const channels = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
  return channels?.length >= 3 ? channels.slice(0, 3) : null;
}

function contrastRatio(foreground, background) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

async function readThemeContract(page) {
  return page.evaluate(() => {
    const solidBackground = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
      }
      return "rgb(245, 244, 236)";
    };
    const reading = [
      ".classroom-stage-heading h2",
      ".classroom-scene-copy h3",
      ".classroom-scene-lead",
      ".classroom-callout p",
      ".classroom-concepts li span",
      ".classroom-example p",
      ".classroom-action-instruction",
      ".classroom-action-how",
      ".classroom-guardrail",
      ".classroom-demonstration article p",
      ".classroom-demo-why",
      "[data-testid=classroom-theme-state-fixture] h2",
      "[data-testid=classroom-theme-state-fixture] .feedback-box p",
    ].flatMap((selector) => [...document.querySelectorAll(selector)]).filter((element) => element.textContent.trim());
    const phase = (index) => {
      const element = document.querySelector(`[data-class-phase="${index}"]`);
      const style = getComputedStyle(element);
      return {
        className: element.className,
        disabled: element.disabled,
        title: element.title,
        contrast: [style.color, solidBackground(element)],
      };
    };
    const shell = getComputedStyle(document.querySelector(".app-shell"));
    const primary = getComputedStyle(document.querySelector(".classroom-route-cta"));
    const heading = getComputedStyle(document.querySelector(".classroom-heading h1"));
    const progress = getComputedStyle(document.querySelector(".progress-track span"));
    return {
      shell: { background: shell.backgroundColor, colorScheme: shell.colorScheme },
      primary: { background: primary.backgroundColor, color: primary.color },
      progressBackground: progress.backgroundColor,
      headingColor: heading.color,
      active: phase(2),
      past: phase(1),
      pending: phase(4),
      reading: reading.map((element) => {
        const style = getComputedStyle(element);
        return [style.color, solidBackground(element), element.className];
      }),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const blocked = ["http:", "https:"].includes(url.protocol) && (
      url.origin !== LOCAL_ORIGIN || /\/api\/|supabase|tutor/i.test(`${url.pathname}${url.search}`)
    );
    if (blocked) return route.abort();
    return route.continue();
  });
});

test.describe("Aula de Aprende · tema Confianza fiscal", () => {
  test("usa marfil claro, petróleo y jade en los controles principales", async ({ page }) => {
    await mountHost(page);
    await renderScene(page, 2, 2, true);
    const contract = await readThemeContract(page);

    expect(contract.shell.background).toBe(COLORS.ivory);
    expect(contract.shell.colorScheme).toBe("light");
    expect(contract.primary.background).toBe(COLORS.jade);
    expect(contract.primary.color).toBe(COLORS.white);
    expect(contract.progressBackground).toBe(COLORS.jadeToken);
    expect(contract.headingColor).toBe(COLORS.petroleum);

    expect(contract.active.className).toContain("is-active");
    expect(contract.active.disabled).toBe(false);
    expect(contrastRatio(parseRgb(contract.active.contrast[0]), parseRgb(contract.active.contrast[1]))).toBeGreaterThanOrEqual(4.5);
    expect(contract.past.className).toContain("is-past");
    expect(contract.past.disabled).toBe(false);
    expect(contrastRatio(parseRgb(contract.past.contrast[0]), parseRgb(contract.past.contrast[1]))).toBeGreaterThanOrEqual(4.5);
    expect(contract.pending.disabled).toBe(true);
    expect(contract.pending.title).toBe("Pendiente");
    expect(contract.pending.className).not.toContain("is-active");
    expect(contract.pending.className).not.toContain("is-past");
    for (const state of ["review", "error"]) {
      const stateCard = page.locator(`[data-state="${state}"]`);
      await expect(stateCard).toBeVisible();
      await expect(stateCard).toHaveAttribute("role", "status");
    }

    for (const [color, background, selector] of contract.reading) {
      expect(
        contrastRatio(parseRgb(color), parseRgb(background)),
        `${selector} debe conservar contraste de lectura`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("las cinco escenas no desbordan el viewport móvil ni escritorio", async ({ page }, testInfo) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await mountHost(page);
      for (let phaseIndex = 0; phaseIndex < 5; phaseIndex += 1) {
        await renderScene(page, phaseIndex, Math.max(2, phaseIndex));
        await expect(page.locator(".classroom-scene")).toBeVisible();
        const overflow = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        expect(overflow.documentWidth, `fase ${phaseIndex + 1} a ${width}px`).toBeLessThanOrEqual(overflow.viewportWidth);
        if (width === 390) {
          const progressNote = await page.locator('.classroom-progress-explainer').boundingBox();
          expect(progressNote.width, 'el aviso de progreso no debe comprimirse en una columna lateral').toBeGreaterThanOrEqual(220);
        }
        if (phaseIndex === 0) {
          await expect(page.locator('.classroom-character img')).toHaveJSProperty('complete', true);
          const screenshot = testInfo.outputPath(`aula-confianza-fiscal-${width}.png`);
          await page.locator('.classroom-content').screenshot({ path: screenshot, animations: 'disabled', style: '.mobile-bottom-nav { visibility: hidden; }' });
          await testInfo.attach(`Aula local ${width}px`, { path: screenshot, contentType: 'image/png' });
        }
      }
    }
  });
});
