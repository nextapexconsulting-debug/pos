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

/**
 * Print on the SAME page (no new tab / no extra history).
 * Mobile: dismiss print dialog → one Back stays in the app.
 */
export function printOrderReceipt(opts: {
  orderNo: number;
  items: { name: string; qty: number; price: number }[];
  total: number;
  parcel?: boolean;
  jain?: boolean;
}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const cfg = loadPrinterCfg();
  const width = cfg.paperWidth === "80" ? "300px" : "220px";
  const flags = [opts.parcel ? "PARCEL" : "", opts.jain ? "JAIN" : ""]
    .filter(Boolean)
    .join(" · ");

  // Remove previous print root if any
  document.getElementById("pos-print-root")?.remove();

  const root = document.createElement("div");
  root.id = "pos-print-root";
  root.innerHTML = `
    <style id="pos-print-style">
      /* Screen: hide receipt completely */
      #pos-print-root {
        position: fixed;
        left: -9999px;
        top: 0;
        width: ${width};
        pointer-events: none;
      }
      @media print {
        /* Print only the receipt — hide the app UI */
        body * { visibility: hidden !important; }
        #pos-print-root, #pos-print-root * { visibility: visible !important; }
        #pos-print-root {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          pointer-events: auto !important;
        }
        #pos-print-root .sheet {
          width: ${width};
          max-width: 100%;
          margin: 0 auto;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 13px;
          color: #000;
        }
      }
    </style>
    <div class="sheet">
      <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:6px">${escapeHtml(cfg.shopHeader)}</div>
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <div><b>Order #${opts.orderNo}</b></div>
      <div>${new Date().toLocaleString("en-IN")}</div>
      ${flags ? `<div><b>${flags}</b></div>` : ""}
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      ${opts.items
        .map(
          (i) =>
            `<div style="margin:4px 0;display:flex;justify-content:space-between;gap:8px"><span>${i.qty}× ${escapeHtml(i.name)}</span><span>₹${i.price * i.qty}</span></div>`
        )
        .join("")}
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <div style="font-size:16px;font-weight:700;text-align:right">TOTAL  ₹${opts.total}</div>
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <div style="text-align:center;margin-top:8px">Thank you</div>
    </div>
  `;
  document.body.appendChild(root);

  const cleanup = () => {
    document.getElementById("pos-print-root")?.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Defer so the DOM is ready (helps iOS/Android)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        window.print();
      } catch (e) {
        console.error(e);
        cleanup();
        alert("Could not open print. Try again.");
      }
      // Safety cleanup if afterprint never fires (some Android WebViews)
      setTimeout(cleanup, 60_000);
    });
  });
}
