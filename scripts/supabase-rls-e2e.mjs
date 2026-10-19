import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Solo ejecutar contra Supabase local o un proyecto dedicado de staging.
// Nunca se usa service_role: todas las operaciones pasan por RLS con usuarios normales.
// Requiere SUPABASE_RLS_TEST_URL, SUPABASE_RLS_TEST_PUBLISHABLE_KEY,
// SUPABASE_RLS_TEST_PROJECT_REF, SUPABASE_RLS_TEST_ENV=staging|local,
// SUPABASE_RLS_TEST_USER_A_EMAIL/PASSWORD y SUPABASE_RLS_TEST_USER_B_EMAIL/PASSWORD.
// Ejecutar con `npm run test:supabase:rls`; las cuentas de prueba deben existir en Auth.
const PRODUCTION_PROJECT_REF = "rjdhfajtttejskhuplzq";
const TABLE = "cfdi_analysis_runs";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable requerida ${name}.`);
  return value;
}

function projectRefFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_RLS_TEST_URL no es una URL válida.");
  }
  const localHost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (localHost && parsed.protocol === "http:") return "local";
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Usa Supabase local en localhost o un proyecto HTTPS (*.supabase.co) de staging; no se admiten dominios arbitrarios.");
  }
  return parsed.hostname.slice(0, -".supabase.co".length);
}

function isClientSafeKey(key) {
  if (key.startsWith("sb_publishable_")) return true;
  if (!key.startsWith("eyJ")) return false;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString("utf8"));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

function clientFor(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "contaia-cfdi-rls-e2e" } },
  });
}

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error, `${label}: no se pudo iniciar sesión en la cuenta de prueba`);
  assert.ok(data.user?.id, `${label}: Supabase no devolvió un usuario autenticado`);
  return data.user;
}

async function main() {
  const url = required("SUPABASE_RLS_TEST_URL");
  const key = required("SUPABASE_RLS_TEST_PUBLISHABLE_KEY");
  const projectRef = projectRefFromUrl(url);
  const expectedRef = required("SUPABASE_RLS_TEST_PROJECT_REF");
  const environment = required("SUPABASE_RLS_TEST_ENV").toLowerCase();

  if ((projectRef !== "local" && !/^[a-z0-9-]{10,40}$/.test(expectedRef)) || expectedRef !== projectRef) {
    throw new Error("SUPABASE_RLS_TEST_PROJECT_REF debe coincidir exactamente con el proyecto configurado.");
  }
  if (!new Set(["staging", "local"]).has(environment)) {
    throw new Error("La prueba solo admite SUPABASE_RLS_TEST_ENV=staging o local.");
  }
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Protección: este script no se ejecuta contra el proyecto Supabase de producción.");
  }
  if (!isClientSafeKey(key)) {
    throw new Error("Usa una clave sb_publishable o un JWT legacy con role=anon. Las claves secret/service_role no se aceptan.");
  }

  const emailA = required("SUPABASE_RLS_TEST_USER_A_EMAIL");
  const passwordA = required("SUPABASE_RLS_TEST_USER_A_PASSWORD");
  const emailB = required("SUPABASE_RLS_TEST_USER_B_EMAIL");
  const passwordB = required("SUPABASE_RLS_TEST_USER_B_PASSWORD");
  assert.notEqual(emailA.toLowerCase(), emailB.toLowerCase(), "Las cuentas de prueba deben ser distintas.");

  const userAClient = clientFor(url, key);
  const userBClient = clientFor(url, key);
  const anonymousClient = clientFor(url, key);
  let runId = null;
  const marker = `contaia-rls-e2e-${randomUUID()}`;
  const results = [];
  const check = (name, fn) => Promise.resolve().then(fn).then(() => {
    results.push(name);
    console.log(`PASS ${name}`);
  });

  try {
    const userA = await signIn(userAClient, emailA, passwordA, "Cuenta A");
    const userB = await signIn(userBClient, emailB, passwordB, "Cuenta B");
    assert.notEqual(userA.id, userB.id, "Las cuentas de prueba deben pertenecer a usuarios distintos.");
    results.push("Autenticación de dos usuarios distintos");
    console.log("PASS Autenticación de dos usuarios distintos");

    await check("Inserción autenticada asigna el propietario desde auth.uid()", async () => {
      const { data, error } = await userAClient
        .from(TABLE)
        .insert({
          title: marker,
          schema_version: "pdfc-compatible-1",
          analysis_data: { e2e_marker: marker, summary: { invoiceCount: 0, paymentCount: 0 } },
        })
        .select("id,user_id")
        .single();
      assert.ifError(error, "Cuenta A no pudo insertar en su historial");
      assert.equal(data.user_id, userA.id, "La fila debe pertenecer al usuario autenticado");
      runId = data.id;
    });

    await check("Usuario A puede leer su propia fila", async () => {
      const { data, error } = await userAClient.from(TABLE).select("id,title,user_id").eq("id", runId);
      assert.ifError(error);
      assert.equal(data.length, 1);
      assert.equal(data[0].user_id, userA.id);
    });

    await check("El historial CFDI es inmutable para el propietario", async () => {
      const { error } = await userAClient
        .from(TABLE)
        .update({ title: `${marker}-updated` })
        .eq("id", runId)
        .select("id");
      assert.equal(error?.code, "42501", "UPDATE debe fallar por privilegio revocado para preservar el historial");
      const ownerCheck = await userAClient.from(TABLE).select("title").eq("id", runId).single();
      assert.ifError(ownerCheck.error);
      assert.equal(ownerCheck.data.title, marker, "La fila no debe cambiar tras un intento UPDATE");
    });

    await check("Usuario B no puede leer la fila de A", async () => {
      const { data, error } = await userBClient.from(TABLE).select("id,title,user_id").eq("id", runId);
      assert.ifError(error);
      assert.deepEqual(data, []);
    });

    await check("Usuario B no puede borrar la fila de A", async () => {
      const { data, error } = await userBClient.from(TABLE).delete().eq("id", runId).select("id");
      assert.ifError(error);
      assert.deepEqual(data, []);
      const ownerCheck = await userAClient.from(TABLE).select("id").eq("id", runId);
      assert.ifError(ownerCheck.error);
      assert.equal(ownerCheck.data.length, 1, "La fila del usuario A debe seguir intacta");
    });

    await check("La política de inserción rechaza suplantar user_id", async () => {
      const { error } = await userAClient.from(TABLE).insert({
        user_id: userB.id,
        title: `${marker}-spoof`,
        schema_version: "pdfc-compatible-1",
        analysis_data: { e2e_marker: `${marker}-spoof` },
      });
      assert.ok(error, "RLS debe rechazar insertar una fila a nombre de otro usuario");
    });

    await check("El rol anónimo no puede leer historial privado", async () => {
      const { data, error } = await anonymousClient.from(TABLE).select("id").eq("id", runId);
      assert.ok(error || data?.length === 0, "El rol anónimo no debe leer filas privadas");
    });

    await check("El rol anónimo no puede insertar historial", async () => {
      const { error } = await anonymousClient.from(TABLE).insert({
        title: `${marker}-anonymous`,
        schema_version: "pdfc-compatible-1",
        analysis_data: { e2e_marker: `${marker}-anonymous` },
      });
      assert.ok(error, "El rol anónimo debe carecer de permiso de inserción");
    });

    await check("La tabla rechaza valores fuera del contrato de esquema", async () => {
      const { error } = await userAClient.from(TABLE).insert({
        title: `${marker}-invalid-schema`,
        schema_version: "unexpected-version",
        analysis_data: { e2e_marker: `${marker}-invalid-schema` },
      });
      assert.ok(error, "La restricción de schema_version debe rechazar versiones desconocidas");
    });

    await check("Solo el propietario puede eliminar; A puede borrar su fila", async () => {
      const { data, error } = await userAClient.from(TABLE).delete().eq("id", runId).select("id");
      assert.ifError(error);
      assert.equal(data.length, 1);
      runId = null;
    });

    console.log(`\nSupabase/RLS E2E: ${results.length} comprobaciones aprobadas (${environment}; ref ${projectRef}).`);
  } finally {
    // Limpieza acotada a la fila única que el script creó y solo mediante el usuario propietario.
    if (runId) {
      const { error } = await userAClient.from(TABLE).delete().eq("id", runId);
      if (error) console.error("ADVERTENCIA: no se pudo limpiar la fila sintética; elimínala buscando el marcador e2e del título.");
    }
    await Promise.allSettled([
      userAClient.auth.signOut(),
      userBClient.auth.signOut(),
      anonymousClient.auth.signOut(),
    ]);
  }
}

main().catch((error) => {
  console.error(`Supabase/RLS E2E falló: ${error?.message || "error inesperado"}`);
  process.exitCode = 1;
});
