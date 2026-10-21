# TODO — evolución visual modular de ContaIA

**Estado:** fases 0–4 implementadas localmente en `feat/visual-modular-tools`. No se hizo commit, push ni despliegue; tampoco se añadieron cambios de backend, operaciones fiscales o integraciones nuevas. Validación final: build estático correcto; 126 pruebas unitarias aprobadas; 20 E2E aprobadas en Chromium de escritorio y Pixel 5; el manifiesto de rutas servido por HTTP coincide exactamente con el archivo fuente.

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
