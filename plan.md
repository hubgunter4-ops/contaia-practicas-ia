# Laboratorio ContaIA — plan de implementación

**Objetivo:** crear una página web interactiva en español para practicar el uso responsable de IA en tareas contables y casos didácticos mexicanos, usando exclusivamente datos ficticios.

**Arquitectura:** aplicación estática de una sola página, servida localmente por un servidor HTTP pequeño de Node.js. La lógica de ejercicios y la retroalimentación corren en el navegador, sin cuentas, base de datos, claves ni llamadas a servicios externos de IA. Las respuestas de opción múltiple se verifican con lógica local y las prácticas abiertas incluyen rúbrica, pistas y solución modelo.

**Tecnologías:** HTML semántico, CSS, JavaScript moderno (módulos ES), Node.js integrado para servir el directorio `public/`, y el ejecutor de pruebas integrado `node:test`. Sin dependencias npm externas.

**Alcance acordado:** módulos inspirados —sin copiar contenido propietario— en los enfoques de Alegra Academy, Edutin y ContadorMx. Incluir laboratorio de prompts, clasificación de transacciones, conciliación bancaria, análisis de balanza, reportes, análisis financiero y anomalías, además de casos educativos sobre ISR, RESICO y nómina en México. Añadir retroalimentación, pistas progresivas, soluciones modelo, advertencias visibles de confidencialidad y de que el contenido fiscal no es asesoría. Entregar fuentes, ejercicios/datos ficticios, guía de instalación y ejecución y repositorio privado.

**Restricciones:** no usar datos reales ni confidenciales de clientes; no calcular ni afirmar obligaciones tributarias vigentes. El contenido fiscal será ilustrativo y requerirá verificación con fuentes oficiales/profesionales. No se almacenarán respuestas personales ni se conectará el sitio a un modelo externo.

## Diseño

- **Movimiento:** diseño editorial contemporáneo de archivo, con referencias sutiles a expedientes y cuadernos de trabajo mexicanos, evitando clichés y apariencia de software corporativo genérico.
- **Principios:** legibilidad primero; rigor sin intimidación; práctica progresiva con explicación; datos simulados claramente identificados.
- **Color:** vino oscuro `#7A2E3A` como tono distintivo, evocando sellos editoriales y autoridad amable; oro cálido `#D8B26E` como acento para hallazgos, pistas y acciones; crema de papel y tinta azul-gris para fondos y lectura sostenida.
- **Composición:** estructura de mesa de trabajo con barra lateral para el expediente de módulos, encabezado de orientación y área de práctica amplia; en móvil, navegación compacta y contenido de una columna.
- **Motivos:** pestañas de expediente numeradas; etiquetas de folio “CASO FICTICIO”; líneas finas de cuaderno y anotaciones cortas tipo margen.
- **Interacción:** cada práctica invita a intentar antes de revelar. Botones separados para comprobar, pedir pista y ver solución; feedback explica el criterio, no solo el resultado.
- **Movimiento:** transiciones discretas de 140–220 ms para apertura de paneles y feedback; sin animación continua, respetando `prefers-reduced-motion`.
- **Tipografía:** Alegreya Sans para titulares y texto de lectura; una sans de sistema para datos/tablas, con cifras tabulares y jerarquía clara entre título, instrucciones y notas.
- **Esencia de marca:** laboratorio de práctica contable con IA para estudiantes y profesionales que quieren aprender con casos seguros; personalidad: cuidadosa, clara, práctica.
- **Voz:** titulares directos y didácticos. Ejemplos: “Primero intenta. Luego verifica.” y “Un caso ficticio, una decisión contable mejor explicada.”
- **Logotipo:** monograma original “C” como carpeta abierta que contiene un pequeño asiento de dos líneas débito/crédito, junto al nombre Laboratorio ContaIA; implementado como SVG propio, no como icono genérico.
- **Color de marca:** vino `#7A2E3A`.

## Estructura del proyecto

- `public/index.html`: documento accesible y punto de entrada de la aplicación.
- `public/manus-routes.json`: manifiesto de rutas de la página.
- `public/favicon.svg`: marca reducida del laboratorio.
- `src/main.js`: navegación por módulos, renderizado de prácticas y gestión de estado local de la sesión.
- `src/exercises.js`: consignas, opciones, pistas, explicaciones y soluciones modelo en español.
- `src/logic.js`: funciones puras para puntuar rúbricas y evaluar respuestas deterministas.
- `src/styles.css`: sistema visual responsive, accesibilidad y estilos del expediente.
- `data/transacciones-ficticias.csv`: datos simulados de ejemplo descargables y documentados.
- `server.js`: servidor HTTP local en el puerto 3000 con resolución segura de archivos estáticos.
- `tests/logic.test.js`: pruebas unitarias de rúbrica y evaluación de respuestas con `node:test`.
- `README.md`: propósito, alcance, advertencias, requisitos, ejecución y pruebas.
- `TODO.md`: criterios del producto y estado de entrega.

## Entregables de implementación

1. Crear la experiencia principal y su navegación; el manifiesto declara únicamente `/`.
2. Implementar módulos por categorías: prompts, operaciones contables, análisis y casos fiscales mexicanos; incluir las prácticas guiadas con pistas, validación y soluciones.
3. Incorporar conjunto de datos ficticios, avisos de privacidad/alcance, estilos adaptables y marca original.
4. Documentar el proyecto y comprobar lógica con las pruebas integradas de Node.js.
5. Conectar el proyecto a un repositorio privado de GitHub mediante el flujo de autorización de Webdev y dejarlo ejecutable desde el clon.

## Criterio de integración

Todas las interacciones esenciales deben funcionar sin conexión a proveedores de IA: escribir, comprobar, solicitar pista, revelar solución y recorrer los módulos. El sitio debe poder iniciarse con `node server.js` y sus pruebas ejecutarse con `node --test`.
