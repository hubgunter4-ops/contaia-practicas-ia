# Acceso de ContaIA

`POST /api/auth` recibe `{ "identifier": "correo o alias", "password": "..." }` y devuelve una sesión de Supabase Auth cuando las credenciales son válidas. Los alias se delegan a la Edge Function `login-by-alias`; el navegador y Vercel nunca reciben la clave de servicio.

Las funciones auxiliares de RLS y resolución de alias viven en el esquema no expuesto `private`. Solo el puente `public.resolve_login_email_for_service` tiene `EXECUTE` para `service_role`, y la Edge Function lo invoca usando su secreto interno. Las contraseñas nunca se almacenan en tablas propias. La sesión se instala en el cliente con `supabase.auth.setSession`, se conserva en el navegador y puede cerrarse desde el botón `Cerrar sesión`.

Para habilitar producción deben existir `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el proyecto Vercel y la Edge Function debe conservar sus secretos administrados por Supabase. Las cuentas y alias se crean mediante un flujo administrativo o de alta de cuenta autenticado; esta entrega implementa el acceso, no el registro público.
