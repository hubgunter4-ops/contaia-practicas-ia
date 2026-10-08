# Laboratorio ContaIA

Aplicación educativa en español para aprender IA aplicada a la contaduría en México. El curso conserva su alcance de **40 horas, 10 semanas y 10 módulos** y se complementa con ejercicios ficticios, una base de estudio local y Nora, tutora IA disponible desde la bienvenida hasta el proyecto integrador.

## Nora, tutora durante todo el recorrido

Nora aparece como un único panel accesible desde **Curso completo**, **Laboratorio práctico** y **Base de estudio**. El hilo se conserva mientras la pestaña está abierta, se actualiza el contexto cuando se cambia de módulo o práctica y se descarta al recargar. Sus estados animados distinguen disponibilidad, pensamiento, explicación y celebración; se respeta `prefers-reduced-motion`. La voz es opcional y se activa solo con una acción explícita.

Las respuestas se generan en un backend Node de Vercel que enruta **OpenAI y Anthropic a través de Vercel AI Gateway** y transmite SSE; **no existe una respuesta local preprogramada como sustituto**. Nora selecciona una de las dos rutas y el servidor mantiene sus claves separadas:

- `AI_PROVIDER_DEFAULT`: `openai` o `anthropic`.
- `AI_GATEWAY_OPENAI_API_KEY` y `AI_GATEWAY_OPENAI_MODEL`, por ejemplo `openai/<modelo-del-catálogo>`.
- `AI_GATEWAY_ANTHROPIC_API_KEY` y `AI_GATEWAY_ANTHROPIC_MODEL`, por ejemplo `anthropic/<modelo-del-catálogo>`.
- `TUTOR_ALLOWED_ORIGINS`: orígenes HTTPS exactos separados por comas si la página está en otro dominio; déjalo vacío si el front-end y la función comparten dominio.

Para desarrollo local, copia `.env.example` a `.env`, configura credenciales Gateway fuera del repositorio y ejecuta `npm run dev`. Nunca pongas claves en `public/tutor-config.js`, HTML, variables `VITE_*`, en el chat o en un commit. El backend ya no llama directamente a las API de OpenAI ni Anthropic.

### Publicar el backend en Vercel

1. Importa el repositorio `hubgunter4-ops/contaia-practicas-ia` como un proyecto conectado a GitHub; no reutilices un proyecto Vercel Drop sin vínculo al repositorio.
2. Usa el comando de build `npm run build:vercel`, el directorio de salida `dist` y el runtime Node.js compatible con `package.json`.
3. En Vercel AI Gateway crea dos claves dedicadas a ContaIA, una para cada ruta, y asigna a **cada clave un presupuesto mensual de USD 10**. El límite de gasto es por clave; si la consola lo permite, restringe también cada clave al proyecto ContaIA (`projectId`). No reutilices las claves en otras aplicaciones y revisa el consumo en el panel de AI Gateway.
4. Añade en Vercel → Project Settings → Environment Variables las cuatro variables Gateway como secretos. Configura los IDs `openai/<modelo>` y `anthropic/<modelo>` desde el catálogo vigente y deja `AI_PROVIDER_DEFAULT=openai` (o cambia a `anthropic`). No añadas claves directas de los proveedores.
5. Despliega el proyecto. Las Functions quedan en `/api/tutor/config` y `/api/tutor/stream`; las claves solo se leen en el servidor.
6. Si el front-end continúa publicado en GitHub Pages, pon el origen de la API de Vercel en `window.CONTAIA_TUTOR_API_BASE` dentro de `public/tutor-config.js`, vuelve a publicar la página y configura el origen exacto de GitHub Pages en `TUTOR_ALLOWED_ORIGINS`. La opción más sencilla es servir front-end y API bajo el mismo dominio Vercel.

El nivel gratuito de AI Gateway incluye un subconjunto de modelos y tiene límites de uso; la pantalla de Vercel compartida muestra USD 5/mes de créditos para ese nivel. Comprar créditos pasa la cuenta al nivel de pago y deja de aplicar el crédito gratuito mensual. La recarga automática es opcional y debe permanecer desactivada. Al agotar el presupuesto/saldo, Nora mostrará un aviso seguro; los presupuestos de Gateway son *soft caps*, así que una petición que cruce el límite puede terminar y producir un pequeño exceso. No se comprarán créditos ni se activará auto-top-up desde este flujo.

Las respuestas se transmiten por fragmentos SSE y el cliente puede cancelar una generación. El límite de solicitudes por IP en memoria es una protección básica por instancia, no un limitador distribuido. **CORS no es autenticación:** el endpoint público puede recibir llamadas directas fuera del navegador. Conserva límites de gasto en AI Gateway y protección/rate limiting de Vercel; no uses el límite en memoria como única barrera de costos.

Referencias operativas: [Chat Completions en Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions), [streaming SSE](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/streaming), [claves API](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys) y [presupuestos](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets).

## Qué datos procesa el tutor

Al proveedor configurado se envían la pregunta que escribes, hasta ocho intervenciones recientes del chat mantenido en memoria y el contexto canónico del módulo/práctica actual. En ejercicios, el servidor **omite la solución modelo hasta la etapa curricular de comparación**. El navegador no envía las respuestas escritas o selecciones del ejercicio, el progreso, las notas privadas, la base IndexedDB ni el portafolio. El historial no se guarda en localStorage ni en el backend. El proveedor procesa el contenido de las preguntas; por eso no escribas datos reales, personales o confidenciales.

El tutor es un apoyo educativo, no asesoría profesional, contable, fiscal, laboral ni legal. Los casos son ficticios; las reglas vigentes y situaciones reales requieren fuentes oficiales y revisión profesional.

## Secuencia de cada clase

Cada sesión guiada de tres horas aparece en el mismo orden:

1. **Activación y objetivo — 15 min**.
2. **Concepto y demostración — 35 min**.
3. **Práctica guiada — 80 min**.
4. **Revisión y reflexión — 40 min**.
5. **Cierre y evidencia — 10 min**.

Se separa una **hora de práctica independiente**. Cada módulo abre con su agenda, pregunta de control, producto esperado y práctica ficticia vinculada. El diagnóstico inicial, el glosario, los materiales y las actividades externas quedan como apoyos secundarios para no competir con la ruta central.

Consulta el [plan integral de 40 horas](docs/curso/plan-trabajo-curso-ia-contaduria.md), el [paquete didáctico del Módulo 2](docs/curso/modulo-02/README.md), el [índice de materiales por módulo](docs/curso/README.md) y la [serie de mini clases en video](docs/curso/videos/README.md). El flujo NotebookLM→Synthesia para los videos es manual; ContaIA no llama sus APIs ni comparte automáticamente notas o actividad del estudiante.

## Videos explicativos por módulo y práctica

Cada sesión del curso y cada práctica tiene una tarjeta de video. Mientras no haya un enlace aprobado, muestra **Video en preparación** y permite copiar un briefing curricular en español para pegarlo en [NotebookLM](https://notebook.google/). Carga únicamente las fuentes educativas aprobadas del módulo; NotebookLM puede preparar un [Video Overview](https://support.google.com/gemininotebook/answer/16454555?hl=es) o un guion estructurado. Revisa citas, afirmaciones, duración y ejemplos ficticios antes de pasar el guion a [Synthesia](https://app.synthesia.io/) para crear la versión narrada/avatar y [obtener su embed oficial](https://help.synthesia.io/en/articles/9189559-how-do-i-share-my-synthesia-video).

Después de revisar y publicar el video en Synthesia, copia el `src` del iframe oficial —con formato `https://share.synthesia.io/embeds/videos/<id>?language=es`— al catálogo `COURSE_VIDEO_LIBRARY` de `src/course-videos.js`. Usa la clave del módulo (`modulo-01`…`modulo-10`) o de la práctica (`prompt`, `clasificacion`, `conciliacion`, etc.): `"modulo-01": { approved: true, embedUrl: "https://share.synthesia.io/embeds/videos/<id>?language=es", title: "Explicación del módulo 1", duration: "3–5 min" }`. Conserva `approved: true` solo después de la revisión docente. La web rechaza dominios, rutas y parámetros distintos; nunca pegues un bloque HTML arbitrario.

Al reproducir un embed, el navegador carga el player desde Synthesia; los enlaces públicos también pueden ser vistos fuera del curso. La protección con contraseña o SSO depende del plan de Synthesia. No cargues datos reales, personales, fiscales, laborales ni confidenciales en NotebookLM o Synthesia. El catálogo está vacío inicialmente: no se generan ni publican videos automáticamente. Consulta el [plan de integración NotebookLM y Synthesia](docs/superpowers/plans/2026-10-08-videos-notebooklm-synthesia.md).

## Progreso, base de estudio y privacidad local

`localStorage` conserva solo identificadores de módulos y prácticas completados y, si la persona lo elige, su ruta inicial. Las respuestas de ejercicios no se guardan. El portafolio se descarga localmente como Markdown.

La sección **Base de estudio** crea un catálogo IndexedDB privado con módulos, prácticas, glosario y conocimiento referenciado. Permite buscar, filtrar, guardar notas de hasta 2.000 caracteres y descargar una copia JSON bajo acción explícita. No sincroniza notas ni envía su contenido al tutor. Evita incluir datos reales o confidenciales.

## Ejercicios

- **Prompts contables:** borrador libre con rúbrica.
- **Operación contable:** clasificación de compra, conciliación bancaria y lectura de balanza.
- **Análisis:** reporte ejecutivo y revisión prudente de anomalías.
- **México:** escenarios didácticos sobre ISR, RESICO y privacidad de nómina.
- **Datos de ejemplo:** archivo CSV inventado disponible en el sitio.

La secuencia de práctica individual es intento, pista, ejemplo y comparación. No se reproducen materiales propietarios de [Alegra Academy](https://academy.alegra.com/courses/ia-para-contadores/), [Edutin](https://edutin.com/curso-de-ia-para-contabilidad) ni [ContadorMx](https://contadormx.net/cursos/inteligencia-artificial-aplicada-a-la-contabilidad-finanzas-e-impuestos/); las prácticas son originales.

## Requisitos y comandos

- Node.js compatible con la versión declarada en `package.json`.
- Sin dependencias npm de producción; las pruebas E2E usan Playwright.

```bash
npm run dev          # http://localhost:3000
npm test              # pruebas unitarias
npm run test:e2e      # navegador de escritorio y móvil
npm run build:vercel  # prepara dist/ para Vercel
```

Las pruebas E2E simulan el backend: no consumen créditos ni llaman a OpenAI o Anthropic. Las pruebas unitarias cubren validación, límites, privacidad del contexto y protocolo SSE. No validan interpretaciones tributarias.

## Estructura

```text
api/tutor/       Vercel Functions de configuración y streaming
public/          Sitio estático, avatares optimizados y URL opcional de API
src/             Interfaz, curso, ejercicios, persistencia y cliente/backend del tutor
data/            Datos ficticios
scripts/          Build estático para Vercel
tests/            Pruebas unitarias y E2E
server.js         Servidor Node local con las mismas rutas API
vercel.json       Configuración de build y Functions
```
