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
- [ ] **Práctica progresiva:** en cada ejercicio ofrecer la secuencia intento → pista → ejemplo/solución → comparación con la respuesta del participante. En la práctica de prompts, mostrar y evaluar sus seis criterios de calidad.
- [ ] **Progreso y portafolio local:** permitir marcar módulos y ejercicios completados y descargar un resumen de evidencias; guardar únicamente el progreso en este navegador, nunca respuestas escritas o selecciones; no requerir cuenta.
- [ ] **Diagnóstico y cierre:** incluir una evaluación breve al inicio y otra al final para evidenciar aprendizaje, junto con una rúbrica sencilla para docentes.
- [ ] **Lista de revisión responsable:** antes de terminar cada ejercicio, recordar comprobar datos y fuentes, identificar lo que falta y no presentar una anomalía como conclusión; conservar casos ficticios y avisos de confidencialidad.

## Restricciones e integración

- No añadir cuentas, almacenamiento remoto, analítica, API de IA, base de datos, proveedores externos ni nuevas dependencias.
- El progreso del curso se guarda solo en `localStorage`; el portafolio se descarga desde el navegador. El texto de respuestas, selecciones y respuestas de evaluación no se persiste.
- Si una integración externa adicional pareciera útil, detener ese punto, describirla y pedir autorización antes de proponerla o conectarla. No se prevé ninguna para este alcance.
- Cerrar cada fase con un commit separado en el repositorio privado canónico; verificar pruebas y Preview antes de continuar. No solicitar publicación del sitio.
