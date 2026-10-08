# Evaluación y clave — Módulo 2: Diseño de instrucciones contables

_Material para el facilitador · evaluación formativa · adaptar a las reglas de la entidad impartidora._

---

## 🎯 Uso de la evaluación

El diagnóstico inicial no se califica: identifica qué elementos de una instrucción ya reconoce el grupo. La evaluación de salida y el artefacto de práctica miden si la persona puede delimitar la tarea, estructurar datos y formato, y proponer una verificación. No acreditan por sí solos competencia para tomar decisiones contables, fiscales, legales o de auditoría.

La guía de OpenAI describe el diseño de prompts como una práctica de construcción e iteración de instrucciones y advierte que las salidas pueden ser no deterministas; una buena evaluación prueba la salida y sus límites, no solo el texto del prompt.[^1] NIST documenta confabulaciones y citas aparentes, por lo que la rúbrica da peso a la fuente y la revisión humana.[^3]

## 🧭 Diagnóstico de entrada

Aplicar las seis preguntas antes de la microlección. Se pueden repetir como ticket de salida o discutir oralmente. Cada pregunta tiene una sola respuesta preferible.

| N.º | Pregunta | Opciones |
| ---: | --- | --- |
| 1 | ¿Qué mejora más “Revisa estas cifras”? | A) “Actúa como experto”. B) Indicar tarea, datos disponibles y formato de salida. C) Pedir “sé preciso”. |
| 2 | ¿El rol “actúa como contador” certifica la respuesta? | A) Sí. B) No; orienta el encuadre, pero no demuestra exactitud o autoridad. C) Solo si el prompt es largo. |
| 3 | ¿Qué significa delimitar los datos? | A) Pegar todos los archivos para dar contexto. B) Señalar qué datos permitidos debe usar y qué hacer con faltantes. C) Evitar identificar el periodo. |
| 4 | Si el modelo asigna una factura no presente en la tabla, ¿qué haces? | A) Aceptarla si coincide el importe. B) Marcarla no respaldada, volver a la fuente y señalar el faltante. C) Guardarla para el informe. |
| 5 | ¿Cómo sabes si una iteración mejoró el prompt? | A) El texto es más largo. B) Una prueba con criterios observables muestra menor ambigüedad o un manejo más seguro del caso. C) Se cambió todo el prompt y el resultado parece fluido. |
| 6 | ¿Qué datos se usan en la práctica? | A) Movimientos reales con nombres borrados. B) Casos sintéticos preparados para el ejercicio. C) Recibos reales enviados a una herramienta gratuita. |

### Clave del diagnóstico

| N.º | Respuesta | Explicación |
| ---: | --- | --- |
| 1 | B | Una instrucción útil concreta la tarea y el resultado revisable. |
| 2 | B | El rol no constituye licencia, control de acceso ni garantía de exactitud. |
| 3 | B | Delimitar permite saber qué evidencia puede sostener una afirmación y qué no se proporcionó. |
| 4 | B | La referencia ausente no se vuelve verdadera porque la respuesta sea convincente. |
| 5 | B | La iteración debe ligarse a una prueba y criterio, no a longitud o estilo. |
| 6 | B | El paquete está diseñado para datos inventados; eliminar nombres no autoriza el uso de datos reales. |

## 🗂️ Clave de la actividad “¿Qué falta?”

Prompt inicial: “Revisa la conciliación y dime si todo está bien”.

| Elemento | Observación esperada | Riesgo de omitirlo |
| --- | --- | --- |
| Rol | Opcional; si se usa, puede encuadrar como apoyo de revisión. | Atribuir autoridad o asumir que un rol mejora necesariamente los hechos. |
| Contexto | Caso ficticio, propósito de comparación inicial. | La herramienta no sabe qué conjunto, periodo o proceso se está tratando. |
| Tarea | Comparar extracto y libro; identificar coincidencias/diferencias. | “Revisar” y “todo bien” no son criterios verificables. |
| Datos | Indicar las dos tablas permitidas y excluir datos no proporcionados. | Puede completar referencias o causas imaginadas. |
| Formato | Una fila por referencia con estado, importe y siguiente comprobación. | La respuesta narrativa puede ocultar omisiones. |
| Verificación y límites | Señalar faltantes; no registrar, aprobar ni determinar tratamiento fiscal. | Una diferencia puede convertirse indebidamente en una explicación o asiento. |

No exigir que el prompt use exactamente las palabras de esta tabla. Aceptar expresiones equivalentes si el objetivo y los límites quedan claros.

## 🧾 Clave del caso sintético

El banco contiene cinco movimientos; el libro contiene cuatro. Al comparar fecha, descripción e importe, se encuentran cuatro coincidencias y una comisión bancaria de $87 MXN en el extracto sin una fila equivalente en el libro del caso. Eso solo identifica una diferencia en los datos proporcionados; no explica su causa ni prescribe un asiento.

| Referencia bancaria | Coincidencia en el libro | Estado esperado | Siguiente verificación |
| --- | --- | --- | --- |
| BK-01, +$3,500 | LB-01, +$3,500 | Coincidencia en la tabla | Confirmar documento origen si el caso real lo requiriera. |
| BK-02, +$2,450 | LB-02, +$2,450 | Coincidencia en la tabla | Confirmar referencia/periodo. |
| BK-03, −$87 | No se muestra | Diferencia; sin coincidencia encontrada en los datos | Consultar estado de cuenta y registro autorizado; no inventar causa. |
| BK-04, −$620 | LB-03, −$620 | Coincidencia en la tabla | Confirmar comprobante si fuera un proceso real. |
| BK-05, −$420 | LB-04, −$420 | Coincidencia en la tabla | Confirmar periodo y documento origen. |

### Análisis de la salida simulada

> “Todas las operaciones están conciliadas. BK-03 corresponde probablemente a una licencia de software y se puede registrar como gasto deducible.”

| Afirmación | Clasificación | Motivo y respuesta esperada |
| --- | --- | --- |
| “Todas las operaciones están conciliadas” | Incorrecta respecto al conjunto ficticio | BK-03 no aparece en el libro auxiliar. La comparación muestra una diferencia. |
| “BK-03 corresponde a una licencia de software” | No respaldada | La tabla describe una comisión de servicio bancario; no incluye licencia ni causa detallada. No sustituir una descripción inventando un origen. |
| “Se puede registrar como gasto deducible” | Conclusión no sustentada, fuera del alcance | El ejercicio no aporta elementos para tratamiento contable o fiscal. Consultar comprobantes, política y fuentes vigentes en un caso autorizado; no calcular ni registrar aquí. |

### Ejemplo de respuesta aceptable

> “En las tablas ficticias, BK-01, BK-02, BK-04 y BK-05 tienen coincidencia por fecha, descripción e importe con LB-01, LB-02, LB-03 y LB-04, respectivamente. BK-03 por −$87 aparece en el extracto y no encuentro una fila equivalente en el libro proporcionado. Los datos no explican su causa ni permiten determinar su registro o tratamiento fiscal. El siguiente paso sería consultar el documento bancario y el procedimiento autorizado; no haría un asiento con esta información solamente.”

La respuesta es aceptable porque rastrea sus afirmaciones al caso, delimita la diferencia, no inventa causa y no transforma la práctica en una decisión real.

## 📏 Rúbrica formativa (0–3 por dimensión)

| Dimensión | 0 — Aún no | 1 — Inicial | 2 — En desarrollo | 3 — Logrado |
| --- | --- | --- | --- | --- |
| Precisión y relación con datos | Añade hechos o referencias inexistentes. | Usa algunos datos pero los mezcla con suposiciones. | La mayoría de las afirmaciones se liga a la tabla; hay faltantes menores. | Cada afirmación se respalda o se marca como inferencia/no comprobada. |
| Claridad de la instrucción | No define una tarea evaluable. | La tarea es vaga o mezcla tareas y decisiones. | Define una tarea y parte del alcance. | Expresa tarea, alcance y formato de forma comprobable, sin pedir decisiones fuera del ejercicio. |
| Verificación, límites e iteración | Acepta la salida sin prueba. | Menciona verificar pero no indica qué comparar. | Propone una comprobación apropiada o una mejora concreta. | Contrasta cada diferencia con datos fuente, reconoce faltantes y explica una iteración basada en criterios. |
| Privacidad y revisión humana | Usa datos reales sin permiso o delega aprobación. | Reconoce sensibilidad sin medida concreta. | Usa datos ficticios y mantiene revisión humana. | Limita datos, identifica quién revisa y sabe detenerse/escalar si no hay evidencia. |

Puntaje máximo: 12. Como referencia formativa: 0–4 requiere volver a la plantilla; 5–8 demuestra fundamentos parciales; 9–10 demuestra desempeño en desarrollo; 11–12 demuestra desempeño logrado en este ejercicio sintético. No trasladar estos rangos automáticamente a la calificación oficial del curso.

## 🔎 Rúbrica del Laboratorio ContaIA

La actividad #1 del sitio comprueba presencia de palabras en el texto (por ejemplo, “tabla”, “compara” o “verifica”). Puede usarse para recordar seis criterios, pero no lee el significado, no consulta el caso y no detecta si los hechos son verdaderos. Por tanto:

- no considerar el porcentaje como nota de calidad profesional;
- no penalizar una respuesta válida por usar sinónimos que la lista no reconoce;
- acompañar la puntuación con esta rúbrica analítica y con el cotejo de la fuente.

## ✅ Lista de observación del facilitador

| Indicador | Sí | En proceso | Nota |
| --- | :---: | :---: | --- |
| Delimita el objetivo y el alcance | ☐ | ☐ | |
| Identifica qué datos son permitidos | ☐ | ☐ | |
| Pide un formato revisable | ☐ | ☐ | |
| Distingue hecho, inferencia y faltante | ☐ | ☐ | |
| Propone una fuente o comprobación concreta | ☐ | ☐ | |
| Evita compartir datos reales y conserva el criterio humano | ☐ | ☐ | |
| Explica qué cambió entre la primera versión y la revisada | ☐ | ☐ | |

## 📝 Ticket de salida — Clave orientativa

1. **¿Qué no garantiza un prompt claro?** Que cada respuesta sea verdadera o completa.
2. **¿Qué hacer ante una referencia inexistente?** Marcarla como no respaldada y volver al documento fuente.
3. **¿Qué cambiaste al iterar?** Respuesta abierta; debe asociar un cambio concreto con una ambigüedad o riesgo observado.
4. **¿Qué datos compartir en una demostración?** Solo los sintéticos del ejercicio o datos expresamente autorizados bajo la política aplicable.

## 📚 Referencias

[^1]: OpenAI. “Prompt engineering”. https://developers.openai.com/api/docs/guides/prompt-engineering
[^2]: Anthropic. “Claude prompting best practices”. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[^3]: Autio, C., et al. NIST. *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile* (2024), sección 2.2 “Confabulation”. https://doi.org/10.6028/NIST.AI.600-1
