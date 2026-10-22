import { accountMap, isAccountEligible, validateCatalog } from "./catalog.js";
import { addMinor, normalizeCurrency, subtractMinor } from "./money.js";

export function validateJournalDraft(draft, catalog) {
  const errors = [...(Array.isArray(draft?.errors) ? draft.errors : [])];
  const warnings = [...(Array.isArray(draft?.warnings) ? draft.warnings : [])];
  errors.push(...validateCatalog(catalog));
  const accounts = accountMap(catalog);
  const totals = new Map();
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  if (lines.length < 2) errors.push("La propuesta necesita al menos dos partidas.");
  for (const line of lines) {
    const account = accounts.get(line.accountId);
    const currency = normalizeCurrency(line.amount?.currency);
    if (!account) errors.push(`La cuenta ${line.accountId || "sin cuenta"} no existe en el catálogo.`);
    if (account && !isAccountEligible(account, currency)) errors.push(`La cuenta ${account.codeText} está inactiva, no es imputable o no admite ${currency || "esta moneda"}.`);
    if (!currency) errors.push(`La partida ${line.lineId || "sin ID"} no tiene moneda válida.`);
    if (!line.amount || !/^-?\d+$/.test(String(line.amount.minor))) errors.push(`La partida ${line.lineId || "sin ID"} no tiene importe exacto.`);
    if (!line.side || !["debit", "credit"].includes(line.side)) errors.push(`La partida ${line.lineId || "sin ID"} no tiene lado cargo/abono válido.`);
    if (line.amount?.minor?.startsWith("-") || line.amount?.minor === "0") errors.push(`La partida ${line.lineId || "sin ID"} debe tener un importe positivo.`);
    if (currency && line.amount?.minor && !line.amount.minor.startsWith("-")) {
      const current = totals.get(currency) || { debit: [], credit: [] };
      current[line.side].push(line.amount.minor);
      totals.set(currency, current);
    }
  }
  if (new Set(draft?.sourceRefs || []).size !== (draft?.sourceRefs || []).length) errors.push("Una misma fuente fue seleccionada más de una vez.");
  const totalsByCurrency = [...totals.entries()].map(([currency, sides]) => {
    const debit = addMinor(sides.debit);
    const credit = addMinor(sides.credit);
    const difference = subtractMinor(debit, credit);
    if (difference !== "0") errors.push(`La póliza no cuadra en ${currency}: diferencia ${difference} unidades menores.`);
    return { currency, debit, credit, difference };
  });
  if (!totalsByCurrency.length) errors.push("No hay totales monetarios válidos para revisar.");
  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];
  const warningsAcknowledged = draft?.warningsAcknowledged === true;
  return {
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    totalsByCurrency,
    canApprove: uniqueErrors.length === 0 && (uniqueWarnings.length === 0 || warningsAcknowledged),
    status: uniqueErrors.length || (uniqueWarnings.length && !warningsAcknowledged) ? "review" : "ready",
  };
}
