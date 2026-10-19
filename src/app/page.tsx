"use client";

import { useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";

import { loadPrinterCfg, savePrinterCfg, defaultPrinterCfg, printOrderReceipt, type PrinterCfg, type Conn } from "@/lib/printer";
type Cfg = PrinterCfg;
const defaults = defaultPrinterCfg;
const KEY = "pos-printer-cfg";

export default function PrinterPage() {
  return (
    <PageShell title="Printer" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [cfg, setCfg] = useState<Cfg>(defaults);
  const [msg, setMsg] = useState("");
  const [btSupported, setBtSupported] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setCfg({ ...defaults, ...JSON.parse(raw) });
    } catch {}
    setBtSupported(typeof navigator !== "undefined" && !!(navigator as any).bluetooth);
  }, []);

  const save = () => {
    savePrinterCfg(cfg);
    setMsg("Printer settings saved on this device");
    setTimeout(() => setMsg(""), 2500);
  };

  const testPrint = async () => {
    printOrderReceipt({
      orderNo: 0,
      items: [{ name: "Test item", qty: 1, price: 0 }],
      total: 0,
    });
    setMsg("Print dialog opened — pick your printer");
  };

  return (
    <>
      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Setup (this device)</h2>
        <p className="text-xs text-slate-500">
          Recommended: install printer drivers on the phone/PC, then use <b>System print</b>. That works for Bluetooth and Wi‑Fi printers and fails least often.
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
            <option value="system">System print (USB / Bluetooth / Wi‑Fi driver) — recommended</option>
            <option value="network">Network IP (ESC/POS port 9100)</option>
            <option value="bluetooth">Web Bluetooth (Chrome Android)</option>
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

        <div className="flex gap-2 flex-wrap">
          <button type="button" className={btn} onClick={save}>
            Save settings
          </button>
          <button type="button" className={btn2} onClick={testPrint}>
            Test print
          </button>
        </div>
        {msg && <p className="text-sm text-orange-700">{msg}</p>}
        {!btSupported && cfg.connection === "bluetooth" && (
          <p className="text-xs text-amber-600">This browser has no Web Bluetooth. Prefer System print.</p>
        )}
      </div>

      <div className={`${card} text-xs text-slate-600 space-y-1`}>
        <p className="font-semibold text-slate-800">How to not fail</p>
        <p>1. Pair the thermal printer in phone/PC Bluetooth or Wi‑Fi settings.</p>
        <p>2. Choose <b>System print</b> here and save.</p>
        <p>3. On Okay, the order receipt opens the system print dialog — pick your printer.</p>
        <p>4. Network IP is optional later if you add a local print bridge.</p>
      </div>
    </>
  );
}

