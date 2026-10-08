# Laboratorio ContaIA

Proyecto en español que reúne una propuesta de curso completo de IA para contaduría y un laboratorio interactivo con prácticas ficticias. El programa se organiza en dos secciones correlacionadas.

## Sección 1: plan de trabajo del curso

Consulta el [plan integral de 40 horas](docs/curso/plan-trabajo-curso-ia-contaduria.md): 10 módulos semanales, resultados de aprendizaje, actividades, evidencias, evaluación, proyecto integrador y correspondencia con cada práctica del laboratorio.
El [paquete didáctico detallado del Módulo 2](docs/curso/modulo-02/README.md) desarrolla la semana de diseño de instrucciones; el [índice de materiales por módulo](docs/curso/README.md) reúne los paquetes disponibles.

## Sección 2: laboratorio práctico

La [aplicación interactiva](https://8328-i143dgisqzurgn5srq8gm-85c68042.us3.manus.computer/) presenta las dos secciones en pestañas: **01 · Curso completo**, con los diez módulos y enlaces a los materiales disponibles, y **02 · Laboratorio práctico**, con nueve ejercicios originales inspirados en temas generales de cursos de Alegra Academy, Edutin y ContadorMx. No reproduce materiales propietarios ni sustituye esos cursos.[^1][^2][^3]

- **Prompts contables:** borrador libre con rúbrica visible, comprobación local y respuesta modelo.
- **Operación contable:** clasificación de una compra, conciliación de movimientos bancarios y lectura de una balanza.
- **Análisis:** preparación de un reporte ejecutivo ficticio y revisión prudente de una anomalía financiera.
- **México:** escenarios educativos sobre ISR, RESICO y privacidad en nómina.
- **Datos de ejemplo:** archivo CSV inventado, descargable desde el menú de la página.

Las prácticas ofrecen pistas, soluciones modelo y retroalimentación en el navegador. El sitio no llama a un modelo externo, no solicita cuentas y no guarda respuestas: el progreso existe solo durante la sesión actual y se reinicia al actualizar la página.

## Alcance y confidencialidad

Todos los nombres, movimientos e importes de los ejercicios son ficticios. **No pegues información real, personal o confidencial de clientes o empleados.** Los módulos sobre ISR, RESICO y nómina son didácticos: no calculan obligaciones ni constituyen asesoría contable, fiscal, laboral o legal. Para una situación real, verifica la normativa y los materiales oficiales vigentes y consulta a una persona profesional calificada.

## Requisitos y ejecución

- Node.js 22 o posterior.
- No hay dependencias npm externas.

```bash
node server.js
```

Abre `http://localhost:3000`. También está disponible `npm run dev`.

## Pruebas

```bash
node --test
```

Las pruebas verifican la rúbrica de prompts, las respuestas de opción múltiple y el cálculo de diferencia de una balanza. No validan interpretaciones tributarias.

## Estructura

```text
public/        Entrada HTML, favicon y manifiesto de rutas
src/           Interfaz, ejercicios y lógica local
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

[^1]: Alegra Academy. “Inteligencia Artificial para Contadores”. https://academy.alegra.com/courses/ia-para-contadores/
[^2]: Edutin. “Curso de IA para contabilidad”. https://edutin.com/curso-de-ia-para-contabilidad
[^3]: ContadorMx. “Inteligencia artificial aplicada a la contabilidad, finanzas e impuestos”. https://contadormx.net/cursos/inteligencia-artificial-aplicada-a-la-contabilidad-finanzas-e-impuestos/
