import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseFiles } from "../src/cfdi/parser.js";

const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="7" Fecha="2026-09-01T10:00:00" SubTotal="1000.00" Total="1160.00" Moneda="MXN" TipoDeComprobante="I" FormaPago="03" MetodoPago="PUE">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor local"/><cfdi:Receptor Rfc="BBB010101BBB" Nombre="Receptor local"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="10101504" Cantidad="1" ClaveUnidad="H87" Descripcion="Servicio local" ValorUnitario="1000.00" Importe="1000.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00"><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="11111111-1111-4111-8111-111111111111"/></cfdi:Complemento>
</cfdi:Comprobante>`;

test("analiza un ZIP recibido como objeto File-like con arrayBuffer", async () => {
  const zip = new JSZip();
  zip.file("factura-local.xml", invoiceXml);
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const fileLike = {
    name: "comprobantes.zip",
    size: buffer.byteLength,
    async arrayBuffer() { return buffer; },
  };

  const result = await parseFiles([fileLike]);

  assert.equal(result.facturas.length, 1);
  assert.equal(result.facturas[0].uuid, "11111111-1111-4111-8111-111111111111");
});
