import { courseSessionFlow } from "./course.js";

export const COURSE_VIDEO_LIBRARY = Object.freeze({
  modules: Object.freeze({}),
  exercises: Object.freeze({}),
});

export const NOTEBOOKLM_URL = "https://notebook.google/";
export const SYNTHESIA_URL = "https://app.synthesia.io/";

export function getApprovedSynthesiaEmbed(entry) {
  if (!entry || entry.approved !== true || typeof entry.embedUrl !== "string") return null;
  try {
    const url = new URL(entry.embedUrl);
    if (url.protocol !== "https:" || url.hostname !== "share.synthesia.io" || url.port || url.username || url.password || url.hash) return null;
    if (!/^\/embeds\/videos\/[A-Za-z0-9-]+$/.test(url.pathname)) return null;
    const params = [...url.searchParams.entries()];
    if (params.some(([key, value]) => key !== "language" || value !== "es") || params.length > 1) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function resolveCourseVideo(kind, id, catalog = COURSE_VIDEO_LIBRARY) {
  const collection = kind === "module" ? catalog?.modules : kind === "exercise" ? catalog?.exercises : null;
  const entry = id && collection && typeof collection === "object" ? collection[id] : null;
  const embedUrl = getApprovedSynthesiaEmbed(entry);
  if (!embedUrl) return null;
  return {
    embedUrl,
    title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : "Video explicativo de Synthesia",
    duration: typeof entry.duration === "string" ? entry.duration.trim() : "",
  };
}

const clean = (value) => String(value ?? "").trim();

export function buildVideoBrief({ module, exercise = null } = {}) {
  if (!module?.id || !module?.title) throw new TypeError("El briefing requiere un módulo curricular válido.");

  const lines = [
    "Crea, a partir exclusivamente de las fuentes curriculares cargadas en este NotebookLM, un guion explicativo original para una clase de ContaIA.",
    "El público son estudiantes de contaduría en México. Escribe en español claro, con tono cercano de tutora, sin presentar el contenido como asesoría profesional.",
    "No inventes reglas contables, fiscales o laborales; cuando falte una fuente vigente, dilo y pide revisión profesional. Usa solo ejemplos ficticios y no incluyas datos personales, confidenciales o de clientes.",
    "",
    `MÓDULO: ${clean(module.title)}`,
    `OBJETIVO: ${clean(module.outcome)}`,
    `ENFOQUE: ${clean(module.focus)}`,
    `GUÍA DE APERTURA: ${clean(module.guide?.opening)}`,
    `PREGUNTA DE CONTROL: ${clean(module.guide?.checkpoint)}`,
    `EVIDENCIA DE SALIDA: ${clean(module.guide?.deliverable)}`,
    "",
    "ORDEN DE LA SESIÓN GUIADA:",
    ...courseSessionFlow.map((phase, index) => `${index + 1}. ${phase.title} (${phase.minutes} min).`),
  ];

  if (module.teachFirst) {
    lines.push("", `CONCEPTO CLAVE: ${clean(module.teachFirst.why)}`);
    if (module.teachFirst.example) lines.push(`EJEMPLO FICTICIO: ${clean(module.teachFirst.example)}`);
    if (Array.isArray(module.teachFirst.concepts) && module.teachFirst.concepts.length) {
      lines.push(`VOCABULARIO: ${module.teachFirst.concepts.map(([term, meaning]) => `${clean(term)}: ${clean(meaning)}`).join("; ")}`);
    }
  }

  if (module.demonstration) {
    lines.push("", `DEMOSTRACIÓN ANTES: ${clean(module.demonstration.before)}`);
    lines.push(`DEMOSTRACIÓN DESPUÉS: ${clean(module.demonstration.after)}`);
    lines.push(`QUÉ EXPLICAR: ${clean(module.demonstration.why)}`);
  }

  if (module.context?.documents?.length) lines.push("", `MATERIALES RECOMENDADOS: ${module.context.documents.map(clean).join("; ")}`);
  if (module.context?.mustContain?.length) lines.push(`ELEMENTOS A VERIFICAR: ${module.context.mustContain.map(clean).join("; ")}`);
  if (module.context?.format) lines.push(`FORMATO DEL PRODUCTO: ${clean(module.context.format)}`);
  if (module.context?.protect) lines.push(`SALVAGUARDA: ${clean(module.context.protect)}`);

  if (Array.isArray(module.guide?.steps) && module.guide.steps.length) {
    lines.push("", "PASOS DE PRÁCTICA GUIADA:", ...module.guide.steps.map((step, index) => `${index + 1}. ${clean(step)}`));
  }

  if (exercise?.title) {
    lines.push("", `TAREA RELACIONADA: ${clean(exercise.title)}`);
    if (exercise.category) lines.push(`CATEGORÍA: ${clean(exercise.category)}`);
    if (exercise.intro) lines.push(`PROPÓSITO DE LA TAREA: ${clean(exercise.intro)}`);
    if (exercise.scenario) lines.push(`CASO FICTICIO: ${clean(exercise.scenario)}`);
    if (exercise.question) lines.push(`PREGUNTA PARA PAUSAR Y REFLEXIONAR: ${clean(exercise.question)}`);
    lines.push("No incluyas opciones de respuesta, selección del estudiante, pistas privadas ni solución modelo.");
  }

  lines.push(
    "",
    "FORMATO PARA SYNTHESIA: entrega un guion de 3–5 minutos, con escenas breves, narración lista para avatar, sugerencias visuales y subtítulos en español.",
    "Incluye una apertura, explicación paso a paso, un ejemplo simulado, una pausa con pregunta para el estudiante y un cierre que conecte con la evidencia de salida.",
    "Al final agrega una lista de las fuentes cargadas que respaldan cada afirmación importante y señala cualquier punto que requiera validación docente.",
    "Si NotebookLM genera un Video Overview, úsalo como borrador visual; revisa sus afirmaciones y no lo publiques automáticamente.",
  );
  return lines.join("\n");
}
