# Próximos pasos para cerrar ContaIA

Este documento resume el trabajo sugerido después del despliegue `0873e86`. El alcance se limita a planificación: no implica ejecutar cambios de producción ni modificar secretos.

## 1. Verificar el estado publicado

- Confirmar que el deployment de `main` corresponde al commit esperado y que las comprobaciones de GitHub/Vercel terminaron.
- Probar en el sitio publicado `/api/tutor/config` y `/api/cfdi/config`; el estado observado durante la última revisión fue Nora disponible con OpenAI y CFDI con Supabase deshabilitado.
- No registrar claves, tokens ni datos de usuarios en esta documentación o en los logs de pruebas.

## 2. Habilitar y validar Supabase para CFDI

- Configurar en Vercel Production `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` con los valores públicos correctos del proyecto; nunca usar `service_role` en el navegador.
- Verificar que la autenticación y sus redirects estén configurados para el dominio de producción.
- Probar con una cuenta autenticada que se pueda guardar, consultar y borrar un análisis, y confirmar que RLS impide el acceso cruzado entre usuarios.
- Repetir una consulta CFDI sintética y comprobar que el XML se procesa localmente y que solo se persiste el resumen normalizado previsto.

## 3. Validar Nora y Anam con servicios reales

- Hacer una prueba manual de extremo a extremo en producción: respuesta de Nora, consentimiento del navegador, inicio de streaming, audio/video, interrupción, reconexión y cierre.
- Confirmar que micrófono y video solo se activan tras una acción explícita y que el chat sigue disponible si Anam falla.
- Revisar logs y controles de uso sin copiar claves ni contenido privado de conversaciones.

## 4. Completar el producto educativo

- Preparar y enlazar materiales descargables de los módulos 3–10, manteniendo ejemplos ficticios y fuentes verificables.
- Diseñar e integrar el diagnóstico inicial, la evaluación final y una revisión responsable del trabajo; reutilizar la lógica existente de `src/phase5.js` cuando proceda.
- Añadir pruebas unitarias y E2E de esos recorridos antes de publicarlos.

## 5. Cierre de experiencia y documentación

- Definir un asset fijo aprobado del avatar Anam para el estado inactivo, sin activar streaming automáticamente.
- Revisar teclado, foco, contraste, lectura asistida y diseño móvil de forma manual.
- Aclarar si la regla de no mostrar duraciones aplica solo a la interfaz o también a materiales curriculares descargables; ajustar el contenido una vez decidido.
- Actualizar README, TODO y plan de trabajo para que describan la arquitectura desplegada y el estado real de Supabase, Anam y los materiales.
- Tratar videos por módulo como opcionales salvo que se decida que forman parte del alcance del producto.

## Orden sugerido

1. Estado de producción y Supabase.
2. Prueba real de Nora/Anam.
3. Materiales y evaluaciones educativas.
4. Revisión visual/accesibilidad y documentación final.

**Criterio de cierre:** producción verificada, persistencia CFDI probada con RLS, conversación/avatar comprobados con servicios reales, recorridos educativos principales completos y documentación alineada con el producto publicado.
