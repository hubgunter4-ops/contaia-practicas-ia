# Especificación: Nora con Vercel AI Gateway

## Objetivo

Cambiar las llamadas del backend tutor de proveedores directos a Vercel AI Gateway, conservando OpenAI y Anthropic como rutas seleccionables, el streaming, el contexto didáctico y las protecciones existentes.

## Requisitos acordados

- Enrutar ambas opciones por `POST https://ai-gateway.vercel.sh/v1/chat/completions` usando `Authorization: Bearer <AI Gateway key>` y la interfaz compatible con OpenAI Chat Completions.
- Enviar IDs de modelo configurables con prefijo del proveedor: `openai/<modelo>` y `anthropic/<modelo>`. No fijar un modelo de producción sin elección/configuración explícita.
- Usar claves Gateway diferentes para conservar topes separados: `AI_GATEWAY_OPENAI_API_KEY` y `AI_GATEWAY_ANTHROPIC_API_KEY`; los modelos serán `AI_GATEWAY_OPENAI_MODEL` y `AI_GATEWAY_ANTHROPIC_MODEL`.
- Configurar en Vercel un presupuesto mensual de **USD 10 por cada clave**. Estos topes son **por clave**, no un presupuesto agregado del proyecto; al crear las claves, restringirlas al proyecto ContaIA si la consola permite fijar `projectId`. Las claves no se reutilizarán en otras aplicaciones. El límite es suave: la solicitud que lo cruza puede completarse y producir un pequeño exceso.
- Aprovechar el crédito gratuito de AI Gateway si el equipo califica y los modelos elegidos están en el catálogo gratuito. No comprar créditos, habilitar recargas automáticas ni iniciar pagos desde esta tarea. La pantalla aportada muestra USD 5/mes para un subconjunto de modelos; la documentación indica que el nivel gratuito limita los modelos y el tráfico. Comprar créditos cambia el plan de créditos y deja de aplicar el crédito mensual gratuito.
- No guardar ni pedir claves en el chat, no incluirlas en Git y no usar claves directas de OpenAI/Anthropic en este backend.
- Conservar las validaciones de entrada, el contexto canónico, la exclusión de respuestas/notas/progreso privados, la disponibilidad continua de Nora, CORS, límite básico de solicitudes y ausencia de fallback local.
- Cuando un presupuesto/saldo se agote (HTTP 402), el tutor mostrará un aviso seguro; ante 401/429/u otros errores, no divulgará cuerpo del proveedor, claves ni diagnósticos sensibles.

## Contrato de API verificado

La ruta OpenAI-compatible de Gateway usa `https://ai-gateway.vercel.sh/v1` como base, `POST /chat/completions`, `messages`, `stream: true`, IDs de modelo que incluyen el proveedor y respuestas SSE compatibles con OpenAI (`choices[0].delta.content`, evento final `data: [DONE]`). La misma API de Chat Completions admite modelos Anthropic usando su identificador `anthropic/<modelo>`.

## Fuentes oficiales consultadas

- [OpenAI Chat Completions API con AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions)
- [Solicitudes Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/chat-completions)
- [Streaming Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/streaming)
- [Claves API de AI Gateway](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys)
- [Presupuestos de AI Gateway](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)
- [Precios, nivel gratuito y créditos](https://vercel.com/docs/ai-gateway/pricing)
- [Autenticación y BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok)
- [Modelos disponibles](https://vercel.com/ai-gateway/models)

## Límite de alcance

Esta especificación cubre código, documentación y pruebas del backend. El proyecto Vercel mostrado como `one` es una app Next.js/Vercel Drop y no es el repo ContaIA; no agregar secretos allí ni reemplazar su despliegue. Para activar el backend hace falta un proyecto Vercel conectado a `hubgunter4-ops/contaia-practicas-ia`, crear las dos claves con sus presupuestos y guardarlas como secretos. El acceso del conector Vercel al ámbito personal y la autorización de My Browser siguen pendientes; no se desplegará ni se crearán/pegarán secretos hasta resolverlos.

## Estado de implementación

El backend Gateway, las pruebas sin claves reales, el ejemplo de entorno y la documentación están implementados en `feat/nora-vercel-ai-gateway`. La validación completa registró 60 pruebas unitarias, 34 E2E y build Vercel correctos. No se han configurado claves, creado un proyecto ContaIA ni desplegado el backend: ese paso requiere que la cuenta Vercel permita vincular el repositorio correcto y que la propietaria cree las claves directamente en Vercel.
