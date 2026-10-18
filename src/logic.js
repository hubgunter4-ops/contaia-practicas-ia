export function scoreRubric(text, criteria = []) {
  const answer = String(text ?? "").toLocaleLowerCase("es-MX");
  const checklist = criteria.map((criterion) => {
    const met = criterion.keywords.some((keyword) => answer.includes(keyword.toLocaleLowerCase("es-MX")));
    return { id: criterion.id, label: criterion.label, met };
  });
  return {
    score: checklist.filter((item) => item.met).length,
    total: checklist.length,
    checklist,
  };
}

export function evaluateChoice(selectedId, exercise) {
  if (!selectedId) {
    return { status: "missing", correct: false, message: "Elige una respuesta para comprobarla." };
  }
  const correct = selectedId === exercise.answer;
  return {
    status: correct ? "correct" : "incorrect",
    correct,
    message: correct ? "Respuesta correcta." : "Todavía no. Revisa la pista y vuelve a intentarlo.",
  };
}

/** Regla determinista para respuestas abiertas: orienta, no certifica exactitud. */
export function buildWrittenFeedback(text, exercise) {
  const answer = String(text ?? "").trim();
  if (!answer || answer.length < 20) {
    return {
      status: "incompleto",
      title: "Aún no hay respuesta",
      message: answer ? "El borrador es demasiado breve para revisar los criterios. Desarrolla un poco más tu propuesta." : "La revisión comienza cuando escribas un primer borrador.",
      strengths: [],
      nextStep: answer ? "Agrega contexto y una idea concreta sobre el caso; después vuelve a comprobarla." : "Escribe tu propuesta con los datos ficticios del caso y vuelve a comprobarla.",
      checklist: [],
      hint: exercise.hint,
    };
  }

  const { checklist } = scoreRubric(answer, exercise.rubric);
  const strengths = checklist.filter(({ met }) => met).map(({ label }) => label);
  const missing = checklist.filter(({ met }) => !met).map(({ label }) => label);
  const nextStep = missing.length
    ? `Revisa este elemento de la guía: ${missing.join(", ")}. Después vuelve a comprobar tu borrador.`
    : "Contrasta tu borrador con el ejemplo y verifica que las afirmaciones se sostengan únicamente en los datos del caso.";

  return {
    status: "revisar",
    title: strengths.length ? "Elementos para aprovechar y revisar" : "Siguiente paso para tu borrador",
    message: "Esta comprobación local busca términos de la guía; no determina si una respuesta abierta es correcta ni la completa por ti.",
    strengths,
    nextStep,
    checklist,
    hint: exercise.hint,
  };
}

/** Convierte un ejercicio objetivo en feedback pedagógico, sin involucrar IA. */
export function buildChoiceFeedback(result, exercise) {
  if (result.status === "missing") {
    return {
      status: "incompleto",
      title: "Selecciona una opción",
      message: result.message,
      strengths: [],
      nextStep: "Lee la consigna y elige la opción que mejor se ajuste a la evidencia disponible.",
      hint: exercise.hint,
    };
  }
  if (result.correct) {
    return {
      status: "logrado",
      title: "Criterio bien aplicado",
      message: "La opción coincide con la respuesta esperada para este caso didáctico. En una situación real, verifica evidencia y reglas aplicables.",
      strengths: ["Elegiste la opción prevista para los datos ficticios de este ejercicio."],
      nextStep: "Revisa la explicación y considera qué evidencia comprobarías antes de aplicar el criterio en un caso real.",
      explanation: exercise.explanation,
      hint: exercise.hint,
    };
  }
  return {
    status: "revisar",
    title: "Vale la pena revisar el criterio",
    message: "Esta opción no coincide con la respuesta esperada para el caso; úsalo como oportunidad para revisar el razonamiento, no como juicio sobre tu capacidad.",
    strengths: [],
    nextStep: "Vuelve a leer la consigna y usa la pista para identificar qué evidencia sí aparece en el caso.",
    hint: exercise.hint,
  };
}

export function calculateDifference(debits, credits) {
  const difference = Number(debits) - Number(credits);
  return Number.isFinite(difference) ? Math.round((difference + Number.EPSILON) * 100) / 100 : null;
}


export function getGuidedStage({ attempted = false, hintSeen = false, solutionSeen = false } = {}) {
  if (!attempted) return "attempt";
  if (hintSeen && solutionSeen) return "compare";
  if (hintSeen) return "example";
  return "hint";
}
