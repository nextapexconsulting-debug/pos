import { splitGst, formatGstLines } from "@/lib/gst";
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
  /** Print tax invoice (prices + GST) */
  printInvoice: boolean;
  /** Print kitchen KOT (items only, no prices/GST/QR) */
  printKot: boolean;
}

const KEY = "pos-printer-cfg";
export const defaultPrinterCfg: PrinterCfg = {
  enabled: false,
  connection: "bluetooth",
  networkHost: "",
  networkPort: "9100",
  paperWidth: "58",
  autoPrint: false,
  shopHeader: "Shop",
  copies: 2,
  copy1Label: "CUSTOMER COPY",
  copy2Label: "SHOP / KOT",
  customerQrEnabled: true,
  customerQrMm: 20,
  instagramUrl: "",
  whatsappNumber: "",
  menuUrl: "",
  printInvoice: true,
  printKot: true,
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

function loadGstCfg() {
  try {
    const raw = localStorage.getItem("pos-gst-cfg");
    if (raw) return JSON.parse(raw) as { gstin?: string; shopState?: string; rate?: number; invoicePrefix?: string };
  } catch {}
  return { gstin: "", shopState: "Gujarat", rate: 5, invoicePrefix: "INV" };
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
    gstHtml?: string;
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
      <div class="total">TOTAL  Rs ${opts.total}</div>
      ${opts.gstHtml || ""}
      ${qrBlock}
      <div class="sep"></div>
      <div style="text-align:center">Thank you</div>
    </div>`;
}


/** Kitchen ticket — items + qty only, no prices, GST, or QR */
function buildKotHtml(
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
  const items = opts.items
    .map((i) => `<div class="row"><span><b>${i.qty}×</b> ${escapeHtml(i.name)}</span></div>`)
    .join("");
  return `
    <div class="sheet">
      <div class="copy">${escapeHtml(copyLabel)}</div>
      <div class="head">${escapeHtml(cfg.shopHeader)}</div>
      <div class="sep"></div>
      <div><b>Order #${opts.orderNo || "—"}</b></div>
      <div>${formatOrderTime(opts.orderedAt)}</div>
      ${flags ? `<div><b>${flags}</b></div>` : ""}
      ${name ? `<div>${escapeHtml(name)}</div>` : ""}
      <div class="sep"></div>
      ${items}
      <div class="sep"></div>
      <div style="text-align:center;font-size:11px">${opts.items.reduce((s, i) => s + i.qty, 0)} items</div>
    </div>`;
}


/** ESC/POS plain receipt (direct Bluetooth). */
function buildEscPosBytes(
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
  title: string
): Uint8Array {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s.slice(0, 32));
  push(cfg.shopHeader || "Shop");
  push(title);
  push("------------------------");
  push("Order #" + (opts.orderNo || ""));
  push(formatOrderTime(opts.orderedAt));
  if (opts.parcel) push("PARCEL");
  if (opts.jain) push("JAIN");
  if (opts.customerName) push(String(opts.customerName));
  if (opts.customerMobile) push(String(opts.customerMobile));
  push("------------------------");
  for (const it of opts.items) {
    push(`${it.qty}x ${it.name}`);
    if (title.toLowerCase().includes("invoice") || title.toLowerCase().includes("customer") || title === "TAX INVOICE") {
      push(`  Rs ${Math.round(it.price * it.qty)}`);
    }
  }
  push("------------------------");
  push(`TOTAL  Rs ${Math.round(opts.total)}`);
  push("Thank you");
  push("");
  push("");
  push("");

  const out: number[] = [
    0x1b, 0x40,       // init
    0x1b, 0x61, 0x00, // left align
  ];
  const text = lines.join("\n") + "\n\n\n\n";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) {
      out.push(0x0a);
    } else if (c < 128) {
      out.push(c);
    } else {
      out.push(0x3f);
    }
  }
  // feed extra lines (more reliable than cut on some BLE printers)
  out.push(0x1b, 0x64, 0x04);
  return new Uint8Array(out);
}


const BT_UART_SERVICES = [
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-43b2-a6f2-08d78aa7c0c0",
  "000018f0-0000-1000-8000-00805f9b34fb",
];

/** Prefer known TX characteristic UUIDs (Nordic etc.) */
const PREFERRED_WRITE_CHARS = [
  "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART RX (phone → printer)
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "0000fff2-0000-1000-8000-00805f9b34fb",
];

// Session cache — avoids Chrome picker on every print in same tab
let _btDevice: any = null;
let _btChar: any = null;

async function collectWriteCharacteristics(server: any): Promise<any[]> {
  const found: any[] = [];
  const seen = new Set<string>();

  const add = (ch: any) => {
    if (!ch) return;
    const id = String(ch.uuid || "");
    if (seen.has(id)) return;
    if (!(ch.properties?.write || ch.properties?.writeWithoutResponse)) return;
    seen.add(id);
    found.push(ch);
  };

  // Preferred UUIDs first
  for (const uuid of PREFERRED_WRITE_CHARS) {
    try {
      for (const svcUuid of BT_UART_SERVICES) {
        try {
          const service = await server.getPrimaryService(svcUuid);
          add(await service.getCharacteristic(uuid));
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  }

  // All services
  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const ch of chars) add(ch);
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  }

  // Sort preferred first
  found.sort((a, b) => {
    const ai = PREFERRED_WRITE_CHARS.indexOf(String(a.uuid).toLowerCase());
    const bi = PREFERRED_WRITE_CHARS.indexOf(String(b.uuid).toLowerCase());
    const as = ai === -1 ? 99 : ai;
    const bs = bi === -1 ? 99 : bi;
    return as - bs;
  });
  return found;
}

async function writeEscPosChunks(ch: any, data: Uint8Array) {
  // Many BLE printers only accept 20-byte ATT payloads
  const chunk = 20;
  for (let i = 0; i < data.length; i += chunk) {
    const slice = data.slice(i, i + chunk);
    try {
      if (ch.properties.writeWithoutResponse) {
        await ch.writeValueWithoutResponse(slice);
      } else {
        await ch.writeValue(slice);
      }
    } catch {
      try {
        await ch.writeValue(slice);
      } catch {
        await ch.writeValueWithoutResponse(slice);
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function resolveBluetoothDevice(bt: any): Promise<any> {
  // 1) Same-tab cache
  if (_btDevice?.gatt) return _btDevice;

  // 2) Previously allowed devices (no picker)
  try {
    const known: any[] = (await bt.getDevices?.()) || [];
    const savedId = localStorage.getItem("pos-bt-printer-id") || "";
    if (savedId) {
      const match = known.find((d) => d.id === savedId);
      if (match) {
        _btDevice = match;
        return match;
      }
    }
    if (known.length) {
      _btDevice = known[0];
      return known[0];
    }
  } catch {
    /* */
  }

  // 3) First time only — system picker
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: BT_UART_SERVICES,
  });
  _btDevice = device;
  _btChar = null;
  try {
    localStorage.setItem("pos-bt-printer-id", device?.id || "");
    localStorage.setItem("pos-bt-printer-name", device?.name || "");
  } catch {
    /* */
  }
  return device;
}

/** Direct BLE ESC/POS. Picker only when no cached/permitted device. */
export async function printViaBluetoothEscpos(data: Uint8Array): Promise<void> {
  const bt = (navigator as any).bluetooth;
  if (!bt) {
    throw new Error("Use Chrome on Android for Bluetooth print.");
  }

  const device = await resolveBluetoothDevice(bt);
  if (!device?.gatt) throw new Error("No Bluetooth printer");

  let server: any;
  try {
    server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  } catch {
    _btDevice = null;
    _btChar = null;
    // reconnect with picker once
    const d2 = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: BT_UART_SERVICES,
    });
    _btDevice = d2;
    server = await d2.gatt.connect();
    try {
      localStorage.setItem("pos-bt-printer-id", d2?.id || "");
    } catch {
      /* */
    }
  }

  // Wait for services
  await new Promise((r) => setTimeout(r, 300));

  const chars = await collectWriteCharacteristics(server);
  if (!chars.length) {
    throw new Error(
      "Connected but no print channel. This printer may be classic Bluetooth only — use System print + Pocket POS Lite."
    );
  }

  // Try cached char first, then all (some accept write but ignore data)
  const ordered = _btChar
    ? [_btChar, ...chars.filter((c) => c.uuid !== _btChar.uuid)]
    : chars;

  let lastErr: any = null;
  for (const ch of ordered) {
    try {
      await writeEscPosChunks(ch, data);
      _btChar = ch;
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Write to printer failed");
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

  // Direct Bluetooth (no system dialog) when connection = bluetooth
  if (cfg.connection === "bluetooth" || cfg.connection === "none" && false) {
    try {
      const title =
        cfg.printInvoice !== false
          ? cfg.copy1Label || "TAX INVOICE"
          : cfg.copy2Label || "KOT";
      const bytes = buildEscPosBytes(opts, cfg, title);
      await printViaBluetoothEscpos(bytes);
      // second copy only if explicitly 2 copies — double BT write often drops
      if (cfg.copies === 2 && cfg.printKot !== false && cfg.printInvoice !== false) {
        await new Promise((r) => setTimeout(r, 500));
        const kot = buildEscPosBytes(opts, cfg, cfg.copy2Label || "KOT");
        await printViaBluetoothEscpos(kot);
      }
      return;
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error("Bluetooth print failed", e);
      // First pairing needed or BLE not available
      if (/No Bluetooth|cancel|User cancelled|NotFound/i.test(msg)) {
        alert(
          "Select your printer once when Chrome asks. After that prints go direct with no questions.\n\n" +
            msg
        );
        return;
      }
      const useSystem = confirm(
        "Bluetooth print failed:\n" +
          msg +
          "\n\nOK = system print\nCancel = stop"
      );
      if (!useSystem) return;
    }
  }

  const widthMm = cfg.paperWidth === "80" ? 72 : 48;
  const copies = cfg.copies === 1 ? 1 : 2;
  const label1 = cfg.copy1Label || "CUSTOMER COPY";
  const label2 = cfg.copy2Label || "SHOP / KOT";
  const qrMm = Math.max(18, cfg.customerQrMm || 20);

  const gstCfg = loadGstCfg();
  const gst = splitGst({
    totalInclusive: opts.total,
    ratePercent: Number(gstCfg.rate) || 0,
    shopState: gstCfg.shopState || "Gujarat",
    customerState: null,
  });
  const gstLines = formatGstLines(gst);
  const gstHtml =
    gstLines.length > 0
      ? `<div class="sep"></div>
         ${gstCfg.gstin ? `<div>GSTIN: ${escapeHtml(gstCfg.gstin)}</div>` : ""}
         ${gstLines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
         <div class="sep"></div>
         <div style="font-size:9px;text-align:center">Tax invoice (GST)</div>`
      : "";

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

  const wantInvoice = cfg.printInvoice !== false;
  const wantKot = cfg.printKot !== false;
  // Backward compat: if both unset somehow, use copies
  const slips: string[] = [];
  if (wantInvoice) {
    slips.push(
      buildSlipHtml(
        { ...opts, gstHtml },
        cfg,
        cfg.copy1Label || "TAX INVOICE",
        qrs,
        true
      )
    );
  }
  if (wantKot) {
    slips.push(
      buildKotHtml(opts, cfg, cfg.copy2Label || "KOT / KITCHEN")
    );
  }
  if (!slips.length) {
    // fallback one invoice
    slips.push(buildSlipHtml({ ...opts, gstHtml }, cfg, "RECEIPT", qrs, true));
  }

  const root = document.createElement("div");
  root.id = "pos-print-root";
  root.innerHTML = `
    <style>
      #pos-print-root {
        position: fixed;
        left: 0;
        top: 0;
        width: ${widthMm}mm;
        max-width: 100%;
        background: #fff;
        color: #000;
        z-index: 99999;
        /* visible briefly so Android/Pocket POS captures content (off-screen often = blank) */
        opacity: 1;
      }
      @media screen {
        #pos-print-root {
          pointer-events: none;
        }
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
      @page { margin: 2mm; size: auto; }
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
      // Remove on-screen slip after dialog (Android often needs it visible during print)
      setTimeout(cleanup, 1500);
      setTimeout(cleanup, 60_000);
    });
  });
}
