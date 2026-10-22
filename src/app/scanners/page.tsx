"use client";

import { useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { loadPrinterCfg, savePrinterCfg, type PrinterCfg } from "@/lib/printer";

type Cfg = PrinterCfg & { customerQrUrl?: string };

async function makeQrDataUrl(text: string, px = 280): Promise<string> {
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

export default function ScannersPage() {
  return (
    <PageShell title="QR scanners" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [preview, setPreview] = useState<{ label: string; url: string; dataUrl: string }[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const c = loadPrinterCfg() as Cfg;
    if (!c.instagramUrl && c.customerQrUrl) c.instagramUrl = c.customerQrUrl;
    setCfg(c);
  }, []);

  const buildLinks = (c: Cfg) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const igHandle = (c.instagramUrl || "")
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .split(/[/?#]/)[0]
      .trim();
    const waDigits = (c.whatsappNumber || "").replace(/[^0-9]/g, "");
    const waFull = waDigits.length === 10 ? "91" + waDigits : waDigits;
    const menu = (c.menuUrl || "").trim();

    const items: { label: string; url: string }[] = [];
    if (igHandle) items.push({ label: "Insta", url: `${origin}/go/ig?u=${encodeURIComponent(igHandle)}` });
    if (waFull.length >= 11) items.push({ label: "WhatsApp", url: `${origin}/go/wa?n=${encodeURIComponent(waFull)}` });
    if (menu) {
      const menuUrl = menu.startsWith("http") ? menu : menu.startsWith("/") ? `${origin}${menu}` : menu;
      items.push({ label: "Menu", url: menuUrl });
    }
    return items;
  };

  const refreshPreview = async () => {
    if (!cfg) return;
    const items = buildLinks(cfg);
    if (!items.length) {
      setPreview([]);
      setMsg("Add Instagram / WhatsApp / Menu in the fields below (same as Printer), then Save.");
      return;
    }
    const out = [];
    for (const it of items) {
      out.push({ ...it, dataUrl: await makeQrDataUrl(it.url, 280) });
    }
    setPreview(out);
    setMsg("");
  };

  useEffect(() => {
    if (cfg) refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.instagramUrl, cfg?.whatsappNumber, cfg?.menuUrl]);

  const save = () => {
    if (!cfg) return;
    savePrinterCfg(cfg);
    setMsg("Saved on this device");
    refreshPreview();
  };

  const printAll = async () => {
    if (!cfg) return;
    const items = buildLinks(cfg);
    if (!items.length) {
      setMsg("Nothing to print — fill Instagram, WhatsApp or Menu first.");
      return;
    }
    const cells: { label: string; dataUrl: string }[] = [];
    for (const it of items) {
      cells.push({ label: it.label, dataUrl: await makeQrDataUrl(it.url, 320) });
    }

    document.getElementById("pos-qr-sheet")?.remove();
    const root = document.createElement("div");
    root.id = "pos-qr-sheet";
    const shop = cfg.shopHeader || "Scan & connect";
    root.innerHTML = `
      <style>
        #pos-qr-sheet {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 80mm;
        }
        #pos-qr-sheet .sheet {
          font-family: system-ui, sans-serif;
          color: #000;
          width: 80mm;
          padding: 4mm;
        }
        #pos-qr-sheet .title {
          text-align: center;
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 2mm;
        }
        #pos-qr-sheet .grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 4mm;
        }
        #pos-qr-sheet .cell {
          text-align: center;
          page-break-inside: avoid;
        }
        #pos-qr-sheet .lab {
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 1mm;
        }
        #pos-qr-sheet img {
          width: 28mm;
          height: 28mm;
          image-rendering: pixelated;
        }
        @page { margin: 5mm; size: auto; }
        @media print {
          body > *:not(#pos-qr-sheet) { display: none !important; }
          #pos-qr-sheet {
            display: block !important;
            position: static !important;
            left: auto !important;
            width: 100% !important;
          }
          #pos-qr-sheet .sheet { width: auto; max-width: 100%; margin: 0 auto; }
        }
      </style>
      <div class="sheet">
        <div class="title">${shop.replace(/</g, "&lt;")}</div>
        <div class="grid">
          ${cells
            .map(
              (c) => `
            <div class="cell">
              <div class="lab">${c.label}</div>
              <img src="${c.dataUrl}" alt="${c.label}" />
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const cleanup = () => {
      document.getElementById("pos-qr-sheet")?.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setTimeout(cleanup, 60_000);
      });
    });
  };

  if (!cfg) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <>
      <p className="text-sm text-slate-600">
        Counter poster: print all available QR codes (Insta, WhatsApp, Menu) on one page. Same links as
        customer slip.
      </p>

      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Links (saved on this device)</h2>
        <div>
          <label className="text-xs text-slate-500">Instagram</label>
          <input
            className={input}
            value={cfg.instagramUrl || ""}
            onChange={(e) => setCfg({ ...cfg, instagramUrl: e.target.value })}
            placeholder="@yourshop"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">WhatsApp</label>
          <input
            className={input}
            value={cfg.whatsappNumber || ""}
            onChange={(e) => setCfg({ ...cfg, whatsappNumber: e.target.value })}
            placeholder="9876543210"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Menu URL</label>
          <input
            className={input}
            value={cfg.menuUrl || ""}
            onChange={(e) => setCfg({ ...cfg, menuUrl: e.target.value })}
            placeholder="https://drive.google.com/..."
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={btn2} onClick={save}>
            Save
          </button>
          <button type="button" className={btn} onClick={printAll}>
            Print all QR
          </button>
        </div>
        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </div>

      <div className={`${card}`}>
        <h2 className="font-semibold text-sm mb-3">Preview</h2>
        {preview.length === 0 ? (
          <p className="text-xs text-slate-400">No QR yet — fill at least one link above.</p>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center">
            {preview.map((p) => (
              <div key={p.label} className="text-center">
                <div className="text-xs font-bold mb-1">{p.label}</div>
                <img src={p.dataUrl} alt={p.label} className="w-32 h-32 mx-auto bg-white border border-slate-200" />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
