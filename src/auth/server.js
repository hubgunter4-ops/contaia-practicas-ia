import { createClient } from "@supabase/supabase-js";

const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 8;
const rateBuckets = new Map();

const sendJson = (response, status, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(body);
};

function originAllowed(request, env) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  const protocol = request.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || (request.socket?.encrypted ? "https" : "http");
  const sameOrigin = origin === `${protocol}://${request.headers.host}`;
  const allowed = String(env.TUTOR_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
  return sameOrigin || allowed || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
}

function getClientIp(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.socket?.remoteAddress) || "unknown";
}

function withinRateLimit(request) {
  const key = getClientIp(request);
  const now = Date.now();
  const previous = rateBuckets.get(key);
  if (!previous || now - previous.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (previous.count >= RATE_LIMIT) return false;
  previous.count += 1;
  return true;
}

async function readJson(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += Buffer.byteLength(chunk);
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("La solicitud supera el límite permitido."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("La solicitud no contiene JSON válido."), { status: 400 }); }
}

function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  let validUrl = false;
  try { validUrl = new URL(url).protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(new URL(url).hostname); } catch { /* configuración inválida */ }
  if (!validUrl || !/^sb_publishable_[A-Za-z0-9_-]{12,200}$/.test(key)) throw Object.assign(new Error("La autenticación no está configurada."), { status: 503 });
  return { url, key };
}

function normalizeIdentifier(value) {
  if (typeof value !== "string") throw Object.assign(new Error("Escribe tu correo o usuario."), { status: 400 });
  const identifier = value.trim().toLowerCase();
  if (!identifier || identifier.length < 3 || identifier.length > 254 || /[\u0000-\u001f\u007f]/.test(identifier)) throw Object.assign(new Error("El correo o usuario no es válido."), { status: 400 });
  return identifier;
}

function normalizePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) throw Object.assign(new Error("La contraseña debe tener entre 8 y 128 caracteres."), { status: 400 });
  return value;
}

function publicSession(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: { id: session.user.id, email: session.user.email, user_metadata: session.user.user_metadata || {} },
  };
}

export async function handleAuth(request, response, env = process.env) {
  if (!originAllowed(request, env)) return sendJson(response, 403, { error: "Origen no autorizado." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Cache-Control": "no-store", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept", "X-Content-Type-Options": "nosniff" });
    return response.end();
  }
  if (request.method !== "POST") return sendJson(response, 405, { error: "Método no permitido." });
  if (!withinRateLimit(request)) return sendJson(response, 429, { error: "Demasiados intentos. Espera unos minutos antes de volver a probar." });
  try {
    const body = await readJson(request);
    const identifier = normalizeIdentifier(body?.identifier);
    const password = normalizePassword(body?.password);
    if (!identifier.includes("@")) {
      const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) return sendJson(response, 503, { error: "La autenticación no está configurada." });
      const upstream = await fetch(`${url}/functions/v1/login-by-alias`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier, password }) });
      const payload = await upstream.text();
      response.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      return response.end(payload);
    }
    const { url, key } = supabaseConfig(env);
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: identifier, password });
    if (error || !data.session || !data.user) return sendJson(response, 401, { error: "El correo o alias no coincide con la contraseña." });
    return sendJson(response, 200, { session: publicSession(data.session) });
  } catch (error) {
    return sendJson(response, Number.isInteger(error?.status) ? error.status : 500, { error: Number.isInteger(error?.status) ? error.message : "No se pudo iniciar sesión." });
  }
}

export const __test = { normalizeIdentifier, normalizePassword, publicSession };
