export const authState = {
  open: false,
  busy: false,
  identifier: "",
  password: "",
  message: "",
  error: false,
  ready: false,
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

export function currentUser() {
  return window.__contaiaAuth?.client ? window.__contaiaAuth.user : null;
}

export function renderAuthControls() {
  const user = currentUser();
  if (user) return `<span class="auth-user" title="${escapeHtml(user.email || "Sesión activa")}">${escapeHtml(user.email || "Sesión activa")}</span><button type="button" class="auth-button" data-action="auth-signout">Cerrar sesión</button>`;
  return `<button type="button" class="auth-button" data-action="auth-toggle">Iniciar sesión</button>`;
}

export function renderAuthPanel() {
  if (!authState.open) return "";
  const disabled = authState.busy || !window.__contaiaAuth?.client;
  return `<div class="auth-backdrop" data-action="auth-close"><section class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" data-auth-panel><button type="button" class="auth-close" data-action="auth-close" aria-label="Cerrar">×</button><p class="eyebrow">ACCESO PRIVADO · CONTAIA</p><h2 id="auth-title">Continúa donde lo dejaste.</h2><p class="auth-lede">Usa tu correo o usuario y contraseña para acceder a tu historial privado y herramientas fiscales.</p><form data-auth-form><label for="auth-identifier">Correo o usuario</label><input id="auth-identifier" name="identifier" autocomplete="username" required maxlength="254" value="${escapeHtml(authState.identifier)}" placeholder="tu@correo.com o usuario" ${disabled ? "disabled" : ""}/><label for="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128" ${disabled ? "disabled" : ""}/><button type="submit" class="button button-primary" ${disabled ? "disabled" : ""}>${authState.busy ? "Entrando…" : "Entrar"}<span aria-hidden="true">→</span></button>${!window.__contaiaAuth?.client ? `<p class="auth-message is-error" role="status">El acceso privado todavía está conectando con Supabase.</p>` : ""}${authState.message ? `<p class="auth-message ${authState.error ? "is-error" : "is-success"}" role="status">${escapeHtml(authState.message)}</p>` : ""}</form><p class="auth-note">Nunca compartas tu contraseña. La sesión se conserva en este navegador mediante Supabase Auth.</p></section></div>`;
}

function notify() { document.dispatchEvent(new CustomEvent("contaia:auth-updated", { detail: { user: currentUser() } })); }

export function setAuthClient(client, user) {
  window.__contaiaAuth = { client, user };
  authState.ready = true;
  notify();
}

export function updateAuthUser(user) {
  if (window.__contaiaAuth) window.__contaiaAuth.user = user;
  notify();
}

export async function signIn() {
  const client = window.__contaiaAuth?.client;
  if (!client || authState.busy) return;
  authState.busy = true;
  authState.message = "";
  authState.error = false;
  notify();
  try {
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier: authState.identifier, password: authState.password }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.session) throw new Error(payload.error || "No se pudo iniciar sesión.");
    const { error } = await client.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
    if (error) throw error;
    authState.password = "";
    authState.open = false;
    authState.message = "";
  } catch (error) {
    authState.error = true;
    authState.message = error instanceof Error ? error.message : "No se pudo iniciar sesión.";
  } finally {
    authState.busy = false;
    notify();
  }
}

export async function signOut() {
  const client = window.__contaiaAuth?.client;
  if (!client) return;
  await client.auth.signOut();
  authState.open = false;
  authState.message = "Sesión cerrada.";
  notify();
}
