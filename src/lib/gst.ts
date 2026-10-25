
/** India GST split for food/QSR style invoices */

export type GstBreakup = {
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  mode: "intra" | "inter";
};

/**
 * Inclusive price → taxable + tax.
 * Gujarat customer / same state → CGST + SGST (half each).
 * Other state → IGST (full).
 */
export function splitGst(opts: {
  totalInclusive: number;
  ratePercent: number;
  shopState: string;
  customerState?: string | null;
}): GstBreakup {
  const rate = Number(opts.ratePercent) || 0;
  const total = Number(opts.totalInclusive) || 0;
  if (rate <= 0) {
    return { taxable: total, rate: 0, cgst: 0, sgst: 0, igst: 0, total, mode: "intra" };
  }
  const taxable = Math.round((total / (1 + rate / 100)) * 100) / 100;
  const tax = Math.round((total - taxable) * 100) / 100;
  const shop = (opts.shopState || "Gujarat").trim().toLowerCase();
  const cust = (opts.customerState || shop).trim().toLowerCase();
  const intra = !cust || cust === shop || cust === "gujarat" && shop === "gujarat";
  if (intra) {
    const half = Math.round((tax / 2) * 100) / 100;
    return {
      taxable,
      rate,
      cgst: half,
      sgst: Math.round((tax - half) * 100) / 100,
      igst: 0,
      total,
      mode: "intra",
    };
  }
  return { taxable, rate, cgst: 0, sgst: 0, igst: tax, total, mode: "inter" };
}

export function formatGstLines(g: GstBreakup): string[] {
  if (g.rate <= 0) return [];
  if (g.mode === "intra") {
    return [
      `Taxable value  Rs ${g.taxable.toFixed(2)}`,
      `CGST @ ${(g.rate / 2).toFixed(1)}%  Rs ${g.cgst.toFixed(2)}`,
      `SGST @ ${(g.rate / 2).toFixed(1)}%  Rs ${g.sgst.toFixed(2)}`,
    ];
  }
  return [
    `Taxable value  Rs ${g.taxable.toFixed(2)}`,
    `IGST @ ${g.rate.toFixed(1)}%  Rs ${g.igst.toFixed(2)}`,
  ];
}
