const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const NORA_AVATAR_STATES = Object.freeze({ ready: "idle", explaining: "explaining", thinking: "thinking", celebrating: "celebrating" });

function renderAction(action, index) {
  if (!action?.label) return "";
  const dataAttribute = action.section
    ? `data-section="${escapeHtml(action.section)}"`
    : action.toolsUi
      ? `data-tools-ui="${escapeHtml(action.toolsUi)}"`
      : action.cfdiAction === "choose-files"
        ? 'data-cfdi-action="choose-files"'
        : "";
  if (!dataAttribute) return "";
  const variant = action.primary ? "button-primary" : "button-quiet";
  return `<button type="button" class="button ${variant} tool-shell-action" ${action.disabled ? "disabled" : ""} ${dataAttribute}>${escapeHtml(action.label)}${action.arrow === false ? "" : ' <span aria-hidden="true">→</span>'}</button>`;
}

export function renderToolHeader({
  id,
  eyebrow,
  title,
  description,
  statusLabel,
  statusKind = "info",
  actions = [],
  className = "",
  headingLevel = 1,
  titleId = "",
}) {
  const safeKind = /^[a-z-]+$/.test(statusKind) ? statusKind : "info";
  const safeClass = className.split(/\s+/).filter((value) => /^[a-z0-9_-]+$/i.test(value)).join(" ");
  const safeHeadingLevel = Number.isInteger(headingLevel) && headingLevel >= 1 && headingLevel <= 6 ? headingLevel : 1;
  const safeTitleId = /^[a-z][a-z0-9_-]*$/i.test(titleId) ? ` id="${escapeHtml(titleId)}"` : "";
  const headingTag = `h${safeHeadingLevel}`;
  const actionMarkup = actions.map(renderAction).join("");
  return `<header class="tool-shell-header ${safeClass}" data-tool-shell="${escapeHtml(id)}" data-island-frame="header">
    <div class="tool-shell-copy island-frame-copy">
      <p class="tool-shell-eyebrow">${escapeHtml(eyebrow)}</p>
      <${headingTag}${safeTitleId}>${escapeHtml(title)}</${headingTag}>
      <p class="tool-shell-description">${escapeHtml(description)}</p>
    </div>
    <div class="tool-shell-actions island-frame-actions">
      ${statusLabel ? `<span class="tool-shell-status island-frame-status is-${safeKind}" data-island-status="${safeKind}"><span aria-hidden="true">${safeKind === "ready" ? "✓" : safeKind === "error" ? "×" : safeKind === "attention" ? "!" : safeKind === "pending" ? "…" : "i"}</span>${escapeHtml(statusLabel)}</span>` : ""}
      ${actionMarkup.replaceAll("tool-shell-action", "tool-shell-action island-frame-action")}
    </div>
  </header>`;
}

export function renderToolGuidance({ state, nextStep, pending = [], boundary, tone = "info" }) {
  const pendingItems = Array.isArray(pending) ? pending.filter(Boolean) : [];
  const safeTone = ["info", "ready", "pending", "attention", "error"].includes(tone) ? tone : "info";
  const stateMark = { info: "i", ready: "✓", pending: "…", attention: "!", error: "×" }[safeTone];
  return `<aside class="tool-guidance" data-guidance-state="${safeTone}" role="status" aria-live="polite" aria-atomic="true" aria-label="Estado y siguiente paso">
    <div class="tool-guidance-item tool-guidance-state is-${safeTone}"><span>Estado actual</span><b><i aria-hidden="true">${stateMark}</i>${escapeHtml(state)}</b></div>
    <div class="tool-guidance-item"><span>Siguiente paso</span><p>${escapeHtml(nextStep)}</p></div>
    <div class="tool-guidance-item tool-guidance-pending"><span>Pendiente</span>${pendingItems.length ? `<ul>${pendingItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p><i aria-hidden="true">✓</i> Sin bloqueos conocidos; conserva la revisión humana.</p>`}</div>
    <div class="tool-guidance-item tool-guidance-boundary"><span><i aria-hidden="true">ⓘ</i> Alcance y privacidad</span><p>${escapeHtml(boundary)}</p></div>
  </aside>`;
}

export function renderNoraContextCard({
  eyebrow = "NORA · AYUDA CONTEXTUAL",
  title,
  description,
  actionLabel = "Abrir Nora",
  section = "advisor",
  cfdiAction = "",
  avatarState = "ready",
  className = "",
}) {
  const safeClass = className.split(/\s+/).filter((value) => /^[a-z0-9_-]+$/i.test(value)).join(" ");
  const avatarAsset = NORA_AVATAR_STATES[avatarState] || NORA_AVATAR_STATES.ready;
  const actionMarkup = cfdiAction === "ask-nora"
    ? `<button type="button" class="nora-context-action" data-cfdi-ask-nora>${escapeHtml(actionLabel)} <span aria-hidden="true">↗</span></button>`
    : `<button type="button" class="nora-context-action" data-section="${escapeHtml(section)}">${escapeHtml(actionLabel)} <span aria-hidden="true">↗</span></button>`;
  return `<aside class="nora-context-card ${safeClass}" aria-label="Ayuda contextual de Nora">
    <img class="nora-context-avatar" src="/assets/nora/nora-${avatarAsset}.webp" alt="" aria-hidden="true" loading="lazy"/>
    <div class="nora-context-copy"><p>${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><span>${escapeHtml(description)}</span></div>
    ${actionMarkup}
  </aside>`;
}
