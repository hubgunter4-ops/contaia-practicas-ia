const MAX_LENGTHS = Object.freeze({
  id: 80,
  title: 160,
  intro: 500,
  scenario: 700,
  question: 400,
  hint: 500,
  label: 180,
});

function limit(value, length) {
  return String(value ?? "").trim().slice(0, length);
}

function safeLabels(rubric = []) {
  return Array.isArray(rubric)
    ? rubric.map((criterion) => limit(criterion?.label, MAX_LENGTHS.label)).filter(Boolean).slice(0, 12)
    : [];
}

function reconciliationSummary(exercise) {
  const bankCount = Array.isArray(exercise?.bank) ? exercise.bank.length : 0;
  const ledgerCount = Array.isArray(exercise?.ledger) ? exercise.ledger.length : 0;
  return [
    bankCount ? `${bankCount} movimientos en el extracto simulado` : "",
    ledgerCount ? `${ledgerCount} movimientos en el libro auxiliar simulado` : "",
  ].filter(Boolean).join("; ");
}

/**
 * Normaliza un ejercicio sin DOM, red ni datos de respuesta del estudiante.
 * La solución modelo solo entra en el contexto después de la etapa compare.
 */
export function toTutorContext(exercise, stage = "attempt") {
  const source = exercise && typeof exercise === "object" ? exercise : {};
  const kind = ["prompt", "written", "quiz", "reconciliation"].includes(source.kind) ? source.kind : "unknown";
  const isRevealed = stage === "compare";
  return Object.freeze({
    id: limit(source.id, MAX_LENGTHS.id),
    title: limit(source.title, MAX_LENGTHS.title),
    kind,
    intro: limit(source.intro, MAX_LENGTHS.intro),
    scenario: limit(source.scenario, MAX_LENGTHS.scenario) || reconciliationSummary(source),
    question: limit(source.question, MAX_LENGTHS.question),
    stage: limit(stage, 40),
    hint: limit(source.hint, MAX_LENGTHS.hint),
    rubricLabels: safeLabels(source.rubric),
    hasModelExplanation: Boolean(source.explanation || source.solution),
    modelExplanation: isRevealed ? limit(source.explanation || source.solution, 900) : "",
  });
}

export { MAX_LENGTHS };
