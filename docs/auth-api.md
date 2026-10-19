# Acceso de ContaIA

`POST /api/auth` recibe `{ "identifier": "correo electrónico", "password": "..." }` y devuelve una sesión de Supabase Auth cuando las credenciales son válidas. Los errores de autenticación usan un mensaje genérico para no confirmar si existe una cuenta.

Las funciones auxiliares de RLS y resolución de alias viven en el esquema no expuesto `private`. El endpoint público no llama funciones RPC de alias; por tanto, el acceso actual requiere correo electrónico. Las contraseñas nunca se almacenan en tablas propias. La sesión se instala en el cliente con `supabase.auth.setSession`, se conserva en el navegador y puede cerrarse desde el botón `Cerrar sesión`.

Para habilitar producción deben existir `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el proyecto Vercel. Las cuentas se crean mediante un flujo administrativo o de alta de cuenta autenticado; esta entrega implementa el acceso, no el registro público.
