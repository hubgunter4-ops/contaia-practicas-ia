# API server-side de Herramientas

El proyecto actual sirve funciones Vercel desde `api/`; por eso el endpoint operativo es `GET|POST|PATCH /api/tools`. La misma lógica está disponible como Route Handler compatible con Next.js en `app/api/tools/route.js`.

El Centro de herramientas ofrece el analizador CFDI y la administración del perfil fiscal. Contabilidad, Nómina, DIOT y Monitor fiscal aún se muestran como preparación; registrar una conexión solo guarda metadatos con estado pendiente.

Todas las operaciones requieren `Authorization: Bearer <supabase access token>`. El servidor crea un cliente Supabase con la clave publicable y reenvía el JWT del usuario; nunca usa `service_role`, por lo que las políticas RLS de los perfiles fiscales son obligatorias.

## Recursos

- `GET /api/tools?resource=profiles`: lista hasta 100 perfiles visibles para la cuenta.
- `POST /api/tools?resource=profiles`: crea un perfil con `legal_name`, `rfc` y campos fiscales opcionales.
- `PATCH /api/tools?resource=profiles&id=<uuid>`: actualiza campos del perfil.
- `GET /api/tools?resource=connections&profileId=<uuid>`: lista conexiones del perfil.
- `POST /api/tools?resource=connections`: crea una conexión con `profile_id`, `tool_key`, `environment` y estado.
- `PATCH /api/tools?resource=connections&id=<uuid>`: actualiza una conexión.
- `GET /api/tools?resource=alerts&profileId=<uuid>`: lista alertas.
- `PATCH /api/tools?resource=alerts&id=<uuid>`: cambia únicamente su estado.
- `GET /api/tools?resource=deadlines&profileId=<uuid>`: lista vencimientos.
- `PATCH /api/tools?resource=deadlines&id=<uuid>`: cambia únicamente su estado.

Los cuerpos están limitados a 32 KB, se validan RFC, código postal, correo, UUID, herramienta, ambiente y estados. La API rechaza nombres de campos relacionados con secretos, CSD, certificados, contraseñas o tokens. Las credenciales sensibles no se reciben ni se persisten desde esta ruta.

La interfaz del Centro de herramientas usa `src/tools/client.js` y la sesión Supabase ya inicializada por la aplicación. Por ahora, el panel registra las conexiones como `pending` con proveedor `pending`; esto solo guarda metadatos administrativos y no configura, verifica ni contacta una integración externa.

## Variables necesarias

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY` como compatibilidad)
- `TUTOR_ALLOWED_ORIGINS` opcional para orígenes adicionales
