import { createClient } from "@supabase/supabase-js";

const MAX_BODY_BYTES = 32_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2,3}$/;
const ZIP = /^[0-9]{5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOOL_KEYS = new Set(["cfdi", "accounting", "payroll", "diot", "monitor"]);
const ENVIRONMENTS = new Set(["sandbox", "production"]);
const CONNECTION_STATUSES = new Set(["not_configured", "pending", "connected", "degraded", "error", "disabled"]);
const ALERT_STATUSES = new Set(["open", "in_review", "resolved", "dismissed"]);
const DEADLINE_STATUSES = new Set(["pending", "completed", "overdue", "not_applicable"]);
const RESOURCES = new Set(["profiles", "connections", "alerts", "deadlines"]);

const PROFILE_COLUMNS = "id,legal_name,rfc,tax_regime,fiscal_zip,fiscal_email,phone,active,metadata,created_at,updated_at";
const CONNECTION_COLUMNS = "id,profile_id,tool_key,provider,environment,status,expires_at,last_checked_at,last_error,metadata,created_at,updated_at";
const ALERT_COLUMNS = "id,profile_id,tool_key,severity,status,title,detail,due_at,source_ref,metadata,acknowledged_by,acknowledged_at,created_at,updated_at";
const DEADLINE_COLUMNS = "id,profile_id,tool_key,title,period_label,due_at,status,source_url,metadata,created_at,updated_at";

const sendJson = (response, status, payload, headers = {}) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  response.end(JSON.stringify(payload));
};

function errorMessage(error) {
  if (error?.code === "23505") return "Ya existe un registro con esos datos.";
  if (error?.code === "23514") return "Los datos no cumplen las reglas de validación.";
  if (error?.code === "23503") return "El perfil fiscal indicado no existe o no está disponible.";
  return "No se pudo completar la operación.";
}

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

function getBearerToken(request) {
  const value = request.headers?.authorization || request.headers?.Authorization || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(value));
  return match?.[1] || "";
}

function getConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  let validUrl = false;
  try { validUrl = new URL(url).protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(new URL(url).hostname); } catch { /* configuración inválida */ }
  if (!validUrl || !/^sb_publishable_[A-Za-z0-9_-]{12,200}$/.test(key)) throw new Error("Supabase server no está configurado.");
  return { url, key };
}

function clientForRequest(request, env) {
  const token = getBearerToken(request);
  if (!token) throw Object.assign(new Error("Autenticación requerida."), { status: 401 });
  const { url, key } = getConfig(env);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function assertObject(value, name = "datos") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error(`${name} debe ser un objeto.`), { status: 400 });
  return value;
}

function assertSafeMetadata(value) {
  assertObject(value, "metadata");
  const forbidden = /secret|password|token|credential|certificate|private[_-]?key|csd|api[_-]?key/i;
  const visit = (node, depth = 0) => {
    if (depth > 5) throw Object.assign(new Error("metadata tiene demasiada profundidad."), { status: 400 });
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.test(key)) throw Object.assign(new Error("metadata no puede contener secretos ni credenciales."), { status: 400 });
      if (child && typeof child === "object" && !Array.isArray(child)) visit(child, depth + 1);
      if (Array.isArray(child)) child.filter((item) => item && typeof item === "object").forEach((item) => visit(item, depth + 1));
    }
  };
  visit(value);
  return value;
}

function optionalText(value, field, max = 300) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw Object.assign(new Error(`${field} no es válido.`), { status: 400 });
  return value.trim();
}

function requireUuid(value, field) {
  if (typeof value !== "string" || !UUID.test(value)) throw Object.assign(new Error(`${field} no es válido.`), { status: 400 });
  return value;
}

function parseProfileInput(body, partial = false) {
  const data = assertObject(body);
  const output = {};
  if (!partial || data.legal_name !== undefined) {
    if (typeof data.legal_name !== "string" || data.legal_name.trim().length < 1 || data.legal_name.trim().length > 300) throw Object.assign(new Error("legal_name no es válido."), { status: 400 });
    output.legal_name = data.legal_name.trim();
  }
  if (!partial || data.rfc !== undefined) {
    if (typeof data.rfc !== "string" || !RFC.test(data.rfc.trim().toUpperCase())) throw Object.assign(new Error("rfc no es válido."), { status: 400 });
    output.rfc = data.rfc.trim().toUpperCase();
  }
  for (const field of ["tax_regime", "phone"]) if (data[field] !== undefined) output[field] = optionalText(data[field], field, 120);
  if (data.fiscal_zip !== undefined) {
    if (data.fiscal_zip !== null && (typeof data.fiscal_zip !== "string" || !ZIP.test(data.fiscal_zip.trim()))) throw Object.assign(new Error("fiscal_zip no es válido."), { status: 400 });
    output.fiscal_zip = data.fiscal_zip === null ? null : data.fiscal_zip.trim();
  }
  if (data.fiscal_email !== undefined) {
    const email = optionalText(data.fiscal_email, "fiscal_email", 254);
    if (email && !EMAIL.test(email)) throw Object.assign(new Error("fiscal_email no es válido."), { status: 400 });
    output.fiscal_email = email;
  }
  if (data.active !== undefined) {
    if (typeof data.active !== "boolean") throw Object.assign(new Error("active no es válido."), { status: 400 });
    output.active = data.active;
  }
  if (data.metadata !== undefined) {
    assertSafeMetadata(data.metadata);
    if (JSON.stringify(data.metadata).length > 8_000) throw Object.assign(new Error("metadata supera el límite permitido."), { status: 400 });
    output.metadata = data.metadata;
  }
  return output;
}

function parseConnectionInput(body, partial = false) {
  const data = assertObject(body);
  for (const forbidden of ["secret", "password", "private_key", "csd", "certificate", "credential", "token"]) {
    if (Object.keys(data).some((key) => key.toLowerCase().includes(forbidden))) throw Object.assign(new Error("No envíes secretos ni credenciales a esta ruta."), { status: 400 });
  }
  const output = {};
  if (!partial || data.profile_id !== undefined) output.profile_id = requireUuid(data.profile_id, "profile_id");
  if (!partial || data.tool_key !== undefined) {
    if (typeof data.tool_key !== "string" || !TOOL_KEYS.has(data.tool_key)) throw Object.assign(new Error("tool_key no es válido."), { status: 400 });
    output.tool_key = data.tool_key;
  }
  if (data.provider !== undefined) output.provider = optionalText(data.provider, "provider", 120);
  if (data.environment !== undefined) {
    if (!ENVIRONMENTS.has(data.environment)) throw Object.assign(new Error("environment no es válido."), { status: 400 });
    output.environment = data.environment;
  }
  if (data.status !== undefined) {
    if (!CONNECTION_STATUSES.has(data.status)) throw Object.assign(new Error("status no es válido."), { status: 400 });
    output.status = data.status;
  }
  if (data.expires_at !== undefined) {
    if (data.expires_at !== null && (typeof data.expires_at !== "string" || Number.isNaN(Date.parse(data.expires_at)))) throw Object.assign(new Error("expires_at no es válido."), { status: 400 });
    output.expires_at = data.expires_at;
  }
  if (data.metadata !== undefined) {
    assertSafeMetadata(data.metadata);
    if (JSON.stringify(data.metadata).length > 8_000) throw Object.assign(new Error("metadata supera el límite permitido."), { status: 400 });
    output.metadata = data.metadata;
  }
  return output;
}

function parseStatusInput(body, resource) {
  const data = assertObject(body);
  const status = String(data.status || "");
  const allowed = resource === "alerts" ? ALERT_STATUSES : DEADLINE_STATUSES;
  if (!allowed.has(status)) throw Object.assign(new Error("status no es válido."), { status: 400 });
  return { status };
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += Buffer.byteLength(chunk);
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("El cuerpo supera el límite permitido."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON inválido."), { status: 400 }); }
}

function parseResource(request) {
  const url = new URL(request.url || "/api/tools", "http://localhost");
  const resource = url.searchParams.get("resource") || "profiles";
  if (!RESOURCES.has(resource)) throw Object.assign(new Error("resource no es válido."), { status: 400 });
  return { resource, id: url.searchParams.get("id"), profileId: url.searchParams.get("profileId") };
}

function tableFor(resource) {
  return { profiles: "fiscal_profiles", connections: "tool_connections", alerts: "fiscal_alerts", deadlines: "fiscal_deadlines" }[resource];
}

function columnsFor(resource) {
  return { profiles: PROFILE_COLUMNS, connections: CONNECTION_COLUMNS, alerts: ALERT_COLUMNS, deadlines: DEADLINE_COLUMNS }[resource];
}

async function handleGet(client, descriptor) {
  const { resource, id, profileId } = descriptor;
  let query = client.from(tableFor(resource)).select(columnsFor(resource)).order("created_at", { ascending: false }).limit(100);
  if (id) query = query.eq("id", requireUuid(id, "id"));
  if (profileId) query = query.eq("profile_id", requireUuid(profileId, "profileId"));
  const { data, error } = await query;
  if (error) throw error;
  return { data: data || [], resource };
}

async function handleMutation(client, request, descriptor) {
  const { resource, id } = descriptor;
  const body = await readJson(request);
  if (request.method === "POST") {
    if (resource === "profiles") {
      const { data, error } = await client.from("fiscal_profiles").insert(parseProfileInput(body)).select(PROFILE_COLUMNS).single();
      if (error) throw error;
      return { status: 201, body: { data, resource } };
    }
    if (resource === "connections") {
      const input = parseConnectionInput(body);
      const { data, error } = await client.from("tool_connections").insert(input).select(CONNECTION_COLUMNS).single();
      if (error) throw error;
      return { status: 201, body: { data, resource } };
    }
    throw Object.assign(new Error("Este recurso solo admite lectura o actualización de estado."), { status: 405 });
  }
  if (!id) throw Object.assign(new Error("id es obligatorio para actualizar."), { status: 400 });
  requireUuid(id, "id");
  if (resource === "profiles") {
    const { data, error } = await client.from("fiscal_profiles").update(parseProfileInput(body, true)).eq("id", id).select(PROFILE_COLUMNS).single();
    if (error) throw error;
    return { body: { data, resource } };
  }
  if (resource === "connections") {
    const { data, error } = await client.from("tool_connections").update(parseConnectionInput(body, true)).eq("id", id).select(CONNECTION_COLUMNS).single();
    if (error) throw error;
    return { body: { data, resource } };
  }
  if (resource === "alerts" || resource === "deadlines") {
    const { data, error } = await client.from(tableFor(resource)).update(parseStatusInput(body, resource)).eq("id", id).select(columnsFor(resource)).single();
    if (error) throw error;
    return { body: { data, resource } };
  }
  throw Object.assign(new Error("Método no permitido."), { status: 405 });
}

export async function handleTools(request, response, env = process.env) {
  if (!originAllowed(request, env)) return sendJson(response, 403, { error: "Origen no autorizado." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Cache-Control": "no-store", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept", "X-Content-Type-Options": "nosniff" });
    return response.end();
  }
  if (!["GET", "POST", "PATCH"].includes(request.method)) return sendJson(response, 405, { error: "Método no permitido." });
  let descriptor;
  try {
    descriptor = parseResource(request);
    const client = clientForRequest(request, env);
    const { data: userData, error: userError } = await client.auth.getUser(getBearerToken(request));
    if (userError || !userData.user) return sendJson(response, 401, { error: "Sesión no válida." });
    if (request.method === "GET") return sendJson(response, 200, await handleGet(client, descriptor));
    const result = await handleMutation(client, request, descriptor);
    return sendJson(response, result.status || 200, result.body);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : error?.code === "PGRST116" ? 404 : error?.code?.startsWith("23") ? 409 : 500;
    return sendJson(response, status, { error: status === 500 ? errorMessage(error) : error.message });
  }
}

export const __test = { parseProfileInput, parseConnectionInput, parseStatusInput, getBearerToken };
