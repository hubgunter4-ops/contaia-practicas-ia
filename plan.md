# Laboratorio ContaIA: ruta de aprendizaje e implementación

> **Ejecución prevista:** implementación nativa en esta sesión. Cerrar cada fase independiente con un commit en `main`, validarlo y empujarlo al remoto canónico antes de comenzar la siguiente. La publicación permanecerá sin solicitar.

**Objetivo:** colocar el plan del curso y los materiales didácticos bajo `docs/curso/` y convertir el laboratorio existente en una experiencia de aprendizaje con ruta curricular, práctica progresiva, progreso local, evaluaciones y controles de revisión responsable.

**Arquitectura:** conservar la aplicación estática de una sola página, escrita en HTML/CSS/JavaScript y servida por Node.js. Añadir un catálogo de curso separado de la interfaz, una capa pequeña para persistir únicamente identificadores de progreso en `localStorage`, evaluaciones deterministas ejecutadas en el navegador y una base de estudio IndexedDB local. Las respuestas escritas, selecciones, diagnósticos y calificaciones no se guardarán ni enviarán a terceros; las notas de estudio son opt-in, privadas al navegador y separadas del progreso.

**Tecnologías:** HTML semántico, CSS, módulos JavaScript modernos, Node.js 22 integrado, `node:test`; sin dependencias nuevas ni llamadas a servicios externos. Los materiales en Markdown estarán dentro de `docs/curso/` y el servidor permitirá solicitar únicamente archivos `.md` de ese subdirectorio.

**Especificación:** solicitud del usuario del 7 de octubre de 2026; sugerencias anteriores: ruta del curso visible, práctica guiada por niveles, progreso y portafolio local, diagnóstico y evaluación final, y lista de revisión integrada. Plan académico: `docs/curso/plan-trabajo-curso-ia-contaduria.md`; materiales didácticos: `docs/curso/modulo-01/` y `docs/curso/modulo-02/`.

## Restricciones globales

- La aplicación tendrá dos secciones principales: **01 · Curso completo** y **02 · Laboratorio práctico**; el laboratorio actual conserva sus nueve ejercicios.
- El curso propuesto mantiene 40 horas, 10 módulos y 3 horas guiadas más 1 hora de práctica independiente por semana.
- No almacenar texto de respuestas, opciones seleccionadas, contenidos del diagnóstico ni calificaciones; el almacenamiento persistente se limita a identificadores de módulos y prácticas completados.
- No enviar respuestas ni progreso a servicios externos; no añadir cuentas, API de IA, analítica, base de datos remota, proveedores ni dependencias externas. La base de estudio usa únicamente IndexedDB nativo del navegador.
- El curso, las soluciones y los ejercicios usan exclusivamente datos ficticios. El contenido de ISR, RESICO, nómina y auditoría sigue siendo educativo, no asesoría ni determinación de obligaciones reales.
- Mantener la paleta vino `#7A2E3A`, oro `#D8B26E`, estética editorial de expediente, navegación por teclado, foco visible, adaptación móvil y soporte a `prefers-reduced-motion`.
- Mantener Node.js `>=22`, puerto `3000`, manifiesto de rutas de página `GET /manus-routes.json` con la ruta única `/`, y cero dependencias npm adicionales.
- No añadir ninguna integración externa. Si una integración adicional llegara a resultar conveniente, detener ese punto y pedir autorización antes de proponerla o conectarla.
- Para cada fase: cambiar solamente sus archivos, ejecutar las comprobaciones afectadas, hacer un commit descriptivo, obtener `origin/main`, integrar solo avance fast-forward compatible, volver a comprobar y empujar a `origin/main`. No usar `git add -A`, no reescribir historial ni forzar. `publishing.auto_publish` está en `false`; no solicitar publicación.

## Atención especial de revisión

- Si `localStorage` contiene JSON inválido, datos antiguos, IDs desconocidos o está bloqueado/cuota llena, el sitio debe seguir funcionando en memoria y no mostrar progreso falso.
- Si la respuesta del navegador tiene caracteres HTML, debe mostrarse escapada en el comparador; nunca interpretarse como marcado.
- En diagnósticos incompletos, respuestas vacías o selecciones inválidas, no otorgar aciertos ni registrar la evaluación como completada.
- La navegación entre las dos secciones y el acceso a los materiales deben funcionar en escritorio, móvil y teclado, sin añadir rutas de página que falten en el manifiesto.
- Una anomalía debe presentarse como señal para investigar, nunca como prueba de fraude; la lista de revisión se mantiene como guía local y no captura datos del cliente.

## Diseño de la experiencia

- **Movimiento:** diseño editorial contemporáneo de archivo, con referencias sutiles a expedientes y cuadernos de trabajo mexicanos, evitando clichés y apariencia corporativa genérica.
- **Principios:** legibilidad primero; rigor sin intimidar; práctica progresiva con explicación; datos sintéticos claramente identificados.
- **Color:** vino oscuro `#7A2E3A` como color propio de criterio y autoridad amable; oro cálido `#D8B26E` para pistas y acciones; crema de papel y tinta azul-gris para lectura prolongada.
- **Composición:** pestañas superiores numeradas para 01/02, navegación del laboratorio como segunda sección, módulos presentados como fichas de expediente con horas y vínculo a su práctica; en móvil, navegación compacta y una columna.
- **Motivos:** pestañas de expediente numeradas, etiquetas de folio “CASO FICTICIO” y líneas de cuaderno con anotaciones al margen.
- **Interacción:** cada práctica comienza con un intento; después permite pedir pista, revisar un ejemplo y comparar borrador/elección. No forzar los pasos por medio de un proveedor externo.
- **Animación:** transiciones discretas de 140–220 ms; sin animación continua y respetando `prefers-reduced-motion`.
- **Tipografía:** Alegreya Sans para titulares y lectura; DM Mono o fuente de sistema para folios, cifras y etiquetas, con cifras tabulares.
- **Esencia de marca:** laboratorio de práctica contable con IA para estudiantes y profesionales que quieren aprender de forma segura; personalidad cuidadosa, clara y práctica.
- **Voz:** directa y didáctica. Ejemplos: “Primero intenta. Luego verifica.” y “Una señal no es una conclusión.”
- **Logotipo:** conservar el monograma original “C” como carpeta abierta con un asiento débito/crédito junto al nombre Laboratorio ContaIA.
- **Color distintivo:** vino `#7A2E3A`.

## Estructura del proyecto

- `docs/curso/plan-trabajo-curso-ia-contaduria.md`: programa integral de 40 horas, calendario editable y vínculo de cada módulo con el laboratorio.
- `docs/curso/modulo-01/` y `docs/curso/modulo-02/`: paquetes didácticos detallados existentes.
- `docs/curso/README.md`: índice de plan y paquetes por módulo.
- `src/course.js`: catálogo de los 10 módulos, nombres, objetivos, prácticas vinculadas, rutas de materiales, preguntas de diagnóstico/cierre y rúbrica.
- `src/main.js`: navegación 01/02, renderizado, flujo de ayudas, evaluaciones, lista de revisión y eventos.
- `src/logic.js`: funciones puras de puntuación, etapas de guía y evaluación de cuestionarios.
- `src/progress.js`: lectura/escritura saneada del progreso local y creación del portafolio sin respuestas.
- `src/study-db.js`: esquema IndexedDB versionado, catálogo semillado, búsqueda, notas privadas y exportación local.
- `src/styles.css`: sistema visual responsive para las vistas y nuevos componentes.
- `server.js`: servidor sin dependencias que expone `public/`, los archivos actuales `src/` y `data/`, y solo Markdown desde `docs/curso/`.
- `tests/logic.test.js`, `tests/course.test.js` y `tests/progress.test.js`: pruebas deterministas de la lógica nueva y existente.
- `README.md` y `TODO.md`: navegación documental, criterios de producto y estado de cada fase.
- `public/manus-routes.json`: conserva `/`; las dos secciones son vistas de la misma página, no rutas nuevas.

## Fases de implementación y commits

### Fase 0 — Consolidar el curso y sus materiales

Mover el plan académico a `docs/curso/plan-trabajo-curso-ia-contaduria.md`; reparar sus enlaces al CSV, módulos, índice y README raíz; actualizar el índice para enlazar el plan y los paquetes 1 y 2; conservar intacto el contenido de los materiales existentes. Validar enlaces relativos y `npm test`. Commit: `docs: organize course plan and teaching materials`.

### Fase 1 — Hacer visible la ruta del curso

Añadir `courseModules` en `src/course.js`, con 10 módulos semanales de 4 horas, objetivos, vínculo con `exercise.id`, y enlace a materiales disponibles; añadir las pestañas **01 · Curso completo** y **02 · Laboratorio práctico** a `src/main.js`, abrir por defecto la vista de curso, y permitir volver a las nueve prácticas; exponer de forma segura los `.md` de `docs/curso/` desde `server.js`, con validación de ruta dentro del subdirectorio; actualizar CSS e incluir enlaces de descarga para el plan y los módulos 1–2. El manifiesto sigue declarando solo `/`. Probar módulos únicos, integridad de sus IDs y materiales, la página y los endpoints Markdown, y rechazar traversal y `/README.md`. Commit: `feat: add visible course roadmap`.

### Fase 2 — Guiar las prácticas por etapas

En `src/logic.js`, exponer `getGuidedStage({ attempted, hintSeen, solutionSeen })`, que devuelve `"attempt"`, `"hint"`, `"example"` o `"compare"` según el intento, la consulta de la pista y la apertura de la solución; en `src/main.js`, habilitar la pista después de un intento válido y la solución después de consultar la pista, conservar el texto únicamente en memoria y, al abrir el ejemplo, mostrar el borrador o selección del alumno junto al modelo, escapando ambos valores. Mantener los seis criterios de rúbrica del prompt visibles. Añadir pruebas de transiciones y entradas vacías, y ejecutar `npm test`. Commit: `feat: guide practice through hints and examples`.

### Fase 3 — Guardar progreso local y exportar portafolio

Crear `src/progress.js` con `loadProgress(storage)`, `saveProgress(progress, storage)` y `createPortfolioMarkdown(progress, modules, exercises, generatedAt)`. Persistir solo arrays depurados `completedModules` y `completedExercises` bajo una clave versionada; el avance de práctica procede del acierto actual y cada módulo dispone de control manual para marcar finalización. Añadir botón de descarga Markdown con nombres, estados y fecha, nunca texto de respuesta ni selección. Ante almacenamiento inaccesible, continuar en memoria y comunicarlo sin bloquear la práctica. Probar round trip, JSON corrupto, IDs desconocidos, almacenamiento que lanza y ausencia de respuestas en el portafolio. Commit: `feat: persist local progress and export portfolio`.

### Fase 4 — Añadir diagnóstico y evaluación de cierre

Definir dos conjuntos breves de cinco preguntas deterministas en `src/course.js`, alineados a los fundamentos y controles del curso. En `src/logic.js`, exportar `evaluateQuiz(answers, questions)` para devolver aciertos, total y retroalimentación sin mutar ni persistir respuestas. En `src/main.js`, permitir iniciar/terminar diagnóstico y cierre, mostrar resultado y la rúbrica de cuatro dimensiones de 0–3 puntos del plan; resultados y respuestas viven solo en memoria. Probar 0/5, 5/5, estado incompleto y entrada inválida. Commit: `feat: add course assessments`.

### Fase 5 — Incorporar revisión responsable al cierre de cada ejercicio

Definir en `src/course.js` cuatro controles de reflexión: usar el caso ficticio; contrastar datos/cálculos con evidencia y fuente pertinente; declarar qué información falta; y no tratar una anomalía como conclusión. Integrar el checklist antes del pie de cada ejercicio en `src/main.js`, adaptando el último control para que diga explícitamente que una señal no demuestra fraude. Las casillas viven solo en memoria y la lista recuerda verificar antes de continuar, sin crear una afirmación contable o fiscal. Probar presencia en las nueve prácticas y el texto prudente para anomalías; conservar avisos fiscales y privacidad. Commit: `feat: add responsible review checklist`.

Al cerrar cada fase, actualizar su estado en `TODO.md`, correr las pruebas afectadas, hacer el commit indicado y empujarlo al `origin/main` canónico después de integrar cualquier avance fast-forward que aparezca. No publicar el sitio.
