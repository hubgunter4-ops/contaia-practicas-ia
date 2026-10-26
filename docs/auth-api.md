# Acceso de ContaIA

`POST /api/auth` recibe `{ "identifier": "correo o alias", "password": "...", "captchaToken": "..." }` y devuelve una sesión de Supabase Auth cuando las credenciales son válidas. El token CAPTCHA solo se incluye cuando el proveedor está configurado; vive en memoria durante el intento, nunca se persiste ni se escribe en logs. Los alias se delegan a la Edge Function `login-by-alias`, que reenvía el token a Supabase Auth sin almacenarlo.

## Flujos protegidos

El inicio de sesión por correo o alias envía `captchaToken` a `/api/auth`; el endpoint lo pasa a Supabase Auth y la Edge Function de alias mantiene el tránsito del token. El registro usa `supabase.auth.signUp` con `options.captchaToken` junto con la URL de confirmación. La solicitud de recuperación usa `supabase.auth.resetPasswordForEmail` con `captchaToken`; el formulario de actualización de contraseña posterior al enlace verificado no solicita otro desafío.

Después de cada intento, el cliente borra el token en memoria y reinicia el widget. La sesión se instala con `supabase.auth.setSession`, se conserva en el navegador y puede cerrarse desde `Cerrar sesión`.

## Configuración de producción

En Vercel se configuran `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CAPTCHA_PROVIDER=turnstile` y `TURNSTILE_SITEKEY`. La sitekey es pública. `/api/cfdi/config` solo entrega el proveedor seleccionado y esa sitekey validada junto con la configuración publicable de Supabase; no expone claves privadas. El widget de Cloudflare debe autorizar el hostname público de ContaIA.

En Supabase Auth se activa la protección CAPTCHA, se selecciona Cloudflare Turnstile y se guarda la **secret key privada** del widget. Mediante Management API, los campos equivalentes son `security_captcha_enabled=true`, `security_captcha_provider="turnstile"` y `security_captcha_secret`; el endpoint es `PATCH /v1/projects/{ref}/config/auth`. La secret key nunca debe agregarse a Vercel, al frontend, a archivos versionados, a logs ni a mensajes. Supabase Auth valida el token recibido; ContaIA no implementa una segunda llamada propia a `siteverify`.

Para desarrollo local usa un widget de prueba o mocks; no añadas `localhost` a la allowlist del widget de producción. Mientras dure la transición, el servidor conserva una opción explícita de reversión a hCaptcha mediante `CAPTCHA_PROVIDER=hcaptcha` y `HCAPTCHA_SITEKEY`. No se debe asumir que la secret key hCaptcha actualmente guardada sea válida: los registros previos mostraron fallos de validación, por lo que el rollback requiere verificar una secret key hCaptcha funcional.

Las funciones auxiliares de RLS y resolución de alias viven en el esquema no expuesto `private`. Solo el puente `public.resolve_login_email_for_service` tiene `EXECUTE` para `service_role`, y la Edge Function lo invoca usando su secreto interno. Las contraseñas nunca se almacenan en tablas propias; el navegador y Vercel nunca reciben la clave de servicio.
