import test from "node:test";
import assert from "node:assert/strict";
import { extractDocumentText, MAX_DOCUMENT_FILE_BYTES, MAX_DOCUMENT_TEXT_CHARS } from "../src/tutor/document-reader.js";

const textFile = (name, text) => ({
  name,
  size: Buffer.byteLength(text),
  text: async () => text,
  arrayBuffer: async () => new TextEncoder().encode(text).buffer,
});

test("extrae texto y CSV localmente y limpia controles sin alterar saltos de línea", async () => {
  const txt = await extractDocumentText(textFile("caso.txt", "Línea uno\r\nLínea dos\u0000"));
  const csv = await extractDocumentText(textFile("movimientos.csv", "fecha,concepto,importe\n2026-01-01,ejemplo,100"));
  assert.equal(txt.text, "Línea uno\nLínea dos");
  assert.match(csv.text, /concepto,importe/);
  assert.equal(txt.truncated, false);
});

test("rechaza tipos desconocidos y archivos vacíos o sobre el límite", async () => {
  await assert.rejects(extractDocumentText(textFile("caso.xlsx", "dato")), /PDF, TXT o CSV/);
  await assert.rejects(extractDocumentText({ name: "vacío.txt", size: 0, text: async () => "" }), /vacío/);
  await assert.rejects(extractDocumentText({ name: "grande.txt", size: MAX_DOCUMENT_FILE_BYTES + 1, text: async () => "x" }), /8 MB/);
});

test("limita la extracción de texto y marca el contenido truncado", async () => {
  const result = await extractDocumentText(textFile("largo.txt", "á".repeat(MAX_DOCUMENT_TEXT_CHARS + 50)));
  assert.equal(result.text.length, MAX_DOCUMENT_TEXT_CHARS);
  assert.equal(result.truncated, true);
});

test("extrae texto de las páginas del PDF con worker local y libera el documento", async () => {
  let destroyed = false;
  const workerOptions = {};
  const fakePdf = {
    numPages: 2,
    getPage: async (pageNumber) => ({ getTextContent: async () => ({ items: [{ str: `Página ${pageNumber}` }] }) }),
    destroy: async () => { destroyed = true; },
  };
  const result = await extractDocumentText(textFile("caso.pdf", "contenido binario ficticio"), {
    pdfjsLoader: async () => ({
      GlobalWorkerOptions: workerOptions,
      getDocument: () => ({ promise: Promise.resolve(fakePdf) }),
    }),
  });
  assert.equal(workerOptions.workerSrc, "/vendor/pdf.worker.mjs");
  assert.match(result.text, /Página 1/);
  assert.match(result.text, /Página 2/);
  assert.equal(result.pageCount, 2);
  assert.equal(destroyed, true);
});
