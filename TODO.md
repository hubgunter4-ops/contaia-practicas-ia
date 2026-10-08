# Criterios del proyecto — Laboratorio ContaIA y curso de IA para contaduría

## Sección 1: plan de trabajo y material didáctico

- [x] Crear un plan de curso integral de 40 horas, organizado en 10 semanas y 10 módulos con 3 horas guiadas y 1 hora de práctica independiente por semana.
- [x] Definir público, prerrequisitos, resultados de aprendizaje, actividades semanales, evidencias, criterios de evaluación y un proyecto integrador con datos ficticios.
- [x] Correlacionar el plan semanal con las nueve prácticas existentes e incorporar controles de privacidad, verificación humana y límites para contenido fiscal mexicano.
- [x] Preparar los paquetes detallados de los módulos 1 y 2, con guía de facilitación, cuaderno del participante y evaluación; el Módulo 2 incluye plantillas de prompts contables.
- [x] Guardar el plan de trabajo, índice y todos los materiales didácticos bajo la carpeta `docs/curso/`, reparar los enlaces relativos y enlazar los paquetes desde el README principal.

## Sección 2: laboratorio práctico

- [x] Mantener las nueve prácticas en español: prompts; clasificación de transacciones; conciliación; balanza; reportes; anomalías; ISR; RESICO; y privacidad de nómina.
- [x] Mantener pistas, retroalimentación y soluciones modelo locales con datos ficticios, sin llamadas a servicios externos de IA.
- [x] Presentar el contenido fiscal como educativo y no como asesoría, y recomendar verificación en fuentes oficiales y consulta profesional.
- [x] **Ruta curricular visible:** mostrar una primera sección “Curso completo” con los 10 módulos, objetivos, duración y vínculo con las prácticas; la página de laboratorio actual será la sección 2.
- [x] **Práctica progresiva:** en cada ejercicio ofrecer la secuencia intento → pista → ejemplo/solución → comparación con la respuesta del participante. En la práctica de prompts, mostrar y evaluar sus seis criterios de calidad.
- [x] **Progreso y portafolio local:** permitir marcar módulos y ejercicios completados y descargar un resumen de evidencias; guardar únicamente el progreso en este navegador, nunca respuestas escritas o selecciones; no requerir cuenta. El portafolio incluirá títulos, estados y fecha. Si el almacenamiento local falla, la práctica continuará en memoria y se mostrará un aviso.
- [ ] **Diagnóstico y cierre:** incluir una evaluación breve al inicio y otra al final para evidenciar aprendizaje, junto con una rúbrica sencilla para docentes.
- [ ] **Lista de revisión responsable:** antes de terminar cada ejercicio, recordar comprobar datos y fuentes, identificar lo que falta y no presentar una anomalía como conclusión; conservar casos ficticios y avisos de confidencialidad.

## Restricciones e integración

- La base de estudio y el progreso siguen locales. La tutoría IA usa exclusivamente el backend seguro de Vercel; no añadir cuentas, analítica ni sincronización de notas.
- El progreso del curso se guarda solo en `localStorage`; el portafolio se descarga desde el navegador. El texto de respuestas, selecciones y respuestas de evaluación no se persiste.
- Las claves de proveedor solo viven en secretos del servidor; no guardarlas en el navegador, el repositorio ni el historial del chat. El front-end no llama directamente a OpenAI/Anthropic.
- Cerrar cada fase con un commit separado en el repositorio privado canónico; verificar pruebas y Preview antes de continuar. No solicitar publicación del sitio.


## Sección 3: Nora como tutora IA durante todo el recorrido

- [x] Integrar un solo panel global de Nora en curso, laboratorio y base de estudio, abierto desde la bienvenida y disponible hasta el módulo 10/proyecto integrador.
- [x] Mantener el hilo en memoria durante la pestaña actual, actualizar el contexto curricular al cambiar de módulo/práctica y descartarlo al recargar.
- [x] Retirar las respuestas automáticas locales del tutor: las respuestas se solicitan al backend IA y un error se comunica sin inventar una respuesta de reemplazo.
- [x] Añadir funciones Node de Vercel, streaming SSE, proveedor/modelo configurables y una protección básica por IP; conservar rutas compatibles con `server.js` local.
- [x] Validar módulos y prácticas en servidor y no enviar progreso, notas, respuestas de ejercicios, selecciones ni portafolio al proveedor.
- [x] Añadir estados visuales animados y aviso de procesamiento externo; respetar `prefers-reduced-motion`.
- [x] Añadir voz opcional mediante `SpeechSynthesis`, apagada por defecto y cancelable.
- [x] Añadir controles accesibles, avatar plegado compacto, navegación responsive y región de mensajes.
- [x] Cubrir secuencia, proveedor sin configurar, contexto/privacidad, SSE, CORS, errores, voz y navegación con pruebas unitarias/E2E.
- [ ] En Vercel, definir proveedor/modelo y clave como secretos, configurar los orígenes y hacer un despliegue autorizado; no poner claves en el chat ni en el repositorio.
- [ ] Antes de asociar una clave real, establecer límites de gasto del proveedor y protección/rate limiting distribuido de Vercel; CORS no evita llamadas directas al endpoint.

> OpenAI o Anthropic se configuran desde variables privadas del servidor. Si falta la configuración, Nora explica el problema y no recurre al antiguo tutor local.

## Sección 6: base de estudio local

- [x] Crear `src/study-db.js` con esquema IndexedDB versionado para fichas de curso y notas privadas.
- [x] Sembrar 47 fichas: 10 módulos, 9 prácticas y 28 conceptos del glosario, con destinos navegables.
- [x] Integrar búsqueda por relevancia, filtros por tipo y apertura del contenido de origen desde la pestaña **03 · Base de estudio**.
- [x] Guardar, editar, eliminar y exportar notas locales de hasta 2,000 caracteres, con fallback en memoria cuando IndexedDB no está disponible.
- [x] Cubrir catálogo, búsqueda, depuración de notas y validación de identificadores con pruebas unitarias.
- [x] Integrar 50 casos sintéticos de `llm-eval-contable`, 3 prompts seleccionados de `AI-prompt-database` y 903 metadatos mexicanos de Kaggle.
- [x] Revisar fuentes contra HTML/script activo, protocolos no HTTPS, secretos y patrones de prompt injection antes de generar el catálogo.
- [x] Mantener atribución, licencia, jurisdicción, carácter sintético y URL de procedencia en cada ficha externa; paginar resultados para no renderizar 1,000 fichas de una vez.

## Sección 4: pruebas E2E y CI

- [x] Añadir selectores `data-testid` estables al panel de Nora.
- [x] Configurar Playwright para Chromium de escritorio y móvil.
- [x] Cubrir apertura/cierre, respuesta del backend simulado, ausencia de llamadas directas al proveedor, continuidad, no persistencia, accesibilidad y voz mockeada.
- [x] Añadir comandos `test:e2e` y `test:e2e:headed`.
- [x] Crear workflow de GitHub Actions para ejecutar unit tests y E2E en cada Pull Request.
- [x] Conservar informes, trazas, capturas y videos como artefactos cuando corresponda.

## Sección 5: Nora como guía de los módulos

- [x] Cada uno de los 10 módulos tiene una apertura contextual específica.
- [x] Cada módulo presenta una ruta de trabajo en exactamente tres pasos.
- [x] Cada módulo incluye una pregunta de control para separar hechos, supuestos y evidencia faltante.
- [x] Cada módulo define una evidencia de salida concreta.
- [x] La guía aparece dentro de la tarjeta curricular, antes de la práctica vinculada y con diseño responsive.

## Sección 7: secuencia de sesiones

- [x] Reordenar la portada para priorizar el curso, la primera acción con Nora y herramientas secundarias plegadas.
- [x] Mostrar en los diez módulos la misma secuencia: activación (15 min), concepto/demo (35), práctica guiada (80), revisión/reflexión (40) y cierre/evidencia (10).
- [x] Mantener 60 minutos de práctica independiente fuera de las tres horas guiadas y cerrar con el proyecto integrador del módulo 10.
- [x] Validar en Chromium de escritorio y móvil, junto con el build estático de Vercel.

## Sección 8: videos explicativos por módulo y práctica

- [x] Crear briefings en español desde el contenido curricular para preparar videos con NotebookLM sin incluir respuestas, progreso ni notas locales.
- [x] Agregar tarjetas por módulo y por ejercicio, con estado pendiente, enlaces a NotebookLM/Synthesia y copiado accesible del briefing.
- [x] Mostrar solo iframes aprobados de Synthesia en el dominio y ruta oficiales; no aceptar HTML arbitrario y avisar que el player carga desde un tercero.
- [x] Cubrir el prompt curricular, las URL hostiles y los estados de copia/pendiente en pruebas unitarias y E2E de escritorio y móvil.
- [ ] Generar, revisar y publicar los videos reales y añadir sus IDs aprobados a `COURSE_VIDEO_LIBRARY`; no hay enlaces publicados en este cambio.
