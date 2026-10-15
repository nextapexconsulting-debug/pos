"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell, { card, input, btn2, Table } from "@/components/PageShell";
import { supabase, todayIST, addDays, downloadCSV, fetchAll } from "@/lib/supabase";

type Col = { key: string; label: string; money?: boolean; num?: boolean };
type Rep = { id: string; label: string; hint: string; cols: Col[]; load: (f: string, t: string) => Promise<Record<string, any>[]>; totals?: boolean };

const rpc = async (fn: string, f: string, t: string) => {
  const { data, error } = await supabase.rpc(fn, { p_from: f, p_to: t });
  if (error) throw new Error(error.message);
  return (data as Record<string, any>[]) ?? [];
};

const REPORTS: Rep[] = [
  { id: "daily", label: "Daily profit & loss", totals: true,
    hint: "Sales − expenses for every day. Your main report.",
    cols: [{ key: "day", label: "Date" }, { key: "orders", label: "Orders", num: true }, { key: "items", label: "Items", num: true },
      { key: "sales", label: "Sales", money: true }, { key: "expenses", label: "Expenses", money: true }, { key: "profit", label: "Profit", money: true }],
    load: (f, t) => rpc("report_daily", f, t) },
  { id: "monthly", label: "Monthly summary", totals: true,
    hint: "Same as daily, rolled up by month.",
    cols: [{ key: "month", label: "Month" }, { key: "orders", label: "Orders", num: true }, { key: "items", label: "Items", num: true },
      { key: "sales", label: "Sales", money: true }, { key: "expenses", label: "Expenses", money: true }, { key: "profit", label: "Profit", money: true }],
    load: async (f, t) => {
      const days = await rpc("report_daily", f, t);
      const m = new Map<string, any>();
      for (const d of days) {
        const k = String(d.day).slice(0, 7);
        const r = m.get(k) ?? { month: k, orders: 0, items: 0, sales: 0, expenses: 0, profit: 0 };
        for (const c of ["orders", "items", "sales", "expenses", "profit"]) r[c] += Number(d[c]);
        m.set(k, r);
      }
      return [...m.values()];
    } },
  { id: "payments", label: "Cash vs UPI vs unpaid", totals: true,
    hint: "How each day's sales were collected. Unpaid = still to collect.",
    cols: [{ key: "day", label: "Date" }, { key: "cash", label: "Cash", money: true }, { key: "upi", label: "UPI", money: true },
      { key: "unpaid", label: "Unpaid", money: true }, { key: "sales", label: "Total", money: true }],
    load: (f, t) => rpc("report_daily", f, t) },
  { id: "unpaid", label: "Unpaid orders list", totals: true,
    hint: "Every order in the period that has not been marked paid.",
    cols: [{ key: "order_date", label: "Date" }, { key: "order_no", label: "Order #" }, { key: "total", label: "Amount", money: true }],
    load: async (f, t) => fetchAll((a, b) => supabase.from("orders").select("order_date,order_no,total")
      .eq("status", "active").eq("payment_status", "unpaid").gte("order_date", f).lte("order_date", t).order("order_date").range(a, b)) },
  { id: "items", label: "Item-wise sales", totals: true,
    hint: "Best sellers by revenue. (Only the last ~6 months have item detail.)",
    cols: [{ key: "item", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "orders", label: "Orders", num: true }, { key: "revenue", label: "Revenue", money: true }],
    load: (f, t) => rpc("report_items", f, t) },
  { id: "expenses", label: "Expenses by category", totals: true,
    hint: "Where the money goes: vegetables, tea, salary, stock purchases…",
    cols: [{ key: "category", label: "Category" }, { key: "entries", label: "Entries", num: true }, { key: "total", label: "Total", money: true }],
    load: (f, t) => rpc("report_expenses", f, t) },
  { id: "expense_lines", label: "Expense details (every entry)",
    hint: "All expense entries with your free-text notes.",
    cols: [{ key: "expense_date", label: "Date" }, { key: "category", label: "Category" }, { key: "note", label: "Note" }, { key: "amount", label: "Amount", money: true }],
    load: async (f, t) => fetchAll((a, b) => supabase.from("expenses").select("expense_date,category,note,amount")
      .gte("expense_date", f).lte("expense_date", t).order("expense_date").range(a, b)) },
  { id: "stock", label: "Stock movement", 
    hint: "Opening, new stock, closing and usage for bread, pizza, butter, cheese…",
    cols: [{ key: "day", label: "Date" }, { key: "item", label: "Item" }, { key: "opening", label: "Opening", num: true },
      { key: "stock_in", label: "+ New", num: true }, { key: "closing", label: "Closing", num: true }, { key: "used", label: "Used", num: true }],
    load: (f, t) => rpc("report_stock", f, t) },
  { id: "hourly", label: "Peak hours", totals: true,
    hint: "Which hours of the day bring the most orders.",
    cols: [{ key: "hour", label: "Hour (24h)" }, { key: "orders", label: "Orders", num: true }, { key: "sales", label: "Sales", money: true }],
    load: (f, t) => rpc("report_hourly", f, t) },
];

export default function ReportsPage() {
  return (
    <PageShell title="Reports" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [id, setId] = useState("daily");
  const [from, setFrom] = useState(todayIST().slice(0, 8) + "01");
  const [to, setTo] = useState(todayIST());
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rep = useMemo(() => REPORTS.find((r) => r.id === id)!, [id]);

  const run = useCallback(async () => {
    setBusy(true); setErr("");
    try { setRows(await rep.load(from, to)); } catch (e: any) { setErr(e.message); setRows([]); }
    setBusy(false);
  }, [rep, from, to]);
  useEffect(() => { run(); }, [run]);

  const t = todayIST();
  const firstOfMonth = (iso: string) => iso.slice(0, 8) + "01";
  const lastMonthStart = (() => { const d = new Date(firstOfMonth(t) + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const presets: [string, string, string][] = [
    ["Today", t, t], ["Yesterday", addDays(t, -1), addDays(t, -1)], ["Last 7 days", addDays(t, -6), t],
    ["This month", firstOfMonth(t), t], ["Last month", lastMonthStart, addDays(firstOfMonth(t), -1)], ["Last 6 months", addDays(t, -182), t],
  ];

  const archive = async () => {
    if (!confirm("Move all orders & expenses older than 6 months into the archive?\n\nDaily totals stay in your reports. Download CSVs first if you want the full detail.")) return;
    const { data, error } = await supabase.rpc("archive_old_data", { p_months: 6 });
    alert(error ? error.message : `Archived ${data.orders_archived} orders and ${data.expenses_archived} expenses older than ${data.before}.`);
  };

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setId(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${id === r.id ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"}`}>{r.label}</button>
        ))}
      </div>

      <div className={`${card} space-y-2`}>
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" className={input + " !w-auto"} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-500">→</span>
          <input type="date" className={input + " !w-auto"} value={to} min={from} max={t} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {presets.map(([l, f, e]) => <button key={l} className={btn2 + " !text-xs"} onClick={() => { setFrom(f); setTo(e); }}>{l}</button>)}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1"><h2 className="font-semibold">{rep.label}</h2><p className="text-xs text-slate-400">{rep.hint}</p></div>
          <button className={btn2} disabled={!rows.length} onClick={() => downloadCSV(`${rep.id}_${from}_${to}.csv`, rows.map((r) => Object.fromEntries(rep.cols.map((c) => [c.label, r[c.key]]))))}>⬇ CSV</button>
          <button className={btn2} onClick={() => window.print()}>🖨 Print</button>
        </div>
        {busy ? <p className="text-slate-500 text-sm py-6 text-center">Loading…</p> : err ? <p className="text-red-400 text-sm">{err}</p> : <Table cols={rep.cols} rows={rows} totals={rep.totals} />}
      </div>

      <div className={`${card} flex items-center gap-3`}>
        <p className="text-xs text-slate-400 flex-1">Keeping the app fast: after ~6 months you can move old detail to the archive. Daily totals stay in reports forever.</p>
        <button className={btn2} onClick={archive}>🗄 Archive &gt; 6 months</button>
      </div>
    </>
  );
}
