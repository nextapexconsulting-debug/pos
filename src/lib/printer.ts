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
  /** Customer copy QR row */
  customerQrEnabled: boolean;
  customerQrMm: number;
  instagramUrl: string;
  whatsappNumber: string;
  menuUrl: string;
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
  customerQrMm: 20,
  instagramUrl: "",
  whatsappNumber: "",
  menuUrl: "",
};

export function loadPrinterCfg(): PrinterCfg {
  if (typeof window === "undefined") return defaultPrinterCfg;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: PrinterCfg = { ...defaultPrinterCfg, ...JSON.parse(raw) };
      parsed.copies = Number(parsed.copies) === 1 ? 1 : 2;
      // Min 18mm — 12mm rarely scans on thermal
      let mm = Number(parsed.customerQrMm) || 20;
      if (mm < 18) mm = 18;
      if (mm > 28) mm = 28;
      parsed.customerQrMm = mm;
      // migrate old single customerQrUrl → instagram
      const anyParsed = parsed as PrinterCfg & { customerQrUrl?: string };
      if (!parsed.instagramUrl && anyParsed.customerQrUrl) {
        parsed.instagramUrl = anyParsed.customerQrUrl;
      }
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

function normalizeInstagram(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("@")) return `https://instagram.com/${v.slice(1)}`;
  if (/instagram\.com/i.test(v)) return v.startsWith("http") ? v : `https://${v}`;
  if (/^[A-Za-z0-9._]+$/.test(v)) return `https://instagram.com/${v}`;
  return v;
}

function normalizeWhatsApp(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 10) return "";
  const full = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent("Hi! I want to order.");
  return `https://wa.me/${full}?text=${text}`;
}

function normalizeMenuUrl(raw: string, origin?: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/") && origin) return `${origin}${v}`;
  return v;
}

async function makeQrDataUrl(text: string, px = 120): Promise<string> {
  try {
    const QR = (await import("qrcode")).default;
    return await QR.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: px,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=1&data=${encodeURIComponent(text)}`;
  }
}

type QrCell = { label: string; dataUrl: string };

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
  qrs: QrCell[],
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

  const qrMm = Math.max(18, cfg.customerQrMm || 20);
  const qrBlock =
    isCustomerCopy && qrs.length
      ? `<div class="sep"></div>
         <div class="qrrow">
           ${qrs
             .map(
               (q) => `
             <div class="qrcell">
               <div class="qrlab">${escapeHtml(q.label)}</div>
               <img class="qr" src="${q.dataUrl}" alt="" />
             </div>`
             )
             .join("")}
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
  const qrMm = Math.max(18, cfg.customerQrMm || 20);

  const qrs: QrCell[] = [];
  if (cfg.customerQrEnabled) {
    const origin = window.location.origin;
    const ig = normalizeInstagram(cfg.instagramUrl || "");
    const wa = normalizeWhatsApp(cfg.whatsappNumber || "");
    const menu = normalizeMenuUrl(cfg.menuUrl || "", origin);
    // ~2.5–3 px per mm for decent scan on thermal
    const px = Math.round(qrMm * 4);
    if (ig) qrs.push({ label: "Insta", dataUrl: await makeQrDataUrl(ig, px) });
    if (wa) qrs.push({ label: "WhatsApp", dataUrl: await makeQrDataUrl(wa, px) });
    if (menu) qrs.push({ label: "Menu", dataUrl: await makeQrDataUrl(menu, px) });
  }

  document.getElementById("pos-print-root")?.remove();

  const slips: string[] = [];
  slips.push(buildSlipHtml(opts, cfg, label1, qrs, true));
  if (copies === 2) {
    slips.push(buildSlipHtml(opts, cfg, label2, [], false));
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
        line-height: 1.3;
        color: #000;
        width: ${widthMm}mm;
      }
      #pos-print-root .copy {
        text-align: center;
        font-weight: 700;
        font-size: 11px;
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
      #pos-print-root .qrrow {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        gap: 3mm;
        margin-top: 2px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #pos-print-root .qrcell {
        text-align: center;
        flex: 0 0 auto;
      }
      #pos-print-root .qrlab {
        font-size: 8px;
        font-weight: 700;
        margin-bottom: 1px;
        letter-spacing: 0.02em;
      }
      #pos-print-root .qr {
        width: ${qrMm}mm;
        height: ${qrMm}mm;
        image-rendering: pixelated;
        display: block;
        margin: 0 auto;
      }
      #pos-print-root .break {
        page-break-after: always;
        break-after: page;
        height: 0;
      }
      @page { margin: 3mm; size: auto; }
      @media print {
        html, body {
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }
        body > *:not(#pos-print-root) { display: none !important; }
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
