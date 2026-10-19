# Migraciones Supabase

Las migraciones versionan el esquema del historial CFDI. La tabla `public.cfdi_analysis_runs` conserva datos JSON de análisis ya consentidos por el usuario; el XML bruto y el nombre local del archivo no se guardan. El frontend usa la clave publicable y nunca ejecuta SQL ni recibe una clave `service_role`.

- `20261010225503`: crea la tabla, sus restricciones de tamaño/versión, activa RLS y concede a `authenticated` únicamente `SELECT`, `INSERT` y `DELETE`.
- `20261010225546`: recrea las políticas de propietario con `(select auth.uid())` para conservar el aislamiento y evitar reevaluación por fila.
- `20261019120000`: reafirma el default `auth.uid()`, los permisos mínimos y las políticas de lectura/alta/borrado por propietario. `UPDATE` permanece revocado: las filas del historial son inmutables desde el cliente.

Cada operación permitida está acotada al usuario autenticado: lectura y borrado usan `USING`; la inserción usa `WITH CHECK`. No se crea una política `UPDATE` porque no existe permiso para actualizar. Si el producto necesita editar registros en el futuro, deberá aprobarse otra migración que conceda el permiso y defina `USING` y `WITH CHECK` por propietario.

## Pruebas RLS locales

`supabase/config.toml` contiene solo un identificador local no sensible y no enlaza este checkout con un proyecto remoto. Para ejecutar pgTAP se requiere Docker y Supabase CLI:

```sh
supabase start
supabase db reset
npm run test:supabase:rls:local
```

`supabase db reset` elimina y reconstruye **la base local**; no añadas `--linked`. La prueba `supabase/tests/cfdi_analysis_runs_rls.test.sql` usa usuarios sintéticos dentro de una transacción que termina en `ROLLBACK`; cubre RLS, permisos, default del propietario, aislamiento A/B, intento de suplantación, eliminación ajena y prohibición de `UPDATE`.

El runner `npm run test:supabase:rls` es una prueba de API aparte, compatible con `local` o `staging`, que necesita dos cuentas de prueba existentes y las variables `SUPABASE_RLS_TEST_*`. Tiene una protección explícita contra el proyecto de producción. El provisionador de cuentas también rechaza la referencia de producción.

La revisión del proyecto registró además una función preexistente `public.rls_auto_enable()` con permiso de ejecución para `anon` y `authenticated`. No se modifica aquí porque no forma parte del contrato de `cfdi_analysis_runs`; su definición, propósito y grants deben revisarse por separado antes de revocarlos.
