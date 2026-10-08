const FALLBACK = "Soy el tutor local: ofrezco ayudas preparadas para este ejercicio. Prueba con “pista”, “reformula la consigna” o “cuál es el siguiente paso”.";

function stageReminder(context) {
  if (context.stage === "attempt") return "Primero intenta responder el ejercicio; después podré orientarte con una pista.";
  if (context.stage === "hint") return "Ya puedes pedir la pista disponible. La solución modelo seguirá reservada hasta completar esa etapa.";
  if (context.stage === "example") return "Ya puedes revisar el ejemplo y comparar tu razonamiento con el modelo.";
  return "La comparación está disponible. Contrasta el modelo con tus datos ficticios y revisa qué evidencia faltaría en un caso real.";
}

export function detectLocalIntent(message = "") {
  const text = String(message).toLocaleLowerCase("es-MX");
  if (/pista|ayuda|atasc|no entiendo|duda|confund/.test(text)) return "hint";
  if (/reformula|replantea|qué pide|que pide|consigna|objetivo|resumen/.test(text)) return "restate";
  if (/por qué|porque|explica|explicación|razón|razonamiento/.test(text)) return "why";
  if (/siguiente|paso|empiezo|compruebo|reviso|verifico/.test(text)) return "next-step";
  return "unknown";
}

export function getLocalTutorReply({ intent = "unknown", context = {} } = {}) {
  const safeContext = context && typeof context === "object" ? context : {};
  const title = safeContext.title || "este ejercicio";
  switch (intent) {
    case "hint":
      return safeContext.hint || `No hay una pista adicional preparada para ${title}. Revisa el escenario y separa los datos observados de lo que aún falta comprobar.`;
    case "restate":
      return safeContext.question
        ? `La consigna te pide: ${safeContext.question}`
        : `El objetivo es trabajar con el escenario ficticio de “${title}” y explicar qué comprobarías sin inventar datos.`;
    case "why":
      return safeContext.stage === "compare" && safeContext.modelExplanation
        ? `La explicación disponible para comparar es: ${safeContext.modelExplanation}`
        : `Todavía no corresponde mostrar una explicación modelo. ${stageReminder(safeContext)}`;
    case "next-step":
      if (safeContext.stage === "attempt") return "Empieza identificando la consigna, los datos disponibles y el resultado que debes producir. Luego escribe tu primer intento.";
      if (safeContext.stage === "hint") return "Pide la pista preparada y úsala para revisar un solo aspecto de tu respuesta. No cambies datos que no aparezcan en el caso.";
      if (safeContext.stage === "example") return "Consulta la pista, ajusta tu razonamiento y decide si ya estás listo para ver el ejemplo y comparar.";
      return "Compara tu respuesta con el modelo, marca qué coincide y anota qué dato o fuente tendrías que verificar en un caso real.";
    case "unknown":
    default:
      return FALLBACK;
  }
}

export { FALLBACK };
