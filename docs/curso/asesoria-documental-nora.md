# Asesoría documental y modo abierto de Nora

## Alcance de la interfaz

- La página inicial sigue siendo **Aula en vivo**. El chat curricular se conserva para las clases guiadas y su secuencia de pasos.
- **Asistente abierto** es una pestaña independiente con conversación contable no curricular y el panel de avatar Anam. No envía a Nora la clase, fase, práctica ni progreso actual.
- El modo abierto usa **México como jurisdicción predeterminada**. La persona puede indicar otro país. Para consultas fiscales o normativas, conviene especificar el ejercicio o periodo aplicable.
- Nora puede proponer pasos concretos para una situación real de trabajo si la descripción es suficiente; no necesita limitarse a casos ficticios. No deben compartirse identificadores personales, nombres de clientes, credenciales ni otros datos confidenciales.
- **Asesoría** continúa disponible como panel flotante en las otras secciones. El panel se inicia cerrado y se puede abrir, cerrar y redimensionar; en pantallas pequeñas queda limitado al viewport.
- El video y el micrófono de Anam se inician solo mediante una acción explícita. El usuario también puede conversar por texto sin activar audio/video.

## Fuentes normativas mexicanas

El Asistente abierto enlaza fuentes oficiales para verificar la publicación y el periodo correspondiente: SAT (RMF/RGCE), Diario Oficial de la Federación, Cámara de Diputados (CFF, LISR y LIVA) y CINIF (NIF). El endpoint de Nora no tiene búsqueda normativa web garantizada, por lo que **no afirma comprobar la vigencia en tiempo real**. Si una respuesta depende de una actualización, Nora debe indicarlo y puede analizar el texto oficial si la persona lo adjunta.

El registro de fuentes, fechas observadas y límites de uso está en [referencias-normativas-mx.md](./referencias-normativas-mx.md). Las fechas allí indicadas reflejan una consulta puntual y requieren verificación futura.

## Uso

1. Abre el panel **Asesoría** para una consulta contextual desde el flujo existente, o abre **Asistente abierto** para una conversación general sobre contaduría.
2. En el Asistente abierto, puedes escribir una pregunta sobre un concepto, procedimiento o situación real de tu entorno. Para una duda fiscal o normativa, indica México (u otra jurisdicción) y el ejercicio o periodo.
3. Para consultar un archivo, adjunta un PDF, TXT o CSV.
4. Espera a que aparezca el nombre local del archivo y el tamaño del texto extraído.
5. Escribe una pregunta y presiona **Enviar**. El documento no se transmite al seleccionarlo; el texto extraído se envía junto con esa pregunta escrita.
6. Quita el archivo con **Quitar** cuando ya no quieras usarlo en la siguiente consulta.

## Extracción y límites

- Extensiones admitidas: `.pdf`, `.txt`, `.csv`.
- Tamaño máximo del archivo: 8 MiB.
- Máximo de texto extraído enviado al tutor: 14.000 caracteres. La interfaz indica si se truncó el texto.
- Los PDF con texto seleccionable se extraen con el bundle local de PDF.js. Los PDF escaneados no tienen OCR en esta versión y se mostrarán como ilegibles.
- Texto normalizado: saltos de línea uniformes y eliminación de controles no imprimibles.
- La extracción se ejecuta en el navegador; no se envía el binario del archivo ni su nombre.

## Datos y privacidad

- El archivo, su nombre y el texto extraído viven solo en memoria durante la sesión del navegador; recargar o cerrar la pestaña los elimina. ContaIA no los escribe en localStorage ni en el portafolio.
- Al enviar una pregunta con documento preparado, el texto extraído sí se transmite al backend de Nora y al proveedor de IA configurado para contestarla. La interfaz lo informa antes del envío.
- El backend valida que el contenido sea texto y que no exceda 14.000 caracteres. Lo presenta al modelo como **dato de referencia no confiable**, nunca como instrucciones, y no lo registra intencionalmente.
- El texto documental no se adjunta a turnos de voz Anam. Notas, respuestas de ejercicios y progreso local permanecen fuera del contexto enviado al modelo.
- No incluyas RFC, CURP, números de cuenta, datos de clientes, credenciales, ni información confidencial que no sea necesaria. Para orientar sobre un entorno real, bastan descripciones generales y cifras anonimizadas cuando correspondan. La retención posterior en el proveedor externo depende de su configuración y políticas; no se declara retención cero.
- Las conversaciones y el historial abierto son efímeros en el cliente y no se guardan en localStorage.

## Compilación y pruebas

El proceso `npm run build:vercel` genera el módulo del lector de documentos y copia el worker PDF a `dist/vendor/`; no depende de un CDN en tiempo de ejecución. La verificación del proyecto incluye `npm test` y `npm run test:e2e`.
