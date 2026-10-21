# Plan de implementación — evolución visual modular de ContaIA

**Estado:** aprobado por el usuario para implementar localmente las fases 0–4. No se autorizaron commit, push, despliegue, cambios de backend ni nuevas operaciones fiscales.

## Objetivo

Evolucionar ContaIA hacia un centro coherente de aprendizaje y control fiscal que combine claridad profesional, motivación educativa y acompañamiento contextual de Nora. La primera iteración rediseñará el centro de Herramientas, establecerá una estructura común para sus espacios y usará el importador CFDI como referencia real, **sin cambiar las capacidades, reglas, persistencia, APIs ni transmisión de datos existentes**.

La interfaz distinguirá lo que ya funciona de lo que está en preparación: ninguna herramienta se presentará como operativa, integrada o conectada si la aplicación no puede respaldar esa afirmación con datos reales.

## Estado actual y condicionantes del proyecto

La aplicación es una SPA servida desde `public/index.html`; `src/main.js` elige Aula, Laboratorio, Herramientas, CFDI, Estudio o Nora mediante `state.section`. El Aula y otras vistas internas no requieren nuevas rutas públicas para esta iteración. El build estático copia el sitio a `dist/` desde `scripts/build-site.js`; `vercel.json` ya configura la publicación y las rutas públicas.

La vista real del centro de herramientas se construye en `src/tools/panel.js` y usa `src/tools/workspace.js`, `client.js` y `server.js`. Existe también `src/tools/ToolsPanel.jsx` con catálogo paralelo; antes de ampliar la interfaz se debe evitar que ambos catálogos diverjan y conservar como punto de partida el renderer que realmente monta `src/main.js`, sin reescribir la SPA a React.

Herramientas ya permite gestionar perfiles fiscales y registrar conexiones por herramienta y ambiente; registrar una conexión no configura ni verifica por sí solo un proveedor. La API acepta alertas y vencimientos, pero la UI no muestra aún un monitor alimentado por datos visibles. CFDI sí tiene capacidades reales: importación local XML/ZIP, revisión previa de lotes, análisis y relaciones entre comprobantes, resultados, alertas, historial opcional en Supabase y transferencia explícita de un resumen acotado a Nora. Contabilidad, Nómina y DIOT están en preparación o son informativas: no hay evidencia de modelos operativos de movimientos/conciliación, cálculos de nómina o declaraciones DIOT. Documentos dispone de piezas de lectura/carga en el asistente, pero no equivale todavía a una biblioteca fiscal completa.

El progreso de curso y ejercicios se conserva localmente y separado de los datos fiscales. No se observó un modelo de insignias, objetivos semanales o actividad operativa transversal. Las tablas actuales de `fiscal_profiles`, `tool_connections`, `fiscal_alerts` y `fiscal_deadlines` no deben interpretarse como prueba de una integración activa o de una operación fiscal completada.

## Alcance propuesto

### Primera iteración

1. Rediseñar la pantalla principal de **Herramientas** como hub profesional y responsive, con perfil/contexto, actividad real disponible, pendientes/alertas existentes y tarjetas con acción principal clara.
2. Definir una plantilla visual compartida para las herramientas, reutilizable sin sustituir sus controladores ni cambiar sus contratos: encabezado con nombre, descripción, estado y acción primaria; resumen; área de trabajo; resultados/historial cuando existan; ayuda contextual de Nora; siguiente paso y enlace a Aula/Base de estudio.
3. Adaptar **CFDI** como demostración del patrón usando su flujo actual: carga y revisión previa, análisis local, hallazgos, resultados, historial y envío explícito del resumen a Nora. Añadir enlaces de continuidad educativa solo si pueden llevar a módulos/prácticas existentes.
4. Llevar la nueva paleta a Herramientas y al marco compartido de la primera iteración, manteniendo accesibilidad, privacidad y estados textuales además de color.
5. Integrar el diseño mobile-first en las mismas vistas, respetando la navegación interna y las acciones actuales.

### Posterior, sujeto al resultado y a nueva aprobación de alcance

- Metas semanales e insignias sincronizadas requieren definir primero eventos, reglas y persistencia; no se inventarán métricas.
- Ampliación de los espacios de Contabilidad, Nómina, DIOT, Monitor fiscal, Perfil, Conexiones y Documentos según datos y operaciones que efectivamente existan. La creación de cálculos, conciliaciones, presentación/declaración, alertas automáticas, almacenamiento documental, nuevas tablas o integraciones se considera trabajo funcional/backend independiente y requerirá autorización específica.
- Modo oscuro para análisis/IA como decisión opcional posterior; no se impondrá un tema global en la primera iteración.

## Arquitectura y estructura del proyecto

- `public/index.html`, `public/manus-routes.json`: shell público y manifiesto de rutas. La iteración inicial no añade rutas públicas; las secciones internas siguen usando `state.section`.
- `src/main.js`: composición de vistas y navegación actual. Se mantiene como punto de entrada; solo se ajusta la composición visual necesaria para insertar el marco común sin alterar eventos ni sesiones.
- `src/styles.css`: tokens globales y estilos del shell; se añadirán tokens semánticos nuevos con alcance controlado, conservando alias y temas heredados durante la transición.
- `src/tools/panel.js`: renderer activo del hub y de sus tarjetas. Será la base para la jerarquía nueva y el catálogo unificado.
- `src/tools/ToolsPanel.jsx`: componente/catálogo paralelo. Se verificará su uso real y se evitará mantener dos definiciones incompatibles; no se hará una migración de framework como parte del plan.
- `src/tools/workspace.js`, `client.js`, `server.js`: estado/eventos del espacio, acceso a API y contratos existentes de perfiles, conexiones, alertas y fechas. Se conservan sus contratos; el marco visual consume los datos disponibles y respeta sus estados vacíos.
- `src/cfdi/workspace.js`, `parser.js`, `analysis.js`, `relations.js`, `upload-queue.js`, `cfdi.css`: importador y análisis CFDI. Se conserva su lógica; la adaptación visual reutiliza la cola de revisión publicada y el handoff explícito a Nora.
- `src/course.js`, `classroom.js`, `exercises.js`, `progress.js`, `glossary.js`, `study-db.js`: módulos, prácticas, conocimiento y progreso educativo local. Son la fuente para enlaces y progreso de aprendizaje, no para métricas fiscales.
- `src/tutor/*`: contexto, chat/streaming, documentos, voz y sesión opcional de Anam. Nora se contextualiza con los datos ya autorizados por cada flujo; Anam, micrófono y envío de documentos no se activan automáticamente.
- `src/auth/*`, `src/documents/*`, `scripts/build-site.js`, `server.js`, `vercel.json`, `tests/*`: autenticación, funciones documentales, build/serving y pruebas existentes. Se mantienen los contratos de publicación y los controles de privacidad.

Se propone añadir un pequeño módulo de **metadatos semánticos de herramientas** y un renderer puro del marco común (por ejemplo, bajo `src/tools/`). El registro separará: (a) madurez/disponibilidad del módulo —operativo, requiere conexión o en preparación— y (b) estado de conexión —sin configurar, pendiente, conectada, requiere revisión o error—. El renderer recibirá datos ya obtenidos por los controladores actuales; no hará llamadas de red ni mutará estado. Las etiquetas, descripciones y CTAs por herramienta se centralizarán para que panel, shell e indicadores compartan una única fuente de verdad.

## Dirección de diseño

- **Movimiento:** editorial fiscal contemporáneo; combina lectura de archivo contable, precisión de una herramienta financiera y calidez de un aula acompañada.
- **Principios:** primero claridad y confianza; una acción primaria por vista; estados verificables y legibles; aprendizaje integrado sin interrumpir el trabajo.
- **Filosofía de color:** el azul petróleo `#123B43` estructura navegación, encabezados y análisis; el jade `#16866F` señala acciones y progreso positivo; el marfil `#F5F4EC` sostiene lectura; la arena `#E4E6D8` agrupa información secundaria; el coral `#E98268` reserva atención a pendientes/riesgos; el amarillo `#D9B84C` destaca recomendaciones y logros. Los significados se acompañan siempre de texto, icono y contraste, no solo color.
- **Convivencia con la marca actual:** la paleta nueva se introduce primero en Herramientas, shell y CFDI mediante tokens y límites de tema. `brand-spec.md` reserva actualmente la lavanda/menta oscura al Aula en vivo y AuditPro a CFDI; la primera iteración no sobrescribirá `:root` ni cambiará globalmente el Aula/login. Una extensión de la paleta al Aula o un modo oscuro nuevo se decidirán después de revisar la primera entrega.
- **Paradigma de layout:** escritorio con encabezado breve, franja de resumen y espacio de trabajo centrado en la tarea, acompañado por un carril contextual lateral; las tarjetas se usan para elegir herramientas, no como patrón para todas las pantallas. En móvil, contenido apilado, CTA principal visible, áreas táctiles amplias y navegación inferior de cinco destinos —Inicio, Curso, Estudio, Herramientas y Nora— mapeados a vistas/handlers existentes, sin ocultar estados ni cambiar flujos funcionales.
- **Motivos distintivos:** reglas finas de hoja contable en superficies seleccionadas; sello discreto para revisión/validación; nodos conectados para una ruta de aprendizaje; iconos funcionales de factura, calculadora y carpeta en herramientas relacionadas. Reutilizar los cuatro avatares locales de Nora para los estados listo, explicando, pensando y celebrando cuando correspondan a una acción real. Texturas/grano y símbolos fiscales se limitan a hero, login y estados vacíos para no competir con tablas y documentos.
- **Interacción:** la pantalla responde a “qué herramienta es”, “qué requiere atención”, “qué hago ahora” y “qué resultado obtuve”. Acciones son explícitas; estados de error/revisión tienen explicación y recuperación; Nora ofrece ayuda contextual sin abrir sesiones o enviar contenido por su cuenta.
- **Animación:** transiciones breves y funcionales (aprox. 150–220 ms), confirmación de estado y progreso al completar acciones reales; evitar movimiento decorativo continuo. Respetar `prefers-reduced-motion`, teclado y foco visible; no desmontar el nodo de vídeo/WebRTC de Anam durante rerenderizados.
- **Tipografía:** mantener Alegreya Sans para interfaz/lectura y DM Mono para datos compactos/etiquetas, según `brand-spec.md`; reforzar jerarquía con tamaños, interlineado y espacios en múltiplos de 4 px, radios discretos y sombras moderadas.
- **Esencia de marca:** “Un centro fiscal para aprender, practicar y actuar con contexto”; personalidad confiable, clara y didáctica.
- **Voz:** directa, serena y basada en evidencia. Ejemplos: “Revisa estos hallazgos antes de continuar.” / “El XML permanece en tu dispositivo; analiza el lote cuando esté listo.”
- **Marca y logotipo:** conservar el wordmark/marca existente y `public/favicon.svg`; no rediseñar el logo en esta iteración. Usar las reglas de hoja y el sello de validación como recursos de interfaz, no como sustitutos de la marca.
- **Color insignia:** azul petróleo `#123B43`, combinado con el jade como color de acción.

## Secuencia de implementación

### Fase 0 — Acordar base visual y semántica

Introducir tokens de la paleta «Confianza fiscal» con nombres por rol y alcance explícito. Definir los estados de herramienta y conexión como conceptos distintos; mapear el catálogo actual y sus acciones a esos conceptos. Resolver la fuente única del catálogo sin reescribir el framework. Esta fase prepara la pantalla sin cambiar las respuestas ni llamadas de API.

### Fase 1 — Centro principal de Herramientas

Reorganizar `renderToolsPanel()` en torno a prioridades y acciones: perfil fiscal y estado, señales de actividad con datos presentes, luego herramientas agrupadas por objetivo y disponibilidad. Mostrar explícitamente conexión no configurada, pendiente, conectada, revisión/error y preparación del módulo, con texto y acciones pertinentes. Si alertas, fechas o actividad están vacías, mostrar un estado vacío útil en lugar de contadores o registros ficticios. Adaptar jerarquía y navegación a móvil sin retirar accesos actuales.

### Fase 2 — Marco compartido de herramienta

Crear el shell de presentación reutilizable y delgado. La metadata define título, descripción, estado de disponibilidad, acción primaria y contexto; cada controlador existente sigue siendo dueño de su estado, permisos y peticiones. Implementar primero el shell con los espacios y capacidades que ya existen: Perfil fiscal, Conexiones y CFDI. Las herramientas en preparación conservarán mensajes honestos y no recibirán formularios operativos ficticios.

### Fase 3 — CFDI como demostración

Integrar el workspace existente dentro del shell, alineando encabezado, resumen, revisión del lote, resultados/hallazgos, historial y acciones posteriores. Mantener el límite de privacidad, procesamiento local y comportamiento de la cola. El panel de Nora puede explicar el resumen solo mediante la acción explícita ya existente; enlaces de estudio conducirán a módulos o prácticas reales. No se convierte el CFDI en validación SAT ni se cambia almacenamiento/API.

### Fase 4 — Continuidad educativa y Nora contextual

Tras estabilizar el primer flujo, añadir una tarjeta de “Continúa donde lo dejaste”, progreso y ruta usando solo módulos y prácticas ya registrados. Nora cambia su texto/ayuda según la herramienta y los datos disponibles, sin personalización inventada ni transferencia automática. Las metas semanales, insignias persistentes y gráficas operativas se dejan fuera hasta definir fuentes, reglas y persistencia.

### Fase 5 — Extensión gradual y decisión de marca

Ajustar las demás tarjetas y vistas al lenguaje visual común en el grado que permita su funcionalidad actual. Mantener Contabilidad/Nómina/DIOT/Monitor como preparación mientras no existan flujos respaldados. Separar futuras mejoras de backend por dominio y solicitar autorización específica antes de añadir operaciones fiscales, sincronizaciones o almacenamiento nuevo. Revisar entonces si la paleta debe extenderse al Aula oscura y si conviene un modo oscuro adicional.

## Dependencias y límites materiales

La primera iteración utiliza JavaScript/CSS existentes y los datos/API actuales; no requiere nuevas dependencias ni reescritura del enrutador. El build continúa produciendo `dist/` y Vercel sigue sirviendo el mismo sitio y endpoints. El contenido fiscal se presenta de acuerdo con lo que el usuario cargó o lo que las APIs ya retornan; no se deducen movimientos, alertas, conexiones, cumplimiento ni resultados. Cualquier tabla nueva, integración externa o tarea fiscal efectiva exige un diseño funcional separado, autorización explícita y revisión de privacidad/permisos.

La base de UI parte de los tokens actuales y los temas localizados descritos en `brand-spec.md`. El principal riesgo visual es mezclar la nueva paleta con estilos históricos globales o la temática particular del Aula; por eso la adopción será gradual y acotada. El principal riesgo funcional es presentar `connected` como sinónimo de “módulo disponible”; se evitará con estados separados y etiquetas visibles.

## Autorización

El usuario autorizó los cambios locales de interfaz de las fases 0–4, sujetos a los límites anteriores. No autorizó operaciones/backend fiscal nuevos, activación de integraciones, cambios en datos reales, commit, push ni despliegue; esos pasos requieren una solicitud/autorización aparte. `TODO.md` contiene los resultados y criterios aprobados.
