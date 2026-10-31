"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase, fetchBusinessDay, inr } from "@/lib/supabase";

type Plat = { id: string; name: string; commission_pct: number };
type Row = {
  id: string;
  platform_name: string;
  external_order_no: string | null;
  amount: number;
  commission_pct: number;
  order_date: string;
  created_at: string;
};

export default function OnlineOrdersPage() {
  return (
    <PageShell title="Online Order" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [plats, setPlats] = useState<Plat[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [todayRows, setTodayRows] = useState<Row[]>([]);

  const loadPlats = useCallback(async () => {
    const { data } = await supabase
      .from("shop_delivery_platforms")
      .select("id,name,commission_pct")
      .eq("active", true)
      .order("sort_order");
    const list = (data as Plat[]) || [];
    setPlats(list);
    if (list[0] && !platformId) setPlatformId(list[0].id);
  }, [platformId]);

  const loadToday = useCallback(async () => {
    const d = day || (await fetchBusinessDay());
    if (!day) setDay(d);
    const { data } = await supabase.rpc("report_online_details", {
      p_from: d,
      p_to: d,
    });
    setTodayRows((data as any[]) || []);
  }, [day]);

  useEffect(() => {
    loadPlats();
    fetchBusinessDay().then((d) => {
      setDay(d);
    });
  }, []);

  useEffect(() => {
    if (day) loadToday();
  }, [day, loadToday]);

  const selected = plats.find((p) => p.id === platformId);
  const gross = Number(amount) || 0;
  const pct = selected?.commission_pct ?? 28;
  const net = Math.round(gross * (1 - pct / 100) * 100) / 100;

  const save = async () => {
    if (!platformId) {
      setMsg("Select platform");
      return;
    }
    if (!(gross > 0)) {
      setMsg("Enter amount");
      return;
    }
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase.rpc("add_online_order", {
      p_platform_id: platformId,
      p_amount: gross,
      p_external_no: orderNo.trim() || null,
      p_day: day || null,
      p_notes: null,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg(
        `Saved · Gross ${inr(gross)} − ${pct}% = Net ${inr(Number(data?.net_after_commission ?? net))}`
      );
      setOrderNo("");
      setAmount("");
      loadToday();
    }
  };

  return (
    <>
      <p className="text-sm text-slate-600">
        Log Zomato / Swiggy (or any platform from Configuration). Commission % is taken from
        settings (default 28%). Net = amount after commission.
      </p>

      <div className={`${card} space-y-3`}>
        <div>
          <label className="text-xs text-slate-500">Platform</label>
          <select
            className={input}
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
          >
            {plats.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.commission_pct}%)
              </option>
            ))}
          </select>
          {plats.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No platforms — add under Configuration → Delivery platforms (run SQL migration first).
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-500">Portal order no (optional)</label>
          <input
            className={input}
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            placeholder="e.g. 1234567890"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Amount (gross on app) ₹</label>
          <input
            className={input}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Business day</label>
          <input
            type="date"
            className={input}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        {gross > 0 && (
          <p className="text-sm text-slate-700">
            Commission <b>{pct}%</b> → Net after commission{" "}
            <b className="pos-text">{inr(net)}</b>
          </p>
        )}
        <button type="button" className={btn} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save online order"}
        </button>
        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </div>

      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Today on this business day</h2>
        {todayRows.length === 0 && (
          <p className="text-xs text-slate-400">No online orders yet</p>
        )}
        {todayRows.map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-2 text-sm border-b border-[var(--pos-soft)] py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {r.platform_name}
                {r.external_order_no ? ` · #${r.external_order_no}` : ""}
              </div>
              <div className="text-xs text-slate-500">
                Gross {inr(Number(r.amount))} · {r.commission_pct}% off · Net{" "}
                {inr(Math.round(Number(r.amount) * (1 - Number(r.commission_pct) / 100) * 100) / 100)}
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-red-500 shrink-0"
              onClick={async () => {
                if (!confirm("Delete this entry?")) return;
                await supabase.rpc("delete_online_order", { p_id: r.id });
                loadToday();
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
