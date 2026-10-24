let sitekey = "";
let scriptPromise = null;
const widgets = new WeakMap();

export function setCaptchaSitekey(value) {
  sitekey = typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value.trim()) ? value.trim() : "";
}

function loadScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("hCaptcha requiere un navegador."));
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-contaia-hcaptcha]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.hcaptcha), { once: true });
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar hCaptcha.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.contaiaHcaptcha = "true";
    script.onload = () => window.hcaptcha ? resolve(window.hcaptcha) : reject(new Error("hCaptcha no está disponible."));
    script.onerror = () => reject(new Error("No se pudo cargar hCaptcha."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function syncCaptchaWidgets({ onToken, onExpired, onError } = {}) {
  if (!sitekey || typeof document === "undefined") return;
  const containers = Array.from(document.querySelectorAll("[data-hcaptcha-widget]"));
  if (!containers.length) return;
  void loadScript().then((hcaptcha) => {
    for (const container of containers) {
      if (widgets.has(container)) continue;
      const widgetId = hcaptcha.render(container, {
        sitekey,
        callback: (token) => onToken?.(token),
        "expired-callback": () => onExpired?.(),
        "error-callback": () => onError?.(),
      });
      widgets.set(container, widgetId);
    }
  }).catch(() => onError?.());
}

export function resetCaptchaWidgets() {
  if (!window.hcaptcha) return;
  document.querySelectorAll("[data-hcaptcha-widget]").forEach((container) => {
    const widgetId = widgets.get(container);
    if (widgetId !== undefined) window.hcaptcha.reset(widgetId);
  });
}

export function captchaMarkup() {
  return sitekey
    ? '<div class="auth-captcha"><div data-hcaptcha-widget aria-label="Verificación de seguridad hCaptcha"></div><small>Completa la verificación de seguridad para continuar.</small></div>'
    : '<p class="auth-captcha-missing" role="status">La verificación de seguridad está conectando…</p>';
}
