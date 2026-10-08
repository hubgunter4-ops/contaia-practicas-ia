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

- No añadir cuentas, almacenamiento remoto, analítica, API de IA, base de datos, proveedores externos ni nuevas dependencias.
- El progreso del curso se guarda solo en `localStorage`; el portafolio se descarga desde el navegador. El texto de respuestas, selecciones y respuestas de evaluación no se persiste.
- Si una integración externa adicional pareciera útil, detener ese punto, describirla y pedir autorización antes de proponerla o conectarla. No se prevé ninguna para este alcance.
- Cerrar cada fase con un commit separado en el repositorio privado canónico; verificar pruebas y Preview antes de continuar. No solicitar publicación del sitio.


## Sección 3: tutor local de Nora

- [x] Integrar un panel plegable de “Nora · Tutor local” en cada práctica, con historial efímero y sin persistencia.
- [x] Añadir contexto didáctico normalizado por tipo de ejercicio, sin exponer claves, selecciones ni respuestas del estudiante.
- [x] Añadir respuestas locales para pista, reformulación, explicación condicionada, siguiente paso y fallback seguro.
- [x] Añadir estados visuales del tutor y avisos explícitos de que no existe conexión externa.
- [x] Añadir voz opcional mediante `SpeechSynthesis`, apagada por defecto y cancelable.
- [x] Añadir controles accesibles, foco visible, región de mensajes y diseño responsive.
- [x] Cubrir contexto, motor local y voz con pruebas unitarias.
- [ ] Revisar manualmente las nueve prácticas en Preview antes de fusionar o publicar.

> La integración remota con OpenAI, Anthropic u otro proveedor permanece fuera de alcance y no se implementa en esta rama.

## Sección 4: pruebas E2E y CI

- [x] Añadir selectores `data-testid` estables al panel de Nora.
- [x] Configurar Playwright para Chromium de escritorio y móvil.
- [x] Cubrir apertura/cierre, respuesta local, privacidad de red, limpieza, no persistencia, accesibilidad y voz mockeada.
- [x] Añadir comandos `test:e2e` y `test:e2e:headed`.
- [x] Crear workflow de GitHub Actions para ejecutar unit tests y E2E en cada Pull Request.
- [x] Conservar informes, trazas, capturas y videos como artefactos cuando corresponda.

## Sección 5: Nora como guía de los módulos

- [x] Cada uno de los 10 módulos tiene una apertura contextual específica.
- [x] Cada módulo presenta una ruta de trabajo en exactamente tres pasos.
- [x] Cada módulo incluye una pregunta de control para separar hechos, supuestos y evidencia faltante.
- [x] Cada módulo define una evidencia de salida concreta.
- [x] La guía aparece dentro de la tarjeta curricular, antes de la práctica vinculada y con diseño responsive.
