"use client";

import { useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase } from "@/lib/supabase";
import { THEMES, ThemeId, applyTheme, getThemeId } from "@/lib/theme";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <PageShell title="Configuration" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [theme, setTheme] = useState<ThemeId>("ink_snow");
  const [notify, setNotify] = useState(true);
  const [rent, setRent] = useState("25000");
  const [elec, setElec] = useState("5000");
  const [lowStock, setLowStock] = useState("2");
  const [gstin, setGstin] = useState("");
  const [shopState, setShopState] = useState("Gujarat");
  const [gstRate, setGstRate] = useState("5");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [dayStart, setDayStart] = useState("14:00");
  const [dayEnd, setDayEnd] = useState("09:00");
  const [bizDay, setBizDay] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [platforms, setPlatforms] = useState<{ id: string; name: string; commission_pct: number }[]>([]);
  const [newPlat, setNewPlat] = useState("");
  const [newPct, setNewPct] = useState("28");
  const [paymentQr, setPaymentQr] = useState("");

  useEffect(() => {
    setTheme(getThemeId());
    (async () => {
      const { data } = await supabase.from("shop_settings").select("*").maybeSingle();
      if (data) {
        if (data.theme) {
          {
            const tid = (["ink_snow","charcoal_brass","night_snow"].includes(data.theme)
              ? data.theme
              : "ink_snow") as ThemeId;
            setTheme(tid);
            applyTheme(tid);
          }
        }
        setNotify(data.notify_new_order !== false);
        setRent(String(data.rent_monthly ?? 25000));
        setElec(String(data.electricity_monthly ?? 5000));
        setLowStock(String(data.low_stock_threshold ?? 2));
        setGstin(data.gstin || "");
        setShopState(data.shop_state || "Gujarat");
        setGstRate(String(data.gst_rate ?? 5));
        setInvoicePrefix(data.invoice_prefix || "INV");
        if (data.payment_qr) setPaymentQr(data.payment_qr);
        if (data.day_start_time) setDayStart(String(data.day_start_time).slice(0, 5));
        if (data.day_end_time) setDayEnd(String(data.day_end_time).slice(0, 5));
      }
      const { data: plats } = await supabase
        .from("shop_delivery_platforms")
        .select("id,name,commission_pct")
        .order("sort_order");
      setPlatforms((plats as any) || []);
      const { data: tim } = await supabase.rpc("get_shop_timings");
      if (tim) {
        if (tim.day_start_time) setDayStart(String(tim.day_start_time).slice(0, 5));
        if (tim.day_end_time) setDayEnd(String(tim.day_end_time).slice(0, 5));
        if (tim.business_day) setBizDay(String(tim.business_day).slice(0, 10));
      }
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    const { data: access } = await supabase.rpc("my_access");
    const shopId = (access as any)?.shop_id;
    // shop_id from settings - use upsert via shop from profile
    const { data: me } = await supabase.from("profiles").select("shop_id").maybeSingle();
    const sid = me?.shop_id;
    if (!sid) {
      setMsg("No shop linked");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("shop_settings").upsert({
      shop_id: sid,
      theme,
      notify_new_order: notify,
      rent_monthly: Number(rent) || 0,
      electricity_monthly: Number(elec) || 0,
      low_stock_threshold: Number(lowStock) || 2,
      gstin: gstin.trim() || null,
      shop_state: shopState.trim() || "Gujarat",
      gst_rate: Number(gstRate) || 5,
      invoice_prefix: invoicePrefix.trim() || "INV",
      payment_qr: paymentQr || null,
      day_start_time: dayStart.length === 5 ? dayStart + ":00" : dayStart,
      day_end_time: dayEnd.length === 5 ? dayEnd + ":00" : dayEnd,
      updated_at: new Date().toISOString(),
    });
    // Also via RPC so function cache is consistent
    await supabase.rpc("set_shop_timings", {
      p_start: dayStart.length === 5 ? dayStart + ":00" : dayStart,
      p_end: dayEnd.length === 5 ? dayEnd + ":00" : dayEnd,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      applyTheme(theme);
      try {
        localStorage.setItem(
          "pos-gst-cfg",
          JSON.stringify({
            gstin: gstin.trim(),
            shopState: shopState.trim() || "Gujarat",
            rate: Number(gstRate) || 0,
            invoicePrefix: invoicePrefix.trim() || "INV",
          })
        );
      } catch {}
      setMsg("Saved");
      // Request browser notification permission if notify on
      if (notify && typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  };

  return (
    <>
      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Theme</h2>
        <select
          className={input}
          value={theme}
          onChange={(e) => {
            const id = e.target.value as ThemeId;
            setTheme(id);
            applyTheme(id);
          }}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2 flex-wrap">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTheme(t.id);
                applyTheme(t.id);
              }}
              className="w-10 h-10 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: t.primary }}
              title={t.name}
            />
          ))}
        </div>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Order notifications</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify on this device when a new order is saved
        </label>
        <p className="text-xs text-slate-500">
          Uses browser / PWA notifications on phones where you installed the app. Telegram still
          receives orders if configured. Allow notifications when the browser asks.
        </p>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Default monthly expenses</h2>
        <p className="text-xs text-slate-500">
          Rent and electricity are split by days in the month and auto-added once per day (old days
          stay unchanged).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500">Rent / month ₹</label>
            <input className={input} type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Electricity / month ₹</label>
            <input className={input} type="number" min="0" value={elec} onChange={(e) => setElec(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Example: Rent 25000 ÷ 30 ≈ ₹833/day · Electricity 5000 ÷ 30 ≈ ₹167/day
        </p>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Low stock alert</h2>
        <div>
          <label className="text-xs text-slate-500">Alert when remaining ≤</label>
          <input className={input} type="number" min="0" step="0.1" value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">Checked on Stock page and can notify via Telegram when you open Stock.</p>
      </div>

      
      
      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Payment scanner (UPI QR)</h2>
        <p className="text-xs text-slate-500">
          Upload your UPI / bank QR image. After each order, staff/customer see amount + this
          scanner on the Pay Now page.
        </p>
        {paymentQr ? (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={paymentQr} alt="Payment QR" className="w-40 h-40 object-contain border border-slate-200 rounded-xl bg-white p-2" />
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => setPaymentQr("")}
            >
              Remove QR
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">No QR uploaded yet</p>
        )}
        <div>
          <label className="text-xs text-slate-500">Upload QR image</label>
          <input
            type="file"
            accept="image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-semibold"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 900_000) {
                setMsg("Image too large — use under 900 KB");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const result = String(reader.result || "");
                setPaymentQr(result);
                setMsg("QR loaded — click Save configuration");
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Delivery platforms (commission %)</h2>
        <p className="text-xs text-slate-500">
          Default <b>28%</b>. Add unlimited platforms (Zomato, Swiggy, or any new app). Used for Online
          Orders and Reports net profit.
        </p>
        <ul className="space-y-2">
          {platforms.map((p) => (
            <li key={p.id} className="flex gap-2 items-center text-sm">
              <span className="flex-1 font-medium">{p.name}</span>
              <input
                className={input + " !w-20"}
                type="number"
                min="0"
                max="100"
                step="0.1"
                defaultValue={p.commission_pct}
                onBlur={async (e) => {
                  const v = Number(e.target.value);
                  if (isNaN(v)) return;
                  await supabase
                    .from("shop_delivery_platforms")
                    .update({ commission_pct: v })
                    .eq("id", p.id);
                }}
              />
              <span className="text-xs text-slate-500">%</span>
              <button
                type="button"
                className="text-xs text-red-500"
                onClick={async () => {
                  if (!confirm("Remove " + p.name + "?")) return;
                  await supabase.from("shop_delivery_platforms").delete().eq("id", p.id);
                  setPlatforms((prev) => prev.filter((x) => x.id !== p.id));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-slate-500">New platform</label>
            <input className={input} value={newPlat} onChange={(e) => setNewPlat(e.target.value)} placeholder="Name" />
          </div>
          <div className="w-24">
            <label className="text-xs text-slate-500">Comm %</label>
            <input className={input} value={newPct} onChange={(e) => setNewPct(e.target.value)} />
          </div>
          <button
            type="button"
            className={btn2}
            onClick={async () => {
              const name = newPlat.trim();
              if (!name) return;
              const { data: me } = await supabase.from("profiles").select("shop_id").maybeSingle();
              if (!me?.shop_id) return;
              const { data, error } = await supabase
                .from("shop_delivery_platforms")
                .insert({
                  shop_id: me.shop_id,
                  name,
                  commission_pct: Number(newPct) || 28,
                  sort_order: platforms.length + 1,
                })
                .select("id,name,commission_pct")
                .single();
              if (error) setMsg(error.message);
              else if (data) {
                setPlatforms((prev) => [...prev, data as any]);
                setNewPlat("");
                setNewPct("28");
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Shop timings (business day)</h2>
        <p className="text-xs text-slate-500">
          Stored in database for this shop. Orders, profit, stock and reports use this day —
          not midnight and not this device clock alone.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500">Day starts (IST)</label>
            <input
              type="time"
              className={input}
              value={dayStart}
              onChange={(e) => setDayStart(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Typical close (IST)</label>
            <input
              type="time"
              className={input}
              value={dayEnd}
              onChange={(e) => setDayEnd(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-600">
          Example: start <b>14:00</b>, close <b>09:00</b> → sales after 2 PM until next day 2 PM
          count as one business day.
          {bizDay ? (
            <>
              {" "}
              Current business day: <b>{bizDay}</b>
            </>
          ) : null}
        </p>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">GST / Tax invoice</h2>
        <p className="text-xs text-slate-500">
          Same state (Gujarat): CGST + SGST. Other state: IGST. Prices treated as GST-inclusive.
        </p>
        <div>
          <label className="text-xs text-slate-500">GSTIN</label>
          <input className={input} value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="24XXXXXXXXXX1Z5" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500">Shop state</label>
            <input className={input} value={shopState} onChange={(e) => setShopState(e.target.value)} placeholder="Gujarat" />
          </div>
          <div>
            <label className="text-xs text-slate-500">GST rate %</label>
            <select className={input} value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
              <option value="0">0% (no GST line)</option>
              <option value="5">5% (typical food)</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Invoice prefix</label>
          <input className={input} value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} placeholder="INV" />
        </div>
      </div>

      <button type="button" className={btn + " w-full"} disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save configuration"}
      </button>
      {msg && <p className="text-sm text-center text-slate-600">{msg}</p>}

      <div className={`${card} text-sm space-y-2`}>
        <Link href="/customers" className="block pos-text font-medium">
          → Customer report
        </Link>
        <p className="text-xs text-slate-500">
          iPhone install: open in <b>Safari</b> → Share → <b>Add to Home Screen</b>. Chrome on
          iPhone cannot show Install the same way.
        </p>
      </div>
    </>
  );
}
