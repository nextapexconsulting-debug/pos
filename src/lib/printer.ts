export type Conn = "none" | "network" | "bluetooth" | "system";

export interface PrinterCfg {
  enabled: boolean;
  connection: Conn;
  networkHost: string;
  networkPort: string;
  paperWidth: "58" | "80";
  autoPrint: boolean;
  shopHeader: string;
  /** How many slips per print */
  copies: 1 | 2;
  /** Label for first copy */
  copy1Label: string;
  /** Label for second copy (used when copies === 2) */
  copy2Label: string;
}

const KEY = "pos-printer-cfg";
export const defaultPrinterCfg: PrinterCfg = {
  enabled: false,
  connection: "system",
  networkHost: "",
  networkPort: "9100",
  paperWidth: "58",
  autoPrint: false,
  shopHeader: "Krishna Sandwich - Pizza",
  copies: 2,
  copy1Label: "CUSTOMER COPY",
  copy2Label: "SHOP / KOT",
};

export function loadPrinterCfg(): PrinterCfg {
  if (typeof window === "undefined") return defaultPrinterCfg;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = { ...defaultPrinterCfg, ...JSON.parse(raw) };
      // normalize copies
      parsed.copies = Number(parsed.copies) === 1 ? 1 : 2;
      return parsed;
    }
  } catch {}
  return defaultPrinterCfg;
}

export function savePrinterCfg(cfg: PrinterCfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatOrderTime(orderedAt?: string | Date | null): string {
  const d = orderedAt ? new Date(orderedAt) : new Date();
  if (isNaN(d.getTime())) {
    return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildSlipHtml(
  opts: {
    orderNo: number;
    items: { name: string; qty: number; price: number }[];
    total: number;
    parcel?: boolean;
    jain?: boolean;
    orderedAt?: string | Date | null;
    customerName?: string | null;
    customerMobile?: string | null;
  },
  cfg: PrinterCfg,
  copyLabel: string
): string {
  const flags = [opts.parcel ? "PARCEL" : "", opts.jain ? "JAIN" : ""]
    .filter(Boolean)
    .join(" · ");
  const name = (opts.customerName || "").trim();
  const mobile = (opts.customerMobile || "").trim();
  const customerBlock =
    name || mobile
      ? `<div class="sep"></div>
         ${name ? `<div><b>Name:</b> ${escapeHtml(name)}</div>` : ""}
         ${mobile ? `<div><b>Mobile:</b> ${escapeHtml(mobile)}</div>` : ""}`
      : "";

  const items = opts.items
    .map(
      (i) =>
        `<div class="row"><span>${i.qty}× ${escapeHtml(i.name)}</span><span>₹${i.price * i.qty}</span></div>`
    )
    .join("");

  return `
    <div class="sheet">
      <div class="copy">${escapeHtml(copyLabel)}</div>
      <div class="head">${escapeHtml(cfg.shopHeader)}</div>
      <div class="sep"></div>
      <div><b>Order #${opts.orderNo || "—"}</b></div>
      <div>${formatOrderTime(opts.orderedAt)}</div>
      ${flags ? `<div><b>${flags}</b></div>` : ""}
      ${customerBlock}
      <div class="sep"></div>
      ${items}
      <div class="sep"></div>
      <div class="total">TOTAL  ₹${opts.total}</div>
      <div class="sep"></div>
      <div style="text-align:center">Thank you</div>
    </div>`;
}

/**
 * Print KOT/receipt. Copies and labels come from Printer settings.
 * Customer name/mobile printed when provided.
 */
export function printOrderReceipt(opts: {
  orderNo: number;
  items: { name: string; qty: number; price: number }[];
  total: number;
  parcel?: boolean;
  jain?: boolean;
  orderedAt?: string | Date | null;
  customerName?: string | null;
  customerMobile?: string | null;
}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const cfg = loadPrinterCfg();
  const widthMm = cfg.paperWidth === "80" ? 72 : 48;
  const copies = cfg.copies === 1 ? 1 : 2;
  const label1 = cfg.copy1Label || "CUSTOMER COPY";
  const label2 = cfg.copy2Label || "SHOP / KOT";

  document.getElementById("pos-print-root")?.remove();

  const slips: string[] = [];
  slips.push(buildSlipHtml(opts, cfg, label1));
  if (copies === 2) {
    slips.push(buildSlipHtml(opts, cfg, label2));
  }

  const root = document.createElement("div");
  root.id = "pos-print-root";
  root.innerHTML = `
    <style>
      #pos-print-root {
        position: absolute;
        left: -10000px;
        top: 0;
        width: ${widthMm}mm;
      }
      #pos-print-root .sheet {
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 12px;
        line-height: 1.35;
        color: #000;
        width: ${widthMm}mm;
      }
      #pos-print-root .copy {
        text-align: center;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.04em;
        margin-bottom: 4px;
      }
      #pos-print-root .row {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        margin: 2px 0;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #pos-print-root .sep {
        border-top: 1px dashed #000;
        margin: 6px 0;
      }
      #pos-print-root .head {
        text-align: center;
        font-weight: 700;
        font-size: 13px;
        margin-bottom: 4px;
      }
      #pos-print-root .total {
        font-size: 14px;
        font-weight: 700;
        text-align: right;
      }
      #pos-print-root .break {
        page-break-after: always;
        break-after: page;
        height: 0;
      }
      @page {
        margin: 4mm;
        size: auto;
      }
      @media print {
        html, body {
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }
        body > *:not(#pos-print-root) {
          display: none !important;
        }
        #pos-print-root {
          display: block !important;
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #pos-print-root .sheet {
          width: ${widthMm}mm;
          max-width: 100%;
          margin: 0 auto;
        }
      }
    </style>
    ${slips
      .map(
        (html, i) =>
          html + (i < slips.length - 1 ? '<div class="break"></div>' : "")
      )
      .join("")}
  `;
  document.body.appendChild(root);

  const cleanup = () => {
    document.getElementById("pos-print-root")?.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        window.print();
      } catch (e) {
        console.error(e);
        cleanup();
        alert("Could not open print. Try again.");
      }
      setTimeout(cleanup, 60_000);
    });
  });
}
