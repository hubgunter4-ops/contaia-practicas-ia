import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceScript = path.join(projectRoot, "scripts/insert-video-component.mjs");

async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "contaia-video-insert-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(path.join(temp, "scripts"), { recursive: true });
  await mkdir(path.join(temp, "public"), { recursive: true });
  const script = path.join(temp, "scripts/insert-video-component.mjs");
  const page = path.join(temp, "public/page.html");
  await copyFile(sourceScript, script);
  await writeFile(page, '<!doctype html><html><head></head><body><main id="hero"><h1>Hola</h1></main></body></html>');
  return { temp, script, page };
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("inserta el componente y carga su módulo en head", async (t) => {
  const { script, page } = await fixture(t);
  const result = run(script, ["--page", "public/page.html", "--target-id", "hero", "--video-id", "video-hero"]);
  assert.equal(result.status, 0, result.stderr);
  const html = await readFile(page, "utf8");
  assert.match(html, /<contaia-video[^>]*data-contaia-video="video-hero"/);
  assert.match(html, /<script type="module" src="\/assets\/contaia-video\.js"><\/script>/);
  assert.ok(html.indexOf("<contaia-video") < html.indexOf("</main>"));
});

test("la segunda ejecución no duplica el componente ni el import", async (t) => {
  const { script, page } = await fixture(t);
  for (let i = 0; i < 2; i += 1) {
    const result = run(script, ["--page", "public/page.html", "--target-id", "hero", "--video-id", "video-hero"]);
    assert.equal(result.status, 0, result.stderr);
  }
  const html = await readFile(page, "utf8");
  assert.equal((html.match(/data-contaia-video="video-hero"/g) || []).length, 1);
  assert.equal((html.match(/\/assets\/contaia-video\.js/g) || []).length, 1);
});

test("rechaza rutas fuera del proyecto y destinos ausentes", async (t) => {
  const { script } = await fixture(t);
  const outside = run(script, ["--page", "../secreto.html", "--target-id", "hero"]);
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /dentro del proyecto/);
  const missing = run(script, ["--page", "public/page.html", "--target-id", "no-existe"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /No se encontró un elemento/);
});
