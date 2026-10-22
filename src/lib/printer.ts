export type Conn = "none" | "network" | "bluetooth" | "system";

export interface PrinterCfg {
  enabled: boolean;
  connection: Conn;
  networkHost: string;
  networkPort: string;
  paperWidth: "58" | "80";
  autoPrint: boolean;
  shopHeader: string;
  copies: 1 | 2;
  copy1Label: string;
  copy2Label: string;
  /** Show QR on customer (first) copy only */
  customerQrEnabled: boolean;
  /** Instagram / WhatsApp / any URL for QR */
  customerQrUrl: string;
  /** QR size in mm (keep small for long orders) */
  customerQrMm: number;
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
  customerQrEnabled: true,
  customerQrUrl: "",
  customerQrMm: 18,
};

export function loadPrinterCfg(): PrinterCfg {
  if (typeof window === "undefined") return defaultPrinterCfg;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = { ...defaultPrinterCfg, ...JSON.parse(raw) };
      parsed.copies = Number(parsed.copies) === 1 ? 1 : 2;
      parsed.customerQrMm = Math.min(28, Math.max(12, Number(parsed.customerQrMm) || 18));
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

function normalizeQrUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("@")) return `https://instagram.com/${v.slice(1)}`;
  if (/instagram\.com/i.test(v)) return v.startsWith("http") ? v : `https://${v}`;
  // bare handle
  if (/^[A-Za-z0-9._]+$/.test(v)) return `https://instagram.com/${v}`;
  return v;
}

/** Build tiny QR as data-URL (no external download needed). */
async function makeQrDataUrl(text: string, px = 96): Promise<string> {
  try {
    const QR = (await import("qrcode")).default;
    return await QR.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 0,
      width: px,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    // Fallback online API if package missing at runtime
    return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=0&data=${encodeURIComponent(text)}`;
  }
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
  copyLabel: string,
  qrDataUrl: string | null,
  isCustomerCopy: boolean
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

  // QR only on customer copy, compact, after total — avoids eating item space at top
  const qrMm = cfg.customerQrMm || 18;
  const qrBlock =
    isCustomerCopy && qrDataUrl
      ? `<div class="sep"></div>
         <div class="qrwrap">
           <img class="qr" src="${qrDataUrl}" width="${Math.round(qrMm * 3.8)}" height="${Math.round(qrMm * 3.8)}" alt="" />
           <div class="qrcap">IG</div>
         </div>`
      : "";

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
      ${qrBlock}
      <div class="sep"></div>
      <div style="text-align:center">Thank you</div>
    </div>`;
}

/**
 * Print KOT/receipt. Customer copy can include a small Instagram QR at the bottom.
 * Shop copy stays text-only so long orders are safer on thermal paper.
 */
export async function printOrderReceipt(opts: {
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

  let qrDataUrl: string | null = null;
  const link = normalizeQrUrl(cfg.customerQrUrl || "");
  if (cfg.customerQrEnabled && link) {
    // Small pixel size is enough for 12–20mm print
    qrDataUrl = await makeQrDataUrl(link, 96);
  }

  document.getElementById("pos-print-root")?.remove();

  const slips: string[] = [];
  slips.push(buildSlipHtml(opts, cfg, label1, qrDataUrl, true));
  if (copies === 2) {
    // Shop / KOT: no QR (saves paper & reduces fail risk on long tickets)
    slips.push(buildSlipHtml(opts, cfg, label2, null, false));
  }

  const qrMm = cfg.customerQrMm || 18;
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
        line-height: 1.3;
        color: #000;
        width: ${widthMm}mm;
      }
      #pos-print-root .copy {
        text-align: center;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.04em;
        margin-bottom: 2px;
      }
      #pos-print-root .row {
        display: flex;
        justify-content: space-between;
        gap: 4px;
        margin: 1px 0;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #pos-print-root .sep {
        border-top: 1px dashed #000;
        margin: 4px 0;
      }
      #pos-print-root .head {
        text-align: center;
        font-weight: 700;
        font-size: 13px;
        margin-bottom: 2px;
      }
      #pos-print-root .total {
        font-size: 14px;
        font-weight: 700;
        text-align: right;
      }
      #pos-print-root .qrwrap {
        text-align: center;
        margin: 4px 0 0;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #pos-print-root .qr {
        width: ${qrMm}mm;
        height: ${qrMm}mm;
        image-rendering: pixelated;
      }
      #pos-print-root .qrcap {
        font-size: 9px;
        margin-top: 1px;
      }
      #pos-print-root .break {
        page-break-after: always;
        break-after: page;
        height: 0;
      }
      @page {
        margin: 3mm;
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
      .map((html, i) => html + (i < slips.length - 1 ? '<div class="break"></div>' : ""))
      .join("")}
  `;
  document.body.appendChild(root);

  const cleanup = () => {
    document.getElementById("pos-print-root")?.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Wait a tick so QR image is in DOM
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
