const RESOURCES = new Set(["profiles", "connections", "alerts", "deadlines"]);
const FORBIDDEN_FIELDS = /secret|password|private[_-]?key|csd|certificate|credential|token|api[_-]?key/i;

export async function requestTools(resource, {
  method = "GET",
  id = "",
  profileId = "",
  body,
  fetchImpl = globalThis.fetch,
  client = globalThis.window?.__contaiaAuth?.client,
} = {}) {
  if (!RESOURCES.has(resource)) throw new Error("El recurso de herramientas no es válido.");
  if (!client?.auth?.getSession) throw new Error("La sesión segura todavía no está disponible.");
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error("No se pudo verificar la sesión. Inicia sesión nuevamente.");
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error("Inicia sesión para consultar el Centro de herramientas.");
  if (typeof fetchImpl !== "function") throw new Error("La conexión con el servidor no está disponible.");

  if (body && typeof body === "object") {
    const forbiddenKey = Object.keys(body).find((key) => FORBIDDEN_FIELDS.test(key));
    if (forbiddenKey) throw new Error("No ingreses secretos ni credenciales en el Centro de herramientas.");
  }

  const query = new URLSearchParams({ resource });
  if (id) query.set("id", id);
  if (profileId) query.set("profileId", profileId);
  const headers = { Accept: "application/json", Authorization: `Bearer ${accessToken}` };
  const options = { method, headers, cache: "no-store" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetchImpl(`/api/tools?${query}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" && payload.error.length <= 240
      ? payload.error
      : "No se pudo completar la operación. Inténtalo nuevamente.";
    throw new Error(message);
  }
  return payload;
}
