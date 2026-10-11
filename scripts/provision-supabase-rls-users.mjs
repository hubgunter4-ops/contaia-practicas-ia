import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Provisiona solo cuentas sintéticas para pruebas RLS. No imprimir ni persistir la clave admin.
const PRODUCTION_PROJECT_REF = "rjdhfajtttejskhuplzq";
const OUTPUT_FILE = resolve(process.cwd(), ".env.supabase-rls-test.local");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable requerida ${name}.`);
  return value;
}

function projectRefFromUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); }
  catch { throw new Error("SUPABASE_RLS_SETUP_URL no es una URL válida."); }
  if (["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:") return "local";
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("Usa Supabase local en localhost o un proyecto HTTPS (*.supabase.co) dedicado a staging.");
  }
  return url.hostname.slice(0, -".supabase.co".length);
}

function jwtRole(key) {
  if (!key.startsWith("eyJ")) return "";
  try { return JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString("utf8")).role || ""; }
  catch { return ""; }
}

function escapeEnv(value) {
  // Los valores admitidos abajo no contienen comillas ni saltos de línea.
  return `"${value}"`;
}

async function main() {
  const url = required("SUPABASE_RLS_SETUP_URL").replace(/\/$/, "");
  const projectRef = projectRefFromUrl(url);
  const expectedRef = required("SUPABASE_RLS_SETUP_PROJECT_REF");
  const environment = required("SUPABASE_RLS_SETUP_ENV").toLowerCase();
  const adminKey = required("SUPABASE_RLS_SETUP_SERVICE_ROLE_KEY");
  const publishableKey = required("SUPABASE_RLS_SETUP_PUBLISHABLE_KEY");
  const emailA = required("SUPABASE_RLS_SETUP_USER_A_EMAIL");
  const emailB = required("SUPABASE_RLS_SETUP_USER_B_EMAIL");

  if ((projectRef !== "local" && !/^[a-z0-9-]{10,40}$/.test(expectedRef)) || expectedRef !== projectRef) {
    throw new Error("SUPABASE_RLS_SETUP_PROJECT_REF debe coincidir exactamente con la URL.");
  }
  if (!["local", "staging"].includes(environment) || (projectRef === "local") !== (environment === "local")) {
    throw new Error("Usa SUPABASE_RLS_SETUP_ENV=local para localhost o staging para un proyecto no productivo.");
  }
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Protección: no se permite aprovisionar usuarios en el proyecto Supabase de producción.");
  }
  if (!(adminKey.startsWith("sb_secret_") || jwtRole(adminKey) === "service_role")) {
    throw new Error("La clave admin debe ser una sb_secret o JWT legacy con role=service_role; no se acepta clave publicable.");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]{12,200}$/.test(publishableKey) && jwtRole(publishableKey) !== "anon") {
    throw new Error("SUPABASE_RLS_SETUP_PUBLISHABLE_KEY debe ser una clave publicable/anon, nunca admin.");
  }
  const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
  if (!emailPattern.test(emailA) || !emailPattern.test(emailB) || emailA.toLowerCase() === emailB.toLowerCase()) {
    throw new Error("Indica dos correos de prueba válidos y distintos; usa alias dedicados del entorno de staging.");
  }

  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const accounts = [];
  let fixtureWritten = false;
  try {
    for (const [label, email] of [["A", emailA], ["B", emailB]]) {
      const password = randomBytes(36).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(`No se pudo crear la cuenta sintética ${label}; revisa Auth, la URL y el entorno de staging.`);
      if (!data.user?.id) throw new Error(`Supabase no devolvió el ID de la cuenta sintética ${label}.`);
      accounts.push({ label, email, password, id: data.user.id });
    }

    const values = {
      SUPABASE_RLS_TEST_URL: url,
      SUPABASE_RLS_TEST_PROJECT_REF: projectRef,
      SUPABASE_RLS_TEST_ENV: environment,
      SUPABASE_RLS_TEST_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_RLS_TEST_USER_A_EMAIL: accounts[0].email,
      SUPABASE_RLS_TEST_USER_A_PASSWORD: accounts[0].password,
      SUPABASE_RLS_TEST_USER_B_EMAIL: accounts[1].email,
      SUPABASE_RLS_TEST_USER_B_PASSWORD: accounts[1].password,
    };
    const contents = `${Object.entries(values).map(([key, value]) => `${key}=${escapeEnv(value)}`).join("\n")}\n`;
    await writeFile(OUTPUT_FILE, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(OUTPUT_FILE, 0o600);
    fixtureWritten = true;
    console.log("Cuentas sintéticas A y B creadas y confirmadas para pruebas RLS.");
    console.log(`Configuración de prueba guardada en ${OUTPUT_FILE} con permisos 0600; el archivo está ignorado por Git (.env*).`);
    console.log("La clave admin no se guardó en el archivo ni se imprimió.");
    console.log("Para ejecutar la prueba: set -a; source .env.supabase-rls-test.local; set +a; npm run test:supabase:rls");
  } finally {
    if (!fixtureWritten) {
      for (const account of accounts.reverse()) {
        const { error } = await admin.auth.admin.deleteUser(account.id);
        if (error) console.error("ADVERTENCIA: no se pudo retirar una cuenta sintética creada parcialmente; revisa Auth del proyecto de staging.");
      }
    }
  }
}

main().catch((error) => {
  console.error(`Aprovisionamiento Supabase cancelado: ${error?.message || "error inesperado"}`);
  process.exitCode = 1;
});
