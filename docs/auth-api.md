# Acceso de ContaIA

`POST /api/auth` recibe `{ "identifier": "correo o alias", "password": "...", "captchaToken": "..." }` y devuelve una sesión de Supabase Auth cuando las credenciales son válidas. El token CAPTCHA solo se incluye cuando el widget está configurado; nunca se persiste ni se escribe en logs. Los alias se delegan a la Edge Function `login-by-alias`, que reenvía el token a Supabase Auth sin almacenarlo.

## Flujos protegidos

- **Inicio de sesión por correo o alias:** el navegador envía el token hCaptcha a `/api/auth`; el endpoint lo pasa a Supabase Auth y la Edge Function de alias lo conserva en el tránsito al flujo de contraseña.
- **Registro público:** `supabase.auth.signUp` recibe el token en `options.captchaToken` junto con la URL de confirmación.
- **Solicitud de recuperación:** `supabase.auth.resetPasswordForEmail` recibe el token en `captchaToken`. El formulario de actualización de contraseña posterior al enlace verificado no solicita otro desafío.

Cada token se guarda solo en memoria mientras el formulario está activo; tras el intento se borra y el widget se reinicia. La sesión se instala con `supabase.auth.setSession`, se conserva en el navegador y puede cerrarse desde `Cerrar sesión`.

## Configuración

En las variables del servidor de Vercel deben existir `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `HCAPTCHA_SITEKEY`. El endpoint `/api/cfdi/config` entrega al navegador únicamente la sitekey pública validada junto con la configuración publicable; no expone claves privadas. La sitekey debe estar autorizada para el dominio del sitio.

En la protección CAPTCHA de Supabase Auth configura la **secret key privada** de hCaptcha. No la añadas a Vercel, al frontend, a archivos versionados ni a mensajes. La Edge Function activa `login-by-alias` también debe conservar la validación y el reenvío del token.

Si `HCAPTCHA_SITEKEY` no está configurada, el sitio mantiene compatibilidad con instancias sin CAPTCHA. En producción, para que la protección sea efectiva, deben coincidir la sitekey del widget, el dominio permitido por hCaptcha y la secret key configurada en Supabase Auth.

Las funciones auxiliares de RLS y resolución de alias viven en el esquema no expuesto `private`. Solo el puente `public.resolve_login_email_for_service` tiene `EXECUTE` para `service_role`, y la Edge Function lo invoca usando su secreto interno. Las contraseñas nunca se almacenan en tablas propias; el navegador y Vercel nunca reciben la clave de servicio.
