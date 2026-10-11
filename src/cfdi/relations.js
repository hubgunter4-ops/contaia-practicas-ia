const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function enriquecerPagosConFacturas(pagos, facturas) {
  const invoices = new Map();
  for (const factura of facturas) if (factura.uuid) invoices.set(String(factura.uuid).toLowerCase().trim(), factura);
  return pagos.map((pago) => {
    const linked = invoices.get(String(pago.docRelacionado || "").toLowerCase().trim());
    if (!linked) {
      if (pago.baseIVA16 === 0 && pago.iva16 === 0 && pago.impPagado > 0) {
        const baseIVA16 = round2(pago.impPagado / 1.16);
        return { ...pago, baseIVA16, iva16: round2(pago.impPagado - baseIVA16), exento: 0, estimatedTax: true, relationStatus: "unmatched" };
      }
      return { ...pago, relationStatus: "unmatched" };
    }
    const proportion = linked.total > 0 ? pago.impPagado / linked.total : 0;
    const baseIVA16 = round2((linked.subtotal - (linked.descuento || 0)) * proportion);
    const iva16 = round2(linked.iva16 * proportion);
    const ivaRetenido = round2((linked.ivaRetenido || 0) * proportion);
    const ieps = round2((linked.ieps || 0) * proportion);
    const iepsBreakdown = {};
    for (const [rate, amount] of Object.entries(linked.iepsBreakdown || {})) {
      const scaled = round2(amount * proportion);
      if (scaled > 0) iepsBreakdown[rate] = scaled;
    }
    return {
      ...pago, baseIVA16, iva16, ivaRetenido, ieps,
      exento: Math.max(0, round2(pago.impPagado - (baseIVA16 + iva16 + ieps - ivaRetenido))),
      iepsBreakdown: Object.keys(pago.iepsBreakdown || {}).length ? pago.iepsBreakdown : iepsBreakdown,
      relationStatus: "matched", linkedInvoiceTotal: linked.total,
    };
  });
}
