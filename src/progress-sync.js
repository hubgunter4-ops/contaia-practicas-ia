import { normalizeProgress } from "./progress.js";

export const PROGRESS_TABLE = "learning_progress";

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractRemoteProgress(row) {
  if (!row || typeof row !== "object") return null;
  const progress = normalizeProgress(row.progress_data);
  progress.updatedAt = row.updated_at || progress.updatedAt;
  return progress;
}

export function chooseNewestProgress(localProgress, remoteProgress) {
  const local = normalizeProgress(localProgress);
  const remote = remoteProgress ? normalizeProgress(remoteProgress) : null;
  if (!remote) return { progress: local, source: "local" };
  if (timestamp(remote.updatedAt) > timestamp(local.updatedAt)) return { progress: remote, source: "remote" };
  if (timestamp(local.updatedAt) > timestamp(remote.updatedAt)) return { progress: local, source: "local" };
  return { progress: remote, source: "remote" };
}

export async function fetchAccountProgress(client) {
  if (!client) throw new TypeError("Se requiere un cliente Supabase para leer el progreso.");
  const { data, error } = await client.from(PROGRESS_TABLE).select("progress_data,updated_at").maybeSingle();
  if (error) throw error;
  return extractRemoteProgress(data);
}

export async function upsertAccountProgress(client, progress) {
  if (!client) throw new TypeError("Se requiere un cliente Supabase para guardar el progreso.");
  const normalized = normalizeProgress({ ...progress, updatedAt: progress?.updatedAt || new Date().toISOString() });
  const { error } = await client.from(PROGRESS_TABLE).upsert({
    progress_data: normalized,
    updated_at: normalized.updatedAt || new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return normalized;
}

export const __test = { timestamp };
