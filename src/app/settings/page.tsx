"use client";

import { useEffect, useState } from "react";
import PageShell, { card, input, btn } from "@/components/PageShell";
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
  const [theme, setTheme] = useState<ThemeId>("sunset_orange");
  const [notify, setNotify] = useState(true);
  const [rent, setRent] = useState("25000");
  const [elec, setElec] = useState("5000");
  const [lowStock, setLowStock] = useState("2");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTheme(getThemeId());
    (async () => {
      const { data } = await supabase.from("shop_settings").select("*").maybeSingle();
      if (data) {
        if (data.theme) {
          setTheme(data.theme as ThemeId);
          applyTheme(data.theme as ThemeId);
        }
        setNotify(data.notify_new_order !== false);
        setRent(String(data.rent_monthly ?? 25000));
        setElec(String(data.electricity_monthly ?? 5000));
        setLowStock(String(data.low_stock_threshold ?? 2));
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
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      applyTheme(theme);
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

      <button type="button" className={btn + " w-full"} disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save configuration"}
      </button>
      {msg && <p className="text-sm text-center text-slate-600">{msg}</p>}

      <div className={`${card} text-sm space-y-2`}>
        <Link href="/customers" className="block text-orange-600 font-medium">
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
