# Laboratorio ContaIA

Proyecto en español que reúne una propuesta de curso completo de IA para contaduría y un laboratorio interactivo con prácticas ficticias. El programa se organiza en dos secciones correlacionadas.

## Sección 1: plan de trabajo del curso

Consulta el [plan integral de 40 horas](docs/curso/plan-trabajo-curso-ia-contaduria.md): 10 módulos semanales, resultados de aprendizaje, actividades, evidencias, evaluación, proyecto integrador y correspondencia con cada práctica del laboratorio.
El [paquete didáctico detallado del Módulo 2](docs/curso/modulo-02/README.md) desarrolla la semana de diseño de instrucciones; el [índice de materiales por módulo](docs/curso/README.md) reúne los paquetes disponibles.
La [serie de diez videos explicativos](docs/curso/videos/README.md) ofrece una mini clase guiada complementaria para cada módulo.

## Sección 2: laboratorio práctico

La [aplicación interactiva](https://8328-i143dgisqzurgn5srq8gm-85c68042.us3.manus.computer/) presenta las dos secciones en pestañas: **01 · Curso completo**, con los diez módulos y enlaces a los materiales disponibles, y **02 · Laboratorio práctico**, con nueve ejercicios originales inspirados en temas generales de cursos de Alegra Academy, Edutin y ContadorMx. No reproduce materiales propietarios ni sustituye esos cursos.[^1][^2][^3]

- **Prompts contables:** borrador libre con rúbrica visible, comprobación local y respuesta modelo.
- **Operación contable:** clasificación de una compra, conciliación de movimientos bancarios y lectura de una balanza.
- **Análisis:** preparación de un reporte ejecutivo ficticio y revisión prudente de una anomalía financiera.
- **México:** escenarios educativos sobre ISR, RESICO y privacidad en nómina.
- **Datos de ejemplo:** archivo CSV inventado, descargable desde el menú de la página.

Las prácticas siguen una secuencia de intento, pista, ejemplo y comparación con retroalimentación en el navegador. El sitio no llama a un modelo externo ni solicita cuentas. `localStorage` conserva solo los identificadores de módulos y prácticas completados y, si la persona lo elige, su ruta inicial de aprendizaje; no guarda texto de respuestas ni selecciones. El portafolio se descarga como Markdown local. Si el almacenamiento falla, se muestra un aviso y la actividad continúa en memoria.

## Base de estudio local

La pestaña **03 · Base de estudio** integra una base IndexedDB privada en el navegador. Se inicializa con el catálogo del curso y un catálogo externo revisado: 10 módulos, 9 prácticas, 28 conceptos, 50 casos sintéticos de evaluación contable, 3 prompts comunitarios y 903 referencias de contexto mexicano (metadatos y enlaces, no artículos completos). Permite buscar y filtrar el contenido, abrir el origen, guardar una nota privada por ficha y descargar una copia JSON bajo acción explícita de la persona usuaria.

La base no sincroniza, no crea cuentas y no envía notas a ningún proveedor. Los textos externos se importan como texto plano escapado; no se ejecutan scripts, HTML, comandos ni instrucciones de control. Solo se aceptan enlaces HTTPS y se abre una fuente externa únicamente mediante una acción explícita. Las notas se limitan a 2,000 caracteres y se recomienda escribir únicamente ideas educativas, nunca información real, personal o confidencial. Si IndexedDB no está disponible, la interfaz conserva una sesión en memoria y lo comunica.

## Alcance y confidencialidad

Todos los nombres, movimientos e importes de los ejercicios son ficticios. **No pegues información real, personal o confidencial de clientes o empleados.** Los módulos sobre ISR, RESICO y nómina son didácticos: no calculan obligaciones ni constituyen asesoría contable, fiscal, laboral o legal. Para una situación real, verifica la normativa y los materiales oficiales vigentes y consulta a una persona profesional calificada.

## Requisitos y ejecución

- Node.js 22 o posterior.
- No hay dependencias npm externas; IndexedDB es una capacidad nativa del navegador.

```bash
node server.js
```

Abre `http://localhost:3000`. También está disponible `npm run dev`.

## Pruebas

```bash
node --test
```

Las pruebas verifican la rúbrica de prompts, las respuestas de opción múltiple, el cálculo de diferencia de una balanza, el contexto seguro del tutor local y la síntesis de voz con mocks. No validan interpretaciones tributarias.

### Pruebas E2E con Playwright

Las pruebas E2E cubren el panel de Nora en Chromium de escritorio y móvil: apertura/cierre, respuesta local, ausencia de llamadas a proveedores, limpieza al cambiar de práctica, conservación durante un render, no persistencia, accesibilidad básica y activación explícita de voz.

```bash
npm run test:e2e
npm run test:e2e:headed
npx playwright show-report
```

Playwright inicia automáticamente `server.js` en el puerto 3000. El workflow `.github/workflows/tests.yml` ejecuta las pruebas unitarias y la matriz E2E en cada Pull Request y en cambios sobre `main`. En caso de fallo conserva el informe, trazas, capturas y video como artefactos de GitHub Actions.

## Estructura

```text
public/        Entrada HTML, favicon y manifiesto de rutas
src/           Interfaz, ejercicios, base de estudio y lógica local
data/          Archivo CSV de movimientos ficticios
docs/          Plan del curso y paquetes didácticos por módulo
tests/         Pruebas Node.js
server.js      Servidor estático local sin dependencias
app.config.ts  Metadatos del proyecto Webdev
plan.md        Plan técnico y decisiones de diseño del sitio
TODO.md        Criterios del alcance y estado del producto
```

## Repositorio

El código fuente está en el [repositorio privado de GitHub](https://github.com/hubgunter4-ops/contaia-practicas-ia). El sitio no requiere credenciales, base de datos ni configuración de servicios externos.

## Tutor local de Nora

La vista de cada práctica incluye un panel plegable **Nora · Tutor local**. El panel utiliza el escenario, la consigna, las pistas y la etapa pedagógica del ejercicio para ofrecer ayudas preparadas en español: pista, reformulación, siguiente paso y explicación después de la comparación autorizada.

La ruta del curso también incluye una guía de Nora dentro de cada uno de sus diez módulos. Cada guía presenta una apertura contextual, una ruta de tres pasos, una pregunta de control y la evidencia de salida esperada. Así, Nora acompaña el aprendizaje desde el plan del curso antes de llevar a la persona a la práctica ficticia vinculada.

Cada módulo incluye además una actividad opcional con **NotebookLM**, **Claude** o **n8n**. La secuencia pedagógica es: NotebookLM para entender conceptos con fuentes controladas, Claude para practicar explicaciones y borradores, y n8n para modelar flujos con validaciones, trazabilidad y aprobación humana. El sitio no conecta estas herramientas ni envía datos automáticamente; las prácticas usan datos ficticios. Consulta la [guía de herramientas de IA](docs/curso/herramientas-ia/README.md) para las actividades, límites y enlaces oficiales.

La Fase 1 de fluidez inmediata añade un diagnóstico inicial no calificable, una secuencia visible de **Aprende primero → Nora demuestra → Herramienta opcional → Ruta en 3 pasos → Práctica**, y un glosario contextual. Los términos subrayados de cada módulo se pueden abrir sin abandonar la página; además, el índice general reúne 28 conceptos con definición sencilla, ejemplo contable y pregunta de comprobación. La selección de ruta es reversible y se guarda únicamente en el navegador.

La Fase 2 añade **contexto continuo**: cada módulo indica qué documento puede aportar el usuario, qué campos debe contener, qué formato conviene y qué debe anonimizarse. La [guía de contexto continuo](docs/curso/contexto-continuo/README.md) incluye una tabla por módulo y una preparación mínima. Los archivos no se suben ni se almacenan en ContaIA.

El tutor funciona completamente en el navegador: no usa `fetch`, SSE, cuentas, proveedores externos ni almacenamiento de conversaciones. El historial se mantiene únicamente en memoria durante la sesión y no se incorpora al progreso, al CSV ni al portafolio. La interfaz identifica de forma visible que se trata de respuestas locales y no de un modelo generativo conectado.

La voz opcional usa `SpeechSynthesis` del navegador, está apagada por defecto, se activa mediante un clic explícito y puede cancelarse. Si el navegador no ofrece Web Speech API, el control queda deshabilitado. Los estados del tutor, el panel, el foco y la región de mensajes están preparados para teclado, lector de pantalla, móvil y `prefers-reduced-motion`.

[^1]: Alegra Academy. “Inteligencia Artificial para Contadores”. https://academy.alegra.com/courses/ia-para-contadores/
[^2]: Edutin. “Curso de IA para contabilidad”. https://edutin.com/curso-de-ia-para-contabilidad
[^3]: ContadorMx. “Inteligencia artificial aplicada a la contabilidad, finanzas e impuestos”. https://contadormx.net/cursos/inteligencia-artificial-aplicada-a-la-contabilidad-finanzas-e-impuestos/
