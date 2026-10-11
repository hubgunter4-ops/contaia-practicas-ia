# Analizador CFDI de ContaIA

## Propósito y límites

El Analizador CFDI es una sección independiente de ContaIA. Reutiliza la salida normalizada y la lógica de relaciones de CFDI del repositorio PDFC (`parsearXML`, lectura de XML/ZIP, catálogo de formas de pago y `enriquecerPagosConFacturas`). El procesamiento del XML ocurre en el navegador; no se envía el XML ni el nombre del archivo al servidor de Nora ni a Supabase.

El resultado es una ayuda de revisión, no una validación fiscal oficial. En pagos relacionados, la lógica de PDFC prorratea subtotal, descuento, IVA, retenciones e IEPS conforme a `ImpPagado / Total` y redondea a dos decimales. Cuando no hay factura cargada, el parser PDFC puede estimar IVA al 16% si el pago carece de desglose; ContaIA marca ese caso como **estimación**, no como importe certificado. Las diferencias detectadas son alertas para investigar, no evidencia de fraude ni dictamen.

## Flujo

1. La persona abre **Analizador CFDI** desde la navegación superior.
2. Elige uno o varios `.xml` o `.zip`; el navegador valida extensión y tamaño, lee los comprobantes, extrae CFDI de ingreso/egreso y pagos, y relaciona `IdDocumento` con UUID de facturas disponibles.
3. La vista muestra resumen por moneda, facturas, pagos, conceptos y alertas de duplicados, saldos o relaciones faltantes.
4. Si la persona solicita ayuda de Nora desde el módulo, una acción explícita prepara un resumen estructurado con conteos, importes y códigos de alerta. No incluye XML, nombres, RFC, UUID, número de folio ni nombres de archivo. El resumen queda en memoria y se envía solo cuando la persona escribe y envía su pregunta; se puede quitar antes de enviar.
5. Si desde Asistente abierto se solicita explícitamente analizar o conciliar XML/CFDI, el chat ofrece/activa el traspaso al Analizador. La pregunta se conserva como solicitud de origen, pero no se envía junto con archivos; Nora solo recibe el resumen después de una acción explícita posterior.
6. Guardar y consultar historial requiere autenticación por enlace de correo y acción explícita. Se almacena el resultado normalizado (sin XML ni nombre local de archivo) en `cfdi_analysis_runs`. Puede incluir RFC, nombres, UUID y folios porque esos campos están en los resultados del parser; por ello el guardado requiere una casilla de reconocimiento y la tabla está protegida por RLS para lectura, inserción y borrado del propietario únicamente.

## Supabase

- Proyecto verificado por conexión segura: `NoraCFDI` (`rjdhfajtttejskhuplzq`).
- URL API canónica: `https://rjdhfajtttejskhuplzq.supabase.co`.
- El navegador obtiene únicamente `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` de `/api/cfdi/config`; nunca recibe una clave `service_role`.
- Migraciones aplicadas: `supabase/migrations/20261010225503_cfdi_analysis_runs.sql` (tabla aditiva) y `supabase/migrations/20261010225546_cfdi_rls_policy_initplan.sql` (políticas RLS optimizadas). La tabla `cfdi_analysis_runs` está presente, vacía y con RLS habilitado; concede a `authenticated` solo `SELECT`, `INSERT` y `DELETE`. Las políticas comparan el propietario con `(select auth.uid())` y el `user_id` se asigna en la base.
- No se suben XML a Storage ni se ejecuta SQL desde el navegador. El JSON tiene límite de 900 KB.

## Configuración local y despliegue

Copia las variables de `.env.example` a `.env` (ignorado por Git) para desarrollo; en este entorno local ya se dejaron configuradas con la URL API canónica y la clave publicable activa. Vercel requiere configurar `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el entorno de producción antes del despliegue; esta implementación no despliega ni cambia variables de Vercel. La URL debe ser la del proyecto (`.supabase.co`), no el dominio de consola.

El proveedor de correo de Supabase Auth y el redirect URL deben permitir el origen local/desplegado. Sin configuración o sin correo habilitado, el análisis local sigue disponible y el panel de historial lo señala sin bloquear la función de lectura.

La revisión de seguridad del proyecto también encontró una función existente, `public.rls_auto_enable()`, `SECURITY DEFINER`, ejecutable por `anon` y `authenticated`. No pertenece a estas migraciones y no se modificó; conviene revisar si debe conservar permisos públicos: [guía de Supabase para el aviso 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [aviso 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Controles aplicados

- XML y ZIP procesados en memoria local; rechazo de DTD/ENTITY, límites de tamaño, número de archivos y contenido expandido.
- No se registra contenido XML en consola, URL, telemetría ni errores del servidor.
- El contexto de Nora es una allowlist numérica, sin identificadores; el backend descarta contexto CFDI si la sección no es `advisor` y limita su tamaño.
- Los documentos y el historial de Nora permanecen separados del progreso local de clases.
- Tabla sin acceso `anon`, sin clave administrativa en frontend, con RLS propietario y sin operación de actualización.
