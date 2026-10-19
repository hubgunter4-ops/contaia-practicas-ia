# Acceso de ContaIA

`POST /api/auth` recibe `{ "identifier": "correo o usuario", "password": "..." }` y devuelve una sesión de Supabase Auth cuando las credenciales son válidas. Los errores de autenticación usan el mismo mensaje genérico para no confirmar si existe un correo o usuario.

Los alias se guardan en `public.user_login_names` y se resuelven mediante `public.resolve_login_email`. Las contraseñas nunca se almacenan en tablas propias. La sesión se instala en el cliente con `supabase.auth.setSession`, se conserva en el navegador y puede cerrarse desde el botón `Cerrar sesión`.

Para habilitar producción deben existir `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el proyecto Vercel. Las cuentas y alias se crean mediante un flujo administrativo o de alta de cuenta autenticado; esta entrega implementa el acceso, no el registro público.
