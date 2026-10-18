import test from "node:test";
import assert from "node:assert/strict";
import { __test, handleDocuments } from "../src/documents/server.js";

function requestFor(payload, remoteAddress = "127.0.0.1") {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() { yield body; },
  };
}

async function invoke(payload, remoteAddress) {
  let status = 0;
  let body = "";
  await handleDocuments(requestFor(payload, remoteAddress), { writeHead(code) { status = code; }, end(value) { body = value; } });
  return { status, body: JSON.parse(body) };
}

test("detecta leer, reparar y generar desde la instrucción", () => {
  assert.equal(__test.detectAction("lee este PDF", ""), "read");
  assert.equal(__test.detectAction("repara el XML", ""), "repair");
  assert.equal(__test.detectAction("genera un xlsx", ""), "generate");
  assert.equal(__test.detectAction("leer", "repair"), "repair");
});

test("infiere formatos de salida comunes", () => {
  assert.equal(__test.inferExtension("genera una hoja Excel"), "xlsx");
  assert.equal(__test.inferExtension("crea un documento Word"), "docx");
  assert.equal(__test.inferExtension("genera un PDF"), "pdf");
});

test("normaliza CSV con comillas y columnas desiguales", () => {
  const rows = __test.parseCsv('fecha,concepto,importe\n2026-01-01,"Venta, mostrador",100\nsegunda,200');
  assert.deepEqual(rows[1], ["2026-01-01", "Venta, mostrador", "100"]);
  assert.match(__test.rowsToCsv(rows), /"Venta, mostrador"/);
  assert.match(__test.rowsToCsv(rows), /segunda,200,/);
});

test("repara entidades ampersand sin alterar entidades válidas", () => {
  const repaired = __test.repairXml(Buffer.from("<root><name>A & B &amp; C</name></root>", "utf8")).toString("utf8");
  assert.match(repaired, /A &amp; B &amp; C/);
});

test("lee XML y genera CSV desde el endpoint server-side", async () => {
  const xml = Buffer.from("<root><total>125</total></root>").toString("base64");
  const read = await invoke({ instruction: "lee el XML", file: { name: "caso.xml", base64: xml } }, "127.0.0.2");
  assert.equal(read.status, 200);
  assert.match(read.body.result.text, /125/);
  const generated = await invoke({ instruction: "genera un CSV con el contenido del caso" }, "127.0.0.3");
  assert.equal(generated.status, 200);
  assert.equal(generated.body.result.kind, "file");
  assert.equal(generated.body.result.name, "documento-generado.csv");
});
