import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BATCH_FILES,
  MAX_UPLOAD_BYTES,
  addCfdiFilesToQueue,
  reviewCfdiQueue,
  validateCfdiUploadFile,
} from "../src/cfdi/upload-queue.js";
import { bindCfdiWorkspace, cfdiState, renderCfdiWorkspace } from "../src/cfdi/workspace.js";

const makeFile = (name, size = 1024) => ({ name, size, lastModified: 1 });

function resetCfdiState() {
  Object.assign(cfdiState, {
    analysis: null,
    fileCount: 0,
    queuedFiles: [],
    queueMessage: "",
    status: "empty",
    error: "",
    activeTab: "overview",
    savedRuns: [],
    historyBusy: false,
    configStatus: "disabled",
    configMessage: "",
    user: null,
  });
}

test("valida extensión y tamaño antes de iniciar el análisis", () => {
  assert.equal(validateCfdiUploadFile(makeFile("factura.XML")).valid, true);
  assert.equal(validateCfdiUploadFile(makeFile("lote.zip", MAX_UPLOAD_BYTES)).valid, true);
  assert.match(validateCfdiUploadFile(makeFile("notas.pdf")).reason, /XML o ZIP/);
  assert.match(validateCfdiUploadFile(makeFile("lote.zip", MAX_UPLOAD_BYTES + 1)).reason, /20 MB/);
});

test("limita el lote a 100 archivos y reporta cuántos quedaron fuera", () => {
  const files = Array.from({ length: MAX_BATCH_FILES + 5 }, (_, index) => makeFile(`cfdi-${index}.xml`, 1));
  const result = addCfdiFilesToQueue([], files);
  assert.equal(result.files.length, MAX_BATCH_FILES);
  assert.equal(result.skipped, 5);
  assert.equal(reviewCfdiQueue(result.files).canAnalyze, true);
});

test("bloquea el análisis de lotes con archivos inválidos", () => {
  const review = reviewCfdiQueue([makeFile("factura.xml"), makeFile("reporte.csv")]);
  assert.equal(review.validCount, 1);
  assert.equal(review.invalidCount, 1);
  assert.equal(review.canAnalyze, false);
});

test("seleccionar un archivo lo agrega a revisión local sin analizarlo automáticamente", () => {
  const previousDocument = globalThis.document;
  const previousCustomEvent = globalThis.CustomEvent;
  const dispatched = [];
  globalThis.document = {
    addEventListener() {},
    dispatchEvent(event) { dispatched.push(event.type); },
  };
  if (!globalThis.CustomEvent) globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

  try {
    resetCfdiState();
    const handlers = new Map();
    const app = { addEventListener(type, handler) { handlers.set(type, handler); } };
    bindCfdiWorkspace(app);
    const file = makeFile("<factura>.xml", 2048);
    const input = {
      files: [file],
      value: "selected",
      matches: (selector) => selector === "[data-cfdi-files]",
    };

    handlers.get("change")({ target: input });

    assert.equal(input.value, "");
    assert.deepEqual(cfdiState.queuedFiles, [file]);
    assert.equal(cfdiState.status, "empty");
    assert.equal(cfdiState.analysis, null);
    assert.deepEqual(dispatched, ["contaia:cfdi-updated"]);
    const html = renderCfdiWorkspace();
    assert.match(html, /REVISIÓN DEL LOTE/);
    assert.match(html, /&lt;factura&gt;\.xml/);
    assert.match(html, /Analizar lote \(1\)/);
  } finally {
    resetCfdiState();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});
