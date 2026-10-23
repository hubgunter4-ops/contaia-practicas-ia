function apiBase(defaultValue = globalThis.CONTAIA_TUTOR_API_BASE ?? "") {
  return String(defaultValue).trim().replace(/\/+$/, "");
}

async function readError(response) {
  const payload = await response.json().catch(() => ({}));
  return payload.error || `El planner CFDI respondió con HTTP ${response.status}.`;
}

export async function requestCfdiPlanner({ message, accessToken = "", idempotencyKey = "", fetchImpl = fetch, apiBaseUrl, signal } = {}) {
  if (typeof message !== "string" || !message.trim()) throw new TypeError("La petición del planner está vacía.");
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (typeof accessToken === "string" && accessToken.trim()) headers.Authorization = `Bearer ${accessToken.trim()}`;
  if (typeof idempotencyKey === "string" && idempotencyKey.trim()) headers["Idempotency-Key"] = idempotencyKey.trim();
  const response = await fetchImpl(`${apiBase(apiBaseUrl)}/api/cfdi/planner`, {
    method: "POST",
    headers,
    cache: "no-store",
    signal,
    body: JSON.stringify({ message: message.trim() }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || typeof payload.toolId !== "string") throw new Error("El planner devolvió una propuesta incompleta.");
  return payload;
}
