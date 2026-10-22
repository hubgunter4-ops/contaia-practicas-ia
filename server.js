import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleTutorConfig, handleTutorStream } from "./src/tutor/server.js";
import { handleAnamSession } from "./src/tutor/anam-session.js";
import { handleCfdiConfig } from "./src/cfdi/server.js";
import { handleTools } from "./src/tools/server.js";
import { handleDocuments } from "./src/documents/server.js";
import { handleAuth } from "./src/auth/server.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const allowedRoot = path.resolve(root);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

async function loadDotEnv() {
  try {
    const contents = await readFile(path.join(root, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env || match[2].startsWith("#")) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function resolvePublicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  let relative;
  if (decoded === "/" || decoded === "/registro" || decoded === "/confirmar-correo" || decoded === "/recuperar-contrasena" || /^\/descripcion\/(cfdi|asistente|anam|curso)\/?$/.test(decoded)) relative = "public/index.html";
  else if (decoded === "/favicon.svg" || decoded === "/manus-routes.json") relative = `public${decoded}`;
  else if (/^\/brand\/contaia-logo(?:-(?:64|192))?\.png$/.test(decoded)) relative = `public${decoded}`;
  else if (decoded === "/vendor/anam-sdk.js") relative = "dist/vendor/anam-sdk.js";
  else if (decoded === "/vendor/document-reader.js") relative = "dist/vendor/document-reader.js";
  else if (decoded === "/vendor/cfdi-parser.js") relative = "dist/vendor/cfdi-parser.js";
  else if (decoded === "/vendor/reconciliation-xlsx.js") relative = "dist/vendor/reconciliation-xlsx.js";
  else if (decoded === "/vendor/supabase.js") relative = "dist/vendor/supabase.js";
  else if (decoded === "/vendor/pdf.worker.mjs") relative = "dist/vendor/pdf.worker.mjs";
  else if (decoded === "/tutor-config.js") relative = "public/tutor-config.js";
  else if (decoded.startsWith("/assets/")) relative = `public${decoded}`;
  else if (decoded.startsWith("/videos/")) {
    const videosRoot = path.resolve(root, "public/videos");
    const candidate = path.resolve(root, `public${decoded}`);
    const withinVideos = path.relative(videosRoot, candidate);
    if (!withinVideos || withinVideos === ".." || withinVideos.startsWith(`..${path.sep}`) || path.isAbsolute(withinVideos)) return null;
    relative = path.relative(root, candidate);
  }
  else if (/^\/(src|data)\//.test(decoded)) relative = decoded.slice(1);
  else if (decoded.startsWith("/docs/curso/") && path.extname(decoded) === ".md") {
    const courseRoot = path.resolve(root, "docs/curso");
    const candidate = path.resolve(root, decoded.slice(1));
    const withinCourse = path.relative(courseRoot, candidate);
    if (!withinCourse || withinCourse === ".." || withinCourse.startsWith(`..${path.sep}`) || path.isAbsolute(withinCourse)) return null;
    relative = path.relative(root, candidate);
  }
  else if (decoded.startsWith("/docs/curso/videos/") && path.extname(decoded) === ".mp4") {
    const videosRoot = path.resolve(root, "docs/curso/videos");
    const candidate = path.resolve(root, decoded.slice(1));
    const withinVideos = path.relative(videosRoot, candidate);
    if (!withinVideos || withinVideos === ".." || withinVideos.startsWith(`..${path.sep}`) || path.isAbsolute(withinVideos)) return null;
    relative = path.relative(root, candidate);
  }
  else return null;

  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(`${allowedRoot}${path.sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname === "/api/tutor/config") return handleTutorConfig(request, response);
  if (pathname === "/api/cfdi/config") return handleCfdiConfig(request, response);
  if (pathname === "/api/tools") return handleTools(request, response);
  if (pathname === "/api/documents") return handleDocuments(request, response);
  if (pathname === "/api/auth") return handleAuth(request, response);
  if (pathname === "/api/tutor/stream") return handleTutorStream(request, response);
  if (pathname === "/api/tutor/anam-session") return handleAnamSession(request, response);
  const filePath = resolvePublicPath(pathname);
  if (!filePath || !["GET", "HEAD"].includes(request.method ?? "GET")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    response.end("No encontrado");
    return;
  }

	try {
		const isVideo = path.extname(filePath) === ".mp4";
		if (isVideo) {
			const fileStat = await stat(filePath);
			const range = request.headers.range;
			const headers = {
				"Content-Type": mime[".mp4"],
				"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
				"Referrer-Policy": "strict-origin-when-cross-origin",
				"X-Content-Type-Options": "nosniff",
				"Accept-Ranges": "bytes",
			};
			if (range) {
				const match = /^bytes=(\d*)-(\d*)$/.exec(range);
				if (!match || (!match[1] && !match[2])) {
					response.writeHead(416, { ...headers, "Content-Range": `bytes */${fileStat.size}` });
					response.end();
					return;
				}
				const suffixLength = match[1] ? null : Number(match[2]);
				const start = match[1] ? Number(match[1]) : Math.max(fileStat.size - suffixLength, 0);
				const end = match[1] ? (match[2] ? Number(match[2]) : fileStat.size - 1) : fileStat.size - 1;
				if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= fileStat.size) {
					response.writeHead(416, { ...headers, "Content-Range": `bytes */${fileStat.size}` });
					response.end();
					return;
				}
				response.writeHead(206, {
					...headers,
					"Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
					"Content-Length": end - start + 1,
				});
				if (request.method === "HEAD") response.end();
				else createReadStream(filePath, { start, end }).pipe(response);
				return;
			}
			response.writeHead(200, { ...headers, "Content-Length": fileStat.size });
			if (request.method === "HEAD") response.end();
			else createReadStream(filePath).pipe(response);
			return;
		}
		const body = await readFile(filePath);
		response.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    response.end("No encontrado");
  }
});

const port = Number(process.env.PORT ?? 3000);
await loadDotEnv();
server.listen(port, "0.0.0.0", () => {
  console.log(`Laboratorio ContaIA listo en http://localhost:${port}`);
});
