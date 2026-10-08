export const DIAGNOSTIC_QUESTIONS = [
  { id: "prompt", question: "¿Qué es un prompt?", options: [{ id: "a", label: "Una instrucción para orientar una respuesta de IA.", correct: true }, { id: "b", label: "Una garantía de que la respuesta es correcta." }, { id: "c", label: "Un archivo que la IA puede usar sin revisión." }] },
  { id: "evidence", question: "Si una herramienta propone una causa para una variación, ¿qué haces primero?", options: [{ id: "a", label: "La presento como conclusión." }, { id: "b", label: "Busco evidencia y separo el hecho de la hipótesis.", correct: true }, { id: "c", label: "Elimino el movimiento que no encaja." }] },
  { id: "privacy", question: "Antes de usar un archivo de nómina, ¿qué es lo más prudente?", options: [{ id: "a", label: "Compartirlo completo para no perder contexto." }, { id: "b", label: "Cambiar solo el nombre del archivo." }, { id: "c", label: "Anonimizar datos y compartir solo lo indispensable.", correct: true }] },
  { id: "fiscal", question: "Para estudiar una cuestión fiscal, ¿qué dato necesitas identificar?", options: [{ id: "a", label: "Solo el importe." }, { id: "b", label: "Ejercicio, régimen, jurisdicción y fuente vigente.", correct: true }, { id: "c", label: "La respuesta más común en internet." }] },
];

export const PROJECT_STAGES = [
  { id: "context", number: "01", title: "Preparar contexto", task: "Elige un caso ficticio, periodo, moneda y fuentes; anonimiza los campos sensibles.", evidence: "Ficha del caso y checklist de privacidad." },
  { id: "prompt", number: "02", title: "Diseñar la instrucción", task: "Escribe una instrucción con contexto, tarea, formato, límites y verificación.", evidence: "Prompt revisado con la rúbrica." },
  { id: "analysis", number: "03", title: "Analizar y separar", task: "Clasifica o concilia los datos y separa hechos, hipótesis, pendientes y excepciones.", evidence: "Tabla de análisis con evidencia faltante." },
  { id: "report", number: "04", title: "Comunicar", task: "Redacta un reporte breve con hallazgo, impacto observable, limitaciones y próximo paso.", evidence: "Reporte de una página para una persona revisora." },
  { id: "governance", number: "05", title: "Gobernar el flujo", task: "Define validaciones, aprobación humana, trazabilidad y condición de escalamiento.", evidence: "Diagrama o tabla del flujo controlado." },
];

export const REMOTE_AI_GATE = [
  "Definir proveedor, modelo y región de procesamiento.",
  "Aprobar qué datos están prohibidos y qué retención se permite.",
  "Mostrar consentimiento antes de enviar cualquier texto.",
  "Configurar autenticación, presupuesto, límites y rate limiting.",
  "Mantener a Nora local como modo degradado y registrar errores sin guardar conversaciones.",
  "Revisar legalidad, privacidad, seguridad y pruebas de contrato antes de habilitar un endpoint.",
];

export function scoreDiagnostic(answers, questions = DIAGNOSTIC_QUESTIONS) {
  const selected = answers && typeof answers === "object" ? answers : {};
  const score = questions.reduce((total, question) => total + (question.options.find((option) => option.id === selected[question.id])?.correct ? 1 : 0), 0);
  return { score, total: questions.length, percentage: Math.round((score / questions.length) * 100) };
}

export function getAdaptiveRoute(result) {
  if (!result || result.score <= 1) return { id: "fundamentos", title: "Ruta de fundamentos", message: "Nora recomienda comenzar por conceptos, ejemplos sencillos y el glosario antes de avanzar.", modules: ["modulo-01", "modulo-02", "modulo-03"] };
  if (result.score <= 3) return { id: "practica", title: "Ruta de práctica guiada", message: "Nora recomienda practicar prompts, evidencia y privacidad, consultando las pistas cuando sea necesario.", modules: ["modulo-02", "modulo-04", "modulo-05", "modulo-07"] };
  return { id: "integrador", title: "Ruta de proyecto integrador", message: "Nora recomienda avanzar al proyecto integrador y usar el glosario para comprobar términos durante el recorrido.", modules: ["modulo-06", "modulo-08", "modulo-09", "modulo-10"] };
}
