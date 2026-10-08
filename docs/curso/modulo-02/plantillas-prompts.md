# Plantillas de prompts — Módulo 2

_Tarjetas de referencia para redactar instrucciones contables acotadas · todos los campos entre corchetes se deben completar con información ficticia o autorizada._

---

## 🧭 Cómo usar estas plantillas

1. Define primero la tarea y el criterio de éxito.
2. Conserva únicamente el contexto y los datos necesarios y permitidos.
3. Pide un formato que permita rastrear las afirmaciones a sus fuentes.
4. Incluye qué hacer con datos faltantes, contradicciones e incertidumbre.
5. Prueba con más de un caso sintético; compara la salida con los datos originales.

Las guías de OpenAI y Anthropic respaldan la claridad, el contexto, la especificación de formatos y el uso de ejemplos, pero señalan técnicas vinculadas a productos o modelos concretos; por ello, adapta el estilo a la herramienta autorizada y vuelve a evaluar los resultados.[^1][^2] Ninguna plantilla reemplaza una fuente contable ni elimina el riesgo de contenido falso o erróneo.[^3]

## 📋 Plantilla base de seis bloques

```text
ROL (opcional)
Actúa como [perspectiva de apoyo; no atribuyas licencia, autoridad ni facultad de aprobación].

CONTEXTO
Caso [educativo/ficticio] de [tipo de entidad y proceso]. El propósito es [borrador o revisión preparatoria].

TAREA
[Verbo concreto: compara / clasifica / resume / identifica]. Limita el trabajo a [alcance]. No ejecutes [decisión, registro o envío que queda fuera].

DATOS PERMITIDOS
Usa únicamente la información delimitada a continuación. Si un dato no aparece, indica que falta; no lo completes por intuición.

--- INICIO DE DATOS ---
[Insertar datos sintéticos o expresamente autorizados]
--- FIN DE DATOS ---

FORMATO DE SALIDA
Devuelve [tabla/lista/reporte] con estas columnas o secciones: [campos]. Usa [moneda/unidad/periodo] solo si está indicado en los datos.

VERIFICACIÓN Y LÍMITES
Separa hechos respaldados, inferencias y datos faltantes. Relaciona cada afirmación con la referencia de origen. Señala contradicciones y la verificación que corresponde. No inventes importes, documentos, nombres ni citas. Si la evidencia es insuficiente, detente y formula preguntas; no tomes decisiones profesionales.
```

## 💰 Tarjeta 1 — Comparación bancaria

```text
Actúa como asistente de revisión contable para un caso educativo ficticio.

Compara únicamente los movimientos del extracto bancario y del libro auxiliar que aparecen abajo. Identifica coincidencias y partidas que aparecen en un lado pero no en el otro. No registres asientos ni determines el tratamiento fiscal.

Devuelve una tabla con: referencia del banco, referencia del libro, estado de comparación, importe y verificación siguiente. Si una referencia no aparece en ambos lados, marca “sin coincidencia encontrada en los datos proporcionados”; no deduzcas su causa.

Separa datos observados de hipótesis. Si el criterio de coincidencia es ambiguo, indícalo antes de concluir.

DATOS FICTICIOS:
[pegar extracto]
[pegar libro auxiliar]
```

**Adaptación permitida:** describir si la coincidencia requiere fecha, importe y referencia exactos. Evitar tratar coincidencias aproximadas como conciliaciones aprobadas.

## 🗂️ Tarjeta 2 — Clasificación preliminar

```text
Para este caso educativo ficticio, sugiere una categoría preliminar para cada movimiento usando únicamente la descripción, importe y catálogo que se incluyen.

Devuelve una tabla con: referencia, categoría sugerida, dato del caso que apoya la sugerencia, información faltante y motivo para revisión humana. No inventes comprobantes, cuentas ni política de la entidad. No registres transacciones ni determines impuestos.

Si el catálogo no ofrece una categoría adecuada, responde “requiere revisión” y explica por qué.

DATOS Y CATÁLOGO FICTICIOS:
[pegar datos sintéticos]
```

## 📊 Tarjeta 3 — Borrador de reporte financiero

```text
Prepara un borrador breve para un caso de gestión ficticio. Resume solo las cifras del periodo y comparación incluidas abajo. No atribuyas causas que no estén documentadas.

Presenta cuatro secciones: 1) hechos y cifras; 2) comparación con el periodo indicado; 3) supuestos o información no disponible; 4) comprobación siguiente. Conserva moneda, unidad y periodos exactamente como se proporcionan.

No hagas recomendaciones de inversión, fiscales o de crédito. Marca cada interpretación que necesite confirmación.

DATOS SINTÉTICOS:
[pegar cifras y periodo]
```

## 🔍 Tarjeta 4 — Revisión de una variación

```text
Analiza la variación [describir indicador] en los datos ficticios. Calcula solo operaciones aritméticas que puedan reproducirse a partir de las cifras incluidas y muestra la operación usada.

Devuelve: valor inicial, valor final, variación absoluta, variación relativa (si los datos permiten calcularla), limitaciones de comparabilidad y tres documentos o datos que una persona debería revisar. No atribuyas fraude, error o causa sin evidencia independiente.

DATOS SINTÉTICOS:
[pegar valores comparables y sus periodos]
```

## ✅ Lista de verificación antes de reutilizar

| Comprobación | Sí / No |
| --- | --- |
| ¿La tarea tiene un verbo concreto y un alcance delimitado? | |
| ¿El ejemplo es sintético o hay autorización expresa para usar los datos? | |
| ¿El formato hace rastreable cada afirmación? | |
| ¿La instrucción permite reconocer faltantes y detenerse? | |
| ¿La salida se comparará con los documentos de origen? | |
| ¿La revisión y cualquier aprobación permanecen en una persona autorizada? | |

## 🗒️ Bitácora de iteración

| Versión | Cambio realizado | Prueba sintética | Resultado observado | Próximo ajuste |
| --- | --- | --- | --- | --- |
| v1 | | | | |
| v2 | | | | |
| v3 | | | | |

No cambies muchos elementos a la vez si luego quieres entender qué mejoró. La documentación de OpenAI recomienda evaluar cambios de prompts en lugar de inferir rendimiento a partir de una sola salida.[^1]

## 📚 Referencias

[^1]: OpenAI. “Prompt engineering”. https://developers.openai.com/api/docs/guides/prompt-engineering
[^2]: Anthropic. “Claude prompting best practices”. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[^3]: Autio, C., et al. NIST. *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile* (2024), sección 2.2. https://doi.org/10.6028/NIST.AI.600-1
