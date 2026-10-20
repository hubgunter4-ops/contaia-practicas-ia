import { requestTools } from "./client.js";

const RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2,3}$/;
const ZIP_PATTERN = /^[0-9]{5}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOOL_KEYS = new Set(["cfdi", "accounting", "payroll", "diot", "monitor"]);

export const toolsWorkspace = {
  profiles: [],
  connections: [],
  selectedProfileId: "",
  loading: false,
  connectionsLoading: false,
  saving: false,
  loaded: false,
  error: "",
  notice: "",
  profileForm: null,
  connectionForm: null,
};

let loadSequence = 0;
let connectionSequence = 0;

function notify() {
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("contaia:tools-updated"));
}

export function normalizeFiscalProfile(input = {}) {
  const profile = {
    legal_name: String(input.legal_name ?? "").trim(),
    rfc: String(input.rfc ?? "").trim().toUpperCase(),
    tax_regime: String(input.tax_regime ?? "").trim(),
    fiscal_zip: String(input.fiscal_zip ?? "").trim() || null,
    fiscal_email: String(input.fiscal_email ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    active: input.active === false || input.active === "false" ? false : true,
  };
  if (!profile.legal_name || profile.legal_name.length > 300) throw new Error("Escribe la razón o nombre fiscal (máximo 300 caracteres).");
  if (!RFC_PATTERN.test(profile.rfc)) throw new Error("El RFC no tiene un formato válido.");
  if (profile.tax_regime.length > 120) throw new Error("El régimen fiscal no debe exceder 120 caracteres.");
  if (profile.fiscal_zip && !ZIP_PATTERN.test(profile.fiscal_zip)) throw new Error("El código postal fiscal debe tener 5 dígitos.");
  if (profile.fiscal_email && (profile.fiscal_email.length > 254 || !EMAIL_PATTERN.test(profile.fiscal_email))) throw new Error("El correo fiscal no tiene un formato válido.");
  if (profile.phone.length > 120) throw new Error("El teléfono no debe exceder 120 caracteres.");
  return profile;
}

export function maskRfc(value = "") {
  const rfc = String(value);
  if (rfc.length < 6) return "RFC protegido";
  return `${rfc.slice(0, 3)}••••••${rfc.slice(-3)}`;
}

export async function loadToolsWorkspace() {
  const sequence = ++loadSequence;
  toolsWorkspace.loading = true;
  toolsWorkspace.error = "";
  notify();
  try {
    const result = await requestTools("profiles");
    if (sequence !== loadSequence) return;
    toolsWorkspace.profiles = Array.isArray(result.data) ? result.data : [];
    if (!toolsWorkspace.profiles.some((profile) => profile.id === toolsWorkspace.selectedProfileId)) {
      toolsWorkspace.selectedProfileId = toolsWorkspace.profiles.find((profile) => profile.active !== false)?.id ?? toolsWorkspace.profiles[0]?.id ?? "";
    }
    toolsWorkspace.loaded = true;
    await loadProfileConnections(toolsWorkspace.selectedProfileId);
  } catch (error) {
    if (sequence === loadSequence) {
      toolsWorkspace.error = error instanceof Error ? error.message : "No se pudieron cargar tus perfiles.";
      toolsWorkspace.loaded = false;
    }
  } finally {
    if (sequence === loadSequence) {
      toolsWorkspace.loading = false;
      notify();
    }
  }
}

export async function loadProfileConnections(profileId = toolsWorkspace.selectedProfileId) {
  const sequence = ++connectionSequence;
  toolsWorkspace.selectedProfileId = profileId || "";
  toolsWorkspace.connections = [];
  toolsWorkspace.error = "";
  if (!profileId) {
    toolsWorkspace.connectionsLoading = false;
    notify();
    return;
  }
  toolsWorkspace.connectionsLoading = true;
  notify();
  try {
    const result = await requestTools("connections", { profileId });
    if (sequence === connectionSequence && toolsWorkspace.selectedProfileId === profileId) {
      toolsWorkspace.connections = Array.isArray(result.data) ? result.data : [];
    }
  } catch (error) {
    if (sequence === connectionSequence) toolsWorkspace.error = error instanceof Error ? error.message : "No se pudieron cargar las conexiones.";
  } finally {
    if (sequence === connectionSequence) {
      toolsWorkspace.connectionsLoading = false;
      notify();
    }
  }
}

export function openFiscalProfileForm(profile = null) {
  toolsWorkspace.error = "";
  toolsWorkspace.notice = "";
  toolsWorkspace.connectionForm = null;
  toolsWorkspace.profileForm = profile ? { ...profile } : {};
  notify();
}

export function openToolConnectionForm(toolKey = "accounting", environment = "sandbox") {
  if (!TOOL_KEYS.has(toolKey)) return;
  if (!["sandbox", "production"].includes(environment)) environment = "sandbox";
  if (!toolsWorkspace.selectedProfileId) {
    toolsWorkspace.error = "Primero crea o selecciona un perfil fiscal.";
    notify();
    return;
  }
  toolsWorkspace.error = "";
  toolsWorkspace.notice = "";
  toolsWorkspace.profileForm = null;
  toolsWorkspace.connectionForm = { tool_key: toolKey, environment };
  notify();
}

export function closeToolsForms() {
  toolsWorkspace.profileForm = null;
  toolsWorkspace.connectionForm = null;
  toolsWorkspace.error = "";
  notify();
}

export async function saveFiscalProfile(input = {}) {
  let profile;
  try { profile = normalizeFiscalProfile(input); }
  catch (error) {
    toolsWorkspace.error = error instanceof Error ? error.message : "Revisa los datos del perfil.";
    notify();
    return false;
  }
  const editingId = toolsWorkspace.profileForm?.id;
  toolsWorkspace.saving = true;
  toolsWorkspace.error = "";
  toolsWorkspace.notice = "";
  notify();
  try {
    await requestTools("profiles", { method: editingId ? "PATCH" : "POST", ...(editingId ? { id: editingId } : {}), body: profile });
    toolsWorkspace.profileForm = null;
    toolsWorkspace.notice = editingId ? "Perfil fiscal actualizado." : "Perfil fiscal creado en tu cuenta privada.";
    await loadToolsWorkspace();
    return true;
  } catch (error) {
    toolsWorkspace.error = error instanceof Error ? error.message : "No se pudo guardar el perfil fiscal.";
    return false;
  } finally {
    toolsWorkspace.saving = false;
    notify();
  }
}

export async function saveToolConnection(input = {}) {
  const profileId = toolsWorkspace.selectedProfileId;
  const toolKey = String(input.tool_key ?? "");
  const environment = String(input.environment ?? "sandbox");
  if (!profileId || !TOOL_KEYS.has(toolKey) || !["sandbox", "production"].includes(environment)) {
    toolsWorkspace.error = "Selecciona un perfil, herramienta y ambiente válidos.";
    notify();
    return false;
  }
  // El panel solo registra el estado pendiente; no recibe credenciales ni se conecta al proveedor.
  const existing = toolsWorkspace.connections.find((item) => item.tool_key === toolKey && item.environment === environment);
  const body = { profile_id: profileId, tool_key: toolKey, provider: existing?.provider || "pending", environment, status: existing?.status || "pending" };
  toolsWorkspace.saving = true;
  toolsWorkspace.error = "";
  toolsWorkspace.notice = "";
  notify();
  try {
    await requestTools("connections", { method: existing ? "PATCH" : "POST", ...(existing ? { id: existing.id } : {}), body: existing ? { provider: body.provider, status: body.status } : body });
    toolsWorkspace.connectionForm = null;
    toolsWorkspace.notice = existing
      ? "Registro actualizado sin cambiar el estado de la conexión. No se envió información al proveedor."
      : "Registro pendiente guardado. Esto no conecta ni envía información al proveedor.";
    await loadProfileConnections(profileId);
    return true;
  } catch (error) {
    toolsWorkspace.error = error instanceof Error ? error.message : "No se pudo guardar el registro de conexión.";
    return false;
  } finally {
    toolsWorkspace.saving = false;
    notify();
  }
}

export function resetToolsWorkspace() {
  loadSequence += 1;
  connectionSequence += 1;
  Object.assign(toolsWorkspace, {
    profiles: [], connections: [], selectedProfileId: "", loading: false, connectionsLoading: false,
    saving: false, loaded: false, error: "", notice: "", profileForm: null, connectionForm: null,
  });
  notify();
}
