# Migraciones Supabase

Estas migraciones se versionan junto con el código y solo agregan la tabla de historial CFDI. Se aplicaron al proyecto `NoraCFDI` (referencia `rjdhfajtttejskhuplzq`) mediante la conexión Supabase autorizada:

- `20261010225503`: crea `public.cfdi_analysis_runs`, establece límites de JSON, activa RLS y concede a `authenticated` únicamente `SELECT`, `INSERT` y `DELETE`.
- `20261010225546`: recrea las políticas de propietario con `(select auth.uid())` para conservar el mismo aislamiento y evitar reevaluación por fila.

No se guarda XML bruto ni nombre local de archivo en la tabla. El frontend nunca ejecuta SQL ni recibe una clave `service_role`. No se modificaron tablas preexistentes. La revisión del proyecto observó aparte una función preexistente `public.rls_auto_enable()` con permiso de ejecución para `anon` y `authenticated`; requiere valoración independiente.
