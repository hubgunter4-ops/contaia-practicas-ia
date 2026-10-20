# Plan de implementación y despliegue del Centro de herramientas

**Estado:** plan activo. El primer hito de la Fase 1 tiene una implementación inicial en la rama de trabajo; todavía no está desplegado ni se considera listo para producción.
**Alcance:** completar gradualmente el Centro de herramientas de ContaIA para perfiles fiscales, contabilidad, DIOT, nómina y monitor fiscal, conservando el Analizador CFDI existente.  
**Orden recomendado:** base común → perfil fiscal y conexiones → contabilidad → DIOT → monitor fiscal → nómina.

**Avance inicial:** el panel ya consume perfiles con la sesión autenticada, permite crear/editar/activar y seleccionar un perfil, y muestra los registros de conexión por ambiente. El alta/actualización de conexiones solo guarda metadatos como `pending`; no abre una conexión con proveedores ni envía datos externos. La verificación del proyecto Supabase/Vercel de destino, RLS entre dos usuarios, E2E y despliegue siguen pendientes; por tanto, no se ha cumplido el criterio de salida de las fases 0/1.

## 1. Estado observado en el repositorio

| Área | Estado actual | Referencia |
|---|---|---|
| Menú y panel | El menú está en `src/main.js`; el panel que utiliza la aplicación se renderiza desde `src/tools/panel.js`. | `src/main.js`, `src/tools/panel.js` |
| Componente alternativo | Existe `src/tools/ToolsPanel.jsx` con otra definición del panel. Antes de ampliarlo hay que confirmar si se usa en algún build y elegir una única fuente canónica para evitar divergencias. | `src/tools/ToolsPanel.jsx`, `scripts/build-site.js` |
| Analizador CFDI | Es la única tarjeta del Centro que abre una función operativa. El análisis XML/ZIP corre localmente en el navegador; la integración se documenta por separado. | `src/cfdi/`, `docs/curso/integracion-analizador-cfdi.md` |
| Perfil y módulos | Las tarjetas de Contabilidad, Nómina, DIOT y Monitor fiscal muestran estados/avisos; el botón de perfil fiscal todavía no presenta un formulario. | `src/tools/panel.js`, manejador de acciones en `src/main.js` |
| API común | `GET|POST|PATCH /api/tools` permite perfiles y conexiones, además de consultar alertas/vencimientos y cambiar sus estados. Requiere JWT de Supabase y aplica validación en el servidor. | `api/tools/index.js`, `src/tools/server.js`, `docs/tools-api.md` |
| Base de datos | La migración crea perfiles, miembros, conexiones, alertas y vencimientos con RLS. La documentación de migraciones indica que se aplicó a los proyectos Supabase registrados allí; verificar el proyecto objetivo y el historial remoto antes de desplegarla otra vez. | `supabase/migrations/20261018103000_tools_fiscal_profiles.sql`, `supabase/migrations/README.md` |
| Variables | El ejemplo documenta `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`; no se debe usar `service_role` en el navegador ni guardar secretos en el repositorio. | `.env.example`, `docs/tools-api.md` |

## 2. Principios y límites de seguridad

1. **Por defecto, preparar y revisar; no ejecutar acciones irreversibles.** Pólizas, cálculos, declaraciones, timbrado, pagos, cancelaciones y envíos externos deben quedar como borradores hasta recibir revisión y confirmación explícitas.
2. **Aislamiento por perfil.** Toda consulta y mutación debe llevarse a cabo con el token del usuario y quedar protegida por RLS. Las pruebas deben comprobar tanto acceso autorizado como denegación entre usuarios/perfiles distintos.
3. **Credenciales fuera de la aplicación.** No aceptar contraseñas, e.firma/CSD, certificados, tokens ni claves en formularios o metadatos. Si una integración futura requiere credenciales, decidir primero un almacén de secretos y un flujo de consentimiento; `credential_ref` no es un lugar para guardar el secreto.
4. **Minimización y privacidad.** No enviar XML bruto ni datos fiscales/laborales a Nora o a terceros por defecto. Definir los datos persistidos, retención, exportación y eliminación antes de cada módulo. Usar datos sintéticos en desarrollo y E2E.
5. **Cálculos deterministas y versionados.** Los importes y validaciones fiscales deben proceder de reglas comprobables, con periodo/jurisdicción y versión visibles. La IA puede ayudar a clasificar o explicar, pero no debe ser la autoridad única del cálculo ni afirmar vigencia normativa sin evidencia.
6. **Cambios aditivos y desactivables.** Activar módulos gradualmente por configuración/estado. Mantener migraciones compatibles hacia atrás y una ruta para desactivar la interfaz o integración sin borrar datos.
7. **Revisión profesional.** Antes de producción, obtener revisión contable/fiscal/laboral del alcance, las reglas y las salidas que correspondan.

## 3. Fases de implementación

### Fase 0 — Preparar y verificar la base común

**Proceso**

1. Confirmar repositorio, proyecto de Vercel y proyecto Supabase destino, distinguiendo Preview/staging de Production.
2. Revisar el historial de migraciones y RLS remoto. La migración de herramientas ya está versionada y documentada como aplicada a los proyectos nombrados en `supabase/migrations/README.md`; no volver a aplicarla a ciegas.
3. Configurar en Vercel las variables del servidor necesarias (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y, si aplica, `TUTOR_ALLOWED_ORIGINS`). Verificar que nunca se exponga una clave de servicio.
4. Confirmar cuál componente es canónico: `src/tools/panel.js` es el que importa `src/main.js`; alinear o retirar la duplicación de `src/tools/ToolsPanel.jsx` solo después de confirmar los consumidores.
5. Agregar y validar las pruebas de aislamiento RLS, autenticación y carga de configuración antes de integrar nuevas funciones.

**Archivos**

- Revisar: `src/main.js`, `src/tools/panel.js`, `src/tools/ToolsPanel.jsx`, `src/tools/server.js`, `api/tools/index.js`, `app/api/tools/route.js`.
- Revisar: `supabase/migrations/20261018103000_tools_fiscal_profiles.sql`, `supabase/migrations/20261019030000_private_auth_helpers.sql` y `supabase/migrations/README.md`.
- Mantener actualizados: `.env.example`, `docs/tools-api.md`.
- Añadir si faltan: `tests/tools-profile.test.js`, `tests/tools-access.test.js` y `tests/e2e/tools-profile.spec.js`.

**Criterio de salida:** el panel muestra el estado real de servicios; la sesión válida puede consultar solo perfiles autorizados; las pruebas negativas demuestran que otra cuenta no puede leer ni modificar información.

### Fase 1 — Completar perfil fiscal y administración de conexiones

**Proceso**

1. Crear formularios accesibles para listar, crear, editar, activar y seleccionar perfiles. Validar en cliente para usabilidad y en servidor/base para seguridad.
2. Mostrar datos mínimos del perfil y el contexto activo. No incluir RFC completo en registros de aplicación, analítica ni mensajes de error.
3. Crear la interfaz para declarar una conexión por herramienta y entorno (`sandbox`/`production`), mostrar su estado y permitir verificar/reintentar. No permitir pegar credenciales en este formulario.
4. Consumir la API actual con el access token de Supabase; contemplar carga, error, estado vacío, expiración de sesión y reintento.
5. Registrar únicamente metadatos operativos permitidos. Definir por separado almacenamiento de secretos y autorización para cada proveedor antes de abrir una conexión real.

**Archivos**

- Modificar: `src/main.js`, `src/tools/panel.js`, `src/tools/server.js`, `api/tools/index.js`, `docs/tools-api.md`, `.env.example` solo si se añade una variable necesaria.
- Crear: `src/tools/client.js` (cliente autenticado de la API), `src/tools/workspace.js` (estado y formularios), `tests/tools-client.test.js`, `tests/tools-workspace.test.js` y `tests/e2e/tools-profile.spec.js`.
- Migración nueva solo si una decisión de producto exige campos/tablas que no cubren el esquema actual: `supabase/migrations/<timestamp>_tools_profile_extension.sql`.

**Criterio de salida:** CRUD de perfil y lectura/escritura de conexiones cubiertos con pruebas; ninguna credencial sensible enviada al navegador/API; RLS verificada con dos usuarios.

### Fase 2 — Contabilidad: MVP de importación y borradores revisables

**Alcance inicial recomendado:** importar CSV/XLSX de movimientos o comprobantes con un esquema documentado; vista previa, mapeo de columnas, detección de duplicados, propuesta explicable de categoría/cuenta y borrador de póliza o conciliación. Exportación local de resultados para revisión. No conectar banca ni contabilizar automáticamente en el MVP.

**Proceso**

1. Definir formatos de entrada, catálogo de cuentas, moneda, periodo y reglas de clasificación junto con quien revisa contabilidad.
2. Parsear archivos con límites de tamaño/tipo y validar estructura; mostrar vista previa y permitir cancelar antes de guardar.
3. Ejecutar reglas deterministas; mantener separados dato original, sugerencia, fundamento y decisión humana.
4. Guardar solo los datos aprobados para persistencia; permitir editar/descartar sugerencias y exportar el borrador.
5. Medir falsos positivos y casos no reconocidos en un conjunto sintético con pruebas de borde y totales reconciliables.

**Archivos**

- Crear: `src/tools/accounting/import.js`, `src/tools/accounting/rules.js`, `src/tools/accounting/workspace.js`, `src/tools/accounting/export.js`.
- Modificar: `src/tools/panel.js`, `src/main.js`, `src/tools/server.js`, `api/tools/index.js`, `docs/tools-api.md`.
- Crear migración aditiva con las tablas mínimas aprobadas (por ejemplo, importaciones, movimientos normalizados, borradores y decisiones/revisiones); nombre propuesto: `supabase/migrations/<timestamp>_accounting_workflows.sql`.
- Crear: `tests/tools-accounting.test.js`, `tests/accounting-rules.test.js`, `tests/accounting-import.test.js`, `tests/accounting-rls.test.js` y `tests/e2e/tools-accounting.spec.js`.
- Añadir muestras inventadas bajo `data/tools/accounting/` y documentar el formato en `docs/tools/accounting.md`.

**Criterio de salida:** todas las cifras de prueba cuadran con el origen, las sugerencias muestran sus motivos, el usuario conserva control de aprobar/rechazar y no se produce una póliza definitiva ni un envío externo sin confirmación.

### Fase 3 — DIOT: preparar un expediente, no presentar automáticamente

**Dependencia:** Fase 2 y revisión de los campos, reglas y periodos que se deben soportar.

**Proceso**

1. Definir origen de operaciones y clasificación de terceros/campos que se incluirán; documentar periodo, reglas y versión.
2. Calcular de forma determinista los importes agregados y señalar datos faltantes o inconsistencias; enlazar cada total con la evidencia interna que lo origina.
3. Preparar vista previa y exportación de expediente. Una persona responsable coteja el contenido contra la fuente y el formato oficial vigente antes de usarlo.
4. No automatizar presentación ante el SAT en esta fase.

**Archivos**

- Crear: `src/tools/diot/rules.js`, `src/tools/diot/workspace.js`, `src/tools/diot/export.js`, `docs/tools/diot.md`.
- Modificar: `src/tools/panel.js`, `src/main.js`, `src/tools/server.js`, `api/tools/index.js` y `docs/tools-api.md`.
- Crear migración `supabase/migrations/<timestamp>_diot_workflows.sql` únicamente para resultados revisables que deban persistirse; no duplicar sin necesidad los movimientos de Contabilidad.
- Crear: `tests/diot-rules.test.js`, `tests/diot-export.test.js`, `tests/diot-rls.test.js`, `tests/e2e/tools-diot.spec.js` y fixtures sintéticos en `data/tools/diot/`.

**Criterio de salida:** las reglas están versionadas y revisadas; se pueden rastrear importes al origen; las pruebas detectan diferencias; exportar no equivale a presentar.

### Fase 4 — Monitor fiscal: alertas y vencimientos con fuente trazable

**Proceso**

1. Definir para cada alerta/vencimiento su fuente, fecha de consulta, jurisdicción, regla y responsable. La tabla existente `fiscal_alerts`/`fiscal_deadlines` almacena elementos operativos, pero la aplicación aún debe producirlos y mostrarlos.
2. Empezar con avisos ingresados/importados o derivados de módulos ya desplegados; no publicar alertas normativas sin fuente verificable.
3. Añadir bandeja con filtros, estado, responsable y detalle de evidencia; permitir marcar en revisión, resuelta o descartada.
4. Si se necesita actualización programada, elegir y documentar un ejecutor fiable, idempotente y monitorizado; definir límites, reintentos, retención y desactivación. No depender de una tarea no configurada.

**Archivos**

- Crear: `src/tools/monitor/workspace.js`, `src/tools/monitor/alert-rules.js`, `docs/tools/monitor.md`.
- Modificar: `src/tools/panel.js`, `src/main.js`, `src/tools/server.js`, `api/tools/index.js`, `docs/tools-api.md`.
- Añadir API de ingesta/tarea programada solo tras decidir fuente y proveedor: `api/tools/monitor-refresh.js` (nombre provisional) y su configuración documentada en el archivo de despliegue correspondiente.
- Crear: `tests/monitor-alerts.test.js`, `tests/monitor-rls.test.js`, `tests/e2e/tools-monitor.spec.js` y fixtures de alertas sin datos reales.
- Migración solo si se requieren campos para procedencia, regla o auditoría que no quepan en el esquema existente; crear `supabase/migrations/<timestamp>_monitor_sources.sql`.

**Criterio de salida:** cada alerta tiene origen y fecha; no se presenta una alerta como determinación oficial; los permisos y cambios de estado se prueban por perfil.

### Fase 5 — Nómina: habilitar tras decidir datos y proveedor

**Riesgo:** contiene datos personales y financieros de alta sensibilidad. No iniciar integración de producción hasta aprobar modelo de datos, retención, permisos, proveedor, obligaciones aplicables y controles laborales.

**Proceso**

1. Limitar el MVP a un flujo acordado (por ejemplo, revisión de incidencias/recibos de prueba), con datos sintéticos y sin pagos ni timbrado.
2. Definir campos mínimos, roles autorizados, retención, eliminación, registro de acceso y tratamiento de documentos.
3. Implementar cálculo/validación con reglas deterministas revisadas y resultados en borrador; separar claramente estimación de dato confirmado.
4. Probar permisos, acceso a archivos, exportación y eliminación. La conexión productiva y cualquier operación externa requieren consentimiento y confirmación explícitos.

**Archivos**

- Crear: `src/tools/payroll/workspace.js`, `src/tools/payroll/rules.js`, `src/tools/payroll/import.js`, `docs/tools/payroll-privacy.md`.
- Modificar: `src/tools/panel.js`, `src/main.js`, `src/tools/server.js`, `api/tools/index.js`, `docs/tools-api.md`, `.env.example` solo si se aprueba una integración.
- Diseñar y aprobar antes de programar una migración `supabase/migrations/<timestamp>_payroll_workflows.sql`; mantener fuera de la base credenciales y documentos no necesarios.
- Crear: `tests/payroll-rules.test.js`, `tests/payroll-access.test.js`, `tests/payroll-retention.test.js`, `tests/e2e/tools-payroll.spec.js` y únicamente fixtures ficticios bajo `data/tools/payroll/`.

**Criterio de salida:** revisión profesional y de privacidad completada, permisos de mínimo privilegio probados, retención/eliminación comprobadas y ninguna nómina pagada/timbrada por la app sin confirmación humana.

## 4. Proceso de desarrollo y despliegue por fase

1. Abrir una rama de trabajo y mantener el cambio acotado a una fase; solicitar decisiones de producto/proveedor antes de codificar integraciones no especificadas.
2. Añadir primero pruebas de reglas, permisos, privacidad y estados de interfaz; usar solo datos sintéticos.
3. Ejecutar, según alcance: `npm test`, `npm run test:e2e` y `npm run build:vercel`. Corregir fallos antes de solicitar revisión.
4. Crear Pull Request con: objetivo, archivos/migraciones, riesgos, variables nuevas, evidencia de pruebas y pasos de rollback. No mezclar credenciales ni datos reales en el PR.
5. Desplegar primero a Preview/staging. Aplicar migraciones aditivas con respaldo y comprobar estado/RLS en el proyecto destino antes de habilitar el código.
6. Probar con cuentas de prueba de dos perfiles, sesión expirada, datos inválidos, archivo límite, errores del proveedor y repetición de solicitudes.
7. Habilitar la fase para un grupo piloto; observar errores y calidad sin registrar RFC, nóminas, contenido de archivos o secretos en logs.
8. Promover a producción solo después de aprobar los criterios de salida. Mantener la función desactivable y una opción de rollback de código compatible con el esquema.
9. Actualizar este plan, `docs/tools-api.md`, `supabase/migrations/README.md` y `TODO.md` con estado real y commit/despliegue al cerrar cada fase.

## 5. Decisiones que deben quedar registradas antes de cada integración

- Proveedor y sistema fuente; ambiente de pruebas/producción; titularidad y consentimiento.
- Formatos de archivo y límites; campos persistidos; clasificación de datos; retención, exportación y eliminación.
- Reglas de negocio, jurisdicción, periodo, versión, responsable de revisión y tratamiento de excepciones.
- Roles autorizados y permisos sobre cada perfil, módulo y acción.
- Integración de credenciales: almacén aprobado, rotación, revocación y observabilidad sin exponer secretos.
- Comportamiento ante caída, datos incompletos, duplicados, reintentos y rollback.
- Quién aprueba una acción externa y qué evidencia de confirmación debe conservarse.

## 6. Registro de estado

| Fase | Estado inicial en este plan | Nota |
|---|---|---|
| Base de datos y API común | Parcialmente preparada | Migración y endpoints existen; confirmar entorno objetivo y completar interfaz/permisos verificables. |
| Perfil fiscal | Pendiente de interfaz operativa | El botón actual muestra un aviso; no existe todavía el flujo de formulario del panel. |
| Analizador CFDI | Disponible por separado | Mantener su flujo local; no duplicarlo como una segunda implementación dentro del panel. |
| Contabilidad | Requiere conexión y reglas | No ejecutar pólizas automáticamente. |
| DIOT | En preparación | No presentar automáticamente. |
| Monitor fiscal | En preparación | Falta producción de alertas con fuentes trazables. |
| Nómina | En preparación | Requiere decisión de privacidad, reglas y proveedor antes de desarrollo productivo. |
