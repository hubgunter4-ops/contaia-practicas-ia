const COMPONENT_TAG = "contaia-video";

class ContaiaVideo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.video = null;
    this.toggle = null;
    this.observer = null;
    this.hasLoadedSource = false;
    this.currentSource = "";
    this.userPaused = false;
    this.resizeTimer = null;
    this.onResize = () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.selectSource(), 150);
    };
    this.onMotionPreference = (event) => {
      if (event.matches) this.video?.pause();
      else if (this.hasAttribute("autoplay") && !this.userPaused && this.hasLoadedSource) this.play();
    };
  }

  connectedCallback() {
    if (this.shadowRoot.childElementCount) return;
    this.render();
    window.addEventListener("resize", this.onResize, { passive: true });
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.motionPreference.addEventListener?.("change", this.onMotionPreference);
    this.observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.loadSource();
            this.observer.disconnect();
          }
        }, { rootMargin: "240px 0px" })
      : null;
    if (this.observer) this.observer.observe(this);
    else this.loadSource();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    window.removeEventListener("resize", this.onResize);
    this.motionPreference?.removeEventListener?.("change", this.onMotionPreference);
    clearTimeout(this.resizeTimer);
  }

  render() {
    const label = this.getAttribute("label") || "Animación ContaIA sin sonido";
    const poster = this.getAttribute("poster") || "";
    const decorative = this.hasAttribute("decorative");
    const ratio = this.getAttribute("ratio") || "16 / 9";
    const safeRatio = /^\s*\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?\s*)?$/.test(ratio) ? ratio : "16 / 9";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; max-width:var(--contaia-video-max-width,100%); aspect-ratio:${safeRatio}; }
        .frame { position:relative; width:100%; height:100%; overflow:hidden; background:#031d2a; border-radius:var(--contaia-video-radius,12px); }
        video { display:block; width:100%; height:100%; object-fit:var(--contaia-video-fit,cover); background:#031d2a; }
        .toggle { position:absolute; right:12px; bottom:12px; z-index:1; min-width:42px; min-height:42px; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:8px 12px; border:1px solid rgba(255,255,255,.45); border-radius:999px; color:#fff; background:rgba(2,19,30,.82); font:600 13px/1.2 system-ui,sans-serif; cursor:pointer; }
        .toggle:hover { background:rgba(2,19,30,.96); }
        .toggle:focus-visible { outline:3px solid #ff9a80; outline-offset:3px; }
        .icon { width:16px; height:16px; flex:none; fill:currentColor; }
        .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        @media (prefers-reduced-motion: reduce) { .frame { scroll-behavior:auto; } }
        @media (max-width:420px) { .toggle { right:8px; bottom:8px; min-width:40px; min-height:40px; } }
      </style>
      <div class="frame">
        <video playsinline muted loop preload="none" ${poster ? `poster="${this.escapeAttribute(poster)}"` : ""} ${decorative ? 'aria-hidden="true"' : `aria-label="${this.escapeAttribute(label)}"`}>
          Tu navegador no puede reproducir este video. ${poster ? `<img src="${this.escapeAttribute(poster)}" alt="${this.escapeAttribute(label)}">` : ""}
        </video>
        <button class="toggle" type="button" aria-label="Reproducir animación" title="Reproducir animación">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>
          <span>Reproducir</span>
        </button>
      </div>`;

    this.video = this.shadowRoot.querySelector("video");
    this.toggle = this.shadowRoot.querySelector("button");
    this.video.addEventListener("play", () => this.updateControl(true));
    this.video.addEventListener("pause", () => this.updateControl(false));
    this.toggle.addEventListener("click", () => {
      if (this.video.paused) {
        this.userPaused = false;
        this.loadSource();
        this.play();
      } else {
        this.userPaused = true;
        this.video.pause();
      }
    });
  }

  escapeAttribute(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  }

  chooseSource() {
    const width = window.innerWidth;
    const saveData = Boolean(navigator.connection?.saveData);
    const source480 = this.getAttribute("src-480");
    const source720 = this.getAttribute("src-720");
    const source1080 = this.getAttribute("src");
    if ((saveData || width <= 600) && source480) return source480;
    if (width <= 1100 && source720) return source720;
    return source1080 || source720 || source480 || "";
  }

  loadSource() {
    if (!this.video) return;
    this.hasLoadedSource = true;
    this.video.preload = "metadata";
    this.video.poster = this.getAttribute("poster") || "";
    this.selectSource();
  }

  selectSource() {
    if (!this.video || !this.hasLoadedSource) return;
    const source = this.chooseSource();
    if (!source || source === this.currentSource) return;
    const wasPlaying = !this.video.paused;
    const previousTime = Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0;
    this.currentSource = source;
    this.video.src = source;
    this.video.load();
    this.video.addEventListener("loadedmetadata", () => {
      if (previousTime > 0 && this.video.duration > 0) {
        try { this.video.currentTime = Math.min(previousTime, this.video.duration - 0.05); } catch {}
      }
      if (wasPlaying || (this.hasAttribute("autoplay") && !this.userPaused && !this.shouldReduceMotion())) this.play();
    }, { once: true });
  }

  shouldReduceMotion() {
    return Boolean(this.motionPreference?.matches || navigator.connection?.saveData);
  }

  async play() {
    if (!this.video || !this.currentSource) return;
    try {
      await this.video.play();
    } catch {
      this.updateControl(false);
    }
  }

  updateControl(isPlaying) {
    if (!this.toggle) return;
    const label = isPlaying ? "Pausar animación" : "Reproducir animación";
    this.toggle.setAttribute("aria-label", label);
    this.toggle.title = label;
    this.toggle.querySelector("span").textContent = isPlaying ? "Pausar" : "Reproducir";
    this.toggle.querySelector("path").setAttribute(
      "d",
      isPlaying ? "M7 5h4v14H7zm7 0h4v14h-4z" : "M8 5v14l11-7z",
    );
  }
}

if (!customElements.get(COMPONENT_TAG)) customElements.define(COMPONENT_TAG, ContaiaVideo);
