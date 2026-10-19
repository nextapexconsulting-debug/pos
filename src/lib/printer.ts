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

export function printOrderReceipt(opts: {
  orderNo: number;
  items: { name: string; qty: number; price: number }[];
  total: number;
  parcel?: boolean;
  jain?: boolean;
}) {
  const cfg = loadPrinterCfg();
  if (!cfg.enabled) return;
  const lines = [
    cfg.shopHeader,
    "----------------",
    `Order #${opts.orderNo}`,
    new Date().toLocaleString("en-IN"),
    opts.parcel ? "PARCEL" : "",
    opts.jain ? "JAIN" : "",
    "----------------",
    ...opts.items.map((i) => `${i.qty}x ${i.name}\n  Rs ${i.price * i.qty}`),
    "----------------",
    `TOTAL  Rs ${opts.total}`,
    "----------------",
    "Thank you",
    "\n\n\n",
  ].filter(Boolean);
  const text = lines.join("\n");
  const w = window.open("", "_blank", "width=320,height=560");
  if (!w) return;
  w.document.write(
    `<pre style="font-family:monospace;font-size:12px;width:${cfg.paperWidth === "80" ? "300" : "220"}px;padding:8px">${text.replace(/</g, "&lt;")}</pre>`
  );
  w.document.close();
  w.focus();
  w.print();
}
