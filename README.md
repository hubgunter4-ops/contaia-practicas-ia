# Laboratorio ContaIA

Página interactiva en español para practicar el uso responsable de IA en tareas contables. Reúne ejercicios originales inspirados en temas presentes en cursos de Alegra Academy, Edutin y ContadorMx; no reproduce materiales propietarios ni sustituye esos cursos.

## Qué incluye

- **Prompts contables:** borrador libre con rúbrica visible, comprobación local y respuesta modelo.
- **Operación contable:** clasificación de una compra, conciliación de movimientos bancarios y lectura de una balanza.
- **Análisis:** preparación de un reporte ejecutivo ficticio y revisión prudente de una anomalía financiera.
- **México:** escenarios educativos sobre ISR, RESICO y privacidad en nómina.
- **Datos de ejemplo:** archivo CSV inventado, descargable desde el menú de la página.

Las prácticas ofrecen pistas, soluciones modelo y retroalimentación en el navegador. El sitio no llama a un modelo externo, no solicita cuentas y no guarda respuestas: el progreso existe solo durante la sesión actual y se reinicia al actualizar la página.

## Alcance y confidencialidad

Todos los nombres, movimientos e importes de los ejercicios son ficticios. **No pegues información real, personal o confidencial de clientes o empleados.** Los módulos sobre ISR, RESICO y nómina son didácticos: no calculan obligaciones ni constituyen asesoría contable, fiscal, laboral o legal. Para una situación real, verifica la normativa y los materiales oficiales vigentes (por ejemplo, las publicaciones del SAT) y consulta a una persona profesional calificada.

## Referencias temáticas

Los ejercicios se construyeron de forma independiente tomando como inspiración los temas generales descritos en estas páginas:

- [Alegra Academy — Inteligencia Artificial para Contadores](https://academy.alegra.com/courses/ia-para-contadores/)
- [Edutin — Curso de IA para contabilidad](https://edutin.com/curso-de-ia-para-contabilidad)
- [ContadorMx — IA aplicada a contabilidad, finanzas e impuestos](https://contadormx.net/cursos/inteligencia-artificial-aplicada-a-la-contabilidad-finanzas-e-impuestos/)

## Requisitos

- Node.js 22 o posterior.
- No hay dependencias npm externas.

## Ejecutar

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
tests/         Pruebas Node.js
server.js      Servidor estático local sin dependencias
app.config.ts  Metadatos del proyecto Webdev
plan.md        Plan y decisiones de diseño aprobadas
TODO.md        Criterios de alcance y estado del producto
```

## Repositorio

El proyecto se entrega en el repositorio privado de GitHub indicado en la respuesta. El sitio no requiere credenciales, base de datos ni configuración de servicios externos.
