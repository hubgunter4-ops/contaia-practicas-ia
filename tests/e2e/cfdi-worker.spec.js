import { test, expect } from "@playwright/test";

const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="7" Fecha="2026-09-01T10:00:00" SubTotal="1000.00" Total="1160.00" Moneda="MXN" TipoDeComprobante="I" FormaPago="03" MetodoPago="PUE">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor local"/><cfdi:Receptor Rfc="BBB010101BBB" Nombre="Receptor local"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="10101504" Cantidad="1" ClaveUnidad="H87" Descripcion="Servicio local" ValorUnitario="1000.00" Importe="1000.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00"><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="11111111-1111-4111-8111-111111111111"/></cfdi:Complemento>
</cfdi:Comprobante>`;

async function mountCfdi(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { bindCfdiWorkspace, cfdiState, renderCfdiWorkspace, resetCfdiWorkspace } = await import("/src/cfdi/workspace.js");
    resetCfdiWorkspace();
    document.body.innerHTML = '<div class="app-shell app-shell--fiscal"><div class="main-shell main-shell-live"><div id="cfdi-worker-host"></div></div></div>';
    const root = document.querySelector("#cfdi-worker-host");
    const render = () => { root.innerHTML = renderCfdiWorkspace(); };
    bindCfdiWorkspace(root, { onUpdate: render });
    cfdiState.status = "empty";
    render();
  });
}

test("CFDI analiza XML en Worker local y cancela sin exponer el contenido", async ({ page }) => {
  const workerUrls = [];
  const requests = [];
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  page.on("request", (request) => requests.push(request.url()));
  await mountCfdi(page);
  await page.locator("[data-cfdi-files]").setInputFiles({ name: "factura-local.xml", mimeType: "application/xml", buffer: Buffer.from(invoiceXml) });
  await expect(page.getByText("1 archivo(s) seleccionado(s)")).toBeVisible();
  await page.locator("[data-cfdi-analyze-batch]").click();
  await expect(page.locator(".cfdi-progress.is-ready")).toContainText("1 archivo(s) leídos");
  await expect(page.locator(".cfdi-metrics")).toContainText("Facturas");
  expect(workerUrls.some((url) => /\/src\/workers\/cfdi-parser\.worker\.js$/.test(url))).toBe(true);
  expect(requests.some((url) => url.includes("factura-local.xml") || url.includes("Emisor local"))).toBe(false);
  expect(requests.filter((url) => /\/api\/documents|\/api\/tutor\/stream|supabase/i.test(url))).toEqual([]);
});
