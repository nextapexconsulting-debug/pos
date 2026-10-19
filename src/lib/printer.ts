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

function buildReceiptHtml(opts: {
  orderNo: number;
  items: { name: string; qty: number; price: number }[];
  total: number;
  parcel?: boolean;
  jain?: boolean;
  shopHeader: string;
  paperWidth: "58" | "80";
}): string {
  const width = opts.paperWidth === "80" ? "300px" : "220px";
  const flags = [opts.parcel ? "PARCEL" : "", opts.jain ? "JAIN" : ""]
    .filter(Boolean)
    .join(" · ");
  const items = opts.items
    .map(
      (i) =>
        `<div style="margin:4px 0"><div>${i.qty}× ${escapeHtml(i.name)}</div><div style="text-align:right">₹${i.price * i.qty}</div></div>`
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Order #${opts.orderNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:12px;color:#000;background:#fff}
  .r{width:${width};max-width:100%;margin:0 auto}
  h1{font-size:15px;text-align:center;margin-bottom:6px}
  .line{border-top:1px dashed #000;margin:8px 0}
  .total{font-size:16px;font-weight:700;text-align:right;margin-top:6px}
  @media print{body{padding:0} .noprint{display:none!important}}
</style></head><body>
<div class="r">
  <h1>${escapeHtml(opts.shopHeader)}</h1>
  <div class="line"></div>
  <div><b>Order #${opts.orderNo}</b></div>
  <div>${new Date().toLocaleString("en-IN")}</div>
  ${flags ? `<div><b>${flags}</b></div>` : ""}
  <div class="line"></div>
  ${items}
  <div class="line"></div>
  <div class="total">TOTAL  ₹${opts.total}</div>
  <div class="line"></div>
  <div style="text-align:center;margin-top:8px">Thank you</div>
</div>
<script>
  window.onload=function(){
    setTimeout(function(){
      try{window.focus();window.print();}catch(e){}
    },250);
  };
</script>
</body></html>`;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Mobile-safe print: uses hidden iframe (popup blockers often block window.open on phones).
 * Falls back to same-tab print document if iframe fails.
 */
export function printOrderReceipt(opts: {
  orderNo: number;
  items: { name: string; qty: number; price: number }[];
  total: number;
  parcel?: boolean;
  jain?: boolean;
}) {
  if (typeof window === "undefined") return;
  const cfg = loadPrinterCfg();
  // Print always allowed when user taps Print (cfg.enabled only for auto after Okay)
  const html = buildReceiptHtml({
    ...opts,
    shopHeader: cfg.shopHeader,
    paperWidth: cfg.paperWidth,
  });

  try {
    // Remove old iframe if any
    document.getElementById("pos-print-frame")?.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "pos-print-frame";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error("no iframe document");

    doc.open();
    doc.write(html);
    doc.close();

    // iOS sometimes needs explicit contentWindow.print after load
    const win = iframe.contentWindow;
    if (win) {
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          fallbackPrint(html);
        }
      }, 300);
    }
  } catch {
    fallbackPrint(html);
  }
}

function fallbackPrint(html: string) {
  // Same-tab approach: open blob URL (works better on some mobile browsers)
  try {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      // Last resort: navigate current tab
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    console.error("print failed", e);
    alert("Print failed. Allow pop-ups for this site, or use browser Share → Print.");
  }
}
