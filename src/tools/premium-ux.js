export const PREMIUM_UX_CONTRACT_VERSION = "premium-ux-v1";

const PLAN_LABELS = Object.freeze({ free: "Free", premium: "Premium" });
const CAPABILITY_REFERENCES = Object.freeze([
  { id: "tools.ai.planner.requests", label: "Consultas IA CFDI", free: "Uso según disponibilidad", premium: "Mayor capacidad" },
  { id: "tools.ai.explanation.requests", label: "Explicaciones con Nora", free: "Uso según disponibilidad", premium: "Mayor capacidad" },
  { id: "tools.ai.workpaper.exports", label: "Papeles de trabajo", free: "Demo local", premium: "Exportación cuando se habilite" },
]);

function clampCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.trunc(number), 1_000_000) : 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

export function normalizePlanSnapshot(input = {}) {
  // La UI nunca convierte un dato local en autoridad de entitlement.
  const isTrusted = input?.source === "server" && input?.verified === true;
  const plan = isTrusted && input.plan === "premium" ? "premium" : "free";
  const status = plan === "premium" && ["active", "grace"].includes(input.status) ? input.status : "fallback_free";
  return Object.freeze({
    contractVersion: PREMIUM_UX_CONTRACT_VERSION,
    plan,
    status,
    source: isTrusted ? "server" : "fallback_free",
    verified: isTrusted,
    usageAvailable: isTrusted && input.usageAvailable === true,
    capabilities: CAPABILITY_REFERENCES.map((capability) => Object.freeze({ ...capability })),
  });
}

export function buildPlanUsageMeters(snapshot = {}) {
  const normalized = normalizePlanSnapshot(snapshot);
  return normalized.capabilities.map((capability) => ({
    id: capability.id,
    label: capability.label,
    currentLabel: normalized.usageAvailable ? "Uso consultable" : "Uso no disponible",
    referenceLabel: normalized.plan === "premium" ? capability.premium : capability.free,
    status: normalized.usageAvailable ? "available" : "informational",
  }));
}

export function buildPremiumPlanModel(snapshot = {}) {
  const normalized = normalizePlanSnapshot(snapshot);
  const isPremium = normalized.plan === "premium";
  return Object.freeze({
    ...normalized,
    eyebrow: isPremium ? "PLAN PREMIUM · CUENTA VERIFICADA" : "PLAN FREE · VISTA INFORMATIVA",
    title: isPremium ? "Tu capacidad Premium está verificada" : "Continúa con límites claros",
    description: isPremium
      ? "Las capacidades mostradas provienen de una respuesta server-side verificada. La interfaz no decide permisos fiscales."
      : "Consulta qué puede crecer en Premium sin activar pagos ni prometer una capacidad que aún no está habilitada.",
    statusLabel: isPremium ? "Premium activo" : "Premium pendiente de activación",
    actionLabel: isPremium ? "Revisar capacidades" : "Conocer Premium",
    meters: buildPlanUsageMeters(normalized),
  });
}

export function renderPremiumPlanPanel({ snapshot = {}, notice = "" } = {}) {
  const model = buildPremiumPlanModel(snapshot);
  const meters = model.meters.map((meter) => `<li class="tools-plan-meter" data-plan-capability="${escapeHtml(meter.id)}"><span><b>${escapeHtml(meter.label)}</b><small>${escapeHtml(meter.referenceLabel)}</small></span><strong>${escapeHtml(meter.currentLabel)}</strong></li>`).join("");
  return `<section class="tools-plan-card" data-premium-plan="${escapeHtml(model.plan)}" aria-labelledby="tools-plan-title"><div class="tools-plan-head"><div><p class="eyebrow">${escapeHtml(model.eyebrow)}</p><h2 id="tools-plan-title">${escapeHtml(model.title)}</h2><p>${escapeHtml(model.description)}</p></div><span class="tools-plan-status" data-plan-status="${escapeHtml(model.status)}">${escapeHtml(model.statusLabel)}</span></div><div class="tools-plan-note" role="note"><b>Autoridad:</b> esta vista es informativa. Los entitlements, cuotas y permisos se resuelven en servidor; no se almacenan en el navegador.</div><ul class="tools-plan-meters" aria-label="Capacidades de referencia">${meters}</ul><div class="tools-plan-actions"><button type="button" class="button button-primary" data-tools-ui="premium-info">${escapeHtml(model.actionLabel)} <span aria-hidden="true">→</span></button><button type="button" class="button button-quiet" data-tools-ui="premium-dismiss">Continuar con Free</button></div>${notice ? `<p class="tools-plan-feedback" role="status">${escapeHtml(notice)}</p>` : ""}</section>`;
}

export function getPremiumCapabilityReferences() {
  return CAPABILITY_REFERENCES.map((capability) => ({ ...capability }));
}
