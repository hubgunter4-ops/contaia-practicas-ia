const normalized = (value) => String(value || "").toLowerCase().trim();
const explicitTaxes = (payment) => payment?.rawPaymentTaxes === true
  || (Array.isArray(payment?.taxDetails) && payment.taxDetails.length > 0)
  || payment?.objetoImpDR === "01" && Array.isArray(payment.taxDetails);

export function enriquecerPagosConFacturas(pagos, facturas) {
  const invoices = new Map();
  const duplicates = new Set();
  for (const invoice of Array.isArray(facturas) ? facturas : []) {
    const uuid = normalized(invoice?.uuid);
    if (!uuid) continue;
    if (invoices.has(uuid)) { duplicates.add(uuid); invoices.delete(uuid); }
    else if (!duplicates.has(uuid)) invoices.set(uuid, invoice);
  }
  return (Array.isArray(pagos) ? pagos : []).map((payment) => {
    const reference = normalized(payment?.docRelacionado);
    const invoice = invoices.get(reference);
    const relationStatus = duplicates.has(reference) ? "ambiguous" : invoice ? "matched" : "unmatched";
    if (explicitTaxes(payment)) return { ...payment, relationStatus,
      taxEvidenceStatus: "source_explicit", ...(invoice ? { linkedInvoiceTotal: invoice.total } : {}) };
    // Un enlace UUID no aporta el desglose DR. No se divide el pago entre 1.16,
    // no se prorratea IVA de la factura y no se interpreta un residual como exento.
    return { ...payment, relationStatus, taxEvidenceStatus: "missing",
      baseIVA16: null, iva16: null, ivaRetenido: null, ieps: null, iepsBreakdown: {}, exento: null,
      ...(invoice ? { linkedInvoiceTotal: invoice.total } : {}) };
  });
}
