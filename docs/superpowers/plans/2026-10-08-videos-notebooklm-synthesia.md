# Integración de videos de clase con NotebookLM y Synthesia — Plan de implementación

> **Para agentes implementadores:** tareas ejecutadas y verificadas en la rama `feat/nora-tutora-ia-continua`.

**Objetivo:** Facilitar la creación de explicaciones de clase con NotebookLM y Synthesia, y mostrar únicamente videos publicados y revisados en el módulo o práctica correspondiente de ContaIA.

**Arquitectura:** NotebookLM se usa para sintetizar material curricular y preparar un guion fundamentado; Synthesia convierte el guion aprobado en el video narrado final. ContaIA no llama a esas plataformas ni almacena credenciales: ofrece un briefing copiable por módulo/práctica y un reproductor web que solo acepta el iframe oficial de Synthesia cuando el video está marcado como revisado. La producción y publicación real de cada video queda manual hasta proporcionar los enlaces aprobados.

**Stack:** JavaScript ES modules, HTML/CSS, Node test runner y Playwright ya existentes; sin dependencias nuevas.

**Spec:** Solicitud del usuario del 8 de octubre de 2026: preparar el plan y realizar un commit para integrar videos explicativos con NotebookLM y Synthesia, en cada módulo o tarea.

## Restricciones globales

- NotebookLM recibe solamente materiales curriculares o casos ficticios; nunca notas, progreso, respuestas, datos personales o confidenciales.
- NotebookLM no se invoca mediante una API desde el navegador: produce fuentes/briefings manuales.
- El resultado final reproducible en la web es el player embebido oficial de Synthesia: `https://share.synthesia.io/embeds/videos/{video_id}`.
- Nunca insertar HTML de iframe arbitrario ni renderizar un video sin `approved: true`; se requiere revisión docente porque el contenido generativo puede equivocarse.
- Cada video está asociado a un `moduleId` o `exerciseId`; las tarjetas sin enlace muestran estado «En preparación», no un reproductor roto.
- Videos públicos o incrustables pueden ser vistos fuera de la web; no subir material confidencial y usar permisos de Synthesia acordes a la audiencia.
- Mantener compatibilidad responsive y con `prefers-reduced-motion`; no añadir librerías.

## Enfoque de revisión

1. URL hostil, HTTP, dominio falso, ruta distinta, parámetros no permitidos o iframe no aprobado: no se debe incrustar.
2. Falta de video publicado o falta de aprobación: mostrar instrucciones/estado pendiente, sin iframe.
3. Briefing por práctica: no debe incluir selecciones ni respuestas del estudiante, solución modelo ni datos persistidos.
4. Fallo o ausencia de Clipboard API: explicar que no se pudo copiar sin romper navegación ni renderizado.
5. Un módulo abierto y una práctica en móvil: tarjeta legible, enlace al player con título accesible y sin impedir controles.

---

## Contrato de integración

Cada entrada en `src/course-videos.js` tiene este esquema:

```js
{
  approved: true,
  embedUrl: "https://share.synthesia.io/embeds/videos/<id>?language=es",
  title: "Explicación del módulo 1",
  duration: "3–5 min"
}
```

El catálogo se divide en `modules` y `exercises`, ambos inicialmente vacíos. Para publicar un video se agrega la entrada bajo el identificador curricular, después de revisar guion, afirmaciones y subtítulos. El renderer valida además el host, path y parámetro de idioma antes de construir el iframe.

## Archivos y responsabilidades

- `src/course-videos.js`: catálogo de URLs aprobadas, constructor del briefing NotebookLM desde datos curriculares y validador del URL oficial Synthesia.
- `src/main.js`: tarjetas de video en cada módulo y práctica, acción de copiar briefing y estados accesibles; no incluye conversación, notas o respuestas en los briefings.
- `src/styles.css`: card, reproductor 16:9, estados vacíos y responsive.
- `tests/course-videos.test.js`: pruebas de briefing, privacidad y validación de iframe.
- `tests/e2e/course-videos.spec.js`: comprobar tarjeta de módulo/práctica, estado pendiente, acción copiable y ausencia de iframe sin aprobación.
- `README.md`: flujo NotebookLM → revisión humana → Synthesia → enlace en catálogo → visualización en ContaIA, con advertencia de privacidad.

## Tarea 1: contrato seguro de video y briefing curricular — completada

- [x] Escribir y correr primero los tests de `buildVideoBrief({ module, exercise })`: incluir objetivo, fases, materiales/demostración y guion en español; excluir `solution` y datos del estudiante.
- [x] Implementar el catálogo vacío `{ modules: {}, exercises: {} }`, el constructor del briefing y la validación estricta del player oficial.
- [x] Validar aprobación explícita, HTTPS, host `share.synthesia.io`, ruta `/embeds/videos/<id>` y único parámetro permitido `language=es`.
- [x] Resultado: `node --test tests/course-videos.test.js` pasa (4 pruebas).

## Tarea 2: integración visible en curso y laboratorio — completada

- [x] Añadir tarjeta de video a cada ficha curricular y vista de práctica; sin entrada aprobada muestra «Video en preparación».
- [x] Añadir el botón «Copiar briefing para NotebookLM», enlaces externos a NotebookLM/Synthesia y estado accesible para éxito o fallo del portapapeles.
- [x] Renderizar iframe responsivo solo para una entrada aprobada; no insertar código HTML arbitrario.
- [x] Añadir aviso al estudiante cuando el reproductor externo de Synthesia esté activo.
- [x] Verificar en Playwright que los briefings de módulo/práctica se copian sin la solución y que el navegador no carga iframes sin aprobar, en escritorio y móvil.
- [x] Resultado: 6 pruebas E2E nuevas (3 flujos en escritorio y móvil) pasan.

## Tarea 3: documentación y verificación final — completada

- [x] Documentar el flujo: cargar fuentes educativas aprobadas en NotebookLM; generar overview/guion español; revisar citas, precisión y casos ficticios; producir en Synthesia; copiar el `src` oficial al catálogo solo tras la revisión docente.
- [x] Advertir sobre errores posibles de la IA, visibilidad fuera del curso y carga del player externo; prohibir material real/confidencial.
- [x] Ejecutar `npm test`, `npm run test:e2e -- --workers=2`, `npm run build:vercel`, `node --check src/course-videos.js`, `node --check src/main.js` y `git diff --check`.
- [x] Resultado: 57 pruebas unitarias y 34 pruebas E2E (incluidos proyectos de escritorio/móvil) pasan; build Vercel y checks de sintaxis/diff correctos.
- [x] Añadir el commit de integración a la rama del PR existente y actualizar el PR; no desplegar producción.

## Estado de publicación

La aplicación ya tiene tarjetas y briefings por cada módulo/tarea, pero el catálogo está vacío porque el usuario aún no ha proporcionado videos publicados y aprobados. No se generó contenido dentro de NotebookLM/Synthesia, no se subieron fuentes a esos servicios y no se desplegó Vercel. La implementación se entrega mediante un commit en la rama del PR existente.

## Referencias oficiales

- [NotebookLM: generar Video Overviews](https://support.google.com/gemininotebook/answer/16454555?hl=en)
- [Synthesia: compartir, incrustar y proteger videos](https://help.synthesia.io/en/articles/9189559-how-do-i-share-my-synthesia-video)
- [Synthesia: reproductor multilingüe y código de embed](https://docs.synthesia.io/docs/video-player)
