export type Conn = "none" | "network" | "bluetooth" | "system";

export interface PrinterCfg {
  enabled: boolean;
  connection: Conn;
  networkHost: string;
  networkPort: string;
  paperWidth: "58" | "80";
  autoPrint: boolean;
  shopHeader: string;
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
};

export function loadPrinterCfg(): PrinterCfg {
  if (typeof window === "undefined") return defaultPrinterCfg;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultPrinterCfg, ...JSON.parse(raw) };
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

/**
 * Same-page print:
 * - Only receipt content is printed (no blank pages from hidden UI)
 * - Long orders flow to next page automatically
 * - No extra browser history on mobile
 */
export function printOrderReceipt(opts: {
  orderNo: number;
  items: { name: string; qty: number; price: number }[];
  total: number;
  parcel?: boolean;
  jain?: boolean;
  /** When the order was placed (ISO string or Date). Defaults to now only if missing. */
  orderedAt?: string | Date | null;
}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const cfg = loadPrinterCfg();
  // Thermal widths ~58mm / 80mm at ~96dpi
  const widthMm = cfg.paperWidth === "80" ? 72 : 48;
  const flags = [opts.parcel ? "PARCEL" : "", opts.jain ? "JAIN" : ""]
    .filter(Boolean)
    .join(" · ");

  document.getElementById("pos-print-root")?.remove();

  const root = document.createElement("div");
  root.id = "pos-print-root";
  root.innerHTML = `
    <style>
      /* On screen: park off-canvas, no layout impact */
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
      #pos-print-root .row {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        margin: 2px 0;
        page-break-inside: avoid;
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

      @page {
        margin: 4mm;
        size: auto;
      }

      @media print {
        /* Hide entire app — display:none so it takes NO space (avoids blank pages) */
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
        /* Allow natural page breaks for long orders; keep each line together */
        #pos-print-root .row {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        #pos-print-root .head,
        #pos-print-root .total {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      }
    </style>
    <div class="sheet">
      <div class="head">${escapeHtml(cfg.shopHeader)}</div>
      <div class="sep"></div>
      <div><b>Order #${opts.orderNo}</b></div>
      <div>${formatOrderTime(opts.orderedAt)}</div>
      ${flags ? `<div><b>${flags}</b></div>` : ""}
      <div class="sep"></div>
      ${opts.items
        .map(
          (i) =>
            `<div class="row"><span>${i.qty}× ${escapeHtml(i.name)}</span><span>₹${i.price * i.qty}</span></div>`
        )
        .join("")}
      <div class="sep"></div>
      <div class="total">TOTAL  ₹${opts.total}</div>
      <div class="sep"></div>
      <div style="text-align:center">Thank you</div>
    </div>
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
