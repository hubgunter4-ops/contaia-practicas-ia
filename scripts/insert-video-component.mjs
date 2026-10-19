#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Argumento inesperado: ${token}`);
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replaceAll("_", "-");
    if (["help", "dry-run"].includes(key)) values[key] = true;
    else {
      const value = inlineValue ?? argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Falta un valor para --${key}`);
      values[key] = value;
    }
  }
  return values;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTarget(html, id) {
  const escapedId = escapeRegExp(id);
  const opening = new RegExp(`<([A-Za-z][\\w:-]*)\\b(?=[^>]*\\bid\\s*=\\s*(["'])${escapedId}\\2)[^>]*>`, "i");
  const match = opening.exec(html);
  if (!match) throw new Error(`No se encontró un elemento con id="${id}".`);
  const tag = match[1];
  if (["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"].includes(tag.toLowerCase())) {
    throw new Error(`El destino #${id} es un elemento vacío y no puede contener el video.`);
  }
  const openEnd = match.index + match[0].length;
  const tokenPattern = new RegExp(`<\\/?${escapeRegExp(tag)}\\b[^>]*>`, "gi");
  tokenPattern.lastIndex = openEnd;
  let depth = 1;
  let closingStart = -1;
  let token;
  while ((token = tokenPattern.exec(html))) {
    if (/^<\//.test(token[0])) depth -= 1;
    else if (!/\/>$/.test(token[0])) depth += 1;
    if (depth === 0) {
      closingStart = token.index;
      break;
    }
  }
  if (closingStart < 0) throw new Error(`No se encontró el cierre </${tag}> del destino #${id}.`);
  return { openEnd, closingStart };
}

function help() {
  console.log(`Uso:
  node scripts/insert-video-component.mjs --page public/otra-pagina.html --target-id hero
    [--video-id contaia-hero] [--position start|end]
    [--src /videos/contaia-analizador-cfdi-loop.mp4]
    [--src-720 /videos/contaia-analizador-cfdi-loop-720p.mp4]
    [--src-480 /videos/contaia-analizador-cfdi-loop-480p.mp4]
    [--poster /videos/contaia-analizador-cfdi-poster.webp]
    [--label "Animación financiera de ContaIA"] [--dry-run]

El comando agrega <contaia-video> en el contenedor indicado, carga el módulo una sola vez
antes de </body> y no duplica una inserción existente con el mismo --video-id.`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    process.exit(0);
  }
  if (!args.page || !args["target-id"]) throw new Error("Debes indicar --page y --target-id.");
  const id = args["video-id"] || `contaia-video-${args["target-id"]}`;
  const position = args.position || "end";
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) throw new Error("--video-id debe ser un identificador HTML válido.");
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(args["target-id"])) throw new Error("--target-id debe ser un identificador HTML válido.");
  if (!["start", "end"].includes(position)) throw new Error("--position acepta start o end.");

  const pagePath = path.resolve(root, args.page);
  const relative = path.relative(root, pagePath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(pagePath).toLowerCase() !== ".html") {
    throw new Error("--page debe ser un archivo .html dentro del proyecto.");
  }
  let html = await readFile(pagePath, "utf8");
  if (new RegExp(`data-contaia-video\\s*=\\s*(["'])${escapeRegExp(id)}\\1`, "i").test(html)) {
    console.log(`El video ${id} ya está insertado en ${relative}; no se hicieron cambios.`);
    process.exit(0);
  }
  const target = findTarget(html, args["target-id"]);
  const source1080 = args.src || "/videos/contaia-analizador-cfdi-loop.mp4";
  const source720 = args["src-720"] || "/videos/contaia-analizador-cfdi-loop-720p.mp4";
  const source480 = args["src-480"] || "/videos/contaia-analizador-cfdi-loop-480p.mp4";
  const poster = args.poster || "/videos/contaia-analizador-cfdi-poster.webp";
  const label = args.label || "Animación financiera de ContaIA, sin sonido";
  const component = `\n  <contaia-video data-contaia-video="${escapeHtml(id)}" id="${escapeHtml(id)}" src="${escapeHtml(source1080)}" src-720="${escapeHtml(source720)}" src-480="${escapeHtml(source480)}" poster="${escapeHtml(poster)}" label="${escapeHtml(label)}" autoplay loop muted playsinline decorative></contaia-video>\n`;
  const insertionPoint = position === "start" ? target.openEnd : target.closingStart;
  html = `${html.slice(0, insertionPoint)}${component}${html.slice(insertionPoint)}`;
  if (!/\bsrc\s*=\s*["']\/assets\/contaia-video\.js["']/i.test(html)) {
    const script = '  <script type="module" src="/assets/contaia-video.js"></script>\n';
    if (/<\/head\s*>/i.test(html)) html = html.replace(/<\/head\s*>/i, `${script}</head>`);
    else if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, `${script}</body>`);
    else throw new Error("No se encontró </head> ni </body> para cargar el componente.");
  }
  if (args["dry-run"]) {
    process.stdout.write(html);
  } else {
    await writeFile(pagePath, html, "utf8");
    console.log(`Video ${id} insertado en ${relative} (#${args["target-id"]}, posición: ${position}).`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
