const CAPTCHA_SITEKEY_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;
const PROVIDERS = Object.freeze({
  turnstile: {
    globalName: "turnstile",
    scriptSelector: 'script[data-contaia-captcha-provider="turnstile"]',
    scriptUrl: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    label: "Cloudflare Turnstile",
  },
  hcaptcha: {
    globalName: "hcaptcha",
    scriptSelector: 'script[data-contaia-captcha-provider="hcaptcha"]',
    scriptUrl: "https://js.hcaptcha.com/1/api.js?render=explicit",
    label: "hCaptcha",
  },
});

let provider = "";
let sitekey = "";
const scriptPromises = new Map();
const widgets = new WeakMap();

export function setCaptchaConfig(providerValue, sitekeyValue) {
  const candidateProvider = typeof providerValue === "string" ? providerValue.trim().toLowerCase() : "";
  const candidateSitekey = typeof sitekeyValue === "string" ? sitekeyValue.trim() : "";
  provider = Object.hasOwn(PROVIDERS, candidateProvider) && CAPTCHA_SITEKEY_PATTERN.test(candidateSitekey)
    ? candidateProvider
    : "";
  sitekey = provider ? candidateSitekey : "";
}

function loadScript(providerName) {
  const config = PROVIDERS[providerName];
  if (!config || typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("El proveedor CAPTCHA requiere un navegador."));
  }
  const getApi = () => window[config.globalName];
  if (getApi()) return Promise.resolve(getApi());
  const pending = scriptPromises.get(providerName);
  if (pending) return pending;

  const request = new Promise((resolve, reject) => {
    const existing = document.querySelector(config.scriptSelector);
    if (existing) {
      existing.addEventListener("load", () => getApi() ? resolve(getApi()) : reject(new Error(`${config.label} no está disponible.`)), { once: true });
      existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${config.label}.`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = config.scriptUrl;
    script.async = true;
    script.defer = true;
    script.dataset.contaiaCaptchaProvider = providerName;
    script.onload = () => getApi() ? resolve(getApi()) : reject(new Error(`${config.label} no está disponible.`));
    script.onerror = () => reject(new Error(`No se pudo cargar ${config.label}.`));
    document.head.appendChild(script);
  });
  const tracked = request.catch((error) => {
    scriptPromises.delete(providerName);
    throw error;
  });
  scriptPromises.set(providerName, tracked);
  return tracked;
}

export function syncCaptchaWidgets({ onToken, onExpired, onError } = {}) {
  const activeProvider = provider;
  const activeSitekey = sitekey;
  if (!activeProvider || !activeSitekey || typeof document === "undefined") return;
  const containers = Array.from(document.querySelectorAll("[data-captcha-widget]")).filter((container) => !widgets.has(container));
  if (!containers.length) return;

  void loadScript(activeProvider).then((api) => {
    for (const container of containers) {
      if (!container.isConnected || widgets.has(container)) continue;
      const widgetId = api.render(container, {
        sitekey: activeSitekey,
        callback: (token) => onToken?.(token),
        "expired-callback": () => onExpired?.(),
        "error-callback": () => onError?.(),
      });
      widgets.set(container, { provider: activeProvider, widgetId });
    }
  }).catch(() => onError?.());
}

export function resetCaptchaWidgets() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  document.querySelectorAll("[data-captcha-widget]").forEach((container) => {
    const widget = widgets.get(container);
    const api = widget ? window[PROVIDERS[widget.provider]?.globalName] : null;
    if (api && widget.widgetId !== undefined) api.reset(widget.widgetId);
  });
}

export function captchaMarkup() {
  const label = provider ? PROVIDERS[provider].label : "verificación de seguridad";
  return provider && sitekey
    ? `<div class="auth-captcha"><div data-captcha-widget aria-label="Verificación de seguridad ${label}"></div><small>Completa la verificación de seguridad para continuar.</small></div>`
    : '<p class="auth-captcha-missing" role="status">La verificación de seguridad está conectando…</p>';
}
