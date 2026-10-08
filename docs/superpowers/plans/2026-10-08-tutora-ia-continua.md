# Nora como tutora IA durante todo el curso

**Estado:** implementación terminada y validada localmente. El sitio no se desplegó: falta configurar credenciales/orígenes en Vercel y publicar mediante un despliegue autorizado.

## Objetivo confirmado

Nora acompaña desde la bienvenida hasta el proyecto integrador, entiende el módulo o ejercicio actual y responde mediante un backend IA seguro. La ruta principal organiza el curso de 40 horas en 10 módulos; cada clase repite el mismo orden didáctico. Se conservan el progreso, las notas, la base local y el portafolio.

**Arquitectura:** SPA estática con Vercel Functions Node para listar proveedores y transmitir respuestas SSE. El cliente solo contacta la API del tutor. OpenAI y Anthropic son configurables desde el servidor; no existe una respuesta local de sustitución. El historial vive solo en memoria, durante la pestaña actual.

**Referencia visual:** poses de Nora del repositorio `hubgunter4-ops/practica-bot`, optimizadas a WebP e integradas en `public/assets/nora/` con animación CSS accesible.

## Alcance implementado

### Secuencia del curso y animación

- La portada prioriza el itinerario, el inicio con Nora y las herramientas secundarias plegadas.
- Cada uno de los diez módulos muestra en orden: activación y objetivo (15 min), concepto y demostración (35), práctica guiada (80), revisión/reflexión (40) y cierre/evidencia (10). La hora independiente queda separada.
- La agenda, la práctica vinculada y el proyecto integrador del módulo 10 conservan la estructura del plan del curso.
- Hay un solo panel tutor en curso, laboratorio y base de estudio. El contexto cambia con la navegación; el hilo permanece hasta recargar y la vista se pliega al cambiar de práctica para despejar controles.
- Estados visuales animados: disponible, pensando, explicando y celebrando. Se respeta `prefers-reduced-motion`; la voz sigue apagada por defecto y requiere activación explícita.

### Backend IA y protección de datos

- `GET /api/tutor/config` publica nombres/modelos habilitados, nunca claves.
- `POST /api/tutor/stream` valida proveedor, mensaje, módulo, práctica y etapa; envía respuesta gradual mediante eventos SSE y permite cancelar.
- El servidor recibe el mensaje, hasta ocho turnos recientes y el contexto curricular canónico. No se envían progreso, notas, respuestas de ejercicios, selecciones ni portafolio. La solución de práctica queda fuera del contexto antes de comparar.
- Las claves se definen como variables privadas de Vercel o del `.env` local. Se documentan `AI_PROVIDER_DEFAULT`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` y `TUTOR_ALLOWED_ORIGINS`.
- El servidor local sirve las mismas rutas API para desarrollo. La página GitHub Pages puede apuntar a una URL de API Vercel mediante `public/tutor-config.js`, sin colocar secretos allí.
- Sin proveedor o ante error, Nora informa el problema y no fabrica una respuesta. El límite de solicitudes por IP en memoria es básico y no reemplaza un rate limiter distribuido a escala.
- CORS no es autenticación: antes de añadir una clave real al proyecto público, configurar límites de gasto del proveedor y protección/rate limiting distribuido de Vercel; el endpoint puede recibir llamadas directas.

## Validaciones ejecutadas

- `npm test`: **53 pruebas aprobadas**, 0 fallidas.
- `npm run test:e2e -- --workers=2`: **28 pruebas aprobadas** en Chromium de escritorio y móvil.
- `npm run build:vercel`: salida estática generada correctamente en `dist/`.
- `node --check` para cliente, servidor y adaptadores; `git diff --check` sin errores.
- HTTP local sin claves: configuración responde sin proveedores; el stream responde 503 comprensible; archivos WebP y JavaScript se sirven con su MIME correcto.
- E2E con el backend simulado: no consume llamadas ni créditos de OpenAI/Anthropic.

## Activación pendiente en Vercel

1. Importar `hubgunter4-ops/contaia-practicas-ia` en el proyecto Vercel.
2. Usar `npm run build:vercel` y `dist/` como salida. `vercel.json` publica las Functions `/api/tutor/config` y `/api/tutor/stream` junto al sitio estático.
3. Configurar protección/rate limiting en Vercel y límites de gasto del proveedor. CORS por sí solo no protege el endpoint contra llamadas directas.
4. Definir proveedor, clave y modelo en Environment Variables de Vercel; no pegarlos en el chat, el front-end ni GitHub.
5. Si se mantiene GitHub Pages como front-end, fijar la URL Vercel en `public/tutor-config.js` y permitir en `TUTOR_ALLOWED_ORIGINS` el origen HTTPS exacto de Pages. Si sitio y API comparten dominio, no hace falta una lista adicional.
6. Desplegar en Vercel y hacer una prueba con un mensaje ficticio, tras autorizar/publicar el entorno.

## Referencias oficiales consultadas

- [Vercel Functions: streaming](https://vercel.com/docs/functions/streaming-functions)
- [Configuración `vercel.json`](https://vercel.com/docs/project-configuration/vercel-json)
- [Variables de entorno de Vercel](https://vercel.com/docs/environment-variables)
