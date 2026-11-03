"use client";


import { useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import {
import { useT } from "@/lib/i18n";
  loadPrinterCfg,
  savePrinterCfg,
  defaultPrinterCfg,
  printOrderReceipt,
  type PrinterCfg,
  type Conn,
} from "@/lib/printer";

type Cfg = PrinterCfg & { customerQrUrl?: string };

export default function PrinterPage() {
  const { t } = useT();
  return (
    <PageShell title={t("printer")} roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [cfg, setCfg] = useState<Cfg>(defaultPrinterCfg);
  const [msg, setMsg] = useState("");
  const [btSupported, setBtSupported] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pos-printer-cfg");
      if (raw) {
        const parsed: Cfg = { ...defaultPrinterCfg, ...JSON.parse(raw) };
        if (!parsed.instagramUrl && parsed.customerQrUrl) {
          parsed.instagramUrl = parsed.customerQrUrl;
        }
        if ((parsed.customerQrMm || 0) < 18) parsed.customerQrMm = 20;
        setCfg(parsed);
      }
    } catch {}
    setBtSupported(typeof navigator !== "undefined" && !!(navigator as any).bluetooth);
  }, []);

  const save = () => {
    savePrinterCfg(cfg);
    setMsg("Printer settings saved on this device");
    setTimeout(() => setMsg(""), 2500);
  };

  const testPrint = async () => {
    await printOrderReceipt({
      orderNo: 0,
      items: [{ name: "Test item", qty: 1, price: 0 }],
      total: 0,
    });
    setMsg("Sent to Bluetooth (or print dialog if fallback)");
  };

  const forgetBt = () => {
    try {
      localStorage.removeItem("pos-bt-printer-id");
      localStorage.removeItem("pos-bt-printer-name");
    } catch {}
    setMsg("Bluetooth printer forgotten — next print will ask once");
  };

  return (
    <>
      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Setup (this device)</h2>
        <p className="text-xs text-slate-500">
          <b>Simple path:</b> set connection to <b>Bluetooth (direct)</b>. On Print, Chrome asks
          once for the printer, then sends the bill straight over Bluetooth — no print dialog.
          Needs <b>Chrome on Android</b> and a <b>BLE</b> thermal printer.
          First print asks once; later prints use the same device in this browser session.
          Pairing works but blank paper often means classic-Bluetooth-only hardware — then use System print.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          Enable printing after order (Okay)
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.autoPrint}
            onChange={(e) => setCfg({ ...cfg, autoPrint: e.target.checked })}
            disabled={!cfg.enabled}
          />
          Auto-print on Okay (no confirm)
        </label>

        <div>
          <label className="text-xs text-slate-500">Connection method</label>
          <select
            className={input}
            value={cfg.connection}
            onChange={(e) => setCfg({ ...cfg, connection: e.target.value as Conn })}
          >
            <option value="bluetooth">Bluetooth (direct — one tap, no dialog)</option>
            <option value="system">System print (Pocket POS Lite dialog)</option>
            <option value="network">Network IP (ESC/POS port 9100)</option>
            <option value="none">None</option>
          </select>
        </div>

        {cfg.connection === "network" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">Printer IP</label>
              <input
                className={input}
                placeholder="192.168.1.50"
                value={cfg.networkHost}
                onChange={(e) => setCfg({ ...cfg, networkHost: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Port</label>
              <input
                className={input}
                value={cfg.networkPort}
                onChange={(e) => setCfg({ ...cfg, networkPort: e.target.value })}
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-slate-500">Paper width</label>
          <select
            className={input}
            value={cfg.paperWidth}
            onChange={(e) => setCfg({ ...cfg, paperWidth: e.target.value as "58" | "80" })}
          >
            <option value="58">58 mm</option>
            <option value="80">80 mm</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-500">Header on receipt</label>
          <input
            className={input}
            value={cfg.shopHeader}
            onChange={(e) => setCfg({ ...cfg, shopHeader: e.target.value })}
          />
        </div>

        <div className="border-t border-[color-mix(in_srgb,var(--pos-primary)_25%,white)] pt-3 space-y-2">
          <h3 className="font-semibold text-sm">What to print</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.printInvoice !== false}
              onChange={(e) => setCfg({ ...cfg, printInvoice: e.target.checked })}
            />
            <b>Tax invoice</b> — prices, total, GST, QR (customer)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.printKot !== false}
              onChange={(e) => setCfg({ ...cfg, printKot: e.target.checked })}
            />
            <b>KOT / Kitchen</b> — items + qty only (no prices / GST / QR)
          </label>
          <p className="text-xs text-slate-500">
            Turn on both for two separate slips. Turn off invoice if you only need kitchen tickets.
          </p>
        </div>
        <div>
          <label className="text-xs text-slate-500">Legacy copies (optional)</label>
          <select
            className={input}
            value={cfg.copies ?? 2}
            onChange={(e) => setCfg({ ...cfg, copies: Number(e.target.value) === 1 ? 1 : 2 })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500">Copy 1 label</label>
            <input
              className={input}
              value={cfg.copy1Label ?? "CUSTOMER COPY"}
              onChange={(e) => setCfg({ ...cfg, copy1Label: e.target.value })}
              placeholder="CUSTOMER COPY"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Copy 2 label (if 2 copies)</label>
            <input
              className={input}
              value={cfg.copy2Label ?? "SHOP / KOT"}
              onChange={(e) => setCfg({ ...cfg, copy2Label: e.target.value })}
              placeholder="SHOP / KOT"
              disabled={(cfg.copies ?? 2) === 1}
            />
          </div>
        </div>

        <div className="border-t pos-border pt-3 space-y-2">
          <h3 className="font-semibold text-sm">Customer slip QR codes</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.customerQrEnabled !== false}
              onChange={(e) => setCfg({ ...cfg, customerQrEnabled: e.target.checked })}
            />
            Print QR row on <b>customer copy only</b> (Insta · WhatsApp · Menu)
          </label>
          <div>
            <label className="text-xs text-slate-500">Instagram (@handle or URL)</label>
            <input
              className={input}
              value={cfg.instagramUrl || ""}
              onChange={(e) => setCfg({ ...cfg, instagramUrl: e.target.value })}
              placeholder="@yourshop"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">WhatsApp number</label>
            <input
              className={input}
              value={cfg.whatsappNumber || ""}
              onChange={(e) => setCfg({ ...cfg, whatsappNumber: e.target.value })}
              placeholder="9876543210"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Menu link (Google Drive / website / PDF)</label>
            <input
              className={input}
              value={cfg.menuUrl || ""}
              onChange={(e) => setCfg({ ...cfg, menuUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">QR size (12 mm does not scan well)</label>
            <select
              className={input}
              value={Math.max(18, cfg.customerQrMm || 20)}
              onChange={(e) => setCfg({ ...cfg, customerQrMm: Number(e.target.value) })}
            >
              <option value={18}>18 mm (minimum reliable)</option>
              <option value={20}>20 mm (recommended)</option>
              <option value={22}>22 mm</option>
              <option value={24}>24 mm</option>
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Labels above each code: <b>Insta</b> · <b>WhatsApp</b> · <b>Menu</b>. Shop/KOT copy stays
            text-only for long orders.
          </p>
        </div>

        {btSupported && cfg.connection === "bluetooth" && (
          <p className="text-xs text-amber-700">
            Web Bluetooth needs Chrome on Android and a compatible ESC/POS printer. System print is
            still more reliable.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button type="button" className={btn} onClick={save}>
            Save
          </button>
          <button type="button" className={btn2} onClick={testPrint}>
            Test print
          </button>
        <button type="button" className={btn2} onClick={forgetBt}>
          Forget Bluetooth printer
        </button>
        </div>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>

      <div className={`${card} text-xs text-slate-600 space-y-2`}>
        <p className="font-semibold text-slate-800">Pocket POS Lite (Bluetooth) — exact steps</p>
        <p>1. Phone <b>Settings → Bluetooth</b> → pair the thermal printer (must show Connected).</p>
        <p>2. Open <b>Pocket POS Lite</b> app → select that printer → run its <b>{t("test_print")}</b> until paper moves.</p>
        <p>3. In GenZPOS → Printer: enable printing, connection <b>System print</b>, paper <b>58 mm</b> → Save.</p>
        <p>4. Tap <b>{t("test_print")}</b> here. In the Android print screen:</p>
        <p className="pl-3">• Printer = <b>Pocket POS Lite</b> (or your printer name) — <b>not</b> Save as PDF</p>
        <p className="pl-3">• Paper size = 58mm / roll if listed</p>
        <p className="pl-3">• Then Print</p>
        <p>5. GenZPOS only opens that dialog — it cannot “search Bluetooth” by itself. If the dialog has no Pocket POS Lite, fix steps 1–2 first.</p>
      </div>
    </>
  );
}
