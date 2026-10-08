import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const allowedRoot = path.resolve(root);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

function resolvePublicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  let relative;
  if (decoded === "/") relative = "public/index.html";
  else if (decoded === "/favicon.svg" || decoded === "/manus-routes.json") relative = `public${decoded}`;
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
				"Cache-Control": "no-cache",
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
server.listen(port, "0.0.0.0", () => {
  console.log(`Laboratorio ContaIA listo en http://localhost:${port}`);
});
