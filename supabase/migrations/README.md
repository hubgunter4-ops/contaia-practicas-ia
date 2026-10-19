# Migraciones Supabase

Estas migraciones se versionan junto con el código y solo agregan la tabla de historial CFDI. Se aplicaron al proyecto `NoraCFDI` (referencia `rjdhfajtttejskhuplzq`) mediante la conexión Supabase autorizada:

- `20261010225503`: crea `public.cfdi_analysis_runs`, establece límites de JSON, activa RLS y concede a `authenticated` únicamente `SELECT`, `INSERT` y `DELETE`.
- `20261010225546`: recrea las políticas de propietario con `(select auth.uid())` para conservar el mismo aislamiento y evitar reevaluación por fila.

No se guarda XML bruto ni nombre local de archivo en la tabla. El frontend nunca ejecuta SQL ni recibe una clave `service_role`. No se modificaron tablas preexistentes. La revisión del proyecto observó aparte una función preexistente `public.rls_auto_enable()` con permiso de ejecución para `anon` y `authenticated`; requiere valoración independiente.

## Herramientas y perfil fiscal

La migración `20261018103000_tools_fiscal_profiles.sql` prepara `fiscal_profiles`, `fiscal_profile_members`, `tool_connections`, `fiscal_alerts` y `fiscal_deadlines`. Las credenciales sensibles no se guardan en Supabase: `tool_connections.credential_ref` solo puede contener una referencia a un almacén de secretos externo. Todas las tablas tienen RLS y se aíslan por perfil fiscal y usuario autenticado.

La migración se aplicó remotamente en ambos proyectos después de restaurarlos:

- `NoraCFDI` (`rjdhfajtttejskhuplzq`): migración registrada como `20261018161949`.
- `NoraCFDI1` (`bbkuhbsgvfrsfwkzzedy`): migración registrada como `20261018161950`.

Ambos proyectos están ahora `ACTIVE_HEALTHY`; las cinco tablas aparecen con RLS habilitado y las consultas de prueba reportan cero perfiles y cero conexiones, sin datos creados durante la verificación.

La migración `20261019011000_auth_usernames.sql` añade `user_login_names` para permitir el acceso con alias además de correo. El endpoint de login resuelve el alias mediante `resolve_login_email` y después autentica con Supabase Auth; nunca guarda ni transmite contraseñas a tablas propias. Los alias deben ser creados por un flujo administrativo o de alta de cuenta autenticado.
