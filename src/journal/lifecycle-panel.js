import { JOURNAL_ACCOUNT_ROLES, PAYMENT_FORM_LABELS } from "./cfdi-policy.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

function selector(state, key, label, selected) {
  const options = state.catalog.accounts.map((account) => `<option value="${escapeHtml(account.accountId)}" ${account.accountId === selected ? "selected" : ""} ${!account.active || !account.imputable ? "disabled" : ""}>${escapeHtml(account.codeText)} · ${escapeHtml(account.name)}</option>`).join("");
  return `<label class="journal-field"><span>${escapeHtml(label)}</span><select data-journal-lifecycle-account="${key}"><option value="">Sin configurar</option>${options}</select></label>`;
}

export function renderLifecycleConfiguration(state) {
  return `<section class="journal-rule-stage" aria-labelledby="journal-lifecycle-title">
    <div class="journal-section-heading"><div><p class="eyebrow">02 · MOTOR CFDI LOCAL</p><h2 id="journal-lifecycle-title">Reconocimiento y liquidación separados</h2><p>PUE propone contado; PPD propone saldo de Clientes/Proveedores; REP liquida ese saldo sin duplicar ventas ni gastos.</p></div></div>
    <div class="journal-form-grid"><label class="journal-field"><span>RFC de la empresa · confirmación explícita</span><input data-journal-business-rfc value="${escapeHtml(state.businessRfc)}" maxlength="13" placeholder="AAA010101AAA"/></label><label class="journal-field"><span>Periodo del evento</span><input type="month" data-journal-period value="${escapeHtml(state.period)}"/></label></div>
    <details class="journal-lifecycle-accounts" ${state.lifecycleConfigured ? "" : "open"}><summary>Configurar cuentas contables de esta empresa y sesión</summary>
      <p>Selecciona cuentas explícitamente. Para notas de crédito configura descuentos, ajustes de IVA y devolución/compensación. Si necesitas una cuenta adicional, agrégala en Catálogo de cuentas. No se asignan cuentas por inferencia.</p>
      <div class="journal-form-grid">${Object.entries(JOURNAL_ACCOUNT_ROLES).map(([key, label]) => selector(state, key, label, state.lifecycleAccounts[key])).join("")}</div>
      <h3>Cuenta de caja/banco por forma de pago</h3><div class="journal-form-grid">${Object.entries(PAYMENT_FORM_LABELS).map(([code, label]) => selector(state, `payment:${code}`, `${code} · ${label}`, state.lifecycleAccounts.paymentForms[code])).join("")}</div>
    </details>
    <p class="journal-inline-note">MXN · IVA explícito 0%/16% · IVA PPD pendiente. REP reclasifica solo impuestos DR originales. Una nota de crédito requiere relación 01, cuentas configuradas y aplicación humana. No acredita impuestos, no infiere devolución y no convierte FormaPago en banco/efectivo.</p>
  </section>`;
}
