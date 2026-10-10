# Integración propuesta: Anam + Nora

**Estado:** integración de cliente y endpoint implementados localmente; no se configuró una clave Anam, no se inició una sesión real y no se desplegó este cambio. La conexión en vivo permanece inactiva hasta definir IDs válidos de avatar/voz y configurar los secretos en Vercel.

## Encaje con ContaIA

Anam ofrece una sesión WebRTC de avatar con voz y sincronización facial en vivo. Su SDK de JavaScript permite `CUSTOMER_CLIENT_V1`: Anam captura/transcribe la voz y representa el avatar, mientras ContaIA conserva el control del LLM y su lógica didáctica.

La ruta elegida es el modo **Custom LLM client-side** de Anam, no delegar las instrucciones de Nora a un modelo administrado por Anam. El cliente recibe solo el turno hablado del estudiante, lo asocia a la clase/fase actual y lo envía al backend existente de Nora. No manda notas, selecciones, portafolio ni progreso local. La respuesta SSE de Nora se reenvía por fragmentos a `createTalkMessageStream()`, que sincroniza voz y movimiento facial.

## Cambios técnicos que serían necesarios

1. **Token de sesión server-side (implementado):** `/api/tutor/anam-session` usa `ANAM_API_KEY` para solicitar un token temporal de Anam. El navegador recibe solo el JWT corto, nunca la clave. La función requiere POST, valida origen, limita solicitudes como protección adicional y no registra payloads ni respuestas upstream.
2. **Avatar/voz (configuración pendiente):** las variables privadas `ANAM_AVATAR_ID` y `ANAM_VOICE_ID` deben contener los UUID confirmados en la cuenta de Anam. La selección de producto es **Mia (Studio)** y **Daniela (español de México)**; no se inventan IDs, ya que aún no han sido verificados en la cuenta que usará el despliegue.
3. **Puente de streaming (implementado):** el flujo SSE del endpoint existente `/api/tutor/stream` continúa gobernando las respuestas. El navegador mantiene la validación de contexto, límites e historial del backend actual y convierte cada fragmento a voz Anam. El SDK se empaqueta localmente como ESM en el build, no se carga por CDN.
4. **Interfaz (implementada):** el aula conserva el chat y ofrece controles explícitos de conexión/fin, estado accesible, video inline y fallback al chat/narración del navegador ante fallos. No se solicita cámara. Cambiar de clase mantiene la conexión, salir del aula o cerrar la pestaña la termina.
5. **Privacidad/operación:** el endpoint desactiva session replay. El esquema de token efímero consultado no ofrece el campo `zeroDataRetention` en la misma alternativa que permite `CUSTOMER_CLIENT_V1`, así que no se debe afirmar ZDR para esta ruta. Anam recibe el audio del micrófono para transcribir el turno; el backend de ContaIA recibe únicamente el texto del turno para generar respuesta. La API key jamás llega al cliente. Antes de producción hay que revisar las políticas de retención del proveedor y la configuración de voz, configurar en Vercel `ANAM_API_KEY` como secreto y `ANAM_AVATAR_ID`/`ANAM_VOICE_ID` como valores no secretos, revisar precio/límites y realizar una sesión real. Este cambio no se ha desplegado.

## Identidad visual y voz seleccionadas

Los assets actuales de Nora son ilustraciones WebP de un robot vertical; para el modo en vivo se seleccionó un avatar humano de catálogo Anam, **Mia (Studio)**, con voz **Daniela (México)**, manteniendo el nombre y personalidad de Nora en ContaIA. La selección/etiqueta debe contrastarse en el panel de la organización y obtener sus IDs antes de habilitar producción. El avatar humano reemplaza temporalmente la ilustración durante la conexión en vivo; al desconectar vuelve la ilustración existente.

La calidad de lip-sync depende del asset/modelo y de la voz disponibles en la cuenta Anam. No se ha verificado en una sesión conectada porque falta la credencial segura y los IDs exactos de catálogo. El micrófono se solicita solo tras pulsar el botón de conexión; de no habilitarse, el aula y el chat siguen disponibles.

## Referencias oficiales

- [Índice de documentación Anam](https://anam.ai/docs/llms.txt)
- [JavaScript SDK: producción y tokens de sesión](https://anam.ai/docs/javascript-sdk/production)
- [Custom LLMs y streaming](https://anam.ai/docs/personas/llms/custom-llms)
- [Ejemplo de Custom LLM del lado cliente](https://anam.ai/cookbook/custom-llm-client-side)
- [Mensajes de usuario del SDK](https://anam.ai/docs/javascript-sdk/reference/user-messages)
- [Comandos de voz/stream del SDK](https://anam.ai/docs/javascript-sdk/reference/talk-commands)
- [Modelos de avatar](https://anam.ai/docs/introduction/models)
- [Buenas prácticas de avatar personalizado](https://anam.ai/docs/personas/avatars/custom-avatar-best-practices)
