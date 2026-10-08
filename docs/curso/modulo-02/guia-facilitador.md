# Guía del facilitador — Módulo 2: Diseño de instrucciones contables

_Versión base · curso de 40 horas · 3 horas guiadas + 1 hora independiente · pendiente de adaptación a la matrícula._

---

## 🎯 Propósito

Enseñar a convertir una necesidad contable acotada en una instrucción clara, comprobable y limitada a datos permitidos. El grupo redactará una primera versión, la probará con un caso sintético, inspeccionará la salida y mejorará el prompt mediante una revisión deliberada.

La sesión retoma del Módulo 1 la diferencia entre hecho, inferencia y dato faltante. Su mensaje central es: **una instrucción más clara facilita evaluar la respuesta, pero no convierte al modelo en una fuente de verdad ni transfiere la responsabilidad profesional**. Las guías de OpenAI y Anthropic recomiendan especificar instrucciones, contexto y formato; algunos mecanismos concretos, como roles de API o etiquetas XML, dependen del producto y no deben enseñarse como requisitos universales.[^1][^2] NIST describe el riesgo de contenido generado falso o erróneo presentado con seguridad, incluidas citas aparentes; por eso, toda salida contable requiere contraste con sus fuentes.[^3]

### Resultados de aprendizaje

Al finalizar, cada participante podrá:

1. Descomponer un prompt en seis criterios: rol, contexto, tarea, datos, formato y verificación/límites.
2. Redactar una instrucción para conciliar movimientos sintéticos que especifique el alcance y el resultado esperado.
3. Revisar una respuesta generada o simulada para distinguir hechos respaldados, inferencias y datos inventados o faltantes.
4. Mejorar un prompt en al menos una iteración y explicar qué cambió y por qué.
5. Mantener la práctica libre de datos reales o confidenciales y dejar toda decisión profesional bajo revisión humana.

### Alcance y límites

El supuesto de partida es un grupo de estudiantes y profesionales con conocimientos contables iniciales, sin requisito de programación. Es una versión base, no una descripción confirmada de la matrícula. Cuando se reciba la lista del grupo, adaptar vocabulario, ritmo, ejemplos, accesibilidad y apoyos.

Este módulo no enseña a configurar APIs, programar asistentes, registrar asientos reales, calcular impuestos ni seleccionar un proveedor comercial. No se requiere iniciar sesión en una herramienta externa. No pedir a participantes que compartan prompts con información de clientes o personal.

## 🧰 Preparación previa

| Momento | Acción |
| --- | --- |
| Antes de la sesión | Leer esta guía, el cuaderno y las plantillas; comprobar la vista previa del [Laboratorio ContaIA](https://8328-i143dgisqzurgn5srq8gm-85c68042.us3.manus.computer/). Si no está disponible, usar las tablas impresas: la actividad no depende de la web. |
| Materiales | Pizarra o pantalla, cuadernos, tarjetas de revisión y copias del conjunto de movimientos ficticios. |
| Organización | Formar parejas o tríos; habilitar alternativa individual o respuesta oral para quien lo prefiera. |
| Privacidad | Repetir la regla de no compartir expedientes, nómina, cuentas, capturas ni datos identificables. No pedir credenciales. |
| Demostración | Preparar dos versiones de una instrucción para el mismo caso; si se usa un modelo, probar antes con datos sintéticos y verificar la salida. También se puede realizar por simulación entre pares. |
| Evaluación | Usar el diagnóstico como línea base formativa. Aplicar la rúbrica del archivo “Evaluación y clave”; no interpretar la puntuación automática del laboratorio como garantía de calidad. |

## 📖 Ideas que conviene enseñar

### Los seis elementos observables

| Elemento | Pregunta docente | Ejemplo adecuado para el caso |
| --- | --- | --- |
| Rol | ¿Qué perspectiva de trabajo ayuda a encuadrar la respuesta? | “Actúa como asistente de revisión contable”; el rol no concede licencia ni autoridad. |
| Contexto | ¿Qué escenario y propósito se deben conocer? | “Caso educativo de una microempresa ficticia; preparación de una conciliación”. |
| Tarea | ¿Qué acción concreta se pide y qué queda fuera? | “Compara los movimientos del banco con los del libro auxiliar; no registres asientos”. |
| Datos | ¿Qué información puede utilizarse? | “Usa únicamente las dos tablas ficticias que aparecen abajo”. |
| Formato | ¿Cómo se revisará el resultado? | “Devuelve una tabla con referencia, importe, coincidencia/diferencia y verificación siguiente”. |
| Verificación y límites | ¿Qué hacer ante faltantes, incertidumbre o contradicciones? | “No inventes registros; marca lo no comprobable y señala qué documento habría que revisar”. |

Estos seis elementos coinciden con los criterios pedagógicos de la práctica #1 del laboratorio. Preséntelos como una lista para revisar, no como una fórmula mágica ni como un orden obligatorio para todos los modelos.

### Lo que un prompt puede y no puede hacer

- **Puede:** delimitar el trabajo solicitado, dar contexto relevante, indicar el formato y pedir que se señalen dudas.
- **No puede:** demostrar que una salida sea cierta, suplir un documento faltante, conferir autoridad profesional ni garantizar que el modelo obedecerá cada restricción.
- **Conviene:** usar encabezados, listas o delimitadores simples cuando ayuden a separar instrucciones de datos; las recomendaciones específicas de formato cambian entre sistemas.[^1][^2]
- **Siempre:** volver a las fuentes y revisar cada afirmación contable antes de usarla. Una cita que parezca precisa también debe abrirse y comprobarse.[^3]

## 🗓️ Guion minuto a minuto

La sesión guiada suma 180 minutos, de acuerdo con el patrón del plan del curso. El bloque de taller de 80 minutos incluye una pausa de 10 minutos.

| Minutos | Bloque | Acción del facilitador | Evidencia a observar |
| --- | --- | --- | --- |
| 0–15 | Apertura y recuperación | Recuperar el ciclo del Módulo 1: tarea, protección de datos, contraste y decisión humana. Diagnóstico breve: comparar “Revísalo y dime qué falta” con una instrucción más delimitada. | El grupo menciona contexto, datos, tarea o criterio de revisión. |
| 15–50 | Microlección y demostración | Presentar los seis elementos. Mostrar la versión vaga y una versión mejorada; explicar qué ayuda a revisar cada cambio y qué no garantiza. | Cada persona puede señalar al menos cuatro criterios faltantes en el prompt vago. |
| 50–130 | Taller guiado | Facilitar actividades A, B y C (abajo), con 10 minutos de pausa. | Borrador con alcance, datos, formato y un paso de verificación. |
| 130–170 | Revisión entre pares | Parejas intercambian prompts y usan la lista de seis criterios; luego prueban el caso o simulan una respuesta si no hay modelo autorizado. | La revisión se basa en el objetivo y los datos, no en “sonar profesional”. |
| 170–180 | Ticket de salida | Aplicar las preguntas del cuaderno, recoger una mejora y una limitación reconocida. Asignar práctica autónoma. | Una versión mejorada y una prueba concreta que la persona hará. |

### Bloque de taller: instrucciones exactas

**Actividad A — Diagnosticar tres instrucciones (20 minutos).** Individualmente, marca en el cuaderno qué criterios aparecen, cuáles faltan y qué riesgo produce la omisión. En parejas, comparen las respuestas. No premies longitud: una instrucción breve puede ser suficiente si delimita la tarea y la revisión.

**Actividad B — Escribir un primer borrador (25 minutos).** Usar solo el caso sintético de conciliación del cuaderno. Cada persona formula una consigna con el formato de seis elementos. Recuerda al grupo que “compara” no equivale a “aprueba” ni a “registra”.

**Pausa (10 minutos).** Mantenerla dentro de los 80 minutos asignados al taller.

**Actividad C — Probar y revisar (25 minutos).** Aplicar el prompt a una salida simulada impresa o, si está permitido, a una herramienta institucional con los datos ficticios. Cada participante anota: afirmación, fila de origen, tipo (hecho/inferencia/no respaldada), cambio propuesto. Revisar una dimensión por vez: primero alcance/datos, luego formato, después límites/verificación.

### Demostración comentada

Use esta instrucción inicial:

> “Revisa la conciliación y dime si todo está bien.”

Pregunte: ¿qué documentos?, ¿qué significa “bien”?, ¿en qué formato?, ¿qué hacer con diferencias?, ¿se solicita registrar algo? Después muestre un borrador mejorado del cuaderno. Enfatice que pedir “no inventes” es una señal de intención, no un control suficiente: la comprobación consiste en rastrear cada resultado hasta los datos ficticios y documentar faltantes.

Si se usa un modelo, no presente una única ejecución como evidencia general de calidad. Las respuestas pueden variar, y las guías de los proveedores recomiendan probar y evaluar iteraciones de manera sistemática.[^1][^2]

## 💬 Preguntas de facilitación

| Pregunta | Respuesta esperada | Si surge una idea equivocada… |
| --- | --- | --- |
| “¿Poner ‘actúa como contador experto’ asegura exactitud?” | No. El rol orienta el estilo o enfoque; no certifica conocimiento ni autoridad. | Pida identificar qué dato/fuente verificaría la afirmación. |
| “¿Debemos incluir todos los detalles que tenemos?” | No. Solo lo necesario y permitido para la tarea. En esta sesión, datos sintéticos; en una organización, política y autorización primero. | Pida separar contexto útil de información sensible o irrelevante. |
| “¿Un prompt largo siempre es mejor?” | No. Debe ser suficiente, ordenado y comprobable; más texto también puede introducir contradicciones. | Pida retirar lo que no cambia la tarea, el formato o el control. |
| “Si pedí que no invente, ¿puedo confiar en el resultado?” | No. Contrastar cada coincidencia y cualquier explicación con la tabla fuente. | Solicite que señale la fila que respalda una afirmación. |
| “¿La puntuación del laboratorio mide qué tan correcto es el prompt?” | No. Comprueba presencia de algunas palabras clave definidas; sirve como recordatorio didáctico, no evalúa verdad, seguridad ni desempeño del modelo. | Comparar la rúbrica de palabras con la rúbrica analítica de cuatro dimensiones. |

## 🧩 Práctica independiente (60 minutos)

Asignar una tarea genérica, sin datos reales:

- **20 min:** escribir un prompt para una tarea contable simulada, completando los seis bloques.
- **20 min:** probarlo con dos escenarios ficticios o someterlo a revisión por pares. Registrar una respuesta respaldada, una duda y un dato faltante.
- **20 min:** revisar el prompt y entregar la versión anterior, la revisada y tres líneas de justificación.

La evidencia va al portafolio del curso si la institución así lo requiere. La página de prácticas no conserva el progreso tras actualizar y no envía respuestas a un modelo externo.

## ✅ Revisión y adaptación

Antes de cerrar, comprobar que cada participante:

- definió una tarea concreta y un límite;
- especificó qué datos usar y qué formato devolver;
- identificó al menos una prueba contra la fuente;
- señaló una incertidumbre o condición para detenerse;
- no incluyó información personal o confidencial.

Cuando se comparta la matrícula, adaptar ritmo y ejemplos. No cambiar el principio de trabajar con datos ficticios ni inferir experiencia, edad, especialidad o accesibilidad a partir de una lista incompleta.

## 📚 Referencias

[^1]: OpenAI. “Prompt engineering”. Incluye instrucciones claras, contexto y formatos; indica que las respuestas generadas son no deterministas y que conviene evaluar iteraciones. https://developers.openai.com/api/docs/guides/prompt-engineering
[^2]: Anthropic. “Claude prompting best practices”. Recomendaciones de claridad, contexto, ejemplos y estructura; algunas técnicas se refieren específicamente a modelos Claude. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[^3]: Autio, C., et al. NIST. *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile* (2024), sección 2.2 “Confabulation”. https://doi.org/10.6028/NIST.AI.600-1
