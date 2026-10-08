function apiBase(defaultValue = globalThis.CONTAIA_TUTOR_API_BASE ?? "") {
  return String(defaultValue).trim().replace(/\/+$/, "");
}

async function readError(response) {
  const payload = await response.json().catch(() => ({}));
  return payload.error || `El servidor del tutor respondió con HTTP ${response.status}.`;
}

export async function loadTutorConfig({ fetchImpl = fetch, apiBaseUrl } = {}) {
  const response = await fetchImpl(`${apiBase(apiBaseUrl)}/api/tutor/config`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  const providers = Array.isArray(payload.providers)
    ? payload.providers.filter((provider) => typeof provider?.id === "string" && typeof provider?.label === "string")
    : [];
  return { providers, defaultProvider: providers.some(({ id }) => id === payload.defaultProvider) ? payload.defaultProvider : providers[0]?.id ?? "" };
}

export async function requestTutorReply({ message, context, history = [], provider = "", onToken = () => {}, fetchImpl = fetch, apiBaseUrl, signal } = {}) {
  const response = await fetchImpl(`${apiBase(apiBaseUrl)}/api/tutor/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ message, context, history, provider }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const payload = await response.json();
    if (typeof payload.reply !== "string" || !payload.reply.trim()) throw new Error("El tutor terminó sin devolver texto.");
    onToken(payload.reply);
    return payload.reply;
  }
  return readTutorEventStream(response, onToken);
}

export async function readTutorEventStream(response, onToken = () => {}) {
  if (!response.body) throw new Error("El servidor no abrió el flujo SSE.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let completed = false;
  const handleFrame = (frame) => {
    let event = "message";
    const data = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (!data.length) return;
    let payload;
    try { payload = JSON.parse(data.join("\n")); }
    catch { throw new Error("El servidor envió un evento SSE inválido."); }
    if (event === "error") throw new Error(payload.error || "La respuesta del tutor se interrumpió.");
    if (event === "done") { completed = true; return; }
    if (event === "token" && typeof payload.text === "string") {
      reply += payload.text;
      onToken(payload.text);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value || new Uint8Array(), { stream: !done })).replace(/\r\n/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        handleFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) handleFrame(buffer);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error("El flujo se cerró antes de completar la respuesta.");
  if (!reply.trim()) throw new Error("El tutor terminó sin devolver texto.");
  return reply;
}
