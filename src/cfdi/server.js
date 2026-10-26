const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(payload));
};

function originAllowed(request, env) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  const protocol = request.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || (request.socket?.encrypted ? "https" : "http");
  const sameOrigin = origin === `${protocol}://${request.headers.host}`;
  const allowed = String(env.TUTOR_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).includes(origin);
  return sameOrigin || allowed || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
}

function publicCaptchaConfig(env) {
  const validSitekey = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value.trim())
    ? value.trim()
    : "";
  const turnstileSitekey = validSitekey(env.TURNSTILE_SITEKEY);
  const hcaptchaSitekey = validSitekey(env.HCAPTCHA_SITEKEY);
  const configuredProvider = typeof env.CAPTCHA_PROVIDER === "string" ? env.CAPTCHA_PROVIDER.trim().toLowerCase() : "";
  const provider = configuredProvider
    ? (Object.hasOwn({ turnstile: true, hcaptcha: true }, configuredProvider) ? configuredProvider : "")
    : "";
  const captchaSitekey = provider === "turnstile" ? turnstileSitekey : provider === "hcaptcha" ? hcaptchaSitekey : "";
  return captchaSitekey ? { captchaProvider: provider, captchaSitekey } : { captchaProvider: "", captchaSitekey: "" };
}

export async function handleCfdiConfig(request, response, env = process.env) {
  if (!originAllowed(request, env)) return sendJson(response, 403, { error: "Origen no autorizado." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Cache-Control": "no-store", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept", "X-Content-Type-Options": "nosniff" });
    return response.end();
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "Método no permitido." });
  const url = typeof env.SUPABASE_URL === "string" ? env.SUPABASE_URL.trim().replace(/\/$/, "") : "";
  const publishableKey = typeof env.SUPABASE_PUBLISHABLE_KEY === "string" ? env.SUPABASE_PUBLISHABLE_KEY.trim() : "";
  const captcha = publicCaptchaConfig(env);
  let validUrl = false;
  try { validUrl = new URL(url).protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(new URL(url).hostname); } catch { /* valor omitido */ }
  const validKey = /^sb_publishable_[A-Za-z0-9_-]{12,200}$/.test(publishableKey);
  if (!validUrl || !validKey) return sendJson(response, 200, { enabled: false, ...captcha });
  sendJson(response, 200, { enabled: true, url, publishableKey, ...captcha });
}
