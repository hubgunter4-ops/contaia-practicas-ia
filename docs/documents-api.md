# Documentos en el Asistente abierto

El Asistente abierto admite XML, CSV, XLSX, PDF y DOCX. El usuario adjunta un archivo y escribe una instrucción. Las instrucciones que contienen acciones como `lee`, `extrae`, `analiza`, `repara`, `corrige`, `genera`, `crea` o `exporta` activan `POST /api/documents`; una pregunta normal sigue usando el flujo de conversación con Nora.

La ruta recibe JSON con `instruction` y, cuando existe, `file.name`, `file.type` y `file.base64`. El límite por archivo es de 8 MB y el cuerpo completo está limitado a 12 MB. No se ejecutan macros ni contenido activo de Office. La respuesta de lectura contiene texto acotado; la reparación o generación devuelve un archivo codificado en base64 para descarga inmediata en el navegador.

La lectura cubre texto XML, filas CSV, hojas XLSX, texto de PDF y texto de DOCX. La reparación normaliza entidades XML y CSV, reserializa XLSX, vuelve a empaquetar DOCX y guarda de nuevo PDF con `pdf-lib`. La generación crea un XML, CSV, XLSX, DOCX o PDF básico a partir de la instrucción del usuario; para una transformación contable compleja, Nora debe explicar y validar el resultado antes de usarlo en producción.

La implementación operativa del proyecto actual está en `api/documents/index.js` y `src/documents/server.js`; el adaptador equivalente para una aplicación Next.js está en `app/api/documents/route.js`. El servidor no guarda los archivos ni los envía a Supabase.
