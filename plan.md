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


---

# Anexo propuesto — evolución comercial de ContaIA

**Estado de este anexo:** propuesta estratégica y de implementación elaborada el 21 de octubre de 2026 a partir de las cuatro preguntas recientes sobre monetización, completar capacidades y pasar de web a software, competencia, y precios/costos. **No constituye autorización para implementar backend de pagos, activar servicios, cobrar, alterar datos reales, hacer commit, desplegar ni cambiar funcionalidades.** Cada fase técnica necesita aprobación de alcance antes de empezar. El roadmap visual 0–4 documentado arriba conserva su estado y alcance originales.

## 1. Decisión de producto y posicionamiento

ContaIA debe competir por ayudar a una persona a pasar de entender un concepto a resolver un flujo contable concreto con orientación clara y privacidad, no por igualar la amplitud de una suite contable madura ni por cobrar por tutoriales básicos que ya se ofrecen gratis. El posicionamiento recomendado es **“aprende, practica y analiza comprobantes con guía contextual”**, dirigido primero a estudiantes de contabilidad y contadores independientes que procesan CFDI en México.

La diferenciación consta de tres partes que se refuerzan: un curso aplicado separado de la operación; un analizador CFDI real cuyo procesamiento permanece local; y Nora que explica el contexto o los hallazgos sin afirmar validación oficial ante el SAT. La interfaz debe decir qué es educativo, qué es análisis auxiliar y qué no es una operación fiscal validada.

La evidencia competitiva preliminar y sus límites están anotados en `contaia-monetization-research.md`: el SAT publica ayuda, ejemplos y simuladores gratuitos, mientras suites como CONTPAQi presentan una amplitud que ContaIA aún no tiene. Esas fuentes orientan el enfoque, no prueban disposición a pagar ni autorizan afirmaciones sobre competidores. No perseguir paridad con contabilidad electrónica, nómina, DIOT, conciliación bancaria, timbrado o alertas automáticas antes de tener los procesos, controles y fuentes que los sostengan.

## 2. Separación de productos y escalera de precios

La separación debe ser comercial y de navegación, pero compartir una cuenta y un núcleo de identidad; compra independiente no debe implicar duplicar login o perfiles. Páginas y menús nombran explícitamente **Aprende** y **Herramientas** y explican qué conserva cada una. El progreso educativo y los documentos fiscales siguen siendo dominios de datos distintos.

| Plan de referencia a validar | Precio sugerido | Qué desbloquea cuando esté implementado | Enfoque gratuito |
|---|---:|---|---|
| **Aprende Gratis** | $0 | Inicio del recorrido, progreso local y prácticas/muestras disponibles. Cuota mensual pequeña y visible para Nora. | Deja que la persona compruebe el estilo didáctico sin tarjeta. |
| **Aprende Plus** | $129 MXN/mes o $1,290/año | Cursos publicados completos, prácticas y retroalimentación de Nora con cuota mensual explícita y progreso sincronizado entre dispositivos. | No cobrar por la información introductoria que ya está ampliamente disponible en fuentes públicas. |
| **Herramientas CFDI Gratis** | $0 | Importar y analizar localmente XML/ZIP conforme a las funciones existentes. Nora y el historial que impliquen servidor pueden llevar cuotas gratuitas, claramente mostradas. | Mantener gratis el análisis local base; no cuesta una llamada de modelo por archivo y es la puerta de entrada al producto. |
| **Herramientas CFDI Pro** | $179 MXN/mes o $1,790/año | Tras implementación: lotes ampliados, historial privado en nube, varios perfiles cuando el flujo esté preparado y explicaciones contextuales de Nora con cuota explícita. | No cobrar por herramientas que aún son solo fichas “en preparación”. |
| **ContaIA Completa** | $249 MXN/mes o $2,490/año | Aprende Plus + Herramientas CFDI Pro; descuento de $59 al mes frente a suscripciones separadas. | Facilita probar cada producto antes de adquirir el paquete. |

Estos importes son hipótesis de lanzamiento para probar, no una decisión final ni benchmark validado por entrevistas. La suscripción anual equivale a diez mensualidades y debe mostrarse con su precio total, condiciones de renovación y cancelación. No vender acceso premium a beneficios que todavía no existan: si el curso completo, sincronización o historial avanzado no están listos, la página muestra lista de espera o acceso beta claramente descrito, no una falsa suscripción.

Un plan para escuelas, facultades o despachos se difiere hasta que exista separación de organizaciones, roles, administración de licencias y control de uso compartido. No fijar precio por asiento todavía.

## 3. Arquitectura: web actual a producto instalable

### 3.1 Ruta recomendada: PWA primero, aplicación nativa solo con evidencia

La forma viable de pasar de “página web” a “software” sin mantener dos productos es convertir primero la SPA actual en una **Progressive Web App (PWA) instalable**. El usuario la instala desde navegador compatible y abre una ventana propia, pero se mantiene una sola base de código JavaScript y CSS. Esta opción reduce el costo inicial frente a rehacer la app en React Native u otro framework y conserva la web indexable para adquisición y páginas públicas.

La PWA debe tener manifiesto con nombre, colores e iconos de ContaIA; comportamiento de instalación explicado; cacheo controlado de shell y contenido público/educativo que se haya diseñado para uso offline; y una pantalla clara cuando no haya conexión. Mantener login, pagos, APIs, historial fiscal y estado privado fuera del cache offline salvo diseño específico de seguridad. No almacenar XML ni respuestas con datos fiscales en un service worker o cache compartido. El analizador CFDI mantiene el principio local-first; los recursos de curso descargables requieren una decisión de derechos, actualización y retención.

Una aplicación nativa solo se evalúa después de observar demanda de notificaciones nativas, uso offline más amplio o necesidad de capacidades móviles que la PWA no cubre. La reutilización de la web no garantiza por sí sola publicación en tiendas; si se aprueba esa vía, preparar presupuesto y arquitectura móvil separados.

### 3.2 Módulos propuestos, reutilizando la SPA y Supabase/Vercel

- `src/course.js`, `classroom.js`, `exercises.js`, `progress.js`: conservar como dominio de Aprende; ampliar con cuotas de curso y sincronización solo después de definir el dato mínimo que requiere persistencia.
- `src/cfdi/*`: conserva parser/análisis local; añadir únicamente mejoras premium alrededor de organización del flujo, historial privado y Nora, sin trasladar XML al backend por defecto.
- `src/tools/catalog.js` y `src/main.js`: sostienen la navegación separada y los estados veraces del Hub; ampliar el catálogo solo con módulos funcionales comprobados.
- `src/billing/*` propuesto: adaptador del proveedor de pagos, lectura de suscripción, catálogo de precios y resolución de derechos/entitlements. El navegador recibe capacidades derivadas del servidor; no puede autodeclarar un plan.
- `api/billing/*` propuesto: inicio de checkout y portal/cancelación, más webhook del proveedor. La URL de retorno del checkout no concede acceso; el webhook autenticado y procesado de forma idempotente actualiza el estado de la suscripción.
- `src/usage/*` y una API de servidor propuesta: validar cuenta y derecho antes de llamar a Nora; contar uso por periodo y función; impedir concurrencia/elusión; responder con saldo/cupo y fecha de reinicio. La cuota actual de Nora, basada en IP y memoria del proceso, no es control comercial durable.
- Persistencia Supabase propuesta: tablas separadas para suscripciones, eventos de cobro idempotentes y consumo agregado por usuario/periodo/producto. RLS por `auth.uid()` para datos privados. El servidor valida firmas del procesador y transiciona estados; no aceptar estado, precio, periodo o límites enviados desde cliente. Guardar datos financieros mínimos para derechos, conciliación y soporte, no credenciales de pago ni documentos fiscales.
- `public/manifest.webmanifest` y service worker propuestos: shell instalable y cache público/estático cuidadosamente definido. Las páginas privadas y API llevan política `no-store` donde corresponda; no cachear llamadas de auth, checkout, suscripción, uso o datos fiscales.
- `tests/*`: ampliar con pruebas de derechos/cuotas y estados de webhook antes de pagos reales, además de mantener la suite actual de unidad/E2E.

La arquitectura existente es Vanilla JS SPA, APIs Vercel y Supabase Auth/RLS; por tanto, no se propone reescribir a React ni añadir un microservicio separado para lanzar un primer plan individual.

## 4. Costos de producción y unidad económica

La hoja de precios investigada y sus condiciones están en `contaia-pricing-proposal.md`; sus cifras reflejan tarifas públicas consultadas el 21 de octubre de 2026, no facturas ni mediciones por usuario.

### 4.1 Base de infraestructura

Para estimar el lanzamiento comercial, reservar como escenario inicial **Vercel Pro $20 USD/mes + Supabase Pro desde $25 USD/mes por organización = $45 USD/mes de precio de lista**. Con un tipo de cambio de modelación, no de mercado, de $18.50 MXN/USD equivale a $832.50 MXN mensuales antes de impuestos/excesos. Hay créditos publicados en ambos proveedores para determinados consumos, pero no se toman como descuento garantizado. Revisar proyectos/compute que causan cobro y evitar duplicación de planes; el uso comercial no debería depender de Vercel Hobby, cuyo plan se publica para uso personal/no comercial.

Supabase Free puede sostener prototipo, pero para operación comercial con registros privados conviene presupuestar Pro, política de backup, límites de gasto y monitoreo. No elevar a un servicio persistente adicional hasta identificar una necesidad que la plataforma actual no pueda cubrir.

### 4.2 IA y límites por plan

Con precio OpenAI publicado para gpt-4.1-mini ($0.40/M tokens input; $1.60/M output) y una hipótesis de 5,000 tokens de entrada + 450 de salida por respuesta, el costo calculado es $0.00272 USD, aproximadamente $0.050 MXN por respuesta con el supuesto de cambio de $18.50. Equivale a unos $5.03 por 100 respuestas y $10.06 por 200. El costo real debe medirse: historial y prompt pueden hacer variar tokens; no se debe vender Nora “ilimitada” sin telemetría y control de gasto.

Propuesta de límites iniciales para validación beta, aún por diseñar y autorizar: Gratis con 10 respuestas de Nora mensuales; Aprende Plus con 100; Herramientas CFDI Pro con 100 explicaciones de hallazgos; Completa con 200 en total por usuario. Los límites son ejemplos de trabajo, no configuraciones ya existentes; instrumentar uso, probar abusos y decidir si los cupos son por mes calendario o ciclo de suscripción antes de publicarlos. El análisis CFDI local se mantiene sin cupo IA porque el cómputo ocurre en el dispositivo.

### 4.3 Pago y contribución

Tarifas públicas consultadas: Stripe México publica 3.6% + $3 MXN por tarjeta nacional y Stripe Billing añade 0.7% del volumen Billing. Mercado Pago Link anuncia 3.49% + $4 MXN al instante, más IVA sobre comisión; el costo final de suscripción automática debe confirmarse porque la fuente pública no establece una tarifa separada clara. Con Stripe + Billing, el pago de $129 deja aproximadamente $120.45 antes del IVA sobre comisión; $179 deja $168.30; $249 deja $235.29. Son netos del procesador, no ingresos netos contables.

Al combinar el costo IA supuesto y una distribución de la infraestructura de $832.50 entre 100 abonados, quedan orientativamente $107 en Aprende Plus, $150 en Herramientas Pro con 200 llamadas IA y $217 en el paquete Completa con 200 llamadas. No incluyen impuestos, soporte, adquisición, desarrollo/contenido, chargebacks ni gasto variable mayor. No fijar el precio final solo a partir de estos márgenes: instrumentar 30–60 días de uso beta y observar conversión/retención.

## 5. Secuencia de ejecución y decisiones de lanzamiento

Los plazos son una estimación de planificación para un equipo pequeño, no compromiso. Cada etapa técnica queda pendiente de autorización específica.

### Etapa A — Validación de valor y alcance (1–2 semanas)

Entrevistar estudiantes y contadores independientes; observar cómo resuelven hoy dudas y revisan lotes CFDI; probar la promesa y tres precios; determinar qué parte del curso está lista para vender. Separar hipótesis (WTP, duración, uso de Nora) de hechos del producto. Diseñar páginas y mensajes distintos para Aprende, Herramientas y paquete; incluir lista explícita de exclusiones. **Salida:** confirmar segmento inicial, qué módulos/beneficios actuales están vendibles y una decisión de precio piloto.

### Etapa B — Preparar producto y medición (1–2 semanas)

Auditar flujos reales de curso, CFDI, auth e historial; definir eventos agregados de activación, uso, conversión y cancelación. Crear instrumentación sin guardar XML, RFC, prompts completos ni datos personales no necesarios. Medir tokens por respuesta y tiempo/tasa de uso local. Diseñar páginas públicas y términos visibles. **Salida:** definición de cuotas beta basada en medición inicial; si no hay datos, no anunciar “ilimitado”.

### Etapa C — Derechos de usuario, cuotas y privacidad (2–3 semanas)

Implementar entitlements en el servidor, consumo mensual durable y controles de presupuesto. Establecer separación de datos Aprende/Herramientas, RLS, retención, recuperación ante error de pago y transiciones de suscripción. Limitar Nora por usuario y plan en el endpoint, no por almacenamiento en memoria/IP. Añadir panel o función interna de consulta de estado para soporte controlado. **Salida:** usuario no puede desbloquear un plan modificando JS; cuentas concurrentes y webhooks repetidos no duplican uso/acceso; cancelación y vencimiento cambian derechos sin borrar progreso/documentos de manera accidental.

### Etapa D — Cobro recurrente en sandbox (2–3 semanas)

Elegir **un** procesador tras prueba comercial y revisión de renovaciones/costos. Stripe ofrece un esquema público más claro para Billing; Mercado Pago puede ofrecer encaje de mercado local, pero se debe confirmar el precio de suscripción y el plazo de depósito. Implementar checkout, webhook firmado/idempotente, portal/cancelación y estados `trialing/active/past_due/canceled/refunded` solo conforme al contrato real del proveedor. Probar en sandbox compra inicial, renovación, pago rechazado, reintento, cambio de plan, reembolso, cancelación y webhook duplicado. No usar compras reales durante pruebas. **Salida:** derechos coinciden con el estado confirmado por el proveedor en todos esos casos.

### Etapa E — Separar experiencia de productos (1–2 semanas)

En la SPA, ofrecer Inicio, Aprende y Herramientas con rutas/estados de sección claros. Páginas de producto distintas presentan para quién es, qué resuelve, lo gratuito, el plan, límites de IA y exclusiones. Mantener cuenta compartida y contexto de Nora específico: tutoría curricular para Aprende, explicación del resumen explícitamente compartido para CFDI. Los mensajes de pago no interrumpen análisis local ni prometen validación SAT. **Salida:** se entiende qué suscripción habilita cada producto y una persona puede usar uno sin comprar el otro.

### Etapa F — PWA instalable (1–2 semanas)

Añadir manifest, iconos, instalación guiada y service worker limitado al shell y materiales públicos/offline aprobados. Mantener las API, auth, pagos y contenido privado fuera del cache. Diseñar actualización/versionado del curso descargable y mensaje de actualización. Validar flujo instalado en Android/iOS compatibles y recuperación de conexión. **Salida:** instalación útil sin duplicar frontend y sin filtrar contenido privado offline.

### Etapa G — Beta cerrada y lanzamiento piloto (2–4 semanas)

Invitar una cohorte pequeña con prioridad en estudiantes y profesionales independientes. Ofrecer precios fundadores por tiempo definido, explicando renovación y cancelación; no fijar descuentos perpetuos antes de conocer unit economics. Recoger solicitudes, medir activación y éxito del primer flujo, conversión por producto, retención a 30/60 días, coste IA por usuario, errores CFDI y reembolsos. Ajustar onboarding/ayuda antes de gastar en campañas de alcance. **Salida:** no ampliar marketing pagado hasta que exista uso recurrente, soporte manejable y coste variable por plan bajo control.

### Etapa H — Campañas de adquisición de bajo costo (continuo tras beta)

1. **Contenido educativo buscable:** lecciones prácticas breves con ejemplos ficticios, glosario, checklist de revisión CFDI y artículos enlazados a fuente oficial. Ofrecer una ruta gratuita concreta, no replicar todo el portal SAT.
2. **Demostración del valor CFDI:** video corto donde se muestra carga, preflight y explicación local, sin XML real ni datos identificables. CTA a probar el analizador gratuito y luego completar una guía Aprende.
3. **Alianzas educativas:** docentes, universidades y comunidades contables para sesiones piloto y talleres con datasets sintéticos. Recoger feedback antes de negociar licencias institucionales.
4. **Embudo separado:** Curso gratuito → práctica → Aprende Plus; analizador local gratuito → resumen revisado → Nora/historial Pro; paquete Completa solo a quienes usan ambos.
5. **Experimentos de precio/mensaje:** probar páginas y precios con cohortes distintas, manteniendo una sola variable por prueba. Medir suscripción pagada y permanencia, no solo visitas o clics. No iniciar una campaña masiva con promesas funcionales no disponibles.
6. **Correo y consentimiento:** mantener auth de Supabase al inicio. Añadir proveedor de correo solo cuando se necesite onboarding/campañas con consentimiento verificable, baja clara, dominio autenticado y separación entre correo de servicio y marketing.

## 6. Indicadores y criterios de decisión

- **Aprendizaje:** activación (inicia primer módulo), finalización de una práctica, regreso a una sesión posterior y progreso a 30 días.
- **Herramientas:** primer análisis completado, proporción de preflight → análisis, retorno con otro lote, uso de ayuda contextual, tasa de error y solicitudes de soporte.
- **Negocio:** conversión gratuita→pago por cada producto, uso del paquete, renovación a 30/60/90 días, cancelación y reembolso, ingresos recurrentes netos de comisiones.
- **Costo y riesgo:** coste real de tokens por persona y por suscriptor, percentiles altos de uso, proporción de usuarios que alcanzan cuota, gasto mensual de proveedores, eventos de facturación sin conciliar y avisos de seguridad/privacidad.

Se amplía presupuesto de marketing solo si la cohorte demuestra retorno y hay margen tras consumo de IA, fees y soporte. Se aplaza una función si exige datos bancarios o fiscales sensibles que no pueda protegerse con controles y permisos claramente diseñados.

## 7. No incluido y autorizaciones futuras

Este anexo no autoriza construir un módulo operativo de contabilidad, nómina, DIOT, monitor fiscal o conexiones bancarias; enviar campañas; crear cuentas en proveedores; activar Resend, Stripe, Mercado Pago o Anam; publicar precios; modificar planes Vercel/Supabase; migrar datos; desplegar; o cobrar. Tampoco declara certificación fiscal, validación SAT ni asesoría profesional automatizada.

Para comenzar implementación comercial, la decisión posterior debe aprobar expresamente: (1) precios y beneficios beta, (2) procesador elegido y país de cobro, (3) persistencia y retención de datos de suscripción/uso, (4) cuotas de Nora y presupuesto máximo, y (5) primera fase técnica autorizada. Cambios de contrato, privacidad, impuestos, cancelación/reembolso y facturación requieren revisión profesional para el mercado mexicano.

## 8. Referencias de tarifas y mercado

- Vercel: [precios](https://vercel.com/pricing), [plan Hobby](https://vercel.com/docs/plans/hobby), [plan Pro](https://vercel.com/docs/plans/pro-plan).
- Supabase: [precios](https://supabase.com/pricing), [facturación por organización](https://supabase.com/docs/guides/platform/org-based-billing), [compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute).
- OpenAI: [precios de API](https://developers.openai.com/api/docs/pricing); Vercel: [GPT-4.1 mini en AI Gateway](https://vercel.com/ai-gateway/models/gpt-4.1-mini), [precios de AI Gateway](https://vercel.com/docs/ai-gateway/pricing).
- Procesamiento: [Stripe México](https://stripe.com/mx/pricing), [Stripe Billing](https://stripe.com/mx/billing/pricing), [Mercado Pago Link de pago](https://www.mercadopago.com.mx/herramientas-para-vender/link-de-pago), [suscripciones de Mercado Pago](https://www.mercadopago.com.mx/herramientas-para-vender/suscripciones).
- Servicios opcionales: [Resend](https://resend.com/pricing), [Anam](https://anam.ai/pricing).
- Mercado de referencia: [Alegra México](https://www.alegra.com/mexico/precios/), [Facturama](https://facturama.mx/planes-facturacion), [curso Aprende.org](https://aprende.org/cursos/view/168), [material SAT](https://www.sat.gob.mx/minisitio/Factura/emite_materialdeayudaparafactura.htm), [guía CONTPAQi](https://www.contpaqi.com/blog/guia-software-contable-mexico).


## Autorización puntual — separación y diseño de productos

El 21 de octubre de 2026 el usuario indicó: «ContaIA Aprende y ContaIA Herramientas. Procede con la separación y el diseño de la página». Queda autorizado el trabajo de interfaz descrito en la nueva sección de TODO.md: presentar ambos productos como las dos ofertas principales, actualizar copy y navegación de la aplicación autenticada y conectar con las rutas y funciones existentes. El Asistente/Nora se conserva como capacidad transversal, no como tercer producto principal.

Esta instrucción **no** aprueba los precios propuestos ni autoriza mostrar planes/compra, crear suscripciones, cuotas, nuevos endpoints/tablas, activar servicios de pago/correo/voz, ampliar capacidades fiscales, migrar a una PWA/app nativa, hacer commit, push o despliegue. Las funciones, privacidad, persistencia y contratos existentes se conservan.
