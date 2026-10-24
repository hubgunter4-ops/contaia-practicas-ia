import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 16 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { startedAt: number; count: number }>();

const json = (status: number, payload: Record<string, unknown>) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  },
});

function normalizedIdentifier(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_identifier");
  const identifier = value.trim().toLowerCase();
  if (!identifier || identifier.length < 3 || identifier.length > 254 || /[\u0000-\u001f\u007f]/.test(identifier)) throw new Error("invalid_identifier");
  return identifier;
}

function normalizedPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) throw new Error("invalid_password");
  return value;
}

function normalizedCaptchaToken(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("invalid_captcha");
  return value;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateAllowed(request: Request): boolean {
  const key = clientIp(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function originAllowed(request: Request): boolean {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  return !origin || allowed.length === 0 || allowed.includes(origin);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) throw new Error("body_too_large");
  const value = JSON.parse(new TextDecoder().decode(raw));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json");
  return value as Record<string, unknown>;
}

function publicSession(session: any) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: { id: session.user.id, email: session.user.email, user_metadata: session.user.user_metadata || {} },
  };
}

function authFailure(error: unknown): { status: number; error: string } {
  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  if (/captcha|hcaptcha|verification|verificación/.test(message)) {
    return { status: 400, error: "La verificación de seguridad caducó o no fue aceptada. Completa el captcha nuevamente." };
  }
  if (Number((error as { status?: unknown })?.status) === 429) {
    return { status: 429, error: "Demasiados intentos. Espera unos minutos antes de volver a probar." };
  }
  return { status: 401, error: "Correo, usuario o contraseña incorrectos." };
}

Deno.serve(async (request) => {
  if (!originAllowed(request)) return json(403, { error: "Origen no autorizado." });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" } });
  if (request.method !== "POST") return json(405, { error: "Método no permitido." });
  if (!rateAllowed(request)) return json(429, { error: "Demasiados intentos. Espera unos minutos antes de volver a probar." });

  try {
    const body = await readBody(request);
    const identifier = normalizedIdentifier(body.identifier);
    const password = normalizedPassword(body.password);
    const captchaToken = normalizedCaptchaToken(body.captchaToken);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !serviceKey || !anonKey) return json(503, { error: "La autenticación no está configurada." });

    const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let email = identifier;
    if (!identifier.includes("@")) {
      const { data, error } = await serviceClient.rpc("resolve_login_email_for_service", { login_identifier: identifier });
      if (error || typeof data !== "string" || !data) return json(401, { error: "Correo, usuario o contraseña incorrectos." });
      email = data;
    }

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const options = captchaToken ? { captchaToken } : undefined;
    const { data, error } = await authClient.auth.signInWithPassword({ email, password, ...(options ? { options } : {}) });
    if (error || !data.session || !data.user) {
      const failure = authFailure(error);
      return json(failure.status, { error: failure.error });
    }
    return json(200, { session: publicSession(data.session) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    if (["invalid_identifier", "invalid_password", "invalid_json", "invalid_captcha"].includes(code)) return json(400, { error: "Correo o usuario y contraseña no válidos." });
    if (code === "body_too_large") return json(413, { error: "La solicitud supera el límite permitido." });
    return json(500, { error: "No se pudo iniciar sesión." });
  }
});
