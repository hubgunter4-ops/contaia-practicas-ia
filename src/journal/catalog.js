import { normalizeCurrency } from "./money.js";

export const DEFAULT_JOURNAL_ACCOUNTS = Object.freeze([
  { accountId: "101-BANCO", codeText: "101-BANCO", name: "Bancos", nature: "deudora", parentAccountId: "", active: true, imputable: true, currencyCode: "MXN" },
  { accountId: "105-CLIENTES", codeText: "105-CLIENTES", name: "Clientes", nature: "deudora", parentAccountId: "", active: true, imputable: true, currencyCode: "MXN" },
  { accountId: "201-PROVEEDORES", codeText: "201-PROVEEDORES", name: "Proveedores", nature: "acreedora", parentAccountId: "", active: true, imputable: true, currencyCode: "MXN" },
  { accountId: "401-VENTAS", codeText: "401-VENTAS", name: "Ventas", nature: "acreedora", parentAccountId: "", active: true, imputable: true, currencyCode: "MXN" },
  { accountId: "501-GASTOS", codeText: "501-GASTOS", name: "Gastos operativos", nature: "deudora", parentAccountId: "", active: true, imputable: true, currencyCode: "MXN" },
]);

export function createJournalCatalog(companyLocalId = "company-local") {
  return {
    version: 1,
    companyLocalId,
    accounts: DEFAULT_JOURNAL_ACCOUNTS.map((account) => ({ ...account })),
  };
}

export function cloneCatalog(catalog) {
  return {
    version: Number(catalog?.version) || 1,
    companyLocalId: String(catalog?.companyLocalId || "company-local"),
    accounts: Array.isArray(catalog?.accounts) ? catalog.accounts.map((account) => ({ ...account })) : [],
  };
}

export function validateCatalog(catalog) {
  const errors = [];
  const accounts = Array.isArray(catalog?.accounts) ? catalog.accounts : [];
  const ids = new Set();
  const codes = new Set();
  for (const account of accounts) {
    if (!account.accountId || ids.has(account.accountId)) errors.push(`La cuenta ${account.accountId || "sin ID"} tiene un ID repetido o vacío.`);
    ids.add(account.accountId);
    if (!account.codeText || codes.has(account.codeText)) errors.push(`El código ${account.codeText || "vacío"} debe ser único en esta empresa.`);
    codes.add(account.codeText);
    if (account.currencyCode && !normalizeCurrency(account.currencyCode)) errors.push(`La moneda de ${account.codeText || account.accountId} no es un código de tres letras.`);
    if (account.parentAccountId && account.parentAccountId === account.accountId) errors.push(`La cuenta ${account.codeText} no puede ser su propio padre.`);
  }
  for (const account of accounts) {
    if (account.parentAccountId && !ids.has(account.parentAccountId)) errors.push(`El padre de ${account.codeText} no existe en este catálogo.`);
  }
  for (const account of accounts) {
    const visited = new Set();
    let current = account;
    while (current?.parentAccountId) {
      if (visited.has(current.accountId)) {
        errors.push(`La jerarquía de ${account.codeText} contiene un ciclo.`);
        break;
      }
      visited.add(current.accountId);
      current = accounts.find((candidate) => candidate.accountId === current.parentAccountId);
    }
  }
  return [...new Set(errors)];
}

export function accountMap(catalog) {
  return new Map((Array.isArray(catalog?.accounts) ? catalog.accounts : []).map((account) => [account.accountId, account]));
}

export function isAccountEligible(account, currency = "") {
  if (!account?.active || !account.imputable) return false;
  if (!currency) return true;
  return !account.currencyCode || account.currencyCode === currency;
}
