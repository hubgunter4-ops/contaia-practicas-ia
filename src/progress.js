import { courseModules } from "./course.js";
import { exercises } from "./exercises.js";

export const PROGRESS_STORAGE_KEY = "contaia.progress.v1";

const validModuleIds = new Set(courseModules.map((module) => module.id));
const validExerciseIds = new Set(exercises.map((exercise) => exercise.id));
const emptyProgress = () => ({ completedModules: [], completedExercises: [] });

function cleanIds(values, allowedIds) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((id) => typeof id === "string" && allowedIds.has(id)))];
}

function sanitizeProgress(progress, moduleIds = validModuleIds, exerciseIds = validExerciseIds) {
  const source = progress && typeof progress === "object" ? progress : {};
  return {
    completedModules: cleanIds(source.completedModules, moduleIds),
    completedExercises: cleanIds(source.completedExercises, exerciseIds),
  };
}

export function loadProgress(storage) {
  try {
    const serialized = storage.getItem(PROGRESS_STORAGE_KEY);
    if (!serialized) return emptyProgress();
    return sanitizeProgress(JSON.parse(serialized));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress, storage) {
  const sanitized = sanitizeProgress(progress);
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
}

export function createPortfolioMarkdown(progress, modules, practiceExercises, generatedAt = new Date()) {
  const moduleIds = new Set(modules.map((module) => module.id));
  const exerciseIds = new Set(practiceExercises.map((exercise) => exercise.id));
  const sanitized = sanitizeProgress(progress, moduleIds, exerciseIds);
  const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const dateLabel = Number.isNaN(date.valueOf()) ? String(generatedAt) : date.toISOString();
  const completedModules = new Set(sanitized.completedModules);
  const completedExercises = new Set(sanitized.completedExercises);
  const moduleRows = modules.map((module) => `- [${completedModules.has(module.id) ? "x" : " "}] Módulo ${module.week}: ${module.title}`).join("\n");
  const exerciseRows = practiceExercises.map((exercise) => `- [${completedExercises.has(exercise.id) ? "x" : " "}] ${exercise.title}`).join("\n");

  return [
    "# Portafolio de avance — Laboratorio ContaIA",
    "",
    `Generado: ${dateLabel}`,
    "",
    "## Módulos del curso",
    moduleRows,
    "",
    "## Prácticas del laboratorio",
    exerciseRows,
    "",
    `Avance: ${completedModules.size} de ${modules.length} módulos y ${completedExercises.size} de ${practiceExercises.length} prácticas completados.`,
    "",
  ].join("\n");
}
