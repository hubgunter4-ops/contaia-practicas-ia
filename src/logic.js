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
