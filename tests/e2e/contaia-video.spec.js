import { test, expect } from "@playwright/test";

const sizes = [
  { width: 320, height: 720, asset: "480p", videoWidth: 854 },
  { width: 390, height: 844, asset: "480p", videoWidth: 854 },
  { width: 768, height: 900, asset: "720p", videoWidth: 1280 },
  { width: 1024, height: 900, asset: "720p", videoWidth: 1280 },
  { width: 1280, height: 900, asset: "contaia-analizador-cfdi-loop.mp4", videoWidth: 1920 },
  { width: 1920, height: 1080, asset: "contaia-analizador-cfdi-loop.mp4", videoWidth: 1920 },
];

test("el componente es responsivo y selecciona un video optimizado según el ancho", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => import("/assets/contaia-video.js"));
  await page.evaluate(() => {
    const mount = document.createElement("div");
    mount.id = "video-component-check";
    mount.style.cssText = "position:fixed;left:0;top:12px;width:100vw;z-index:2147483000;background:#001b2a";
    const video = document.createElement("contaia-video");
    video.setAttribute("src", "/videos/contaia-analizador-cfdi-loop.mp4");
    video.setAttribute("src-720", "/videos/contaia-analizador-cfdi-loop-720p.mp4");
    video.setAttribute("src-480", "/videos/contaia-analizador-cfdi-loop-480p.mp4");
    video.setAttribute("poster", "/videos/contaia-analizador-cfdi-poster.webp");
    video.setAttribute("label", "Animación financiera de prueba");
    video.setAttribute("autoplay", "");
    video.setAttribute("decorative", "");
    mount.append(video);
    document.body.append(mount);
  });

  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    const host = page.locator("contaia-video");
    const video = host.locator("video");
    await expect.poll(() => video.evaluate((node) => node.currentSrc), { timeout: 8000 }).toContain(size.asset);
    await expect.poll(() => video.evaluate((node) => node.readyState), { timeout: 12000 }).toBeGreaterThanOrEqual(1);

    const result = await page.evaluate(() => {
      const host = document.querySelector("contaia-video");
      const video = host.shadowRoot.querySelector("video");
      const rect = host.getBoundingClientRect();
      return {
        hostWidth: rect.width,
        hostHeight: rect.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        muted: video.muted,
        loop: video.loop,
        playsInline: video.playsInline,
        preload: video.preload,
        controlLabel: host.shadowRoot.querySelector("button").getAttribute("aria-label"),
      };
    });
    expect(result.hostWidth).toBeLessThanOrEqual(size.width + 1);
    expect(result.hostWidth).toBeGreaterThan(size.width * 0.95);
    expect(result.hostHeight).toBeCloseTo(result.hostWidth * 9 / 16, 0);
    expect(result.videoWidth).toBe(size.videoWidth);
    expect(result.videoHeight).toBe(size.videoWidth === 854 ? 480 : size.videoWidth === 1280 ? 720 : 1080);
    expect(result.muted).toBe(true);
    expect(result.loop).toBe(true);
    expect(result.playsInline).toBe(true);
    expect(result.preload).toBe("metadata");
    expect(result.controlLabel).toMatch(/Pausar|Reproducir/);
  }
});

test("respeta movimiento reducido y deja reproducir o pausar con el control accesible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => import("/assets/contaia-video.js"));
  await page.evaluate(() => {
    const video = document.createElement("contaia-video");
    video.setAttribute("src", "/videos/contaia-analizador-cfdi-loop.mp4");
    video.setAttribute("src-720", "/videos/contaia-analizador-cfdi-loop-720p.mp4");
    video.setAttribute("src-480", "/videos/contaia-analizador-cfdi-loop-480p.mp4");
    video.setAttribute("autoplay", "");
    video.style.cssText = "position:fixed;top:12px;left:0;width:100vw;z-index:2147483000";
    document.body.append(video);
  });
  const video = page.locator("contaia-video video");
  const button = page.locator("contaia-video button");
  await expect.poll(() => video.evaluate((node) => node.readyState), { timeout: 12000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await expect(button).toHaveAttribute("aria-label", "Reproducir animación");
  await button.click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  await button.click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
});

test("la ruta del video sirve rangos parciales con MIME y caché adecuados", async ({ request }) => {
  const response = await request.get("/videos/contaia-analizador-cfdi-loop-480p.mp4", {
    headers: { Range: "bytes=0-1023" },
  });
  expect(response.status()).toBe(206);
  expect(response.headers()["content-type"]).toContain("video/mp4");
  expect(response.headers()["accept-ranges"]).toBe("bytes");
  expect(response.headers()["content-range"]).toMatch(/^bytes 0-1023\//);
  expect(response.headers()["cache-control"]).toContain("max-age=86400");
  expect((await response.body()).byteLength).toBe(1024);
});
