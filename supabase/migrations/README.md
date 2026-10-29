# Migraciones Supabase

Estas migraciones se versionan junto con el código y agregan el historial CFDI, el progreso de aprendizaje y las tablas de herramientas. Se aplicaron al proyecto `NoraCFDI` (referencia `rjdhfajtttejskhuplzq`) mediante la conexión Supabase autorizada:

- `20261010225503`: crea `public.cfdi_analysis_runs`, establece límites de JSON, activa RLS y concede a `authenticated` únicamente `SELECT`, `INSERT` y `DELETE`.
- `20261010225546`: recrea las políticas de propietario con `(select auth.uid())` para conservar el mismo aislamiento y evitar reevaluación por fila.
- `20261024003500`: crea `learning_progress`, una fila privada por usuario para sincronizar módulo, fase, paso y completados; el texto de respuestas no forma parte del payload. Debe aplicarse en `NoraCFDI` antes de habilitar la lectura remota.

No se guarda XML bruto ni nombre local de archivo en la tabla. El frontend nunca ejecuta SQL ni recibe una clave `service_role`. No se modificaron tablas preexistentes. La revisión del proyecto observó aparte una función preexistente `public.rls_auto_enable()` con permiso de ejecución para `anon` y `authenticated`; requiere valoración independiente.

## Herramientas y perfil fiscal

La migración `20261018103000_tools_fiscal_profiles.sql` prepara `fiscal_profiles`, `fiscal_profile_members`, `tool_connections`, `fiscal_alerts` y `fiscal_deadlines`. Las credenciales sensibles no se guardan en Supabase: `tool_connections.credential_ref` solo puede contener una referencia a un almacén de secretos externo. Todas las tablas tienen RLS y se aíslan por perfil fiscal y usuario autenticado.

La migración se aplicó remotamente en ambos proyectos después de restaurarlos:

- `NoraCFDI` (`rjdhfajtttejskhuplzq`): migración registrada como `20261018161949`.
- `NoraCFDI1` (`bbkuhbsgvfrsfwkzzedy`): migración registrada como `20261018161950`.

Ambos proyectos están ahora `ACTIVE_HEALTHY`; las cinco tablas aparecen con RLS habilitado y las consultas de prueba reportan cero perfiles y cero conexiones, sin datos creados durante la verificación.

La migración `20261019011000_auth_usernames.sql` añade `user_login_names` para permitir el acceso con alias además de correo. El endpoint de login resuelve el alias mediante `resolve_login_email` y después autentica con Supabase Auth; nunca guarda ni transmite contraseñas a tablas propias. Los alias deben ser creados por un flujo administrativo o de alta de cuenta autenticado.

La migración `20261019030000_private_auth_helpers.sql` mueve las funciones auxiliares al esquema no expuesto `private`, actualiza las políticas RLS para usar `private.is_fiscal_profile_member` y elimina los RPC públicos. La migración `20261019031500_alias_service_bridge.sql` deja únicamente un puente invocable por `service_role`; la Edge Function `login-by-alias` lo utiliza sin exponer el esquema privado.

## Borrador local de identidad externa

`20261028150000_external_identity_app_users.sql` es un borrador local, **no aplicado** a `NoraCFDI`, `NoraCFDI1` ni a otro servicio. Introduce `private.app_users` y el mapa privado `(issuer, audience, subject) → app_user_id`, conserva los UUID ya existentes, cambia las FK/defaults y políticas de propiedad para usar `private.current_app_user_id()`, y deja el provisioning de identidades Firebase exclusivamente a `service_role`. No asocia cuentas por correo ni permite vincular una identidad nueva a un UUID existente; ese flujo requerirá prueba de control y auditoría aparte. Un preflight aborta la conversión si encuentra filas propietarias sin usuario interno, sin inventar vínculos. El borrador también preserva el flujo actual de Supabase Auth; no cambia todavía el SDK, los endpoints de autenticación ni la configuración de Google Identity Platform.

La prueba `../tests/external_auth_identity_rls.test.sql` usa claims JWT sintéticos para probar el resolver y una parte de las políticas (progreso, perfiles fiscales, membresía y herramientas). **No verifica firmas de tokens reales ni la aceptación del proveedor externo por Supabase**, y no se ejecutó en este entorno porque no están disponibles `psql` ni Supabase CLI. La prueba remota queda pendiente hasta tener proyecto/credenciales de prueba autorizados, comprobar drift y emitir un token real de Identity Platform. El acceso por alias, la recuperación/confirmación de cuenta, las rutas Auth heredadas y Storage/Realtime también requieren una fase de integración y pruebas aparte.

### Script de despliegue a staging

`scripts/deploy-external-auth-identity-staging.sh` es un ejecutor opt-in fijado al proyecto `NoraCFDI1` (`bbkuhbsgvfrsfwkzzedy`). Por defecto solo hace `db push --dry-run`; crea un directorio Supabase temporal con **únicamente** la migración objetivo, valida que el CLI enlace el ref de staging y se detiene si el plan contiene otra versión. Para aplicar requiere `--apply`, que se escriba el ref exacto en una terminal interactiva y que después se acepte la confirmación adicional del CLI. Nunca se ejecutó como parte de su preparación. La simulación no equivale a probar la migración: antes de usar `--apply` se debe validar el SQL completo en una base local aislada y comprobar el estado/drift de staging.
