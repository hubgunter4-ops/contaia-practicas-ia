import { captchaMarkup, resetCaptchaWidgets, setCaptchaSitekey, syncCaptchaWidgets } from "./captcha.js";

export const authState = {
  open: false,
  busy: false,
  identifier: "",
  password: "",
  recoveryMode: false,
  recoveryComplete: false,
  recoveryPassword: "",
  recoveryPasswordConfirmation: "",
  message: "",
  error: false,
  ready: false,
  status: "idle",
  captchaSitekey: "",
  captchaToken: "",
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const AUTH_DESTINATIONS = new Set(["cfdi", "asistente", "curso"]);

export function getAuthDestination() {
  if (typeof location === "undefined") return "";
  const requestedDestination = new URLSearchParams(location.search).get("destino");
  const destination = requestedDestination === "anam" ? "asistente" : requestedDestination;
  return AUTH_DESTINATIONS.has(destination) ? destination : "";
}

export function getAuthDestinationTarget() {
  const destination = getAuthDestination();
  return destination ? `/?destino=${destination}` : "/";
}

function getAuthDestinationQuery() {
  const destination = getAuthDestination();
  return destination ? `?destino=${destination}` : "";
}

export function currentUser() {
  return window.__contaiaAuth?.client ? window.__contaiaAuth.user : null;
}

function authRedirectUrl() {
  return `${location.origin}/${getAuthDestinationQuery()}`;
}

function emailConfirmationRedirectUrl() {
  return `${location.origin}/confirmar-correo${getAuthDestinationQuery()}`;
}

function passwordRecoveryRedirectUrl() {
  return `${location.origin}/recuperar-contrasena${getAuthDestinationQuery()}`;
}

function confirmationErrorMessage() {
  if (typeof location === "undefined") return "";
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = query.get("error_code") || hash.get("error_code") || "";
  const error = query.get("error") || hash.get("error") || "";
  const description = query.get("error_description") || hash.get("error_description") || "";
  if (!code && !error && !description) return "";
  if (code === "otp_expired" || /expired|expir/i.test(`${error} ${description}`)) {
    return "El enlace de confirmación expiró o ya fue usado. Vuelve al registro para solicitar uno nuevo.";
  }
  return "No pudimos confirmar el correo con este enlace. Vuelve al registro para intentarlo de nuevo.";
}

let authInitializationPromise = null;

export function initializeAuthClient({ signal } = {}) {
  if (authInitializationPromise) return authInitializationPromise;
  authInitializationPromise = (async () => {
    const response = await fetch("/api/cfdi/config", { headers: { Accept: "application/json" }, cache: "no-store", signal });
    if (!response.ok) throw new Error("No se pudo leer la configuración de acceso.");
    const config = await response.json();
    if (!config.enabled) {
      setAuthClient(null, null);
      return null;
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || "") || typeof config.publishableKey !== "string" || !config.publishableKey.startsWith("sb_publishable_")) {
      throw new Error("La configuración pública de Supabase no tiene el formato esperado.");
    }
    setCaptchaSitekey(config.hcaptchaSitekey);
    authState.captchaSitekey = config.hcaptchaSitekey || "";
    const { createClient } = await import("/vendor/supabase.js");
    const client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    setAuthClient(client, data.session?.user ?? null);
    queueMicrotask(syncAuthCaptchaWidgets);
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        authState.recoveryMode = true;
        authState.recoveryComplete = false;
        authState.recoveryPassword = "";
        authState.recoveryPasswordConfirmation = "";
        authState.message = "";
        authState.error = false;
        authState.status = "recovery";
      }
      updateAuthUser(session?.user ?? null);
      document.dispatchEvent(new CustomEvent("contaia:auth-event", { detail: { event } }));
    });
    return client;
  })().catch((error) => {
    if (error?.name !== "AbortError") setAuthClient(null, null);
    throw error;
  });
  return authInitializationPromise;
}

export function renderAuthControls() {
  const user = currentUser();
  if (user) return `<span class="auth-user" title="${escapeHtml(user.email || "Sesión activa")}">${escapeHtml(user.email || "Sesión activa")}</span><button type="button" class="auth-button" data-action="auth-signout">Cerrar sesión</button>`;
  return `<button type="button" class="auth-button" data-action="auth-toggle">Iniciar sesión</button>`;
}

export function renderAuthGate() {
  const connecting = !authState.ready || !window.__contaiaAuth?.client;
  const disabled = authState.busy || connecting;
  const destination = getAuthDestination();
  const registrationHref = destination ? `/registro?destino=${encodeURIComponent(destination)}` : "/registro";
  const recoveryHref = destination ? `/recuperar-contrasena?destino=${encodeURIComponent(destination)}` : "/recuperar-contrasena";
  const connectionNote = connecting
    ? `<p class="auth-connection-status" role="status"><i aria-hidden="true"></i>Conectando acceso seguro…</p>`
    : "";
  const message = authState.message
    ? `<p class="auth-message ${authState.error ? "is-error" : "is-success"}" role="status">${escapeHtml(authState.message)}</p>`
    : "";
  return `<main class="auth-gate" aria-labelledby="auth-gate-title">
    <div class="auth-gate-background" aria-hidden="true">
      <span class="auth-orb auth-orb-coral"></span><span class="auth-orb auth-orb-gold"></span><span class="auth-orb auth-orb-teal"></span>
      <span class="auth-grid"></span><span class="auth-data-line auth-data-line-one"></span><span class="auth-data-line auth-data-line-two"></span>
      <span class="auth-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    </div>
    <div class="auth-gate-layout">
      <section class="auth-brand-story" aria-labelledby="auth-brand-title">
        <a class="auth-brand" href="/" aria-label="ContaIA, página de inicio"><span class="auth-brand-mark" aria-hidden="true"><img src="/brand/contaia-logo.png" alt="" /></span><span>Conta<span>IA</span></span></a>
        <p class="eyebrow">LABORATORIO DE APRENDIZAJE</p>
        <h1 id="auth-brand-title">Aprende con IA para tu <em>práctica contable.</em></h1>
        <p class="auth-brand-lede">Avanza a tu ritmo, practica con casos ficticios y convierte cada concepto en una acción clara.</p>
        <div class="auth-tutor-badge"><span class="auth-tutor-avatar" aria-hidden="true">N</span><span><strong>Nora</strong><small>Tutora IA · te acompaña paso a paso</small></span><i aria-hidden="true"></i></div>
      </section>
      <section class="auth-gate-card" aria-labelledby="auth-gate-title">
        <div class="auth-gate-heading"><p class="eyebrow">ACCESO SEGURO</p><h2 id="auth-gate-title">Bienvenido de nuevo</h2><p>Inicia sesión para continuar tu recorrido en ContaIA.</p></div>
        <form class="auth-gate-form" data-auth-form>
          <label for="auth-identifier">Correo o alias</label>
          <input id="auth-identifier" name="identifier" autocomplete="username" required maxlength="254" value="${escapeHtml(authState.identifier)}" placeholder="tu@correo.com o usuario" ${disabled ? "disabled" : ""}/>
          <label for="auth-password">Contraseña</label>
          <div class="auth-password-wrap"><input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128" ${disabled ? "disabled" : ""}/><button type="button" class="auth-password-toggle" data-action="auth-password-toggle" aria-label="Mostrar contraseña" aria-pressed="false">◉</button></div>
          ${captchaMarkup()}<div class="auth-gate-options"><label class="auth-remember"><input type="checkbox" name="remember"/> <span>Recordar este dispositivo</span></label><a href="${recoveryHref}">¿Olvidaste tu contraseña?</a></div>
          <button type="submit" class="auth-gate-submit" ${disabled ? "disabled" : ""}>${connecting ? "Conectando…" : authState.busy ? "Validando…" : authState.status === "success" ? "Sesión iniciada" : "Iniciar sesión"}<span aria-hidden="true">→</span></button>
          ${connectionNote}${message}
        </form>
        <div class="auth-divider"><span>o continúa con</span></div>
        <button class="auth-sso-button" type="button" data-action="auth-google" ${disabled ? "disabled" : ""}><span aria-hidden="true">G</span> Continuar con Google</button>
        <p class="auth-signup">¿No tienes una cuenta? <a href="${registrationHref}">Crear una cuenta</a></p>
        <p class="auth-note">Nunca compartas tu contraseña. La sesión se conserva en este navegador mediante Supabase Auth.</p>
      </section>
    </div>
    <footer class="auth-gate-footer"><span>© 2026 ContaIA</span><span aria-hidden="true">·</span><a href="/privacidad">Privacidad</a><span aria-hidden="true">·</span><a href="/ayuda">Ayuda</a></footer>
  </main>`;
}

export function renderAuthPanel() {
  if (!authState.open) return "";
  const disabled = authState.busy || !window.__contaiaAuth?.client;
  const destination = getAuthDestination();
  const registrationHref = destination ? `/registro?destino=${encodeURIComponent(destination)}` : "/registro";
  const recoveryHref = destination ? `/recuperar-contrasena?destino=${encodeURIComponent(destination)}` : "/recuperar-contrasena";
  return `<div class="auth-backdrop" data-action="auth-close"><section class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" data-auth-panel><button type="button" class="auth-close" data-action="auth-close" aria-label="Cerrar">×</button><p class="eyebrow">ACCESO PRIVADO · CONTAIA</p><h2 id="auth-title">Continúa donde lo dejaste.</h2><p class="auth-lede">Usa tu correo o alias y contraseña para acceder a tu historial privado y herramientas fiscales.</p><form data-auth-form><label for="auth-identifier">Correo o alias</label><input id="auth-identifier" name="identifier" autocomplete="username" required maxlength="254" value="${escapeHtml(authState.identifier)}" placeholder="tu@correo.com o usuario" ${disabled ? "disabled" : ""}/><label for="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128" ${disabled ? "disabled" : ""}/>${captchaMarkup()}<button type="submit" class="button button-primary" ${disabled ? "disabled" : ""}>${authState.busy ? "Entrando…" : "Entrar"}<span aria-hidden="true">→</span></button>${!window.__contaiaAuth?.client ? `<p class="auth-message is-error" role="status">El acceso privado todavía está conectando con Supabase.</p>` : ""}${authState.message ? `<p class="auth-message ${authState.error ? "is-error" : "is-success"}" role="status">${escapeHtml(authState.message)}</p>` : ""}</form><p class="auth-recovery-link"><a href="${recoveryHref}">¿Olvidaste tu contraseña?</a></p><p class="auth-signup">¿No tienes una cuenta? <a href="${registrationHref}">Crear una cuenta</a></p><p class="auth-note">Nunca compartas tu contraseña. La sesión se conserva en este navegador mediante Supabase Auth.</p></section></div>`;
}

function notify() { document.dispatchEvent(new CustomEvent("contaia:auth-updated", { detail: { user: currentUser() } })); }

export function setAuthClient(client, user) {
  window.__contaiaAuth = { client, user };
  authState.ready = true;
  notify();
}

export function syncAuthCaptchaWidgets() {
  syncCaptchaWidgets({
    onToken: (token) => { authState.captchaToken = token; },
    onExpired: () => { authState.captchaToken = ""; },
    onError: () => { authState.captchaToken = ""; },
  });
}

export function updateAuthUser(user) {
  if (window.__contaiaAuth) window.__contaiaAuth.user = user;
  notify();
}

export async function signIn() {
  const client = window.__contaiaAuth?.client;
  if (!client || authState.busy) return;
  if (authState.captchaSitekey && !authState.captchaToken) {
    authState.error = true;
    authState.message = "Completa la verificación de seguridad para continuar.";
    notify();
    return;
  }
  const captchaToken = authState.captchaToken;
  authState.busy = true;
  authState.status = "validating";
  authState.message = "";
  authState.error = false;
  notify();
  try {
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier: authState.identifier, password: authState.password, captchaToken }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.session) {
      const message = response.status === 401
        ? "El correo o alias no coincide con la contraseña."
        : payload.error || "No se pudo iniciar sesión. Revisa los datos e inténtalo de nuevo.";
      throw new Error(message);
    }
    const { error } = await client.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
    if (error) throw error;
    authState.password = "";
    authState.status = "success";
    authState.open = false;
    authState.message = "Sesión iniciada.";
  } catch (error) {
    authState.password = "";
    authState.status = "error";
    authState.error = true;
    authState.message = error instanceof Error ? error.message : "No se pudo iniciar sesión. Revisa los datos e inténtalo de nuevo.";
  } finally {
    authState.captchaToken = "";
    resetCaptchaWidgets();
    authState.busy = false;
    notify();
  }
}

export async function signUp() {
  const client = window.__contaiaAuth?.client;
  if (!client || authState.busy) return;
  if (authState.captchaSitekey && !authState.captchaToken) {
    authState.error = true;
    authState.message = "Completa la verificación de seguridad para continuar.";
    notify();
    return;
  }
  const captchaToken = authState.captchaToken;
  authState.busy = true; authState.message = ""; authState.error = false;
  try {
    const options = { emailRedirectTo: emailConfirmationRedirectUrl() };
    if (captchaToken) options.captchaToken = captchaToken;
    const { data, error } = await client.auth.signUp({ email: authState.identifier, password: authState.password, options });
    if (error) throw error;
    authState.password = "";
    authState.status = "success";
    authState.message = data.session ? "Cuenta creada. Ya puedes continuar." : "Cuenta creada. Revisa tu correo y confirma tu dirección para activar el acceso.";
  } catch (error) {
    authState.password = ""; authState.status = "error"; authState.error = true;
    authState.message = error instanceof Error ? error.message : "No se pudo crear la cuenta.";
  } finally {
    authState.captchaToken = "";
    resetCaptchaWidgets();
    authState.busy = false;
    notify();
  }
}

export async function signInWithGoogle() {
  const client = window.__contaiaAuth?.client;
  if (!client || authState.busy) return;
  authState.busy = true; authState.message = ""; authState.error = false; notify();
  const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirectUrl() } });
  if (error) {
    authState.busy = false; authState.status = "error"; authState.error = true;
    authState.message = "Google no está habilitado todavía en el proveedor de autenticación.";
    notify();
  }
}

export async function resetPassword() {
  const client = window.__contaiaAuth?.client;
  if (!client || authState.busy) return;
  authState.busy = true; authState.message = ""; authState.error = false;
  authState.recoveryMode = false;
  authState.recoveryComplete = false;
  notify();
  try {
    const { error } = await client.auth.resetPasswordForEmail(authState.identifier, { redirectTo: passwordRecoveryRedirectUrl() });
    if (error) throw error;
    authState.message = "Si existe una cuenta con ese correo, recibirás un enlace para continuar.";
    authState.status = "success";
  } catch (error) {
    authState.error = true; authState.status = "error";
    authState.message = error instanceof Error ? error.message : "No se pudo enviar el enlace. Revisa el correo e inténtalo de nuevo.";
  } finally { authState.busy = false; notify(); }
}

export async function updatePassword() {
  const client = window.__contaiaAuth?.client;
  if (!client || authState.busy) return;
  const password = authState.recoveryPassword;
  if (password.length < 8) {
    authState.error = true;
    authState.message = "La nueva contraseña debe tener al menos 8 caracteres.";
    notify();
    return;
  }
  if (password !== authState.recoveryPasswordConfirmation) {
    authState.error = true;
    authState.message = "Las contraseñas no coinciden.";
    notify();
    return;
  }
  authState.busy = true; authState.message = ""; authState.error = false;
  notify();
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    authState.recoveryPassword = "";
    authState.recoveryPasswordConfirmation = "";
    authState.recoveryComplete = true;
    authState.recoveryMode = false;
    authState.status = "success";
    authState.message = "Contraseña actualizada. Ya puedes continuar con tu recorrido.";
  } catch (error) {
    authState.error = true; authState.status = "error";
    authState.message = error instanceof Error ? error.message : "No se pudo actualizar la contraseña. Solicita un nuevo enlace e inténtalo de nuevo.";
  } finally { authState.busy = false; notify(); }
}

export function renderRegistrationGate() {
  const connecting = !authState.ready || !window.__contaiaAuth?.client;
  const disabled = authState.busy || connecting;
  const message = authState.message ? `<p class="auth-message ${authState.error ? "is-error" : "is-success"}" role="status">${escapeHtml(authState.message)}</p>` : "";
  return `<main class="auth-gate auth-register-gate" aria-labelledby="register-title"><div class="auth-gate-background" aria-hidden="true"><span class="auth-orb auth-orb-coral"></span><span class="auth-orb auth-orb-gold"></span><span class="auth-orb auth-orb-teal"></span><span class="auth-grid"></span></div><div class="auth-gate-layout"><section class="auth-brand-story"><a class="auth-brand" href="/" aria-label="ContaIA, página de inicio"><span class="auth-brand-mark" aria-hidden="true"><img src="/brand/contaia-logo.png" alt="" /></span><span>Conta<span>IA</span></span></a><p class="eyebrow">NUEVO RECORRIDO</p><h1>Construye tu espacio para <em>aprender.</em></h1><p class="auth-brand-lede">Guarda tu avance, revisa tus prácticas y vuelve a tus herramientas cuando quieras.</p><div class="auth-tutor-badge"><span class="auth-tutor-avatar" aria-hidden="true">N</span><span><strong>Nora</strong><small>Tutora IA · te acompaña paso a paso</small></span><i aria-hidden="true"></i></div></section><section class="auth-gate-card" aria-labelledby="register-title"><div class="auth-gate-heading"><p class="eyebrow">REGISTRO SEGURO</p><h2 id="register-title">Crea tu cuenta</h2><p>Empieza tu recorrido en ContaIA con un correo y una contraseña.</p></div><form class="auth-gate-form" data-register-form><label for="auth-identifier">Correo electrónico</label><input id="auth-identifier" name="identifier" type="email" autocomplete="email" required maxlength="254" value="${escapeHtml(authState.identifier)}" placeholder="tu@correo.com" ${disabled ? "disabled" : ""}/><label for="auth-password">Contraseña</label><div class="auth-password-wrap"><input id="auth-password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" ${disabled ? "disabled" : ""}/><button type="button" class="auth-password-toggle" data-action="auth-password-toggle" aria-label="Mostrar contraseña" aria-pressed="false">◉</button></div><small class="auth-form-hint">Usa al menos 8 caracteres.</small>${captchaMarkup()}<button type="submit" class="auth-gate-submit" ${disabled ? "disabled" : ""}>${connecting ? "Conectando…" : authState.busy ? "Creando cuenta…" : "Crear cuenta"}<span aria-hidden="true">→</span></button>${message}</form><div class="auth-divider"><span>o continúa con</span></div><button class="auth-sso-button" type="button" data-action="auth-google" ${disabled ? "disabled" : ""}><span aria-hidden="true">G</span> Continuar con Google</button><p class="auth-signup">¿Ya tienes una cuenta? <a href="/">Iniciar sesión</a></p><p class="auth-note">La autenticación y la sesión se gestionan mediante Supabase Auth.</p></section></div><footer class="auth-gate-footer"><span>© 2026 ContaIA</span><span aria-hidden="true">·</span><a href="/privacidad">Privacidad</a></footer></main>`;
}

export function renderEmailConfirmationGate() {
  const callbackError = confirmationErrorMessage();
  const user = currentUser();
  const waiting = !callbackError && !authState.ready;
  const confirmed = !callbackError && Boolean(user);
  const title = callbackError ? "Revisa tu enlace" : waiting ? "Verificando tu correo…" : confirmed ? "Correo confirmado" : "No pudimos validar la confirmación";
  const message = callbackError || (waiting
    ? "Estamos comprobando la confirmación con el acceso seguro de ContaIA. No cierres esta página."
    : confirmed
      ? "Tu dirección quedó confirmada y tu sesión está lista. Ya puedes continuar en ContaIA."
      : "El enlace no inició una sesión. Vuelve al registro para solicitar un nuevo correo de confirmación o inicia sesión si ya activaste tu cuenta.");
  const requestedDestination = new URLSearchParams(location.search).get("destino");
  const destination = requestedDestination === "anam" ? "asistente" : requestedDestination;
  const target = ["cfdi", "asistente", "curso"].includes(destination) ? `/?destino=${destination}` : "/";
  const action = confirmed
    ? `<a class="auth-gate-submit auth-confirmation-action" href="${target}">Continuar a ContaIA <span aria-hidden="true">→</span></a>`
    : callbackError || (!waiting && !user)
      ? `<a class="auth-gate-submit auth-confirmation-action" href="/registro">Volver al registro <span aria-hidden="true">→</span></a>`
      : `<p class="auth-connection-status" role="status"><i aria-hidden="true"></i>Validando el enlace de confirmación…</p>`;
  const icon = confirmed ? "✓" : callbackError || (!waiting && !user) ? "!" : "…";
  const statusClass = confirmed ? "is-confirmed" : callbackError || (!waiting && !user) ? "is-error" : "is-pending";
  return `<main class="auth-gate auth-confirmation-gate" aria-labelledby="confirmation-title"><div class="auth-gate-background" aria-hidden="true"><span class="auth-orb auth-orb-coral"></span><span class="auth-orb auth-orb-gold"></span><span class="auth-orb auth-orb-teal"></span><span class="auth-grid"></span></div><div class="auth-gate-layout"><section class="auth-brand-story"><a class="auth-brand" href="/" aria-label="ContaIA, página de inicio"><span class="auth-brand-mark" aria-hidden="true"><img src="/brand/contaia-logo.png" alt="" /></span><span>Conta<span>IA</span></span></a><p class="eyebrow">ACCESO SEGURO · CONTAIA</p><h1>Un último paso para <em>continuar.</em></h1><p class="auth-brand-lede">Confirma tu dirección de correo para activar tu cuenta y volver a tu recorrido.</p></section><section class="auth-gate-card" aria-labelledby="confirmation-title"><div class="auth-confirmation-icon ${statusClass}" aria-hidden="true">${icon}</div><div class="auth-gate-heading"><p class="eyebrow">CONFIRMACIÓN DE CORREO</p><h2 id="confirmation-title">${title}</h2><p>${message}</p></div>${action}<p class="auth-note">Si no esperabas este correo, puedes cerrar esta página. Nunca compartas los enlaces de acceso.</p></section></div><footer class="auth-gate-footer"><span>© 2026 ContaIA</span><span aria-hidden="true">·</span><a href="/privacidad">Privacidad</a><span aria-hidden="true">·</span><a href="/ayuda">Ayuda</a></footer></main>`;
}

export async function signOut() {
  const client = window.__contaiaAuth?.client;
  if (!client) return;
  await client.auth.signOut();
  authState.open = false;
  authState.message = "Sesión cerrada.";
  notify();
}
