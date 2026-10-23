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
  - Mantener los formatos actualmente soportados: XML y ZIP; no anunciar ni habilitar PDF en esta iteración. Conservar los límites: hasta 5,000 archivos por lote, XML de hasta 5 MB, ZIP de hasta 20 MB y hasta 25 MB de XML extraídos.
  - Representar validez, advertencias y errores solo según las comprobaciones que el parser/análisis realmente ejecuta. No describirlo como validación oficial del SAT ni afirmar cumplimiento fiscal que no haya sido verificado.
  - El XML y los nombres de archivo permanecen locales; no subirlos ni enviarlos a Nora automáticamente. El guardado opcional continúa almacenando solo el resultado autorizado por el contrato existente. El resumen CFDI se comparte con Nora únicamente por la acción explícita ya disponible y sigue acotado por el backend.
  - Mostrar resultados/hallazgos, relaciones, historial y cifras que ya produzca el análisis; no calcular ni inventar datos nuevos por necesidades visuales. Los enlaces de estudio conducen a módulos o prácticas existentes.

- [x] **Hoja de cálculo fiscal avanzada local**
  - Ofrecer una sección visible después del análisis CFDI para descargar un libro XLSX generado en el navegador, sin enviar XML, RFC, nombres ni resultados a un endpoint nuevo.
  - Incluir siete hojas separadas: Resumen, Comprobantes, Ventas, Compras, Impuestos, Pagos y Conceptos; conservar importes, moneda, tasas IVA 0%/16%, IEPS por tasa/cuota, estados de relación y calidad de lectura.
  - Clasificar Ventas por RFC emisor y Compras por RFC receptor solo cuando la persona haya indicado explícitamente el RFC del comercio/empresa; sin RFC, las hojas quedan sin atribución.
  - Mantener el libro como hoja de trabajo para revisión. El nombre, metadatos y aviso visible no deben presentarlo como declaración, envío, acuse o formato oficial compatible con el SAT.
  - Usar el bundle local de SheetJS, conservar filtros/anchuras de columnas y mantener el flujo responsive; un error de generación debe quedar visible sin borrar el análisis CFDI.

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


---

## Criterios propuestos — DIOT asistida

**Estado:** corte local implementado y validado, aún sin publicar. Permanecen pendientes los elementos que requieren verificación normativa o autorización adicional. La herramienta no presenta declaraciones y no crea backend, tablas, pagos ni conexión con el SAT. El esquema y los catálogos deben verificarse contra la versión oficial vigente antes de habilitar una exportación compatible.

### 1. Alcance, contexto y privacidad

- [ ] La vista se identifica como **DIOT asistida** y comunica de forma persistente: «Prepara, revisa y descarga; no presenta declaraciones».
- [ ] La herramienta permite elegir ejercicio, periodo, contexto de contribuyente y moneda antes de clasificar. No atribuye automáticamente un análisis CFDI a un perfil fiscal solo porque esté abierto.
- [ ] El estado de contexto distingue «Sin configurar», «En preparación», «Requiere revisión», «Lista para descargar», «Descargada para revisión» y «Error».
- [ ] El archivo original, XML, análisis seleccionado, datos de terceros y preparación permanecen en memoria local durante el primer incremento. No se envían automáticamente a `/api/documents`, Nora, Supabase, SAT o un proveedor externo.
- [ ] Si se permite abrir una corrida CFDI guardada, la persona la selecciona explícitamente y la lectura usa la autenticación/RLS existente. No se realizan lecturas masivas ni se crea una nueva tabla.
- [ ] Recargar, cerrar sesión, cambiar de usuario o cambiar de periodo limpia la preparación activa, las decisiones y las descargas pendientes; la UI advierte cuando se perdería trabajo no descargado.

### 2. Esquema versionado y fuentes oficiales

- [ ] Cada preparación conserva `schemaVersion`, fecha de verificación, fuente oficial y estado de vigencia del esquema usado.
- [ ] Las tasas, categorías, campos obligatorios y catálogos no se incrustan como porcentajes históricos en el renderer. Una versión vencida o incompleta bloquea el exportador compatible.
- [ ] La aplicación separa el CSV de trabajo de cualquier archivo compatible con una plantilla oficial. La etiqueta «compatible con versión X» solo aparece después de verificar una plantilla y fixtures de prueba.
- [ ] La fuente y la regla de proveedor global se muestran junto al indicador; una regla de facilidad no se presenta como garantía de cumplimiento.
- [ ] La interfaz conserva evidencia de qué documentación oficial fundamenta el esquema, sin afirmar que ContaIA valida la declaración ante el SAT.

### 3. Selección y normalización de fuentes

- [ ] La persona selecciona de forma explícita los análisis CFDI que alimentarán la preparación y puede ver periodo, fecha de análisis, conteos, monedas y calidad de importes antes de abrirlos.
- [ ] Solo se agrupan facturas, pagos y conceptos provenientes de las fuentes seleccionadas; no se incorporan documentos del historial por coincidencia de RFC o periodo.
- [ ] Cada fila conserva su fuente, UUID/folio disponible, fecha, línea de concepto y calidad del dato. La vista puede ocultar identificadores, pero la trazabilidad local permanece para revisar el total.
- [ ] Los importes se conservan como decimales exactos con moneda y escala. Un número derivado de un análisis legado se marca `derived_from_number` y no se presenta como exactitud original.
- [ ] La ausencia de un importe, moneda, fecha o desglose fiscal produce «Faltante» o «No determinable», nunca cero silencioso.
- [ ] Las filas duplicadas, UUID repetidos, documentos relacionados ambiguos y fuentes recargadas se señalan sin eliminar ni fusionar registros automáticamente.

### 4. Terceros y operaciones

- [ ] La herramienta distingue proveedor nacional, proveedor extranjero y proveedor global solo cuando el esquema vigente los admite.
- [ ] Para proveedor nacional valida el RFC disponible; para proveedor extranjero solicita y valida los identificadores y datos que exija la versión vigente, como nombre, país de residencia y nacionalidad.
- [ ] El tipo de operación se selecciona mediante catálogo cerrado y muestra etiqueta legible, código, versión y procedencia. Una sugerencia automática requiere confirmación cuando hay más de una opción.
- [ ] Los datos originales y normalizados se muestran lado a lado; la normalización no borra ceros iniciales, signos, referencias o nombres originales.
- [ ] Un tercero sin identificador obligatorio, con identidad conflictiva o con operación no clasificada queda en «Requiere revisión» y no se incluye en un archivo final revisado sin acción explícita.

### 5. IVA, importes y agrupación

- [ ] El modelo representa las categorías de base, IVA trasladado, IVA retenido, IVA no acreditable, importación, exento, tasa cero u otras únicamente si existen en el esquema activo.
- [ ] No se mezclan monedas, periodos, categorías ni tratamientos distintos en un mismo total. Los totales se muestran por moneda y categoría.
- [ ] La base y el IVA se comparan con la evidencia disponible del CFDI. Una diferencia se marca y se explica; el sistema no recalcula o completa impuestos para que la fila cuadre.
- [ ] La agrupación se puede abrir hasta sus comprobantes fuente y conserva tercero, operación, periodo, moneda y calidad del importe como claves de agrupación.
- [ ] Un CFDI de ingreso, egreso, pago o traslado no determina automáticamente el tratamiento fiscal final de la persona; las excepciones y el papel del contribuyente requieren contexto y revisión.
- [ ] Los importes con moneda extranjera quedan pendientes si no existe una conversión autorizada, tipo de cambio verificable y regla de esquema aplicable. No se convierten a MXN silenciosamente.

### 6. Proveedor global

- [ ] Proveedor global se muestra como decisión separada y no como una deducción automática de RFC faltante.
- [ ] El indicador de global solo se calcula cuando el total de pagos del periodo está completo y en una base comparable; si no, muestra «No determinable con las fuentes seleccionadas».
- [ ] La UI muestra la versión y fuente de la regla, incluyendo los límites aplicables en esa versión, y separa operaciones candidatas de operaciones excluidas.
- [ ] Antes de agrupar, la persona confirma la operación, el motivo y las advertencias. Los comprobantes que forman el agregado permanecen trazables.
- [ ] Combustibles, beneficios fiscales u otras exclusiones no se absorben en global por defecto. Una operación excluida queda individual o pendiente.
- [ ] El resultado se etiqueta «facilidad sugerida; revisar aplicabilidad», nunca «cumplimiento confirmado».

### 7. Revisión, incidencias y estados

- [ ] Cada incidencia explica fila afectada, dato faltante/conflictivo, motivo y siguiente acción. La interfaz permite filtrar por faltantes, duplicados, moneda, IVA, global y listos.
- [ ] El resumen cuenta filas, terceros, periodos, monedas, operaciones excluidas e incidencias reales. Falta de fuente no se muestra como cero incidencias.
- [ ] El estado «Lista para descargar» requiere que cada fila incluida tenga clasificación, importe, moneda, evidencia y esquema compatibles con el tipo de archivo elegido.
- [ ] Advertencias no bloqueantes se reconocen de forma explícita antes de descargar un archivo marcado como revisado. Reconocer una advertencia no modifica la fuente.
- [ ] Un error de esquema, importe inválido, tercero incompleto, moneda incompatible, duplicado no resuelto o campo obligatorio faltante deshabilita la descarga compatible y explica la causa.
- [ ] Una fila excluida conserva su motivo y aparece en el resumen; excluir no borra el CFDI ni lo presenta como corregido.
- [ ] No existen estados «Presentada», «Aceptada por SAT», «Validada por SAT» o equivalentes.

### 8. Exportación descargable

- [ ] La vista previa muestra nombre de archivo, ejercicio, periodo, versión de esquema, fecha local, número de filas, monedas, exclusiones, incidencias y advertencias.
- [ ] La acción principal se llama **Descargar para revisar** o equivalente y nunca «Presentar», «Enviar» o «Validar ante SAT».
- [ ] El CSV de trabajo conserva encabezados legibles, códigos de esquema, importes exactos formateados, moneda, procedencia y estado de revisión.
- [ ] El JSON de revisión opcional contiene configuración, mapeos y procedencia mínima sin incrustar XML completo por defecto ni secretos.
- [ ] El archivo compatible con formato oficial solo se ofrece para una versión comprobada; su nombre incluye la versión y la UI mantiene la advertencia de que la presentación ocurre fuera de ContaIA.
- [ ] La descarga se genera localmente, no hace una solicitud de red ni cambia el estado a «Presentada». Se puede descargar de nuevo el mismo snapshot sin crear una segunda preparación.
- [ ] Un archivo descargado no se vuelve a importar o sincronizar automáticamente; cualquier nueva preparación requiere acción explícita.

### 9. Nora y ayuda contextual

- [ ] El panel se identifica como **Nora · Asistente abierto · DIOT asistida**, está cerrado por defecto y su apertura no comparte fuentes.
- [ ] Nora puede explicar estados, campos y pasos de revisión de forma genérica. No recibe automáticamente RFC, XML, importes, proveedores, filas ni archivos de exportación.
- [ ] El panel usa la conversación abierta existente y no el tutor curricular: no incluye módulo, fase, ejercicio, progreso, notas ni historial educativo.
- [ ] Solo «Enviar consulta» realiza la consulta al proveedor configurado. El aviso distingue que abrir el panel no comparte datos de la herramienta, pero una pregunta escrita puede enviarse.
- [ ] Nora no cambia categorías, importes, terceros, exclusiones, advertencias, estados ni archivos. Toda modificación requiere una acción humana en el editor.
- [ ] El panel no usa `documentText` o `cfdiContext` como atajo para enviar la preparación DIOT. Un resumen estructurado requiere autorización backend separada.

### 10. Diseño responsive y accesibilidad

- [ ] La ruta de cinco etapas conserva el paso actual visible en móvil y escritorio: Contexto, Fuentes, Clasificar, Revisar y Descargar.
- [ ] En escritorio la tabla puede mostrar columnas de tercero, operación, base, IVA, categoría, evidencia y estado con detalle lateral.
- [ ] En móvil cada fila se convierte en tarjeta o detalle apilado; no hay desbordamiento horizontal global y el resumen de incidencias queda antes de la tabla.
- [ ] Los controles críticos miden al menos 44 px, tienen foco visible, nombres accesibles, `aria-current`, `aria-expanded` y `aria-controls` cuando corresponda.
- [ ] Errores y estados se comunican con texto e iconos además de color. Se respeta `prefers-reduced-motion` y la barra inferior no tapa el botón de descarga.
- [ ] La paleta Confianza fiscal y las tipografías actuales se mantienen sin alterar el Aula ni la navegación de otros productos.

### 11. Pruebas y publicación

- [ ] Las pruebas unitarias cubren normalización reversible, importes exactos, monedas, terceros nacionales/extranjeros, duplicados, categorías, proveedor global, bloqueos y agrupaciones trazables.
- [ ] Las pruebas de exportación comprueban encabezados, versión, orden estable, caracteres, importes, advertencias y ausencia de XML/secrets no autorizados.
- [ ] Las pruebas E2E cubren selección explícita, filtros, corrección manual, exclusión, descarga local, limpieza de sesión, Nora sin envío al abrir y responsive móvil.
- [ ] Una regresión comprueba que CFDI, conciliación y Pólizas no cambian su flujo ni reciben llamadas nuevas por abrir DIOT.
- [ ] La herramienta permanece en preparación hasta completar la verificación del esquema oficial y los criterios anteriores.
- [ ] Cualquier implementación requiere autorización adicional. Commit, push, despliegue, backend, persistencia, autenticación SAT, pagos y presentación automática no quedan autorizados por este documento.

### Corte local implementado — pendiente de publicación

- [x] Workspace local con cinco etapas: Contexto, Fuentes, Clasificar, Revisar y Descargar; estado visible de preparación, revisión, listo y descarga local.
- [x] Selección explícita de CFDI I/E analizados en memoria; no hay lectura de historial, conexión con SAT, API DIOT, persistencia ni envío automático de XML, terceros o importes.
- [x] Clasificación humana de tercero, RFC/ID, operación, categoría e importes; los importes originados por el parser numérico se etiquetan como derivados y requieren cotejo/advertencia.
- [x] Bloqueos deterministas de contexto, RFC/ID, categoría, base, IVA gravado, moneda, duplicados, proveedor global no determinable y exclusiones sin motivo.
- [x] Agrupación con enteros exactos por tercero, operación, categoría, moneda y calidad, con evidencia UUID/folio/fecha conservada localmente.
- [x] CSV/JSON de trabajo descargables solo en navegador; el control de formato oficial permanece deshabilitado y se etiqueta como no disponible.
- [x] Nora contextual cerrada por defecto; abrirla no comparte fuentes y el único envío posible es la pregunta que el usuario escribe explícitamente, sin `documentText` ni `cfdiContext`.
- [x] Pruebas unitarias DIOT, E2E de escritorio/móvil, descarga local y regresión general aprobadas en este corte.
- [ ] Verificar y versionar una plantilla oficial vigente del SAT con fixtures antes de habilitar cualquier exportación compatible.
- [ ] Ampliar la extracción XML con campos fiscales que el parser actual no conserva como texto original, si la especificación verificada lo requiere.
- [ ] Solicitar autorización independiente antes de commit, push o despliegue; no habilitar autenticación SAT, presentación, backend o persistencia nueva.


## Motor CFDI PUE/PPD/REP — corte autorizado 22 octubre 2026

- [x] Conservar códigos de forma/método, decimales originales y ocurrencias de Pago/DoctoRelacionado sin sustituirlos por estimaciones.
- [x] Proponer venta/compra PUE contra cuenta de pago configurada y PPD contra Clientes/Proveedores; separar base neta e impuestos explícitos, sin rellenar faltantes con cero.
- [x] Complemento emitido: cobro de Clientes; recibido: pago de Proveedores. Relacionar UUID y parcialidad, comprobar saldos, moneda, papel y pago acumulado. No reconocer ventas/gastos otra vez.
- [x] IVA PPD pendiente y reclasificación al cobro/pago únicamente con desglose DR explícito y cuentas configuradas. Acreditamiento/deducibilidad no se determinan automáticamente.
- [x] Cuentas por empresa/forma de pago configuradas expresamente; MXN inicial, moneda extranjera, impuestos no soportados, duplicados, precisión perdida y relaciones ambiguas bloquean la propuesta correspondiente. CFDI E exige relación, aplicación humana y cuentas de ajuste explícitas.
- [x] Generación repetida idempotente; conservar revisión aprobada, invalidar borradores ante cambios de fuente/configuración y mantener aprobación humana local sin registro ERP/SAT.
- [x] Integrar el motor en Pólizas existentes con errores visibles y Nora sin fuentes automáticas; incluir auditoría global/parcial local, exportación XLSX de revisión y notas de crédito con decisión humana, sin backend, persistencia ni despliegue.

La evidencia está limitada a fuentes expresamente seleccionadas. Cambiar RFC limpia borradores, selección y cuentas del contexto anterior; cambiar evidencia genera una revisión pendiente y conserva el snapshot anterior, sin heredar aprobación. ObjetoImp ausente no equivale a IVA cero. Los impuestos DR faltantes aparecen como no disponibles, sin prorrateo automático. UUID, bases y pago aplicado deben ser coherentes antes de aprobar.


**Validación final de este corte:** `npm test`: 189/189; `npm run build:vercel`: correcto; `npm run test:e2e -- --workers=1 --timeout=30000`: 60/60 en escritorio y móvil; `git diff --check`: correcto. Los fallos detectados durante revisión se corrigieron antes de esta ejecución final. Sin commit, push ni despliegue.

## Auditoría CFDI y notas de crédito — corte local implementado, pendiente de publicación

- [x] Motor determinista de auditoría global y parcial; mismos códigos/reglas, con alcance, severidad, evidencia, documentos relacionados y estado visibles.
- [x] Diferenciar una relación ausente de una relación existente fuera de la selección o de un filtro parcial; no usar el filtro para declarar que falta un complemento o documento.
- [x] Hallazgos locales para papel RFC ambiguo, UUID/conflicto duplicado, PPD/PUE, complemento sin relación, aritmética de saldo, moneda/equivalencia faltante, impuestos no disponibles, cancelación no verificable, póliza sin evidencia y CFDI E.
- [x] UI para filtrar por periodo, papel, tipo, método, moneda, RFC de tercero, relación, severidad y estado sin mutar el resultado global ni fuentes; detalle con evidencia y motivo de decisión humana.
- [x] CFDI E tratado como ajuste: exige `TipoRelacion 01`, documento relacionado único, papel compatible, importes/IVA originales, cuentas activas y una aplicación humana (reducir saldo, devolución o compensación). No convierte FormaPago/MetodoPago en efectivo, banco o condonación.
- [x] Póliza sugerida emitida/recibida para ajuste con cuentas configurables de descuentos, ajuste IVA y devolución/compensación; permanece en revisión/aprobación local y no registra saldos.
- [x] XLSX local de revisión con Resumen, Hallazgos, Documentos y Evidencia; se etiqueta como reporte de trabajo, no auditoría certificada, declaración, validación SAT ni acuse.
- [x] Pruebas unitarias de auditoría, filtros, aplicación E, relaciones fuera de alcance y exportación XLSX; E2E de escritorio/móvil para auditoría, decisión E, póliza sugerida y descarga local.
- [x] Validación final: `npm test` 195/195, `npm run build:vercel` correcto, `npm run test:e2e -- --workers=1 --timeout=30000` 62/62 y `git diff --check` correcto.
- [ ] Definir política autorizada para divisas/EquivalenciaDR, retenciones, IEPS, múltiples documentos relacionados y reglas fiscales no soportadas.
- [ ] Consultar/validar estado de cancelación ante SAT solo mediante una integración aprobada por separado; mientras tanto mostrar «no verificable».
- [ ] Solicitar autorización independiente antes de commit, push o despliegue. No habilitar SAT, bancos, ERP, backend, persistencia ni presentación automática.


---

## Fase 4 — Capacidades explícitas entre islas

**Estado:** implementada localmente y validada; sin commit, push ni despliegue.

- [x] Broker efímero con token opaco de un solo uso, TTL corto, copia profunda y validación de `sessionEpoch`.
- [x] Toda solicitud exige `explicitUserAction: true`, destino permitido y `sourceIds` pertenecientes a la isla CFDI.
- [x] Snapshot CFDI limitado por destino: DIOT recibe facturas; Pólizas puede recibir facturas y complementos de pago; XML, `File`, `Blob`, buffers y rutas locales quedan fuera.
- [x] El snapshot no cruza por `CustomEvent.detail` ni por almacenamiento persistente. El proveedor se registra bajo `CleanupScope` y se libera al desmontar CFDI.
- [x] CFDI muestra acciones separadas para «Usar en Pólizas sugeridas» y «Preparar DIOT asistida»; los destinos exigen selección posterior dentro de su workspace.
- [x] Cambio de usuario o cierre de sesión invalida leases y snapshots mediante el avance de época, además de ejecutar los resets heredados.
- [x] Validación reproducible del corte: 210 pruebas unitarias, build estático y 70 pruebas E2E aprobadas en serie.
- [ ] Migrar Pólizas/Auditoría y DIOT a `mountIsland()`/`destroy()` independientes; esta capa de capacidades no autoriza todavía esa migración.
- [ ] No añadir backend, persistencia, integración bancaria, presentación SAT, pagos, commit, push ni despliegue sin autorización específica.

**Siguiente fase sugerida:** Fase 5 — Pólizas + Auditoría como isla real, previa confirmación del usuario.


---

## Fase 5 — Pólizas + Auditoría como isla real

**Estado:** implementada localmente y validada; sin commit, push ni despliegue.

- [x] Crear `src/journal/island.js` con `mountIsland()`/`destroy()`, `CleanupScope`, señal de transición y destrucción idempotente.
- [x] Retirar de `main.js` el bind global y el suministro implícito de `cfdiState.analysis` y movimientos bancarios a Pólizas.
- [x] Consumir al montar una capacidad CFDI explícita y una capacidad bancaria explícita; ambas usan leases opacas de un solo uso, `sourceIds` pertenecientes y snapshots limitados.
- [x] Añadir la acción «Usar movimientos revisados en Pólizas» en Conciliación; el handoff conserva únicamente movimientos normalizados, no el archivo bancario.
- [x] Limpiar al desmontar fuentes, drafts, snapshots aprobados, decisiones de auditoría, aplicaciones de notas E y conversación/solicitudes de Nora.
- [x] Añadir `IslandManager.update()` y usarlo para que el streaming de Nora no reconstruya el shell ni remonte Pólizas.
- [x] Validación reproducible: 211 pruebas unitarias, build estático y 72 pruebas E2E aprobadas en serie en escritorio y móvil.
- [x] Mantener DIOT fuera del montaje de Pólizas en esta fase; su migración independiente queda documentada en la Fase 6.
- [ ] No añadir backend, persistencia, pagos, integración bancaria remota, presentación SAT, commit, push ni despliegue sin autorización específica.

**Siguiente fase de ese corte:** Fase 6 — DIOT como isla real; ya completada y documentada abajo.


---

## Fase 6 — DIOT como isla real

**Estado:** implementada localmente y validada; sin commit, push ni despliegue.

- [x] Crear `src/diot/island.js` con `mountIsland()`/`destroy()`, `CleanupScope`, señal de transición y limpieza idempotente.
- [x] Retirar de `main.js` el render y bind globales de DIOT; la ruta usa un host estable administrado por `IslandManager`.
- [x] Consumir el handoff CFDI exclusivamente al montar DIOT y solo después de una acción explícita desde CFDI; una entrada directa no lee análisis abiertos ni historial.
- [x] Registrar bajo `CleanupScope` los listeners de contexto, fuentes, clasificación, revisión, descarga y Nora, conservando compatibilidad con el binding directo de pruebas.
- [x] Limpiar al desmontar preparación, fuentes, selección, overrides, descarga, lease CFDI y conversación de Nora.
- [x] Usar `IslandManager.update()` durante el streaming de Nora para evitar remounts y reconstrucción del shell.
- [x] Validación reproducible: 211 pruebas unitarias, build estático y 74 pruebas E2E aprobadas en serie en escritorio y móvil.
- [x] Mantener Aprende/Estudio fuera del montaje fiscal de esta fase; su migración independiente queda documentada en la Fase 7.
- [ ] No añadir backend, persistencia fiscal, pagos, autenticación SAT, presentación SAT, commit, push ni despliegue sin autorización específica.

**Siguiente fase de ese corte:** Fase 7 — Aprende/Estudio como isla real; ya completada y documentada abajo.


---

## Fase 7 — Aprende/Estudio como isla real

**Estado:** implementada localmente y validada; sin commit, push ni despliegue.

- [x] Crear `src/learn/island.js` con `mountIsland()`/`destroy()`, `CleanupScope`, abortado de transición y destrucción idempotente.
- [x] Montar Aula, Laboratorio y Estudio mediante un host estable gestionado por `IslandManager`, sin mezclar sus estados con CFDI, Conciliación, Pólizas, Auditoría o DIOT.
- [x] Mover la delegación de clics, formularios, `toggle`, entradas y cambios al scope de la isla; las ramas históricas de `main.js` quedan protegidas y no reciben eventos dentro de `[data-learning-island]`.
- [x] Actualizar dentro de la isla las fases del Aula, respuestas, pistas, soluciones, búsqueda/filtros de Estudio y notas sin reconstruir el shell ni remonte de la isla.
- [x] Navegar explícitamente Aula→Estudio→Herramientas→Aula con desmontaje antes de montar el destino; limpiar filtros, selección, borrador de nota, glosario, demostración y módulo abierto al desmontar.
- [x] Conservar el progreso educativo y la base local de estudio autorizados; no añadir persistencia fiscal, backend, API, pago ni transporte de datos hacia Nora o Herramientas.
- [x] Validación reproducible: 211 pruebas unitarias, build estático y 78 pruebas E2E aprobadas en serie en escritorio y móvil.
- [x] Retirar las ramas históricas bloqueadas de handlers educativos después de una regresión específica; la medición de rendimiento queda documentada en la Fase 9.
- [ ] No añadir backend, pagos, integración remota, commit, push ni despliegue sin autorización específica.

**Siguiente fase de ese corte:** limpieza de compatibilidad bloqueada y medición de rendimiento de islas; ya completada y documentada en la Fase 9.


---

## Fase 8 — Recuperación de contraseña con destino

**Estado:** implementada localmente y validada; sin commit, push ni despliegue.

- [x] Inicializar el cliente Auth global en rutas públicas, incluida `/recuperar-contrasena` y `/confirmar-correo`, sin depender de montar CFDI para habilitar la sesión.
- [x] Conservar de forma allowlisted `?destino=curso`, `?destino=cfdi` y `?destino=asistente`; `anam` se normaliza a `asistente` y cualquier otro destino se descarta.
- [x] Solicitar enlaces con `redirectTo` en `/recuperar-contrasena?destino=...` y añadir el rewrite equivalente de Vercel y el fallback del servidor local.
- [x] Detectar el evento Supabase `PASSWORD_RECOVERY`, mostrar «Enlace verificado» y permitir cambiar la contraseña con confirmación, mínimo de 8 caracteres y validación local de coincidencia.
- [x] Actualizar la contraseña únicamente mediante `client.auth.updateUser({ password })`; no registrar ni transportar la contraseña fuera del formulario y limpiar sus campos después de éxito.
- [x] Mostrar estado de éxito y un enlace de retorno a `/?destino=...`, conservando la llegada posterior a Aula, CFDI o Nora.
- [x] El enlace «¿Olvidaste tu contraseña?» del diálogo de inicio de sesión conserva también el destino de producto.
- [x] Validación final: **211 pruebas unitarias**, build estático aprobado y **16 E2E de autenticación** aprobadas en escritorio y móvil; la regresión previa completa dejó **88/90** aprobadas y sus dos fallos históricos de mock CFDI quedaron corregidos y pasaron 6/6 en reejecución.
- [ ] No añadir recuperación por SMS, proveedor alternativo, backend nuevo, tablas, pagos, commit, push ni despliegue sin autorización específica.

**Siguiente revisión de ese corte:** conservar la frontera de Auth y no ampliar el flujo sin una autorización específica.


---

## Fase 9 — Limpieza de compatibilidad y rendimiento de islas

**Estado:** implementada localmente y validada; sin commit, push ni despliegue.

- [x] Retirar del click global los handlers duplicados de módulos, fases, glosario, demostraciones, navegación de Laboratorio, fichas de Estudio y acciones educativas.
- [x] Retirar del shell global el guardado de notas, `toggle` de módulos, búsqueda/filtro de Estudio, respuestas de ejercicios, onboarding y selección de opciones; esos eventos quedan bajo `CleanupScope` de `src/learn/island.js`.
- [x] Conservar únicamente en `main.js` la navegación exterior del shell, Auth, Herramientas, Nora global y los resets/sincronizadores que no pertenecen al contenido educativo.
- [x] Mantener intacto el contrato local de progreso educativo y `study-db`; desmontar una isla sigue limpiando solo estado efímero y no borra progreso autorizado.
- [x] Añadir `tests/e2e/learning-performance.spec.js` con presupuestos de montaje `< 2500 ms`, actualización local `< 500 ms` y navegación `< 2500 ms`, además de comprobar que el host educativo permanece estable durante `update()`.
- [x] Mediciones observadas en Chromium: montaje 391.9 ms, actualización 259.5 ms, navegación 225.6 ms; en Pixel 5: montaje 267.1 ms, actualización 238.4 ms, navegación 248.7 ms.
- [x] Validación final reproducible: **211 pruebas unitarias**, build estático aprobado y **92 pruebas E2E** aprobadas en serie en escritorio y móvil.
- [ ] No realizar optimizaciones de infraestructura, eliminar compatibilidad de Auth ni modificar el esquema educativo sin una nueva autorización.
- [ ] No añadir backend, pagos, integración remota, commit, push ni despliegue sin autorización específica.

**Siguiente fase sugerida:** revisión de rendimiento fiscal y auditoría de listeners en islas, previa confirmación del usuario.

---

## Fases visuales 1–4 — Marco, jerarquía, densidad y vacíos

**Estado general:** Fases visuales 1–4 terminadas localmente y validadas; sin commit, push ni despliegue.

### Fase visual 1 — Tokens compartidos y marco común

- [x] `src/app/island-frame.css` define tokens compartidos de espaciado, gutters, ancho máximo, radios, sombras, foco, duración y curva de movimiento.
- [x] CFDI, Conciliación, Pólizas/Auditoría y DIOT usan `data-island-frame="header"` sin romper clases históricas.
- [x] El encabezado común conserva jerarquía de eyebrow, título petróleo, descripción muted, estado semántico y acciones táctiles.
- [x] `prefers-reduced-motion` y foco visible quedan incluidos en el marco común.

### Fase visual 2 — Jerarquía interna, distribución y movimiento

- [x] `src/app/island-visual.css` normaliza agrupación interna, grids, tarjetas, separadores y distribución mobile-first por isla.
- [x] Las microanimaciones de entrada/interacción son sutiles, no bloquean acciones y se desactivan con `prefers-reduced-motion: reduce`.
- [x] Las pruebas de contrato cubren las cuatro islas y la carga ordenada del CSS común.

### Fase visual 3 — Revisión comparativa específica

- [x] Capturas ficticias comparables de CFDI, Conciliación, Pólizas/Auditoría y DIOT en Chromium de escritorio y Pixel 5.
- [x] Auditoría centra el panel vacío; Conciliación mejora separación de resumen, métricas y tabla; DIOT obtiene stepper móvil con scroll-snap; CFDI conserva su tratamiento.
- [x] Validación reproducible del corte: 225 pruebas unitarias, build estático y 94 pruebas E2E en serie.
- [x] Evidencia externa: `/home/ubuntu/contaia-visual3-comparativa.zip`.

### Fase visual 4 — Estados vacíos y jerarquía de acciones

- [x] Estados sin fuentes o resultados de CFDI, Conciliación, Pólizas/Auditoría y DIOT explican el motivo y muestran el siguiente paso.
- [x] `.island-empty-actions` establece un CTA primario; las rutas alternativas permanecen secundarias y no cambian su contrato de eventos.
- [x] La superficie muted, borde discontinuo y acento jade distinguen el vacío operativo sin convertir pendientes en éxito.
- [x] `island-empty-reveal` solo se activa con movimiento permitido; móvil apila acciones a ancho completo y conserva controles mínimos de 40 px.
- [x] Validación reproducible del corte: 226 pruebas unitarias, build estático y 96 pruebas E2E en serie en escritorio y móvil.
- [x] Evidencia externa: `/home/ubuntu/contaia-visual4-comparativa.zip`.

- [x] Fase visual 5: estados de carga/error y feedback de acciones; el resultado queda documentado abajo.
- [ ] No hacer commit, push ni despliegue sin autorización específica.


---

## Fase visual 5 — Feedback de carga, error y confirmación

**Estado:** terminada localmente y validada; sin commit, push ni despliegue.

- [x] Unificar visualmente estados reales de CFDI, Conciliación, Pólizas/Auditoría y DIOT sin modificar lógica ni contratos de eventos.
- [x] Diferenciar carga con superficie de atención, borde amarillo de validación y spinner de baja amplitud en `.cfdi-processing`.
- [x] Diferenciar errores bloqueantes con coral, fondo marfil rosado, borde izquierdo y acción de recuperación conservando `role="alert"`.
- [x] Diferenciar confirmaciones locales con jade, `role="status"`, borde y entrada suave sin afirmar cumplimiento fiscal ni envío remoto.
- [x] Añadir foco visible común y feedback de controles deshabilitados; en móvil los errores de CFDI apilan su acción a ancho completo.
- [x] Respetar `prefers-reduced-motion`: se desactivan spinner, entrada y transformaciones cuando la persona lo solicita.
- [x] Añadir `tests/e2e/visual-phase5.spec.js` para capturar carga, error y confirmación en las cuatro islas en Chromium y Pixel 5.
- [x] Validación final: **227 pruebas unitarias**, CSS compilado, build estático aprobado y **98 pruebas E2E** aprobadas en serie en escritorio y móvil.
- [x] Fase visual 6: revisar accesibilidad visual de contraste, foco y densidad tipográfica con auditoría específica; el resultado queda documentado abajo.
- [ ] No hacer commit, push ni despliegue sin autorización específica.

**Siguiente fase sugerida:** Fase visual 7 — revisión final de consistencia responsive y evidencia visual.


---

## Fase visual 6 — Auditoría de contraste, foco y densidad tipográfica

**Estado:** terminada localmente y validada; sin commit, push ni despliegue.

- [x] Separar el jade de marca `#16866F` de la tinta accesible `#126A57`, manteniendo la paleta Confianza fiscal y asegurando contraste AA en usos textuales.
- [x] Añadir `--fiscal-text-secondary: #355A5B` y tokens compartidos de cuerpo/meta para texto secundario y etiquetas fiscales.
- [x] Sustituir el foco tenue por un anillo dual jade/petróleo con borde interior marfil para botones, enlaces, pestañas, stepper, filtros, tarjetas interactivas, formularios y acciones de las islas.
- [x] Elevar la densidad mínima de metadatos a 11 px, cuerpo a 13 px y el interlineado común a 1.5; conservar tablas compactas con encabezados de 10 px y celdas legibles.
- [x] Mantener `prefers-reduced-motion` sin transiciones adicionales ni transformaciones para personas que solicitan reducción de movimiento.
- [x] Añadir contrato unitario WCAG determinista y `tests/e2e/visual-phase6.spec.js` para contraste computado, foco real por teclado, interlineado y overflow en CFDI, Conciliación, Pólizas/Auditoría y DIOT.
- [x] Validación final: **228 pruebas unitarias**, CSS compilado, build estático aprobado y **100 pruebas E2E** aprobadas en serie en escritorio y Pixel 5.
- [ ] No hacer commit, push ni despliegue sin autorización específica.

**Siguiente fase sugerida:** Fase visual 7 — revisión final de consistencia responsive y evidencia visual, previa confirmación.


---

## Fase visual 7 — Consistencia responsive y evidencia visual

**Estado:** terminada localmente y validada; sin commit, push ni despliegue.

- [x] Añadir un breakpoint tablet común a 840 px para apilar el encabezado compartido y mantener las acciones de CFDI, Conciliación, Pólizas/Auditoría y DIOT en un patrón consistente.
- [x] Crear `tests/e2e/visual-phase7.spec.js` con fixtures ficticios de estados vacíos y feedback en los cuatro workspaces.
- [x] Auditar tres viewports explícitos: escritorio de 1280 px, tablet de 820 px y móvil de 390 px.
- [x] Verificar ancho global, elementos visibles fuera del viewport, límites del encabezado y del grupo de acciones; los scrollers horizontales intencionales quedan excluidos de la métrica global.
- [x] Generar evidencia visual externa de 24 capturas y manifiesto en `/home/ubuntu/contaia-visual7-evidencia.zip`.
- [x] Validación focalizada: **7 pruebas unitarias visuales**, CSS compilado y matriz responsive aprobada en Chromium.
- [x] Regresión final: **229 pruebas unitarias**, build estático aprobado y **102 pruebas E2E** aprobadas en serie en escritorio y Pixel 5.
- [ ] No hacer commit, push ni despliegue sin autorización específica.

**Siguiente fase sugerida:** no iniciar otra fase visual hasta recibir confirmación; la Fase 7 queda lista para revisión del usuario.

---
## Fase IA A — Contratos puros y router determinista CFDI
**Estado:** terminada localmente y validada; sin commit, push ni despliegue.
- [x] Crear `src/cfdi/ai/tool-registry.js` con registro cerrado y versionado, schemas de entrada/salida, allowlist de herramientas locales CFDI, acción explícita y validación de `sessionEpoch`.
- [x] Bloquear antes de planear o explicar cualquier `File`, `Blob`, `ArrayBuffer`, XML, RFC directo, UUID, folio, contraseña, token, sesión o ruta local; el RFC empresarial se acepta únicamente como parámetro local del reporte fiscal tras acción humana explícita.
- [x] Crear `src/cfdi/ai/intent-router.js` con intenciones deterministas de resumen, alertas, pagos, impuestos, siguiente paso y explicación; las peticiones ambiguas muestran opciones y las no admitidas no inventan herramientas.
- [x] Crear `src/cfdi/ai/cfdi-tools.js` con herramientas locales de resumen, alertas, relaciones de pagos, reporte de impuestos, siguiente paso y contexto seguro, reutilizando `buildCfdiAnalysis`, `buildCfdiTaxReport` y `buildNoraCfdiContext` sin duplicar lógica fiscal.
- [x] Crear `src/cfdi/ai/cfdi-ai-orchestrator.js` para separar petición, enrutamiento, plan, ejecución local, artefacto, evidencia y explicación no solicitada; no llama a Nora, Gateway ni a un modelo en esta fase.
- [x] Integrar cancelación y desmontaje mediante `AbortController` y `CleanupScope`; los cambios de sesión invalidan resultados tardíos y la cancelación limpia operaciones pendientes.
- [x] Añadir `tests/cfdi-ai-orchestrator.test.js` con 11 casos de contratos, privacidad, allowlist, router, ejecución, contexto seguro, sesión y limpieza.
- [x] Validación final: **240 pruebas unitarias** aprobadas, compilación ESM focalizada y build estático aprobado.
- [x] La Fase A mantuvo fuera UI, proveedor/modelo, Gateway, pagos, cuotas Premium, handoffs automáticos y transmisión de archivos o datos sensibles; la integración posterior quedó delimitada a la Fase B autorizada.
**Fase IA B:** terminada localmente y documentada abajo; no realizar commit, push ni despliegue sin autorización específica.

---
## Fase IA B — Integración del orquestador local en la isla CFDI
**Estado:** terminada localmente y validada; sin commit, push ni despliegue.
- [x] Montar `ToolRegistry` y `AiOrchestrator` dentro de `src/cfdi/island.js`, tomando el análisis mediante la capacidad ya existente y registrando el orquestador con `CleanupScope`.
- [x] Añadir al workspace un panel de consulta local con cuatro acciones rápidas: resumen, alertas, pagos y siguiente paso; el formulario acepta hasta 2,000 caracteres y requiere una acción explícita.
- [x] Mostrar artefactos agregados y evidencia (`schemaVersion`, cálculo, revisión humana y estado) sin renderizar XML, RFC, UUID, folios, nombres de archivo ni el análisis completo en el resultado del panel.
- [x] Mantener las acciones de Nora, handoff y otras operaciones fuera del panel de Fase B; las únicas acciones posteriores visibles son navegación local a alertas/pagos, apertura del reporte local y exportación local.
- [x] Invalidar consultas previas al iniciar, cargar o quitar un análisis; destruir el orquestador, cerrar el registro y limpiar consulta, resultado, error y estado ocupado al desmontar la isla.
- [x] Añadir `tests/e2e/cfdi-ai-panel.spec.js` para Chromium y Pixel 5, cubriendo montaje real de la isla, consulta de alertas, consulta de pagos, ausencia de identificadores en el artefacto visible y limpieza.
- [x] Validación final: **240 pruebas unitarias**, compilación ESM/CSS, build estático aprobado y **104 pruebas E2E** aprobadas en serie en escritorio y Pixel 5.
- [x] Mantener fuera de Fase B proveedor/modelo, Gateway, cuotas Premium, persistencia de artefactos, handoffs automáticos y datos adjuntos; Fase C solo reutiliza el adaptador existente con contexto depurado y dos acciones humanas.

---
## Fase IA C — Explicación segura opcional con Nora
**Estado:** terminada localmente y validada; sin commit, push ni despliegue.
- [x] Añadir `AiOrchestrator.explain()` con destino único `nora-advisor`, modo `explain_safe_summary`, época de sesión y cancelación efímera.
- [x] Ejecutar `cfdi.safe_context` antes del adaptador y entregar únicamente `cfdi-summary-v1`; la respuesta del orquestador no devuelve el contexto seguro al workspace.
- [x] Implementar primera confirmación visible en CFDI: resumen numérico, sin XML, archivos, RFC, UUID, folios, nombres ni movimientos originales.
- [x] Reutilizar el adaptador existente `onAskNora`; tras la primera confirmación se abre Asistente abierto con un borrador revisable y el envío a Nora permanece detrás del botón Enviar como segunda acción humana.
- [x] Mantener disponible el resultado local si Nora no está configurada, falla el adaptador o cambia la sesión; no convertir la explicación en resultado fiscal.
- [x] Añadir pruebas unitarias de allowlist, explicit action, doble sanitización y salida sin `safeContext`, más E2E en Chromium y Pixel 5 para confirmación, payload depurado y limpieza.
- [x] Validación final: **241 pruebas unitarias**, compilación ESM/CSS, build estático aprobado y **104 pruebas E2E** aprobadas en serie en escritorio y Pixel 5.
- [x] Mantener fuera de Fase C nuevas cuotas Premium, persistencia de conversaciones, envío automático, handoffs y acciones fiscales; el planner posterior queda limitado a selección de herramientas read-only.

---
## Fase IA D — Planner JSON cerrado y controlado
**Estado:** terminada localmente y validada; sin commit, push ni despliegue.
- [x] Crear `src/cfdi/ai/planner.js` con schema cerrado `cfdi-planner-v1`, cuatro intenciones permitidas y catálogo derivado solo de herramientas `modelCallable`.
- [x] Excluir `analysisRef`, XML, archivos, RFC, UUID, folios y fuentes completas del request enviado al planner; la petición textual se normaliza y se rechazan patrones identificables antes de red.
- [x] Ejecutar el planner únicamente cuando el router determinista devuelve `unsupported`; las peticiones ambiguas siguen mostrando opciones y no llaman al planner.
- [x] Añadir `validatePlannerPlan()` al `ToolRegistry`: rechaza propiedades extra, versiones inválidas, herramientas mutantes/no allowlisted, argumentos extra, `analysisRef`, revisión humana falsa y discrepancias entre intención y herramienta.
- [x] Añadir `POST /api/cfdi/planner`; usa el modelo configurado en el Gateway existente, solicita `json_schema` estricto y vuelve a validar la salida en servidor antes de responder.
- [x] Conectar el cliente solo con `{ message }`; la ejecución posterior inyecta `analysisRef` localmente después de validar el plan y conserva el cálculo en navegador.
- [x] Añadir pruebas de prompt injection, salida manipulada hacia `cfdi.tax_report`, rechazo de identificadores, contrato cliente/servidor y E2E de ejecución local del plan.
- [x] Validación final: **249 pruebas unitarias**, compilación focalizada, build estático aprobado y **106 pruebas E2E** aprobadas en serie en escritorio y Pixel 5.
- [ ] No agregar todavía planner con herramientas mutantes, acceso a fuentes completas, persistencia de prompts, nuevas cuotas Premium ni acciones fiscales; requieren otra fase y autorización.
**Fases IA E0 y E1:** contrato de gobernanza y DLP local completados; la siguiente propuesta es E2, previa autorización explícita.

---
## Fase IA E0 — Contrato de gobernanza IA
**Estado:** terminada localmente y validada; no activa runtime, sin commit, push ni despliegue.
- [x] Crear `AI_GOVERNANCE_CONTRACT_VERSION = ai-governance-v1` y clases `local_sensitive`, `local_derived`, `safe_summary`, `planner_text`, `telemetry_aggregate` y `entitlement_aggregate`.
- [x] Declarar políticas por endpoint para planner CFDI, Nora, futura admisión comercial y observabilidad; el planner solo permite `message` y la telemetría no permite prompts, bodies, headers ni datos fiscales.
- [x] Fijar cuotas arquitectónicas iniciales: planner Free/Premium 20/200 por mes, explicación 10/100, snapshot Nora 0/50, concurrencia 1/2 y 2,000 caracteres por petición.
- [x] Crear `AI_MODEL_CAPABILITIES_V1` con estado inicial `unapproved`, proveedores permitidos y requisitos de JSON Schema estricto, structured output, cancelación y política de retención.
- [x] Registrar amenazas E-01 a E-12, códigos de error canónicos y eventos `ai.*` de observabilidad redacted.
- [x] Validar que los eventos solo admitan escalares y referencias opacas; se rechazan campos como `message`, `prompt`, `body`, `content`, `xml`, `rfc`, `uuid`, `cfdiContext`, `safeContext`, tokens y API keys.
- [x] Añadir `tests/cfdi-ai-governance-contract.test.js`: **8/8 pruebas unitarias** aprobadas.
- [x] Confirmar que E0 no añade `fetch`, persistencia, logging real, endpoints, entitlements ni rate limiting distribuido.
- [x] E1 implementada por separado: DLP runtime local, modo planner estricto, bloqueo antes de Gateway y pruebas de redacción.
- [ ] Mantener E2+ pendientes: identidad/entitlements, cuotas server-side, rate limit distribuido, circuit breaker, telemetría real, revisión de proveedores y UI Premium.

**Contrato entregado:** `contaia-ai-phase-e0-governance-contract.md` y `src/cfdi/ai/ai-governance-contract.js`.
**Siguiente fase sugerida:** Fase IA E2 — admisión, identidad, entitlements y cuotas server-side, previa autorización explícita.

---
## Fase IA E1 — `AiDataLossPreventionGate` local
**Estado:** terminada localmente y validada; sin commit, push ni despliegue.
- [x] Crear `src/cfdi/ai/ai-dlp-gate.js` con política `ai-dlp-v1`, normalización Unicode NFKC, eliminación controlada de zero-width, control de caracteres y límite de 2,000 caracteres.
- [x] Detectar y clasificar XML/CFDI, UUID, RFC, CURP, NSS, CLABE/cuenta, tarjetas, correo, teléfono, nombres/domicilios etiquetados, URLs con query, tablas, JSON y bloques codificados.
- [x] Emitir decisiones `allow`, `confirm` o `block`; el planner opera en modo estricto y detiene tanto señales medias como altas antes de `fetchImpl`.
- [x] Generar preview local redacted sin conservar texto sensible en `normalizedMessage` cuando la petición no es permitida; errores y previews no incluyen el valor original.
- [x] Integrar el gate en `src/cfdi/ai/planner.js`, de modo que la validación se repita en la frontera server-side antes de llamar al Gateway.
- [x] Mantener diferenciados `planner_input_invalid`, `planner_input_sensitive` y `planner_input_confirmation_required`.
- [x] Añadir `tests/cfdi-ai-dlp-gate.test.js` y ampliar `tests/tutor-server.test.js` para probar que XML, identificadores, contactos y tablas no alcanzan Gateway.
- [x] Validación final: **265/265 pruebas unitarias**, **21/21 pruebas focalizadas** de DLP/servidor, **4/4 E2E focalizadas** del panel CFDI, compilación focalizada y build estático aprobados.
- [ ] Mantener fuera de E1 DLP semántico para imágenes/audio/archivos, UI de confirmación para señales medias, autenticación, entitlements, cuotas distribuidas y telemetría conectada.

**Contrato entregado:** `contaia-ai-phase-e1-dlp-gate.md` y `src/cfdi/ai/ai-dlp-gate.js`.
**Siguiente fase sugerida:** Fase IA E2 — implementar `AiAdmissionService`, identidad, entitlements y cuotas server-side, previa autorización explícita.

---
## Papeles de trabajo IA — WP0/WP1
**Estado:** terminadas, validadas e incluidas en el checkpoint de publicación autorizado en esta tarea.
- [x] Definir `contaia-workpapers-ia-contract.md`: límites de solo lectura, snapshots autorizados futuros, modelo de libro, estados de fuente, procedencia por rango, capacidades Free/Premium y roadmap WP2–WP5.
- [x] Crear la isla `workpapers` con `CleanupScope`, estado efímero y sin capacidades, handoffs, `fetch`, endpoints, IA remota, créditos, persistencia, Workers ni lectura de fuentes reales.
- [x] Integrar una tarjeta **Demo disponible** en ContaIA Herramientas, menú de escritorio y tema fiscal; la barra inferior móvil mantiene sus cinco destinos y resalta Herramientas.
- [x] Implementar demo con tres periodos ficticios, métricas/tendencia, cinco pasos (fuentes, regla, póliza, hoja y confirmación), pestañas de procedencia/planes, fórmulas visibles y aceptación o descarte simulado de reglas.
- [x] Mostrar en cada vista que no se consultan CFDI, bancos, perfiles ni pólizas reales; no se genera XLSX, no se modifica contabilidad y no se guardan decisiones al salir.
- [x] Añadir `tests/workpapers-demo.test.js` y `tests/e2e/workpapers-island.spec.js`; validan fixtures sin identificadores fiscales, render, reset, navegación, cambio de periodo, procedencia, foco/contención en tema fiscal y limpieza al desmontar.
- [x] Validación final: **270/270 pruebas unitarias**, **2/2 E2E focalizadas** en Chromium y móvil, build estático y **108/108 E2E validadas**; el caso responsive restante se aprobó en reejecución aislada con timeout ampliado.
- [ ] Mantener fuera de WP0/WP1: snapshots locales reales y autorización por fuente (WP2), motor de fórmulas/XLSX y descarga local (WP3), sugerencias IA controladas (WP4), dashboard/proyección y auditoría de rendimiento (WP5), además de E2–E6 para IA remota y controles comerciales.

**Entregable:** `contaia-workpapers-ia-contract.md`, `src/workpapers/` y la tarjeta de demo en Herramientas.
**Siguiente fase sugerida:** WP2 — `WorkpaperEngine` local con selección explícita de snapshots CFDI/Conciliación/Pólizas y recálculo por periodo; requiere autorización específica.

---
## Visibilidad híbrida y producto IA — Asistente IA CFDI + WP0/WP1
**Estado:** implementado localmente, validado e incluido en el checkpoint de publicación autorizado en esta tarea; Free/Premium permanece pendiente.
- [x] Añadir `Asistente IA CFDI` al catálogo de ContaIA Herramientas con estado `Listo`, CTA propio y descripción de la frontera local-first.
- [x] Mostrar en la tarjeta el modelo operativo: reglas y resultados locales, planner remoto opcional solo para preguntas depuradas y revisión humana obligatoria.
- [x] Conectar la tarjeta con el workspace CFDI existente; no se creó una isla duplicada ni se cambió el ciclo fiscal.
- [x] Mostrar un bloque visible `Asistente IA para CFDI` antes del análisis con estado `Disponible después del análisis` y después del análisis con estado `Listo para consultar` y CTA hacia la consulta.
- [x] Actualizar el panel interno a `ASISTENTE IA CFDI · CONSULTA LOCAL`, `LOCAL-FIRST` y copy explícito de la ruta híbrida.
- [x] Actualizar la landing pública para explicar que el Asistente IA CFDI está disponible después del análisis local.
- [x] Mantener el contrato Free/Premium sin activar: no se agregaron planes, créditos, bloqueos, upgrade, pagos ni entitlements comerciales.
- [x] Conservar WP0/WP1 como demo local con datos ficticios, fórmulas y procedencia visible; la demo no consulta fuentes reales, no llama IA, no genera XLSX ni persiste información.
- [x] Validación: **270 pruebas unitarias**, build estático aprobado, **107/108 E2E** aprobadas en la regresión completa y el único caso restante de navegación responsive aprobado en reejecución aislada con timeout ampliado (**108/108 validadas**).
- [x] Privacidad: la tarjeta y los cambios visuales no agregan endpoints, persistencia ni transmisión automática de XML, bancos, pólizas o datos fiscales.
**Siguiente propuesta:** mantener Free/Premium pendiente y decidir después si se autoriza una fase comercial; no iniciar nuevas fases automáticamente.


---
## Fase IA E2 — Admisión, identidad y cuotas server-side
**Estado:** terminada; se publica mediante el checkpoint firmado de esta fase.
- [x] Crear `ai-admission-v1` con límites Free/Premium y periodos mensuales UTC.
- [x] Validar Bearer con Supabase `auth.getUser` y derivar solo `accountId` opaco.
- [x] Resolver entitlement server-side: Free por defecto; Premium solo mediante configuración privada explícita; estado desconocido cae a Free.
- [x] Reservar, cerrar o liberar consumo con idempotencia antes de Gateway para planner y `cfdi-summary-v1`.
- [x] Enviar Authorization e Idempotency-Key desde clientes sin añadir datos fiscales al body.
- [x] Probar que manipular body, reintentos o la configuración cliente no desbloquea Premium ni duplica consumo.
- [x] Validar **281/281** unitarias, build estático, **6/6** E2E focalizadas y **110/110** E2E completas; sin datos fiscales reales ni artefactos de test conservados.
**Siguiente fase propuesta tras E2:** E3 — rate limit distribuido, resiliencia y circuit breaker, previa confirmación explícita.


---
## Fase IA E3 — Rate limiting distribuido, TTL y circuit breaker
**Estado:** terminada, validada y publicada en el checkpoint firmado de E3; la activación Redis real sigue pendiente de secretos privados.
- [x] Crear store Redis REST opcional con operaciones atómicas Lua de reserva, cierre y liberación por cuenta opaca, capability y periodo UTC.
- [x] Aplicar TTL de 30 segundos a reservas y retención de 62 días para distinguir `reserved`, `completed`, `released` y `expired` sin permitir replay silencioso.
- [x] Mantener store en memoria compatible solo para desarrollo/pruebas cuando no existan las variables privadas del store distribuido; la configuración inválida falla cerrada para la admisión remota.
- [x] Añadir circuit breaker por proveedor/modelo: tres fallos transitorios abren 30 segundos, una sola prueba half-open y cierre tras éxito.
- [x] Añadir timeout de Gateway de 15 segundos, `Retry-After` seguro y liberación de reservas en timeout, abort o error.
- [x] Mantener límite inmediato por IP como defensa secundaria y no confiar en él como cuota comercial.
- [x] Cubrir atomicidad, TTL, expiración, replay, fallos del store, estados del breaker y fallback local sin datos fiscales.
- [x] Validar **290/290 pruebas unitarias**, build estático, **9/9 pruebas E3 focalizadas**, **24/24 E2E focalizadas** y **110/110 E2E** completas en serie.
- [ ] Las variables `AI_RATE_LIMIT_KV_REST_URL` y `AI_RATE_LIMIT_KV_REST_TOKEN` quedaron preparadas pero no configuradas en este sandbox; la activación distribuida real requiere definirlas como secretos privados en Vercel.
- [ ] No se añadió todavía un semáforo distribuido independiente para `tools.ai.concurrent.requests`; queda como parte de la siguiente revisión de capacidad/resiliencia.
**Siguiente fase propuesta tras E3:** E4 — observabilidad redacted y métricas agregadas sin prompts ni datos fiscales, previa confirmación explícita.


---
## Fase IA E4 — Observabilidad redacted y métricas agregadas
**Estado:** terminada, validada y publicada en el commit firmado `f517c92`; Vercel reportó los despliegues de producción como `READY`.
- [x] Crear el contrato `ai-observability-v1` sobre los eventos E0 existentes, con campos enumerados y sin prompts, cuerpos, headers, XML, RFC, UUID, importes, cookies, tokens ni credenciales.
- [x] Implementar un registry de métricas en memoria que conserva únicamente contadores y buckets de latencia; no guarda eventos completos ni textos de solicitud.
- [x] Emitir eventos seguros para admisión permitida/bloqueada, planner solicitado/completado/fallback, explicación CFDI sanitizada/confirmada/fallida y cancelación de lifecycle.
- [x] Permitir un sink de logs redacted solo mediante `AI_OBSERVABILITY_SINK=console`; el entorno de pruebas usa sink nulo.
- [x] Instrumentar planner CFDI y explicación `cfdi-summary-v1` sin cambiar el payload remoto ni exponer el snapshot.
- [x] Añadir pruebas de no filtración, enums, agregación, buckets, sink y rutas server-side.
- [x] Validar **301/301 pruebas unitarias**, build estático aprobado, **24/24 E2E focalizadas** y **110/110 E2E** completas en serie.
- [ ] No se añadió un endpoint público de métricas, persistencia de eventos, dashboard externo ni telemetría con datos fiscales; E5 queda pendiente.
**Siguiente fase propuesta tras E4:** E5 — matriz y aprobación de modelos/proveedores, previa confirmación explícita.


---
## Fase IA E5 — Matriz y aprobación formal de modelos/proveedores
**Estado:** terminada localmente y validada; sin commit, push ni despliegue de esta fase.
- [x] Registrar el catálogo vivo consultado el 23 de octubre de 2026 como evidencia de candidatos; no usar IDs del catálogo como configuración automática del Gateway.
- [x] Crear `ai-model-approval-v1` con entradas exactas por proveedor/modelo, estado, capacidades requeridas, política de retención, evidencia de revisión, aprobador y expiración.
- [x] Rechazar por defecto entradas ausentes, `candidate`, `deprecated`, `superseded`, preview sin aprobación, proveedor no allowlisted o cualquier modelo sin JSON Schema estricto, structured output, abort signal y salida acotada.
- [x] Leer la matriz únicamente desde `AI_MODEL_APPROVALS_JSON` privado de servidor; nunca desde frontend, query string, body, localStorage o variables públicas.
- [x] Bloquear planner y Nora remota antes de Gateway con `ai_provider_unapproved`, conservando herramientas locales, resultados CFDI y fallback local.
- [x] Mantener `configuredProviders()` sin secretos y añadir solo `approvalStatus` seguro, sin convertir la UI en autoridad de seguridad.
- [x] Añadir pruebas de matriz válida, campos extra, modelo expirado, capacidades insuficientes, proveedor no permitido, JSON inválido y bloqueo previo a Gateway.
- [x] Validar catálogo vivo, **309/309 pruebas unitarias**, build estático aprobado, **24/24 E2E focalizadas** y **110/110 E2E** completas en serie; no se activó ningún proveedor nuevo automáticamente.
**Contrato entregado:** `contaia-ai-phase-e5-model-approval.md`.
**Siguiente fase propuesta tras E5:** E6 — UX Premium, canary sintético y aprobación de lanzamiento, previa confirmación explícita.
