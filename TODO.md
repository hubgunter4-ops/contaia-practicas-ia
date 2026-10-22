# TODO — evolución visual modular de ContaIA

**Estado:** fases visuales 0–4 incluidas en `main` mediante `217484c`. La separación de ContaIA Aprende/Herramientas se publicó mediante `72383ba`; el Aula Confianza fiscal se publicó mediante `2603999`, firmado y verificado, con despliegue READY. El anexo comercial y los precios siguen como propuesta, sin pagos ni cuotas. Conciliación bancaria está implementada localmente, en preparación y sin commit/despliegue: no hay conexión bancaria ni persistencia de extractos/decisiones. Pólizas sugeridas ya cuentan con una primera implementación frontend local: motor determinista, catálogo/reglas en memoria, fuentes CFDI/movimientos, validación exacta, revisión/aprobación local y panel contextual de Nora. Persisten pendientes la durabilidad, backend, exportación oficial, roles, impuestos, integración bancaria y cualquier commit/despliegue de este corte. Las validaciones de cada entrega se conservan abajo.

- [x] **Base visual y semántica compartida**
  - Introducir la paleta «Confianza fiscal» con estos valores y usos: azul petróleo `#123B43` para estructura, encabezados, navegación y análisis; verde jade `#16866F` para acciones, progreso y estados positivos; marfil cálido `#F5F4EC` para lectura y fondo; arena `#E4E6D8` para superficies secundarias; coral tenue `#E98268` para alertas, riesgos y pendientes; amarillo validación `#D9B84C` para recomendaciones y logros.
  - Mantener el fondo editorial, tarjetas claras, líneas finas tipo hoja contable, sellos discretos y pequeñas ilustraciones funcionales de recibos, calculadora, factura o carpeta en los espacios adecuados; limitar patrones/textura a hero, acceso y estados vacíos para no saturar tablas ni documentos.
  - Mantener Alegreya Sans para interfaz/lectura y DM Mono para datos compactos; usar jerarquía tipográfica clara, espacios basados en múltiplos de 4 px y radios/sombras moderados.
  - Expresar los estados con texto e iconografía además de color: verde para completado/válido; amarillo para revisión; coral para error/riesgo; azul para información; gris para pendiente o sin configurar. Mantener foco visible, teclado, contraste suficiente y `prefers-reduced-motion`.
  - Aplicar los nuevos tokens con alcance controlado a Herramientas, shell común y CFDI; no sobrescribir globalmente el Aula oscuro lavanda/menta ni cambiar login/Aula en esta iteración. Conservar la identidad/wordmark y favicon existentes.
  - No alterar funcionalidad, contratos de API, datos o persistencia como efecto colateral del cambio visual.

- [x] **Hub principal de Herramientas, organizado por objetivo y adaptado a móvil**
  - Mostrar con jerarquía clara qué herramienta es, qué requiere atención, cuál es su siguiente paso y qué resultado obtuvo la persona; cada pantalla/herramienta tendrá una sola acción principal visible.
  - Mantener el perfil fiscal y las conexiones existentes; organizar CFDI, Contabilidad, Nómina, DIOT, Monitor fiscal, Perfil fiscal, Conexiones y Documentos según el objetivo que cumplen. Las diferencias se expresan en el tipo de interacción, no solo en el color.
  - Cada tarjeta muestra únicamente estado, última actividad, documentos procesados, pendientes, alertas y acción principal que estén respaldados por datos existentes. Cuando no existan registros, mostrar un estado vacío claro; no inventar actividad, métricas, riesgos, vencimientos, sincronizaciones ni conexiones.
  - Separar explícitamente la disponibilidad/madurez de una herramienta de su estado de conexión. Las conexiones deben poder comunicar «Sin configurar», «Pendiente», «Conectada», «Requiere revisión» y «Error»; la disponibilidad del módulo debe comunicar «Listo», «Requiere configuración» o «En revisión/preparación», según corresponda. Un módulo en preparación no se presenta como operación disponible aunque exista una conexión registrada.
  - Mantener como acciones reales las que ya existen: CFDI abre el analizador local; Perfil fiscal permite configurar/editar el perfil; Conexiones registra la configuración administrativa existente. No presentar el registro de una conexión como conexión verificada con un proveedor.
  - En móvil, usar tarjetas apiladas y acciones táctiles amplias; ofrecer navegación inferior para **Inicio, Curso, Estudio, Herramientas y Nora**, mapeada a vistas/handlers existentes y sin ocultar opciones actuales ni cambiar los flujos funcionales. Mantener visible la acción principal y los estados.

- [x] **Plantilla común de presentación para herramientas**
  - Proveer un encabezado con nombre, descripción breve, estado verificable y acción principal; un resumen superior de actividad/pendientes/alertas con datos disponibles; un área de trabajo; resultados e historial cuando existan; y panel contextual de ayuda de Nora.
  - Incorporar consejos, errores frecuentes, próximo paso recomendado y acceso a Aula/Base de estudio solo cuando haya contenido o destino real. No añadir formularios u operaciones nuevas a herramientas que sigan en preparación.
  - Conservar la lógica, permisos, controladores y peticiones de cada herramienta. El shell es una capa de presentación; no debe cambiar estado de servidor ni llamar servicios por sí mismo.
  - Mantener una fuente coherente para metadatos, descripciones, colores/estados y CTAs, evitando divergencia entre el renderer de `src/tools/panel.js` y el catálogo paralelo de `src/tools/ToolsPanel.jsx`; no migrar la SPA a React.

- [x] **CFDI como herramienta demostrativa, sin ampliar su funcionalidad**
  - Adaptar visualmente el flujo existente de importación local, revisión previa del lote, análisis, hallazgos, resultados, historial y acciones posteriores al shell común. Conservar selección/arrastre, eliminación de archivos y confirmación explícita para analizar.
  - Mantener los formatos actualmente soportados: XML y ZIP; no anunciar ni habilitar PDF en esta iteración. Conservar los límites existentes: hasta 100 archivos por lote, XML de hasta 5 MB, ZIP de hasta 20 MB y hasta 25 MB de XML extraídos.
  - Representar validez, advertencias y errores solo según las comprobaciones que el parser/análisis realmente ejecuta. No describirlo como validación oficial del SAT ni afirmar cumplimiento fiscal que no haya sido verificado.
  - El XML y los nombres de archivo permanecen locales; no subirlos ni enviarlos a Nora automáticamente. El guardado opcional continúa almacenando solo el resultado autorizado por el contrato existente. El resumen CFDI se comparte con Nora únicamente por la acción explícita ya disponible y sigue acotado por el backend.
  - Mostrar resultados/hallazgos, relaciones, historial y cifras que ya produzca el análisis; no calcular ni inventar datos nuevos por necesidades visuales. Los enlaces de estudio conducen a módulos o prácticas existentes.

- [x] **Continuidad educativa y Nora contextual**
  - Usar el progreso existente de módulos y ejercicios para mostrar progreso educativo, una ruta visual de módulos y «Continúa donde lo dejaste» cuando el estado real permita identificar el punto de continuación. No mezclar progreso del curso con métricas fiscales.
  - Dar a Nora un rol contextual coherente: explicar hallazgos CFDI; guiar procedimientos cuando exista el flujo; ayudar con inconsistencias/alertas solo cuando esos datos existan; orientar en búsqueda de documentos solo con la funcionalidad documental disponible.
  - Mantener chat, voz, Anam, micrófono, envío de documentos y transferencia de resultados bajo acción explícita; no iniciar sesión de Anam ni compartir datos automáticamente. No incorporar progreso o notas locales al contexto de Nora sin autorización existente.
  - Las metas semanales, insignias persistentes/sincronizadas y gráficas transversales solo pueden usar datos con reglas y persistencia definidas; no se inventan en esta iteración. Reutilizar assets existentes de Nora; no simular estados de avatar (lista, explicando, pensando, celebrando) si no hay un asset/estado compatible. La creación de nuevos assets se decidirá por separado.

- [x] **Límites de las demás herramientas y expansión posterior**
  - Contabilidad se presenta como clasificación/conciliación solo en el grado respaldado por capacidades existentes; Nómina como flujo guiado solo si hay cálculos y datos reales; DIOT como revisión de consistencia solo con datos verificables; Monitor fiscal como centro de alertas solo con alertas/fechas reales; Perfil, Conexiones y Documentos muestran sus capacidades actuales, estados y acciones reales.
  - No añadir en este trabajo pólizas, conciliación bancaria, cálculo/confirmación de nómina, generación/presentación DIOT, alertas automáticas, sincronización real de proveedores, almacenamiento documental nuevo ni auditoría fiscal. Esos flujos necesitan contratos, datos, permisos y autorización específica.
  - El modo oscuro adicional para análisis/IA y extender la nueva paleta al Aula/login quedan como decisiones posteriores; el tema oscuro del Aula en vivo permanece aislado.


## Nuevo alcance autorizado — páginas y navegación de ContaIA Aprende y ContaIA Herramientas

- [x] **Portada pública con dos productos claramente separados**
  - Presentar únicamente dos productos principales y con jerarquía equivalente: **ContaIA Aprende** y **ContaIA Herramientas**; no presentar Asistente abierto como tercer producto, sino como capacidad de Nora disponible dentro de los recorridos donde corresponde y conservar su acceso.
  - Explicar con copy factual el propósito, qué se puede hacer hoy y el destino de cada producto. Aprende remite al curso real y a su progreso local. Herramientas muestra CFDI como herramienta disponible (XML/ZIP, revisión y análisis local) y aclara que Contabilidad, Nómina, DIOT y Monitor fiscal están en preparación, si se mencionan.
  - Enlazar Aprende al destino existente `/descripcion/curso` y Herramientas al destino existente `/descripcion/cfdi`; conservar compatibilidad de estas URLs, el registro, el prellenado de destino, login, confirmación de correo, páginas informativas y accesibilidad de enlaces.
  - No mostrar precios, botones de compra, pruebas de pago ni afirmar planes gratuitos/de pago como contrato vigente. La separación es informativa/visual; no se añade backend, autenticación nueva, segmentación comercial ni almacenamiento.
  - Preservar notas reales de privacidad y alcance: progreso de Aprende guardado localmente; XML de CFDI procesado localmente; no afirmar que el análisis sea validación SAT ni dictamen profesional.

- [x] **Identidad de producto dentro de la aplicación autenticada**
  - Nombrar y agrupar las áreas de curso/aprendizaje como **ContaIA Aprende** y el hub/análisis CFDI como **ContaIA Herramientas**, con indicadores comprensibles en encabezado, menú superior y navegación móvil.
  - Mantener el recorrido funcional existente: Curso/Aula, Estudio y prácticas siguen accesibles; Herramientas, CFDI y Nora siguen en las secciones y manejadores actuales. Nora conserva su función contextual, no se presenta como un tercer producto vendible.
  - Conservar la barra móvil de cinco destinos y sus acciones existentes —Inicio, Aprende/Curso, Estudio, Herramientas y Nora— con estados activos correctos; adaptar nombres sin truncar ni ocultar controles.
  - Mantener los temas visuales separados que ya existen para aprendizaje y fiscal; no introducir registro de suscripción, cuotas, claims de plan ni cambios de acceso.

- [x] **Diseño responsive, accesible y compatible con rutas existentes**
  - Usar el diseño editorial y la identidad ContaIA existentes con las superficies/cromática apropiadas a cada producto; preservar tipografías, jerarquía, foco visible, navegación por teclado, movimiento reducido y contraste suficiente.
  - En móvil, apilar las dos tarjetas con CTA táctiles, textos legibles y enlaces no solapados con Nora flotante ni la navegación inferior; en escritorio, mostrar dos columnas equilibradas y una introducción breve.
  - Si se modifica el conjunto de URLs públicas, actualizar `public/manus-routes.json` solo con las rutas reales y comprobar que el servidor sirve el JSON exacto, no fallback HTML. Preferir las rutas existentes y no añadir ruta si el producto puede explicarse usando los destinos actuales.
  - Confirmar que una sesión autenticada conserva sus rutas/acciones y que un visitante no autenticado puede explorar ambas descripciones y continuar por el registro que ya existe.


## Criterios del módulo completo — Conciliación bancaria

**Estado:** esta sección conserva los criterios del módulo completo. El corte frontend local al final de este documento ya cubre carga, mapeo, matching heurístico y tabla preliminar; los criterios no cubiertos permanecen pendientes. No se crea backend, servicio de banco, persistencia de extractos/decisiones ni despliegue. Los límites de 8 MiB/5,000 movimientos y la ventana inicial de ±3 días quedan como valores locales visibles y revisables.

- [ ] **Carga local de CSV/XLSX y selección de la fuente bancaria**
  - Aceptar extractos `.csv` y `.xlsx`; mostrar formatos y límites antes de seleccionar. Propuesta inicial: máximo 8 MiB y 5,000 filas por extracto; advertir y rechazar de forma clara el archivo/hoja que exceda el límite, sin congelar la interfaz.
  - Leer CSV en el navegador con comillas escapadas, separador coma/punto y coma/tabulador, saltos de línea dentro de campos y UTF-8/BOM. Cuando codificación o separador no puedan determinarse con seguridad, pedir selección explícita y mostrar previsualización antes de aceptar.
  - Para XLSX, permitir elegir la hoja y conservar número de fila/hoja; no ejecutar macros ni fórmulas. No suponer que una celda de fórmula sin valor calculado es un movimiento válido.
  - Mostrar archivo, tamaño, periodo elegido, cantidad de filas, estado de lectura y errores por fila. Permitir retirar o reemplazar el archivo y cancelar el procesamiento.
  - El archivo bancario se queda en memoria del navegador. Importar, mapear, analizar o cambiar de vista no lo envía a `/api/documents`, al tutor, a Supabase ni a otro proveedor; no se almacena en `localStorage` ni en historial.

- [ ] **Mapeo explícito, normalización reversible y validación por fila**
  - Antes de comparar, la persona confirma la columna de fecha, importe o cargo/abono, signo/dirección y moneda. Referencia y descripción son opcionales; saldo y fecha valor son datos auxiliares y no sustituyen silenciosamente la fecha de operación.
  - La detección automática de encabezados presenta sugerencias editables, no decide en silencio. Mostrar lado a lado el valor de origen, la interpretación normalizada, la regla aplicada y la advertencia.
  - Preservar los valores originales. Parsear fecha como fecha local sin zona horaria inventada; exigir elección cuando el formato sea ambiguo. Convertir dinero a escala exacta por moneda; no comparar monedas distintas, no inferir moneda ausente y no aplicar redondeo/tolerancia invisible.
  - Conservar la referencia original y una versión canónica aparte; no borrar ceros iniciales ni considerar que una coincidencia aproximada es exacta. Identificar duplicados y colisiones sin borrar/fusionar filas.
  - Filas con importe, moneda, fecha o signo inválidos quedan marcadas con causa y excluidas de coincidencias ordinarias hasta corregirlas o excluirlas con acción explícita.

- [ ] **Selección segura de facturas/pagos CFDI del periodo**
  - Permitir elegir el análisis CFDI vigente en memoria o corridas guardadas por la persona en `cfdi_analysis_runs`; presentar primero metadatos mínimos y leer `analysis_data` solo de corridas seleccionadas.
  - Toda lectura de resultados guardados se hace con el cliente Supabase autenticado y queda bajo el RLS existente. No se añade tabla, endpoint ni acceso a datos de otra cuenta.
  - Mostrar título, fecha y conteos de cada análisis elegido y pedir confirmación del periodo/contexto. No atribuir automáticamente una corrida a un perfil fiscal: `cfdi_analysis_runs` no tiene `profile_id`.
  - Comparar solo las facturas y pagos que provienen de los resultados expresamente elegidos; si no existe análisis fuente, mostrar que no hay candidatos CFDI y no producir un resultado «sin diferencias» engañoso.
  - Filtrar o advertir por periodo elegido. Tratar facturas y complementos de pago como tipos distintos; no duplicar en silencio evidencia de una factura ya asociada a un complemento.

- [ ] **Coincidencias deterministas, explicables y no automáticas**
  - Ejecutar matching local y reproducible sobre moneda, dirección, importe, fecha y referencia normalizada; mostrar por candidato los motivos que aumentan o reducen su confianza, diferencia de importe por moneda y distancia de fecha.
  - Etiquetar confianza **Alta / Media / Baja / Sin sugerencia** como prioridad heurística, nunca como probabilidad estadística. Propuesta de partida: alta solo para candidato único con moneda/dirección compatibles, importe exacto, fecha dentro de la ventana aprobada y referencia exacta/evidencia fuerte; media para importe exacto y fecha compatible con un candidato único pero sin referencia exacta; baja para coincidencia parcial, colisión o importe distinto.
  - La ventana ±3 días calendario y una tolerancia inicial de cero centavos para «Alta» son propuestas a confirmar antes de implementar y deben poder cambiarse solo con una regla visible.
  - Si hay varios candidatos equivalentes, presentar la ambigüedad en vez de elegir el primero. Moneda contradictoria, fecha ilegible o dirección/signo incompatible bloquean un match ordinario.
  - Pagos parciales, comisiones, reversas y grupos uno-a-varios/muchos-a-uno quedan como incidencias para revisión manual en el MVP; ningún candidato puede reutilizarse en vínculos incompatibles.
  - Repetir la misma entrada, mapeo y versión del algoritmo debe dar el mismo orden, nivel y explicación de sugerencias. Un cambio posterior de reglas debe quedar versionado.

- [ ] **Tabla de revisión humana, diferencias y exportación local**
  - Mostrar resumen del periodo solo después de leer datos: movimientos, sugerencias, por revisar, sin candidato y diferencias, con importes siempre separados por moneda.
  - La tabla incluye fecha/importe del movimiento, referencia o descripción enmascarable, tipo/folio CFDI abreviado, diferencia, confianza, evidencia y estado. Cada fila expande originales/normalizados y hasta tres candidatos.
  - Mantener estados diferenciados: sugerida alta/media/baja, ambigua, diferencia, sin candidato, error y vínculo confirmado manualmente. Una sugerencia nunca aparece como conciliada antes de la acción expresa del usuario.
  - Ofrecer acciones separadas: confirmar vínculo temporal, elegir otro candidato, rechazar sugerencia, dejar pendiente y consultar a Nora. Confirmar en esta pantalla no crea asiento, no modifica el pago/CFDI y no persiste un historial bancario.
  - La exportación CSV es opcional, local y solo comienza por acción explícita. Indica campos incluidos, conserva el origen de cada fila y no afirma que el resultado sea un libro contable o dictamen.

- [ ] **Ayuda del Asistente abierto con minimización y consentimiento**
  - El Asistente abierto/Nora puede explicar el mapeo a partir de encabezados, explicar la evidencia de una sugerencia y comparar candidatos que el usuario seleccione. ANAM no es el motor de matching y no recibe datos del extracto en esta versión.
  - «Consultar a Nora» prepara una consulta y una vista previa visible; importar, comparar, abrir una sugerencia o hacer clic en la tarjeta no envía nada. El envío ocurre solo después de que la persona revisa la vista previa y pulsa «Enviar» en el Asistente abierto.
  - El payload usa un contexto tipado/versionado y una lista cerrada de campos, solo en `section: advisor`; limita filas/candidatos y tamaño (límite inicial propuesto: 4 KB), sanea los valores en servidor y descarta campos desconocidos. No reutiliza el envío documental genérico para transmitir el archivo completo.
  - Por defecto se omiten extracto completo, cuenta, institución, saldos ajenos, descripción completa, referencia original, RFC, nombres, UUID/folios completos, credenciales y tokens. La vista de consentimiento identifica datos seleccionados y proveedor de IA; cancelar elimina el borrador sin llamar al tutor.
  - La respuesta de Nora se muestra como explicación/sugerencia no vinculante. Nunca acepta, rechaza, agrupa, cierra ni cambia un vínculo; cualquier decisión se confirma manualmente en la tabla.
  - Antes de enviar datos bancarios reales, la interfaz y el servidor deben tener límites probados y una política visible de proveedor, logs y retención. La conversación y el contexto no se persisten en una tabla ni se incorporan al historial del curso.

- [ ] **Shell coherente, responsive y accesible**
  - La herramienta usa ToolShell y la paleta «Confianza fiscal», separa disponibilidad del módulo («En preparación»/«Listo») de cualquier conexión (sin configurar/sin conexión) y anuncia claramente que no conecta bancos.
  - En escritorio usa pasos de importación, panel de carga/mapeo y tabla filtrable con razones expandibles. En móvil transforma filas en tarjetas apiladas, conserva las acciones críticas visibles, respeta la barra inferior de cinco destinos y no desborda horizontalmente.
  - Formularios, filtros, tablas/tarjetas, confianza y errores son accesibles por teclado y lector de pantalla; el estado no depende solo del color y respeta foco visible y `prefers-reduced-motion`.
  - La disponibilidad del catálogo solo pasa de `preparation` a `ready` cuando se cumplan estos criterios. Un error, falta de permiso o falta de datos no se representa como cero pendientes ni conciliación exitosa.


## Corte frontend autorizado — estado de implementación

**Alcance:** cargar archivos CSV/XLS/XLSX localmente, previsualizar datos, mapear campos y presentar sugerencias provisionales contra el análisis CFDI activo en memoria. No se implementa historial ni conciliación contable definitiva.

- [x] Lectura en navegador con límite de 8 MiB y 5,000 movimientos; CSV con comillas/BOM/delimitador, selección de hoja XLS/XLSX, fila de encabezados, tipos de fecha explícitos y reporte de errores.
- [x] Mapeo explícito de fecha, importe y moneda obligatorios; referencia y descripción opcionales; previsualización y corrección antes de comparar. Los datos originales se conservan en la sesión.
- [x] Candidatos explicables con niveles heurísticos Alta/Media/Baja/Sin sugerencia, importe/moneda exactos y ventana de fecha visible. Referencia exacta aporta evidencia; monto diferente se etiqueta como diferencia; colisiones como ambiguas. Cargo/abono no se valida contra CFDI; la revisión humana sigue siendo obligatoria y los niveles no son probabilidades.
- [x] Extracto en memoria de la pestaña; el archivo no se envía a ningún servicio ni se guarda en almacenamiento persistente. El lector Excel se sirve como bundle estático local. No se comparte nada con Nora y el módulo permanece en `preparation`, «Sin conexión bancaria».
- [x] Validación local: 137 pruebas unitarias aprobadas; `npm run build:vercel` correcto; las 6 pruebas E2E nuevas del módulo (CSV, XLSX, matching y móvil en los proyectos de escritorio/Pixel 5) aprobaron. Las cuatro repeticiones aisladas de las dos pruebas públicas que fallaron una vez también aprobaron.
- [ ] Repetir la suite E2E combinada hasta obtener una corrida completa limpia: la última terminó 26/28; dos pruebas de portada/registro mostraron solo el enlace de salto y no el contenido, pero ambas aprobaron al repetirse aisladas. No se identificó una relación con Conciliación bancaria.
- [ ] Persistencia/decisiones de revisión, exportación, historial CFDI guardado, Nora contextual, reglas de cargo/abono, pagos parciales, conciliación bilateral, conexión bancaria y habilitación comercial siguen fuera de este corte y requieren diseño/autorización propios.


## Aula de Aprende — actualización Confianza fiscal

- [x] El Aula usa esquema claro, fondo marfil, tarjetas claras, títulos petróleo y acciones/progreso jade. Sus controles, fases, navegación y paneles de apoyo ya no heredan fondo oscuro ni acentos lavanda. Las acciones con texto blanco pequeño usan jade accesible `#147D68`; el token de marca/progreso sigue siendo `#16866F`.
- [x] El progreso y las fases conservan sus estados y etiquetas; activo/completado en jade, pendiente neutro, revisión en amarillo con texto oscuro y error en coral con texto oscuro. Ningún estado depende solo del color.
- [x] Se conservan Nora y su avatar, el currículo, la secuencia de cinco fases, los materiales, la voz/Anam y los controles existentes sin cambios funcionales ni transmisión nueva de datos.
- [x] La lectura y los controles son legibles en móvil/escritorio, con foco visible, contraste y respeto de `prefers-reduced-motion`, sin desbordamiento global. Se corrigió el resumen móvil de progreso para que los avisos no queden en columnas estrechas.
- [x] Tras autorización posterior explícita, el Aula se publicó mediante `2603999`, firmado con GPG y verificado en GitHub. Vercel terminó READY y `contaia.site` sirve el CSS exacto. El commit incluye solo CSS y pruebas del Aula; los cambios bancarios permanecen locales y sin publicar.

Validación del ajuste: 137 pruebas unitarias aprobadas, sintaxis CSS comprobada con esbuild, build estático correcto y 10 E2E específicos aprobados (4 del Aula y 6 de conciliación, en Chromium/Pixel 5). El Aula se verificó con las cinco escenas reales a 390/1280 px y con comprobaciones de contraste. No se repitió la suite pública completa; se conserva arriba la incidencia intermitente previa. Las capturas locales del componente usan el renderer y avatar existentes, sin sesión autenticada ni datos personales.

Validación de la versión efectivamente publicada: una copia limpia sin el código bancario aprobó 126 unitarias, 4 E2E del Aula y build estático.


---

## Criterios propuestos — Pólizas sugeridas y asistente desplegable


**Estado:** criterios propuestos. La primera entrega frontend local cubre parcialmente estas cláusulas: contexto opaco en memoria, catálogo/reglas declarativas, fuentes CFDI y movimientos seleccionados, importes exactos, balance cargos/abonos, revisión/aprobación local y Nora genérica sin adjuntos automáticos. Las casillas no cubiertas permanecen pendientes; nada de esta sección representa una función publicada. Backend, persistencia, roles, exportación, impuestos, integraciones y contexto estructurado para IA siguen fuera del alcance autorizado.

## 1. Empresa, fuentes y privacidad local

- [ ] El workspace exige empresa/contexto local, periodo y moneda explícitos antes de generar. `companyLocalId` es opaco, no deriva del RFC y puede existir sin crear un perfil fiscal. Un `fiscalProfileId` existente se enlaza solo por selección humana.
- [ ] Catálogo, reglas, fuentes, propuestas y conversación pertenecen a la misma empresa. Un análisis CFDI no se atribuye automáticamente por el perfil abierto; `cfdi_analysis_runs` no se supone asociado a un perfil. El primer incremento consume fuentes elegidas en memoria y no lee el historial remoto automáticamente.
- [ ] Cerrar sesión o cambiar usuario cancela solicitudes y limpia contexto. Cambiar empresa exige cancelar el cambio o descartar expresamente trabajo afectado; borra contexto/historial del asistente y no reutiliza cuentas, reglas o fuentes de otra empresa.
- [ ] XML, movimientos, catálogo y borradores se procesan en memoria sin envío automático ni guardado en localStorage, IndexedDB, tablas actuales o nube. La UI advierte que recargar/cerrar puede perder el trabajo. La descarga/importación opcional de configuración ocurre solo por acción explícita y no contiene pólizas ni fuentes.

## 2. Catálogo de cuentas y reglas por empresa

- [ ] Cada cuenta tiene ID estable, código textual único por empresa —con ceros iniciales preservados—, nombre, naturaleza normal, padre, estado activo, posibilidad de recibir partidas, moneda(s) y versión. No se usan códigos de ejemplo como catálogo oficial del SAT.
- [ ] Se rechazan padres ausentes/de otra empresa, ciclos, códigos duplicados y cuentas incompatibles. Solo cuentas activas, imputables y de moneda confirmada reciben nuevas partidas. La naturaleza normal orienta advertencias; no impide por sí sola cargos/abonos de signo contrario.
- [ ] Una cuenta referenciada no se elimina silenciosamente; se desactiva para nuevas propuestas. Cambiar catálogo revalida borradores afectados y conserva el snapshot de revisiones aprobadas.
- [ ] Las reglas son datos declarativos versionados, con origen/evento, condiciones permitidas, prioridad, partidas/cuentas, importes fuente y motivos de revisión. No aceptan `eval`, código, llamadas de red, funciones libres u operadores/campos desconocidos.
- [ ] «Probar regla» no modifica documentos ni contabiliza; explica coincidencia, cuentas, importes y conflictos. Prioridad explícita puede decidir una regla; empate/conflicto requiere elección humana, sin selección por orden accidental. Importaciones quedan deshabilitadas hasta revisión.
- [ ] Límites propuestos visibles: configuración de hasta 1 MiB, 2,000 cuentas y 200 reglas; plantilla de hasta 10 partidas y lógica de profundidad máxima 4. Exceso o referencias inválidas se rechazan con explicación, sin truncar ni sobrescribir otra empresa.

## 3. Importes exactos y controles para aprobación

- [ ] El primer incremento usa una moneda MXN por póliza. Otra moneda o moneda ausente se muestra como no soportada/pendiente, nunca se convierte a MXN ni se compensa con otra moneda. Extensiones requieren escala y compatibilidad explícitas.
- [ ] El motor conserva entero decimal serializado, escala y moneda; suma cargos/abonos en unidades menores exactas. Formato visual no sustituye el cálculo. No usa flotantes para balancear ni inventa un residual de redondeo.
- [ ] Importe derivado de `Number` se distingue del decimal original. Cuando una regla requiere precisión/evidencia perdida, se solicita recarga local del original o cifras manuales expresamente cotejadas. El adaptador no reconstruye ni declara exactitud original a partir de números redondeados.
- [ ] Cada partida tiene una cuenta válida, un solo lado con cantidad positiva y origen explicable. No acepta líneas vacías, negativos, cargo/abono simultáneos o valores fuera de rango. Se muestran cargos, abonos y diferencia exacta; diferencia distinta de cero bloquea aprobación, sin tolerancia oculta.
- [ ] Cuadrar no basta para aprobar: se requieren empresa/periodo/fecha, cuentas elegibles, evidencia, evento/papel confirmados, versiones y conflictos resueltos. Errores bloqueantes deshabilitan aprobación y explican causas; advertencias no bloqueantes son visibles y, cuando corresponda, requieren reconocimiento expreso.
- [ ] Impuestos estimados y señales del parser no se convierten automáticamente en IVA acreditable/trasladado, deducibilidad, obligación fiscal, tipo de cambio o asiento tributario. La plantilla inicial no inventa impuestos ni tratamiento legal.

## 4. Eventos, duplicados y vínculo bancario

- [ ] I/E/P y signo bancario no determinan solos el papel de la empresa o contrapartida. El usuario confirma rol, tipo de evento y evidencia. Cada fuente conserva identidad/procedencia y se distingue el importe base de la evidencia auxiliar.
- [ ] Factura, pago y movimiento que acredita el pago no se suman como un mismo evento. Reconocimiento y liquidación pueden coexistir como propuestas diferentes, sin registrar nuevamente ingreso/gasto en el cobro/pago por defecto.
- [ ] Se distinguen ocurrencias de pagos y documentos relacionados; compartir UUID de un complemento no convierte sus partidas en duplicados. Códigos/IDs estables no dependen del orden visible de una lista filtrada.
- [ ] Repetir la generación con iguales fuentes, catálogo y reglas no crea copias del mismo borrador. Duplicado de origen se muestra y resuelve sin «último gana». Igual importe/fecha no demuestra duplicidad; documentos diferentes pueden coexistir.
- [ ] Confianza bancaria Alta/Media/Baja es heurística, no aprobación ni confirmación contable. Relación/sentido pendiente exige revisión humana. Parciales, agrupaciones, comisiones, reversas y casos ambiguos permanecen para revisión/manual, sin ajustes ficticios.
- [ ] El adaptador bancario no se habilita ni publica por aprobar el módulo de pólizas. Depende de autorización y disponibilidad del flujo bancario correspondiente; no conecta un banco ni modifica el CFDI.

## 5. Borradores, decisiones y revisiones

- [ ] El usuario distingue Borrador, Requiere revisión, Listo para aprobar, Aprobada localmente, Rechazada y Sustituida; generar o superar el validador nunca equivale a aprobación.
- [ ] La aprobación es humana, expresa e individual sobre una revisión visible, con empresa, periodo, partidas, evidencia y advertencias reconocidas. No se aprueba un lote ni otro borrador por aprobar una fila; IA y matching no aprueban.
- [ ] Cada revisión conserva snapshots y versiones de fuentes/reglas/catálogo, actor de sesión, fecha local, decisión y advertencias. El registro local de acciones no se presenta como auditoría certificada, firma legal o evidencia durable.
- [ ] Editar una póliza aprobada crea una revisión nueva en borrador, sin heredar aprobación; preserva la anterior y vincula su sustitución explícita cuando corresponda. Cambios de configuración no reescriben automáticamente revisiones aprobadas.
- [ ] «Aprobada localmente; no contabilizada» permanece visible. No se crea ledger, actualiza saldo, envía póliza, escribe Supabase/ERP, presenta declaración ni afirma aprobación por un contador distinto. La pérdida del estado en memoria está informada.

## 6. Asistente abierto en cada herramienta

- [ ] Todas las vistas/subespacios reales de herramientas ofrecen «Nora · Asistente abierto» desplegable: CFDI, conciliación cuando esté disponible, pólizas, Nómina, DIOT, Monitor fiscal, Perfil fiscal, Conexiones y Documentos. Una herramienta en preparación ofrece ayuda informativa, no operaciones ficticias. El registro de nuevas herramientas exige adaptador de ayuda o fallback genérico.
- [ ] Está cerrado por defecto y expandir no cambia `state.section`, redirige al asistente global ni envía datos. Texto, proveedor real, privacidad y preguntas sugeridas responden a la herramienta abierta sin cargar automáticamente archivos o perfil.
- [ ] El panel usa modo explícito de conversación abierta y no el tutor curricular. No incluye módulo, ejercicio, fase, progreso, notas o historial educativo. Tampoco copia mensajes/contexto del asistente global o de otra empresa/herramienta.
- [ ] El modo genérico reutiliza `context: {section: "advisor"}` sin API nueva y sin adjuntos/contexto de herramienta. El usuario puede escribir y enviar expresamente una duda; si el proveedor no está disponible se informa y permanece ayuda estática.
- [ ] Cada conversación y solicitud se identifican; cambios de empresa/usuario o cierre cancelan la respuesta activa. Tokens tardíos se descartan, la cancelación no se guarda como respuesta completa y el streaming actualiza solo el mensaje correcto sin reconstruir el workspace.
- [ ] No hereda rutas documentales automáticas, redirección por palabras clave a CFDI, escrituras de perfiles/conexiones ni sesión Anam activa. No llama `/api/documents`, inicia micrófono/video, reproduce respuestas de trabajo ni ejecuta comandos sugeridos. Las cargas propias de cada herramienta siguen separadas del chat.

## 7. Consentimiento y resumen estructurado opcional

- [ ] Abrir, seleccionar una pregunta o preparar contexto no llama a la IA. «Enviar consulta» comparte únicamente pregunta, historial permitido de esa conversación y contexto visible expresamente aprobado. El aviso no promete anonimización de texto sensible escrito libremente por el usuario.
- [ ] El resumen `tool-assistance-v1` no se habilita antes de autorización backend y sanitizador/protecciones correspondientes. No se oculta dentro de `documentText`, `cfdiContext` o campos actuales que el servidor ignora.
- [ ] El contrato futuro tiene versión y herramienta válidas, una sola póliza/candidato, moneda, totales exactos, hasta 10 partidas seleccionadas y lista cerrada de incidencias. Límite propuesto 4 KiB UTF-8, validado en cliente/servidor; exceso pide reducir selección, no trunca en silencio.
- [ ] Por defecto omite empresa/perfil identificable, RFC/nombres, cuentas bancarias, UUID/folios, referencias, descripciones completas, catálogo entero, saldos ajenos, archivos, tokens y credenciales. Etiquetas de cuentas son genéricas salvo consentimiento y contrato posterior explícitos.
- [ ] La vista previa indica campos/cifras exactos, finalidad, proveedor y omisiones. Cancelar/quitar contexto no hace red. Cambiar selección, revisión, empresa o proveedor invalida el permiso previo; la respuesta es orientación, no modificación ni aprobación.
- [ ] Antes de contexto real se definen y verifican autenticación cuando corresponda, límites de mensaje/historial, logs, proveedor y retención. No se crea persistencia de conversaciones ni historial fiscal por implementar el panel.

## 8. Diseño, disponibilidad y alcance de publicación

- [ ] La interfaz usa Confianza fiscal, tipografías y avatares existentes; Borradores/Catálogo/Reglas, bandeja/detalle, validación de totales y una sola acción principal por etapa. Los estados tienen texto/icono y no dependen solo del color.
- [ ] En móvil las partidas se apilan, la ayuda permanece dentro de la herramienta, los controles críticos son táctiles de al menos 44 px y la barra inferior no los tapa. No hay desbordamiento global; teclado, foco, lectores de pantalla y movimiento reducido se conservan.
- [ ] El catálogo comunica preparación/configuración/error con datos reales. Falta de evidencia o proveedor no se representa como cero problemas, validación SAT o operación completada.
- [ ] Cualquier implementación, backend, persistencia, exportación de pólizas, roles, commit o despliegue requiere autorización correspondiente. No incluye pagos, APIs bancarias ni publicación automática de conciliación. El trabajo autorizado actual modifica únicamente documentación.
