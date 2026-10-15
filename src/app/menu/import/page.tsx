"use client";

import { useState } from "react";
import Link from "next/link";
import PageShell, { card, btn, btn2, input } from "@/components/PageShell";
import { loadProducts, saveProducts, makeProductId, makeKeywords, Product } from "@/lib/products";

interface Row { nameEn: string; nameGu: string; price: number; use: boolean; check?: string }

export default function ImportMenuPage() {
  return (
    <PageShell title="Import menu from photo" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ *
 *  1. Photo → clean black & white canvas (OCR reads this much better)
 * ------------------------------------------------------------------ */
function prepare(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(2.5, 2200 / Math.max(img.width, img.height));       // upscale small photos
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      let lo = 255, hi = 0;
      const g = new Uint8Array(c.width * c.height);
      for (let i = 0; i < g.length; i++) {
        const v = 0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2];
        g[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      const span = Math.max(1, hi - lo);                                      // stretch contrast to full range
      for (let i = 0; i < g.length; i++) {
        const v = Math.max(0, Math.min(255, ((g[i] - lo) / span) * 255));
        d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
      }
      ctx.putImageData(d, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error("Could not open this image"));
    img.src = URL.createObjectURL(file);
  });
}

/* ------------------------------------------------------------------ *
 *  2. OCR text → menu rows   (no AI, plain rules)
 *     A menu line looks like:  "Veg Grilled Sandwich  વેજ ગ્રીલ ....... 60"
 *     • price  = last number on the line
 *     • Gujarati letters → Gujarati name, Latin letters → English name
 * ------------------------------------------------------------------ */
const GU_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
const GU = /[\u0A80-\u0AFF]/;

function parseMenuText(raw: string): Row[] {
  const rows: Row[] = [];
  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/[૦-૯]/g, (c) => String(GU_DIGITS.indexOf(c)));      // Gujarati digits → 0-9
    line = line.replace(/[|_~=•·]+/g, " ").replace(/\.{2,}|-{2,}|…/g, " ").trim();
    if (line.length < 4) continue;

    // numbers like 60, 60/-, ₹60, Rs.60, 1,200
    const nums = [...line.matchAll(/(?:₹|rs\.?|inr)?\s*(?<![\d,])(\d{1,3}(?:,\d{3})+|\d{1,4})(?![\d,])(?:\s*\/-)?/gi)];
    if (!nums.length) continue;
    const last = nums[nums.length - 1];
    const price = Number(last[1].replace(/,/g, ""));
    if (!price) continue;

    const text = line.replace(/(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\s*\/-)?/gi, " ");   // remove all numbers
    const gu = (text.match(/[\u0A80-\u0AFF]+(?:\s+[\u0A80-\u0AFF]+)*/g) || []).join(" ").trim();
    const en = text.replace(/[\u0A80-\u0AFF]+/g, " ").replace(/[^A-Za-z&()' -]/g, " ").replace(/\s+/g, " ").replace(/^[-\s]+|[-\s]+$/g, "").trim();
    if (!en && !gu) continue;
    if (en && en.length < 2 && !gu) continue;

    const title = en.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
    rows.push({
      nameEn: title,
      nameGu: gu,
      price,
      use: !!title && nums.length === 1,
      check: !title ? "English name missing – type it" : nums.length > 1 ? "several prices on this line – check" : undefined,
    });
  }
  return rows;
}

function Body() {
  const [preview, setPreview] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [rawText, setRawText] = useState("");
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"replace" | "add">("replace");

  const existing = typeof window === "undefined" ? [] : loadProducts();
  const find = (nameEn: string) => {
    const id = makeProductId(nameEn);
    return existing.find((p) => p.id === id || p.nameEn.toLowerCase() === nameEn.trim().toLowerCase());
  };

  const pick = async (file?: File) => {
    if (!file) return;
    setMsg(""); setRows([]); setRawText(""); setBusy(true); setProgress("Preparing photo…");
    try {
      const canvas = await prepare(file);
      setPreview(canvas.toDataURL("image/jpeg", 0.6));

      // loaded only when needed (≈ 2 MB language data downloads once, then it's cached)
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["eng", "guj"], 1, {
        logger: (m: { status: string; progress: number }) =>
          setProgress(`${m.status.replace(/_/g, " ")} ${m.progress ? Math.round(m.progress * 100) + "%" : ""}`),
      });
      const { data } = await worker.recognize(canvas);
      await worker.terminate();

      setRawText(data.text);
      const found = parseMenuText(data.text);
      if (!found.length) throw new Error("No lines with item + price found. Try a straighter, brighter photo of one menu column.");
      setRows(found);
    } catch (e) {
      setMsg("❌ " + (e as Error).message);
    }
    setProgress(""); setBusy(false);
  };

  const edit = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = () => {
    const picked = rows.filter((x) => x.use && x.nameEn.trim());
    const toProduct = (r: Row): Product => {
      const nameEn = r.nameEn.trim();
      const nameGu = r.nameGu.trim() || nameEn;
      return { id: makeProductId(nameEn), nameEn, nameGu, keywords: makeKeywords(nameEn, nameGu), price: r.price };
    };

    if (mode === "replace") {
      if (!confirm(`This DELETES all ${loadProducts().length} old menu items and saves these ${picked.length} new ones. Continue?`)) return;
      const seen = new Set<string>();
      const fresh = picked.map(toProduct).filter((p) => !seen.has(p.id) && seen.add(p.id));
      saveProducts(fresh);
      setMsg(`✅ Old menu removed. ${fresh.length} new items saved.`);
    } else {
      const list: Product[] = [...loadProducts()];
      let added = 0, updated = 0;
      for (const r of picked) {
        const p = toProduct(r);
        const hit = list.findIndex((x) => x.id === p.id || x.nameEn.toLowerCase() === p.nameEn.toLowerCase());
        if (hit >= 0) { if (list[hit].price !== p.price) { list[hit] = { ...list[hit], price: p.price }; updated++; } }
        else { list.push(p); added++; }
      }
      saveProducts(list);
      setMsg(`✅ ${added} item(s) added, ${updated} price(s) updated.`);
    }
    setRows([]); setPreview("");
  };

  const chosen = rows.filter((r) => r.use && r.nameEn.trim()).length;

  return (
    <>
      <div className={`${card} space-y-3`}>
        <p className="text-sm text-slate-300">
          Photograph your menu (straight-on, good light, one column at a time works best). Items and prices are read on your phone — free, no sign-up, nothing is uploaded.
        </p>
        <label className={btn + " inline-block cursor-pointer"}>
          📷 {busy ? "Reading…" : "Take / choose photo"}
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {progress && <p className="text-xs text-slate-400 capitalize">{progress} <span className="normal-case">(first time downloads language data, please wait)</span></p>}
        {preview && <img src={preview} alt="menu" className="max-h-48 rounded-lg border border-slate-700" />}
        {msg && <p className="text-sm">{msg} {msg.startsWith("✅") && <Link href="/menu" className="underline text-emerald-400 ml-1">Open menu</Link>}</p>}
      </div>

      {rows.length > 0 && (
        <div className={card}>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="font-semibold text-sm flex-1">{rows.length} lines found — check &amp; fix before adding</h2>
            <div className="flex gap-3 text-xs text-slate-200">
              <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace whole menu (delete old)</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "add"} onChange={() => setMode("add")} /> Add to existing</label>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">Photo reading makes mistakes, especially with Gujarati. Untick junk lines and correct names/prices. If the Gujarati name is empty, the English name is used.</p>
          {rows.map((r, i) => {
            const ex = r.nameEn ? find(r.nameEn) : undefined;
            return (
              <div key={i} className="py-1.5 border-b border-slate-800">
                <div className="grid grid-cols-[auto_1fr_1fr_5rem_auto] gap-2 items-center">
                  <input type="checkbox" checked={r.use} onChange={(e) => edit(i, { use: e.target.checked })} />
                  <input className={input} placeholder="English name" value={r.nameEn} onChange={(e) => edit(i, { nameEn: e.target.value })} />
                  <input className={input} placeholder="ગુજરાતી નામ" value={r.nameGu} onChange={(e) => edit(i, { nameGu: e.target.value })} />
                  <input className={input} type="number" min="0" value={r.price} onChange={(e) => edit(i, { price: Number(e.target.value) })} />
                  <span className={`text-[10px] w-14 ${ex ? "text-amber-400" : "text-emerald-400"}`}>{!r.nameEn ? "" : ex ? (ex.price === r.price ? "same" : `was ₹${ex.price}`) : "new"}</span>
                </div>
                {r.check && <p className="text-[11px] text-amber-400 pl-6">{r.check}</p>}
              </div>
            );
          })}
          <div className="flex gap-2 mt-3">
            <button className={btn} onClick={save} disabled={!chosen}>{mode === "replace" ? `Delete old & save ${chosen} items` : `Add ${chosen} to menu`}</button>
            <button className={btn2} onClick={() => { setRows([]); setPreview(""); }}>Cancel</button>
          </div>
          <details className="mt-3"><summary className="text-xs text-slate-500 cursor-pointer">Show raw text the photo reader saw</summary>
            <pre className="text-[11px] text-slate-400 whitespace-pre-wrap mt-1">{rawText}</pre></details>
        </div>
      )}
    </>
  );
}
