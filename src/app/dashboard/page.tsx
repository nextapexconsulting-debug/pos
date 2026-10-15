"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, Table } from "@/components/PageShell";
import { supabase, todayIST, addDays, inr } from "@/lib/supabase";

interface Day { day: string; orders: number; items: number; sales: number; cash: number; upi: number; unpaid: number; expenses: number; profit: number }
interface Exp { id: string; category: string; note: string | null; amount: number; source: string; spread_days: number }

const PRESETS = ["Vegetables", "Tea", "Salary", "Gas", "Electricity", "Rent", "Misc"];

export default function Dashboard() {
  return (
    <PageShell title="Today · Income, Expense, Profit" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [date, setDate] = useState(todayIST());
  const [d, setD] = useState<Day | null>(null);
  const [week, setWeek] = useState<Day[]>([]);
  const [exps, setExps] = useState<Exp[]>([]);
  const [cats, setCats] = useState<string[]>(PRESETS);
  const [cat, setCat] = useState("");
  const [note, setNote] = useState("");
  const [amt, setAmt] = useState("");
  const [spread, setSpread] = useState("1");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: r }, { data: w }, { data: e }, { data: c }] = await Promise.all([
      supabase.rpc("report_daily", { p_from: date, p_to: date }),
      supabase.rpc("report_daily", { p_from: addDays(date, -6), p_to: date }),
      supabase.from("expenses").select("id,category,note,amount,source,spread_days").eq("expense_date", date).order("created_at", { ascending: false }),
      supabase.rpc("report_expenses", { p_from: addDays(todayIST(), -180), p_to: todayIST() }),
    ]);
    setD(((r as Day[]) ?? [])[0] ?? null);
    setWeek(((w as Day[]) ?? []).slice().reverse());
    setExps((e as Exp[]) ?? []);
    const used = ((c as { category: string }[]) ?? []).map((x) => x.category).filter((x) => !x.startsWith("Stock:"));
    setCats(Array.from(new Set([...PRESETS, ...used])));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amt);
    if (!cat.trim() || !(amount > 0)) return;
    setBusy(true);
    const { error } = await supabase.from("expenses").insert({ expense_date: date, category: cat.trim(), note: note.trim() || null, amount, spread_days: Math.max(1, parseInt(spread) || 1) });
    setBusy(false);
    if (error) return alert(error.message);
    setCat(""); setNote(""); setAmt(""); setSpread("1"); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) alert(error.message); else load();
  };

  const changeSpread = async (x: Exp) => {
    const v = prompt(`Spread "${x.category}" ₹${x.amount} over how many days? (1 = all on this day)`, String(x.spread_days));
    if (v === null) return;
    const n = Math.max(1, Math.min(366, parseInt(v) || 1));
    const { error } = await supabase.from("expenses").update({ spread_days: n }).eq("id", x.id);
    if (error) alert(error.message); else load();
  };

  const sales = d?.sales ?? 0;
  const paidOut = exps.reduce((s, x) => s + Number(x.amount), 0);   // cash paid today
  const expense = d?.expenses ?? 0;                                   // today's share (after spreading)
  const profit = sales - expense;
  const collected = (d?.cash ?? 0) + (d?.upi ?? 0);

  return (
    <>
      <input type="date" className={input + " !w-auto"} value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />

      <div className={`${card} space-y-2`}>
        <Row label={`Income (${d?.orders ?? 0} orders · ${d?.items ?? 0} items)`} v={sales} c="text-emerald-400" />
        <div className="text-xs text-slate-400 grid grid-cols-3 gap-2 text-center pb-2 border-b border-slate-700">
          <span>💵 Cash<br /><b className="text-slate-200">{inr(d?.cash)}</b></span>
          <span>📱 UPI<br /><b className="text-slate-200">{inr(d?.upi)}</b></span>
          <span>⏳ Unpaid<br /><b className="text-amber-300">{inr(d?.unpaid)}</b></span>
        </div>
        <Row label="− Expenses (today's share)" v={expense} c="text-red-400" />
        <div className="border-t border-slate-600 pt-2">
          <Row label="Profit today" v={profit} c={profit >= 0 ? "text-emerald-400" : "text-red-400"} big />
          <p className="text-[11px] text-slate-500 text-right">Cash view: collected − paid out today = {inr(collected - paidOut)}</p>
        </div>
      </div>

      <form onSubmit={add} className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Add expense</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input className={input} list="cats" placeholder="Category (type or pick)" value={cat} onChange={(e) => setCat(e.target.value)} required />
          <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          <input className={input + " col-span-2"} placeholder="Note – anything you like (e.g. tomato, onion 5kg)" value={note} onChange={(e) => setNote(e.target.value)} />
          <input className={input} type="number" inputMode="decimal" step="0.01" min="0" placeholder="Amount ₹" value={amt} onChange={(e) => setAmt(e.target.value)} required />
          <input className={input} type="number" min="1" max="366" placeholder="Spread over days" title="1 = count fully today. 30 = salary shared over a month" value={spread} onChange={(e) => setSpread(e.target.value)} />
        </div>
        <p className="text-[11px] text-slate-500">Spread over days: 1 = whole amount counts today · 5 = bread that lasts 5 days · 30 = monthly salary.</p>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button type="button" key={p} onClick={() => setCat(p)} className="text-xs bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-full">{p}</button>
          ))}
        </div>
        <button className={btn} disabled={busy}>{busy ? "Saving…" : "Add & deduct from income"}</button>
      </form>

      <div className={card}>
        <h2 className="font-semibold text-sm mb-2">Paid on {date}</h2>
        {exps.length === 0 && <p className="text-slate-500 text-sm">None yet</p>}
        {exps.map((x) => (
          <div key={x.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 text-sm">
            <span className="font-medium">{x.category}</span>
            <span className="text-xs text-slate-400 truncate flex-1">{x.note}</span>
            <button onClick={() => changeSpread(x)} className="text-[11px] text-slate-400 underline whitespace-nowrap" title="Change how many days this is spread over">
              {x.spread_days > 1 ? `${inr(x.amount / x.spread_days)}/day × ${x.spread_days}d` : "1 day"}
            </button>
            <span className="text-red-300 tabular-nums">{inr(x.amount)}</span>
            {x.source === "manual"
              ? <button onClick={() => del(x.id)} className="text-xs text-slate-500 hover:text-red-400">✕</button>
              : <span className="text-[10px] text-slate-500">stock</span>}
          </div>
        ))}
      </div>

      <div className={card}>
        <h2 className="font-semibold text-sm mb-1">Last 7 days</h2>
        <Table
          totals
          cols={[
            { key: "day", label: "Date" },
            { key: "sales", label: "Sales", money: true },
            { key: "expenses", label: "Expense", money: true },
            { key: "profit", label: "Profit", money: true },
          ]}
          rows={week}
        />
      </div>
    </>
  );
}

const Row = ({ label, v, c, big }: { label: string; v: number; c: string; big?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className={big ? "font-semibold" : "text-sm text-slate-300"}>{label}</span>
    <span className={`font-bold tabular-nums ${c} ${big ? "text-2xl" : "text-lg"}`}>{inr(v)}</span>
  </div>
);
