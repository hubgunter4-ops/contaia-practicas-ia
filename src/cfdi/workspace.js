import { buildCfdiAnalysis, buildNoraCfdiContext, buildStoredAnalysis } from "./analysis.js";
import { setAuthClient, updateAuthUser } from "../auth/client.js";

export const cfdiState = {
  initialized: false, configStatus: "loading", configMessage: "Conectando con el almacenamiento privado…",
  client: null, user: null, authBusy: false, email: "", authMessage: "", authError: false,
  analysis: null, fileCount: 0, status: "empty", processingStep: 0, error: "", activeTab: "overview", pendingRequest: "",
  savedRuns: [], historyBusy: false, saveBusy: false, operationMessage: "", operationError: false,
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const formatMoney = (amount, currency = "Sin moneda indicada") => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  if (!/^[A-Z]{3}$/.test(currency)) return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(value)} · ${currency === "Sin moneda indicada" ? "moneda no indicada" : escapeHtml(currency)}`;
  try { return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toFixed(2)} ${escapeHtml(currency)}`; }
};
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(date);
};
const abbreviate = (value) => value ? `${escapeHtml(String(value).slice(0, 8))}…` : "Sin UUID";

function summaryCards(analysis) {
  const summary = analysis.summary;
  return `<div class="cfdi-metrics" aria-label="Resumen del análisis">
    <article><span>Facturas</span><b>${summary.invoiceCount}</b><small>Ingreso y egreso</small></article>
    <article><span>Pagos relacionados</span><b>${summary.matchedPayments} / ${summary.paymentCount}</b><small>${summary.unmatchedPayments} sin vínculo cargado</small></article>
    <article><span>Conceptos</span><b>${summary.conceptCount}</b><small>Detalle extraído del XML</small></article>
    <article class="${summary.alerts.length ? "has-alert" : "is-ok"}"><span>Revisiones sugeridas</span><b>${summary.alerts.reduce((sum, alert) => sum + alert.count, 0)}</b><small>${summary.alerts.length ? "No equivalen a un dictamen" : "Sin alertas de regla básicas"}</small></article>
  </div>`;
}

function renderCurrencyTotals(analysis) {
  if (!analysis.summary.totalsByCurrency.length) return "";
  return `<section class="cfdi-total-block" aria-label="Totales agrupados por moneda"><div class="cfdi-section-title"><div><span>LECTURA DE CONJUNTO</span><h2>Importes por moneda</h2></div><small>No se suman monedas distintas</small></div><div class="cfdi-currency-grid">${analysis.summary.totalsByCurrency.map((total) => `<article><b>${escapeHtml(total.currency)}</b><div><span>Facturado</span><strong>${formatMoney(total.invoiced, total.currency)}</strong></div><div><span>Pagado</span><strong>${formatMoney(total.paid, total.currency)}</strong></div><div><span>Saldo pendiente reportado</span><strong>${formatMoney(total.remaining, total.currency)}</strong></div></article>`).join("")}</div></section>`;
}

function renderAlerts(analysis) {
  const labels = {
    duplicate_uuid: "UUID de factura repetido en los archivos cargados",
    payment_without_invoice: "Pago sin factura relacionada dentro de la selección",
    payment_balance_difference: "Saldo anterior − importe pagado − saldo insoluto no cuadra",
    payment_exceeds_invoice: "Importe pagado mayor al total de la factura relacionada",
    estimated_tax_unmatched: "Estimación de IVA al 16% aplicada a pago sin factura vinculada",
  };
  if (!analysis.summary.alerts.length) return `<div class="cfdi-empty-state cfdi-success"><b>Sin alertas básicas</b><p>El parser no detectó diferencias en las comprobaciones disponibles. Esto no valida la autenticidad ni el cumplimiento fiscal del CFDI.</p></div>`;
  return `<section class="cfdi-alert-list" aria-label="Alertas para revisión"><div class="cfdi-section-title"><div><span>CRITERIO · NO DICTAMEN</span><h2>Conviene revisar</h2></div></div>${analysis.summary.alerts.map((alert) => `<article class="cfdi-alert cfdi-alert-${alert.severity}"><i aria-hidden="true">!</i><div><b>${escapeHtml(labels[alert.code] || "Resultado para revisar")}</b><p>${alert.count} registro(s). Confirma documentos y reglas aplicables antes de concluir.</p></div></article>`).join("")}</section>`;
}

function renderInvoices(analysis) {
  if (!analysis.facturas.length) return `<div class="cfdi-empty-state"><b>No hay facturas de ingreso/egreso en esta carga.</b><p>El lote puede contener únicamente CFDI de pago.</p></div>`;
  return `<div class="cfdi-table-wrap"><table class="cfdi-table"><thead><tr><th>UUID / folio</th><th>Emisor</th><th>Receptor</th><th>Fecha</th><th>Tipo</th><th>Moneda</th><th class="numeric">Total</th></tr></thead><tbody>${analysis.facturas.map((invoice) => `<tr><td><b>${abbreviate(invoice.uuid)}</b><small>${escapeHtml(invoice.serieFolio || "Sin folio")}</small></td><td>${escapeHtml(invoice.nombreEmisor || invoice.emisor || "—")}<small>${escapeHtml(invoice.rfcEmisor || "")}</small></td><td>${escapeHtml(invoice.nombreReceptor || invoice.receptor || "—")}<small>${escapeHtml(invoice.rfcReceptor || "")}</small></td><td>${escapeHtml(formatDate(invoice.fecha))}</td><td>${invoice.tipo === "E" ? "Egreso" : "Ingreso"}</td><td>${escapeHtml(invoice.moneda || "—")}</td><td class="numeric">${formatMoney(invoice.total, invoice.moneda)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderPayments(analysis) {
  if (!analysis.pagos.length) return `<div class="cfdi-empty-state"><b>No se encontraron complementos de pago.</b><p>Los CFDI de pago (tipo P) aparecerán aquí al cargar XML que los contengan.</p></div>`;
  return `<div class="cfdi-table-wrap"><table class="cfdi-table"><thead><tr><th>Documento relacionado</th><th>Fecha de pago</th><th>Saldo anterior</th><th>Pagado</th><th>Saldo insoluto</th><th>Relación / nota</th></tr></thead><tbody>${analysis.pagos.map((payment) => {
    const currency = payment.moneda || "MXN";
    const difference = Math.round((Number(payment.saldoAnterior) - Number(payment.impPagado) - Number(payment.saldoInsoluto)) * 100) / 100;
    const note = payment.relationStatus === "matched" ? "Factura encontrada" : payment.estimatedTax ? "Sin factura · impuesto estimado" : "Sin factura cargada";
    return `<tr><td><b>${abbreviate(payment.docRelacionado)}</b></td><td>${escapeHtml(formatDate(payment.fechaPago))}</td><td class="numeric">${formatMoney(payment.saldoAnterior, currency)}</td><td class="numeric">${formatMoney(payment.impPagado, currency)}</td><td class="numeric">${formatMoney(payment.saldoInsoluto, currency)}</td><td><span class="cfdi-status-tag ${payment.relationStatus === "matched" ? "is-linked" : "is-review"}">${escapeHtml(note)}</span>${Math.abs(difference) > 0.01 ? `<small>Diferencia aritmética: ${formatMoney(difference, currency)}</small>` : ""}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderConcepts(analysis) {
  if (!analysis.conceptos.length) return `<div class="cfdi-empty-state"><b>No hay conceptos extraídos.</b><p>El detalle aparece cuando se cargan comprobantes de ingreso o egreso.</p></div>`;
  return `<div class="cfdi-table-wrap"><table class="cfdi-table"><thead><tr><th>Concepto</th><th>Emisor</th><th>Clave SAT</th><th>Cantidad</th><th>Importe</th><th>IVA 16%</th><th>IEPS</th></tr></thead><tbody>${analysis.conceptos.map((item) => `<tr><td>${escapeHtml(item.descripcion || "Sin descripción")}<small>${escapeHtml(item.serieFolio || "")}</small></td><td>${escapeHtml(item.emisor || "—")}</td><td>${escapeHtml(item.claveProdServ || "—")}</td><td>${Number(item.cantidad || 0).toLocaleString("es-MX")}</td><td class="numeric">${formatMoney(item.importe, item.moneda)}</td><td class="numeric">${formatMoney(item.iva16, item.moneda)}</td><td class="numeric">${formatMoney(item.ieps, item.moneda)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderHistory() {
  if (!cfdiState.user) return `<div class="cfdi-history-empty">Inicia sesión para consultar tus análisis guardados. El análisis local no requiere cuenta.</div>`;
  if (cfdiState.historyBusy) return `<div class="cfdi-history-empty" role="status">Cargando historial privado…</div>`;
  if (!cfdiState.savedRuns.length) return `<div class="cfdi-history-empty">Todavía no hay análisis guardados en esta cuenta.</div>`;
  return `<div class="cfdi-history-list">${cfdiState.savedRuns.map((run) => `<article><div><b>${escapeHtml(run.title)}</b><small>${escapeHtml(formatDate(run.created_at))} · ${run.analysis_data?.summary?.invoiceCount ?? 0} facturas · ${run.analysis_data?.summary?.paymentCount ?? 0} pagos</small></div><button type="button" data-cfdi-load="${escapeHtml(run.id)}">Abrir</button><button type="button" data-cfdi-delete="${escapeHtml(run.id)}" aria-label="Eliminar ${escapeHtml(run.title)}">Eliminar</button></article>`).join("")}</div>`;
}

function renderStoragePanel() {
  const signedIn = Boolean(cfdiState.user);
  const configNotice = cfdiState.configStatus === "ready"
    ? `<p class="cfdi-db-status is-ready" role="status">${signedIn ? "Conectada · historial privado de tu cuenta" : "Supabase listo · inicia sesión para guardar"}</p>`
    : `<p class="cfdi-db-status is-offline" role="status">${escapeHtml(cfdiState.configMessage)} El análisis en el navegador continúa disponible.</p>`;
  const auth = signedIn
    ? `<div class="cfdi-auth-row"><span>Sesión privada activa</span><button type="button" data-cfdi-signout>Cerrar sesión</button></div>`
    : `<form class="cfdi-auth-form" data-cfdi-auth><label for="cfdi-email">Correo para enlace de acceso</label><div><input id="cfdi-email" type="email" autocomplete="email" required maxlength="254" value="${escapeHtml(cfdiState.email)}" placeholder="tu@correo.com" ${cfdiState.configStatus !== "ready" || cfdiState.authBusy ? "disabled" : ""}/><button type="submit" ${cfdiState.configStatus !== "ready" || cfdiState.authBusy ? "disabled" : ""}>${cfdiState.authBusy ? "Enviando…" : "Enviar enlace"}</button></div><small>El acceso se solicita solo al pulsar. No guardes XML: el historial conserva resultados normalizados.</small>${cfdiState.authMessage ? `<p class="${cfdiState.authError ? "cfdi-error" : "cfdi-success-text"}" role="status">${escapeHtml(cfdiState.authMessage)}</p>` : ""}</form>`;
  const save = cfdiState.analysis ? `<form class="cfdi-save-form" data-cfdi-save><label for="cfdi-run-title">Nombre de este análisis</label><input id="cfdi-run-title" name="title" maxlength="120" value="Análisis CFDI" required ${!signedIn || cfdiState.saveBusy ? "disabled" : ""}/><label class="cfdi-consent"><input name="acknowledge" type="checkbox" required ${!signedIn || cfdiState.saveBusy ? "disabled" : ""}/><span>Entiendo que el resultado puede incluir RFC, nombres, UUID y folios. Se guardará en mi cuenta privada; el XML y el nombre local del archivo no se almacenan.</span></label><button type="submit" ${!signedIn || cfdiState.saveBusy ? "disabled" : ""}>${cfdiState.saveBusy ? "Guardando…" : "Guardar resultado en Supabase"}</button></form>` : `<p class="cfdi-history-empty">Carga y analiza archivos antes de guardar un resultado.</p>`;
  return `<section class="cfdi-storage" aria-labelledby="cfdi-storage-title"><div class="cfdi-section-title"><div><span>SUPABASE · ACCESO PERSONAL</span><h2 id="cfdi-storage-title">Historial privado</h2></div><span class="cfdi-lock" aria-label="Acceso restringido">RLS</span></div>${configNotice}${auth}${save}${cfdiState.operationMessage ? `<p class="${cfdiState.operationError ? "cfdi-error" : "cfdi-success-text"}" role="status">${escapeHtml(cfdiState.operationMessage)}</p>` : ""}<div class="cfdi-history-head"><b>Tus análisis</b><button type="button" data-cfdi-refresh ${!signedIn || cfdiState.historyBusy ? "disabled" : ""}>Actualizar</button></div>${renderHistory()}</section>`;
}

function renderProcessingStatus() {
  const steps = ["Leyendo XML", "Clasificando comprobantes", "Preparando alertas"];
  const active = Math.max(0, Math.min(steps.length - 1, cfdiState.processingStep || 0));
  return `<div class="cfdi-processing" role="status" aria-live="polite" aria-label="Progreso del análisis CFDI"><div class="cfdi-processing-head"><span>ANÁLISIS LOCAL</span><b>${escapeHtml(steps[active])}…</b></div><ol>${steps.map((label, index) => `<li class="${index < active ? "is-complete" : index === active ? "is-active" : ""}"><span aria-hidden="true">${index < active ? "✓" : String(index + 1).padStart(2, "0")}</span><b>${label}</b></li>`).join("")}</ol></div>`;
}

export function renderCfdiWorkspace() {
  const analysis = cfdiState.analysis;
  const currentTab = cfdiState.activeTab;
  const body = !analysis ? `<div class="cfdi-empty-state cfdi-empty-large"><span aria-hidden="true">XML</span><b>El análisis empieza aquí</b><p>Selecciona CFDI en XML o un ZIP con varios comprobantes. La extracción y las relaciones se calculan en este navegador.</p></div>`
    : `<section class="cfdi-results" aria-label="Resultados del análisis">${summaryCards(analysis)}${renderCurrencyTotals(analysis)}${renderAlerts(analysis)}<nav class="cfdi-result-tabs" aria-label="Vistas del resultado">${[["overview", "Resumen"], ["invoices", `Facturas (${analysis.facturas.length})`], ["payments", `Pagos (${analysis.pagos.length})`], ["concepts", `Conceptos (${analysis.conceptos.length})`]].map(([id, label]) => `<button type="button" data-cfdi-tab="${id}" class="${currentTab === id ? "is-active" : ""}" aria-current="${currentTab === id ? "page" : "false"}">${label}</button>`).join("")}</nav><section class="cfdi-tab-panel" aria-live="polite">${currentTab === "overview" ? `<div class="cfdi-overview-grid">${renderInvoices(analysis)}${renderPayments(analysis)}</div>` : currentTab === "invoices" ? renderInvoices(analysis) : currentTab === "payments" ? renderPayments(analysis) : renderConcepts(analysis)}</section><div class="cfdi-nora-handoff"><div><span>NORA · ACOMPAÑAMIENTO</span><b>¿Quieres interpretar una alerta o revisar una diferencia?</b><p>Solo se preparará un resumen numérico sin RFC, nombres, UUID, folios, archivo ni XML. Nora lo recibe cuando envíes tu pregunta en el Asistente abierto.</p></div><button type="button" data-cfdi-ask-nora>Pedir apoyo a Nora <span aria-hidden="true">↗</span></button></div><button type="button" class="cfdi-reset" data-cfdi-reset>Quitar resultado de esta sesión</button></section>`;
  const pending = cfdiState.pendingRequest ? `<aside class="cfdi-origin-request"><div><span>DERIVADO DESDE ASISTENTE ABIERTO</span><p>${escapeHtml(cfdiState.pendingRequest)}</p></div><button type="button" data-cfdi-dismiss-request aria-label="Quitar solicitud de origen">×</button></aside>` : "";
  const status = cfdiState.status === "processing" ? renderProcessingStatus() : cfdiState.error ? `<div class="cfdi-parse-error" role="alert"><div><b>No se pudo completar el análisis</b><p>${escapeHtml(cfdiState.error)}</p></div><button type="button" data-cfdi-ask-error>Pedir ayuda a Nora</button></div>` : cfdiState.status === "ready" ? `<p class="cfdi-progress is-ready" role="status">Análisis listo · ${cfdiState.fileCount} archivo(s) leídos en este navegador.</p>` : "";
  return `<main id="contenido" class="content cfdi-page" data-cfdi-page tabindex="-1"><header class="cfdi-hero"><div><p class="cfdi-eyebrow">MÓDULO INDEPENDIENTE · CFDI</p><h1>Analiza tus comprobantes.<br/><em>Con criterio y control.</em></h1><p>Lee XML y ZIP, relaciona complementos de pago con facturas y localiza diferencias para revisar. El XML permanece en tu navegador.</p></div><div class="cfdi-hero-visual" aria-hidden="true"><div class="cfdi-visual-icon"><span>XML</span><i>✓</i></div><p>Lectura y validación local</p></div><aside class="cfdi-local-badge"><span class="cfdi-local-pulse"></span><b>PROCESAMIENTO LOCAL</b><small>Sin carga de XML al servidor</small></aside></header>${pending}<section class="cfdi-workspace" aria-label="Carga y análisis de CFDI"><div class="cfdi-workspace-main"><section class="cfdi-upload-card" aria-labelledby="cfdi-upload-title"><div class="cfdi-upload-heading"><div><span>01 · CARGA CONTROLADA</span><h2 id="cfdi-upload-title">Añade uno o varios archivos</h2></div><span class="cfdi-format-pill">.XML · .ZIP</span></div><label class="cfdi-dropzone" for="cfdi-files" data-cfdi-drop><input id="cfdi-files" type="file" data-cfdi-files multiple accept=".xml,.zip,application/xml,text/xml,application/zip"/><span class="cfdi-upload-icon" aria-hidden="true">↑</span><b>${cfdiState.status === "processing" ? "Procesando localmente…" : "Selecciona o arrastra XML / ZIP"}</b><small>Hasta 100 XML · 5 MB por XML · 25 MB extraídos · ZIP de hasta 20 MB</small></label><p class="cfdi-file-count" data-cfdi-file-count>${cfdiState.fileCount ? `${cfdiState.fileCount} archivo(s) procesados en memoria` : "No se conserva el nombre de los archivos al guardar."}</p>${status}<p class="cfdi-privacy-note"><b>Privacidad:</b> el XML no se envía a Nora ni a Supabase. Guardar el resultado es opcional y puede conservar RFC, nombres, UUID y folios solo en tu cuenta privada.</p></section>${analysis ? body : `<section class="cfdi-preflight">${body}</section>`}</div><aside class="cfdi-storage-column">${renderStoragePanel()}</aside></section><footer class="cfdi-disclaimer"><b>Alcance del análisis</b><p>La lógica de extracción y prorrateo replica el parser de PDFC. Un pago sin factura cargada puede mostrar una estimación de IVA al 16%; se marca como estimación. Las alertas son comprobaciones aritméticas y de relación, no una validación ante el SAT ni un dictamen profesional.</p></footer></main>`;
}

async function loadSupabaseClient() {
  const response = await fetch("/api/cfdi/config", { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo leer la configuración de historial.");
  const config = await response.json();
  if (!config.enabled) {
    cfdiState.configStatus = "disabled";
    cfdiState.configMessage = "Historial no configurado. Define SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY; el análisis local sigue disponible.";
    return;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || "") || typeof config.publishableKey !== "string" || !config.publishableKey.startsWith("sb_publishable_")) {
    throw new Error("La configuración pública de Supabase no tiene el formato esperado.");
  }
  const { createClient } = await import("/vendor/supabase.js");
  const client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  cfdiState.client = client;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  cfdiState.user = data.session?.user ?? null;
  setAuthClient(client, cfdiState.user);
  cfdiState.configStatus = "ready";
  cfdiState.configMessage = "";
  client.auth.onAuthStateChange((_event, session) => {
    cfdiState.user = session?.user ?? null;
    updateAuthUser(cfdiState.user);
    cfdiState.authMessage = session ? "Acceso privado activo." : "";
    void loadHistory();
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  });
  if (cfdiState.user) await loadHistory();
}

export async function initializeCfdiWorkspace() {
  if (cfdiState.initialized) return;
  cfdiState.initialized = true;
  try { await loadSupabaseClient(); }
  catch {
    cfdiState.configStatus = "error";
    cfdiState.configMessage = "No fue posible conectar con el historial privado. El análisis local sigue disponible.";
    setAuthClient(null, null);
  }
  document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
}

async function loadHistory() {
  if (!cfdiState.client || !cfdiState.user) { cfdiState.savedRuns = []; return; }
  cfdiState.historyBusy = true;
  document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  try {
    const { data, error } = await cfdiState.client.from("cfdi_analysis_runs").select("id,title,created_at,analysis_data").order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    cfdiState.savedRuns = Array.isArray(data) ? data : [];
  } catch {
    cfdiState.operationError = true;
    cfdiState.operationMessage = "No se pudo leer el historial. Revisa el acceso de la cuenta y la migración RLS.";
  } finally {
    cfdiState.historyBusy = false;
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  }
}

async function analyzeFiles(files) {
  if (cfdiState.status === "processing") return;
  cfdiState.status = "processing";
  cfdiState.processingStep = 0;
  cfdiState.error = "";
  cfdiState.operationMessage = "";
  document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  try {
    const { parseFiles } = await import("/vendor/cfdi-parser.js");
    const parsed = await parseFiles(files);
    cfdiState.processingStep = 1;
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
    cfdiState.analysis = buildCfdiAnalysis(parsed);
    cfdiState.processingStep = 2;
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
    await new Promise((resolve) => setTimeout(resolve, 140));
    cfdiState.fileCount = files.length;
    cfdiState.activeTab = "overview";
    cfdiState.status = "ready";
    cfdiState.processingStep = 0;
    cfdiState.operationMessage = "El XML fue analizado localmente y no se ha guardado.";
    cfdiState.operationError = false;
  } catch (error) {
    cfdiState.analysis = null;
    cfdiState.fileCount = 0;
    cfdiState.status = "error";
    cfdiState.error = error instanceof Error ? error.message : "El archivo no pudo analizarse.";
  }
  document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
}

async function authenticate(form) {
  const email = String(new FormData(form).get("email") || "").trim();
  cfdiState.email = email;
  cfdiState.authBusy = true;
  cfdiState.authMessage = "";
  cfdiState.authError = false;
  document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  try {
    const { error } = await cfdiState.client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/` } });
    if (error) throw error;
    cfdiState.authMessage = "Si el correo puede recibir acceso, Supabase enviará un enlace. Vuelve aquí para completar el ingreso.";
  } catch {
    cfdiState.authError = true;
    cfdiState.authMessage = "No se pudo solicitar el enlace. Revisa el proveedor de correo y los Redirect URLs de Supabase.";
  } finally {
    cfdiState.authBusy = false;
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  }
}

async function saveAnalysis(form) {
  if (!cfdiState.client || !cfdiState.user || !cfdiState.analysis) return;
  const formData = new FormData(form);
  if (formData.get("acknowledge") !== "on") {
    cfdiState.operationError = true;
    cfdiState.operationMessage = "Confirma el aviso de privacidad antes de guardar.";
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
    return;
  }
  cfdiState.saveBusy = true;
  cfdiState.operationMessage = "";
  cfdiState.operationError = false;
  document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  try {
    const analysisData = buildStoredAnalysis(cfdiState.analysis);
    const title = String(formData.get("title") || "Análisis CFDI").trim().slice(0, 120) || "Análisis CFDI";
    const { error } = await cfdiState.client.from("cfdi_analysis_runs").insert({ title, schema_version: "pdfc-compatible-1", analysis_data: analysisData });
    if (error) throw error;
    cfdiState.operationMessage = "Resultado guardado en el historial privado. El XML no se conservó.";
    await loadHistory();
  } catch {
    cfdiState.operationError = true;
    cfdiState.operationMessage = "No se pudo guardar. Verifica que la migración esté aplicada y que tu sesión tenga permiso RLS.";
  } finally {
    cfdiState.saveBusy = false;
    document.dispatchEvent(new CustomEvent("contaia:cfdi-updated"));
  }
}

export function bindCfdiWorkspace(app, { onUpdate = () => {}, onAskNora = () => {} } = {}) {
  document.addEventListener("contaia:cfdi-updated", onUpdate);
  app.addEventListener("change", (event) => {
    if (!event.target.matches("[data-cfdi-files]")) return;
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) void analyzeFiles(files);
  });
  app.addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-cfdi-drop]")) return;
    event.preventDefault();
    event.target.closest("[data-cfdi-drop]").classList.add("is-dragging");
  });
  app.addEventListener("dragleave", (event) => event.target.closest?.("[data-cfdi-drop]")?.classList.remove("is-dragging"));
  app.addEventListener("drop", (event) => {
    const drop = event.target.closest?.("[data-cfdi-drop]");
    if (!drop) return;
    event.preventDefault();
    drop.classList.remove("is-dragging");
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) void analyzeFiles(files);
  });
  app.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-cfdi-tab]");
    if (tab) { cfdiState.activeTab = tab.dataset.cfdiTab; onUpdate(); return; }
    if (event.target.closest("[data-cfdi-reset]")) {
      cfdiState.analysis = null; cfdiState.fileCount = 0; cfdiState.status = "empty"; cfdiState.error = ""; cfdiState.operationMessage = ""; onUpdate(); return;
    }
    if (event.target.closest("[data-cfdi-dismiss-request]")) { cfdiState.pendingRequest = ""; onUpdate(); return; }
    if (event.target.closest("[data-cfdi-ask-nora]")) {
      const context = buildNoraCfdiContext(cfdiState.analysis);
      onAskNora(context, "Ayúdame a interpretar el resultado del análisis CFDI. Calcula cualquier diferencia que identifiques y dime qué debo revisar primero.");
      return;
    }
    if (event.target.closest("[data-cfdi-ask-error]")) {
      onAskNora({ schemaVersion: "cfdi-summary-v1", status: "parse_error", errorCode: "local_parse_failed" }, "No pude analizar este XML. Ayúdame a revisar causas comunes y qué comprobar en el archivo, sin pedir que lo envíe al chat.");
      return;
    }
    if (event.target.closest("[data-cfdi-refresh]")) { await loadHistory(); return; }
    const signout = event.target.closest("[data-cfdi-signout]");
    if (signout) { await cfdiState.client?.auth.signOut(); cfdiState.user = null; cfdiState.savedRuns = []; cfdiState.operationMessage = "Sesión cerrada."; onUpdate(); return; }
    const load = event.target.closest("[data-cfdi-load]");
    if (load) {
      try {
        const { data, error } = await cfdiState.client.from("cfdi_analysis_runs").select("analysis_data").eq("id", load.dataset.cfdiLoad).maybeSingle();
        if (error || !data?.analysis_data) throw error || new Error("not found");
        cfdiState.analysis = data.analysis_data;
        cfdiState.fileCount = 0;
        cfdiState.status = "ready";
        cfdiState.operationMessage = "Análisis recuperado de tu historial. El XML original no está guardado.";
        cfdiState.operationError = false;
      } catch {
        cfdiState.operationMessage = "No se pudo abrir este análisis con la cuenta actual.";
        cfdiState.operationError = true;
      }
      onUpdate(); return;
    }
    const remove = event.target.closest("[data-cfdi-delete]");
    if (remove) {
      if (!window.confirm("¿Eliminar este resultado guardado de tu historial privado?")) return;
      const { error } = await cfdiState.client.from("cfdi_analysis_runs").delete().eq("id", remove.dataset.cfdiDelete);
      cfdiState.operationError = Boolean(error);
      cfdiState.operationMessage = error ? "No se pudo eliminar el resultado." : "Resultado eliminado del historial privado.";
      await loadHistory(); onUpdate();
    }
  });
  app.addEventListener("input", (event) => {
    if (event.target.matches("#cfdi-email")) cfdiState.email = event.target.value;
  });
  app.addEventListener("submit", (event) => {
    const authForm = event.target.closest("[data-cfdi-auth]");
    if (authForm) { event.preventDefault(); if (cfdiState.client) void authenticate(authForm); return; }
    const saveForm = event.target.closest("[data-cfdi-save]");
    if (saveForm) { event.preventDefault(); void saveAnalysis(saveForm); }
  });
}
