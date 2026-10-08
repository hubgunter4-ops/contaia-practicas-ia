# Fase 4 — Revisión, preview y entrega controlada

**Fecha:** 2026-10-08  
**Repositorio:** `hubgunter4-ops/contaia-practicas-ia`  
**Commit revisado:** `14382af` (`feat: expand contextual glossary`)  
**Rama:** `main`

## Resultado

**Aprobada con las verificaciones automatizadas y manuales ejecutadas.** La implementación conserva el tutor local, el glosario contextual y el contexto documental sin añadir proveedor remoto, API de tutor ni almacenamiento de conversaciones.

## Evidencias

| Revisión | Resultado |
| --- | --- |
| `git diff --check` | Correcto; árbol limpio al iniciar la revisión |
| Sintaxis de `src/main.js`, `src/course.js`, `src/glossary.js` | Correcta |
| `npm test` | Correcto: 34 pruebas unitarias |
| `npm run test:e2e` | Correcto: 24 pruebas E2E |
| Chromium y móvil | Correcto en Playwright |
| Patrones prohibidos en tutor/UI (`OPENAI_API_KEY`, URLs de proveedores, `fetch`) | No encontrados |
| Archivos `.env` y logs en el proyecto | No encontrados |
| Ruta `/api/tutor` | `404`, no existe endpoint remoto |
| Preview `/` | `200 OK`, HTML servido correctamente |
| Recursos `src/main.js` y `src/glossary.js` | Servidos y verificados |
| Consola del navegador | Sin mensajes |
| Glosario contextual | Índice abierto; 28 entradas; Prompt muestra definición, ejemplo y comprobación |
| GitHub Actions | Tests y E2E exitosos |
| GitHub Pages | Despliegue exitoso y contenido público verificado |

## Revisión manual

Se comprobó en la preview:

1. Entrada al curso y navegación desde el laboratorio.
2. Diagnóstico inicial de Nora.
3. Apertura del índice general del glosario.
4. Consulta de una definición ampliada de **Prompt**.
5. Presencia de términos clicables dentro del primer módulo.
6. Presencia de la guía modular, contexto documental y demostración antes/después.
7. Carga de los enlaces de curso y prácticas vinculadas.
8. Ausencia de errores en consola.

## Seguridad y privacidad

- El tutor sigue siendo local.
- No se agregaron credenciales ni archivos `.env`.
- No se agregaron datos reales.
- Las respuestas y conversaciones no se persisten.
- El progreso aprobado permanece separado del historial del tutor.
- El glosario no requiere red ni cuenta.
- El contexto documental recuerda no subir archivos a ContaIA y anonimizar información sensible.

## Observaciones

- `package-lock.json` existe como lockfile intencional para reproducir las dependencias de Playwright en CI; no es un archivo accidental.
- GitHub muestra avisos de infraestructura sobre acciones que apuntan a Node.js 20 y la futura migración de `ubuntu-latest`; no afectan el resultado actual, que ejecuta con Node.js 24.
- El sitio ya cuenta con publicación permanente habilitada por decisiones anteriores. Esta revisión no cambió permisos, visibilidad ni configuración de cuenta.

## Referencias

- [Sitio publicado](https://hubgunter4-ops.github.io/contaia-practicas-ia/)
- [Workflow de pruebas](https://github.com/hubgunter4-ops/contaia-practicas-ia/actions/runs/37744013103)
- [Workflow de despliegue](https://github.com/hubgunter4-ops/contaia-practicas-ia/actions/runs/37744013122)
