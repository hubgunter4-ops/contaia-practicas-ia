const ANAM_SESSION_ENDPOINT = "https://api.anam.ai/v1/auth/session-token";
const SESSION_TOKEN_TIMEOUT_MS = 8_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 8;
const rateBuckets = new Map();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function allowedOrigins(env) {
  return String(env.TUTOR_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function applyCors(req, res, env) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  const protocol = req.headers?.["x-forwarded-proto"]?.split(",")[0]?.trim() || (req.socket?.encrypted ? "https" : "http");
  const sameOrigin = origin === `${protocol}://${req.headers?.host}`;
  if (!sameOrigin && !allowedOrigins(env).includes(origin)) return false;
  res.setHeader?.("Access-Control-Allow-Origin", origin);
  res.setHeader?.("Vary", "Origin");
  res.setHeader?.("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader?.("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader?.("Access-Control-Max-Age", "600");
  return true;
}

function isRateLimited(req, now = Date.now()) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress) || "unknown";
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    if (rateBuckets.size > 1000) {
      for (const [key, item] of rateBuckets) if (now - item.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

export async function handleAnamSession(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  if (!applyCors(req, res, env)) return json(res, 403, { error: "Origen no permitido." });
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  if (req.method !== "POST") {
    return json(res, 405, { error: "Método no permitido." }, { Allow: "POST, OPTIONS" });
  }
  if (isRateLimited(req)) return json(res, 429, { error: "Se alcanzó el límite temporal de sesiones. Inténtalo más tarde." });

  const apiKey = typeof env.ANAM_API_KEY === "string" ? env.ANAM_API_KEY.trim() : "";
  const avatarId = typeof env.ANAM_AVATAR_ID === "string" ? env.ANAM_AVATAR_ID.trim() : "";
  const voiceId = typeof env.ANAM_VOICE_ID === "string" ? env.ANAM_VOICE_ID.trim() : "";
  if (!apiKey || !UUID.test(avatarId) || !UUID.test(voiceId)) {
    return json(res, 503, { error: "La sesión en vivo de Nora aún no está configurada en el servidor." });
  }

  try {
    const upstream = await fetchImpl(ANAM_SESSION_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        personaConfig: {
          name: "Nora",
          avatarId,
          voiceId,
          llmId: "CUSTOMER_CLIENT_V1",
          languageCode: "es",
          skipGreeting: true,
        },
        sessionOptions: { sessionReplay: { enableSessionReplay: false } },
      }),
      signal: AbortSignal.timeout(SESSION_TOKEN_TIMEOUT_MS),
    });
    if (!upstream.ok) return json(res, 502, { error: "Anam no pudo iniciar la sesión. Revisa la configuración del servidor e inténtalo de nuevo." });
    const payload = await upstream.json();
    if (typeof payload?.sessionToken !== "string" || !payload.sessionToken.trim()) {
      return json(res, 502, { error: "Anam no devolvió un token de sesión válido." });
    }
    return json(res, 200, { sessionToken: payload.sessionToken });
  } catch {
    return json(res, 502, { error: "No se pudo conectar con Anam. Inténtalo de nuevo." });
  }
}
