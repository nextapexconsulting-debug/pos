"use client";


import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2, Table } from "@/components/PageShell";
import { supabase, todayIST, addDays, inr } from "@/lib/supabase";
import { useT } from "@/lib/i18n";
import { EXPENSE_PRESETS, normalizeExpenseCategory, expenseCategoryLabel } from "@/lib/expenseCategory";

const PRESETS = EXPENSE_PRESETS;

interface Exp {
  id: string;
  expense_date: string;
  category: string;
  note: string | null;
  amount: number;
  source: string;
}

export default function ExpensesPage() {
  const { t } = useT();
  return (
    <PageShell title={t("expenses")} roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const { t } = useT();
  const [from, setFrom] = useState(todayIST().slice(0, 8) + "01");
  const [to, setTo] = useState(todayIST());
  const [rows, setRows] = useState<Exp[]>([]);
  const [cat, setCat] = useState("");
  const [note, setNote] = useState("");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(todayIST());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("id,expense_date,category,note,amount,source")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false });
    if (error) setMsg(error.message);
    else {
      setMsg("");
      setRows((data as Exp[]) ?? []);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Auto rent + electricity daily share (idempotent)
    supabase.rpc("apply_default_daily_expenses", {}).then(() => load());
  }, []);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byCat = Object.entries(
    rows.reduce((m: Record<string, number>, r) => {
      const k = normalizeExpenseCategory(r.category);
      m[k] = (m[k] || 0) + Number(r.amount);
      return m;
    }, {})
  ).map(([category, amount]) => ({ category: expenseCategoryLabel(category, t), amount }));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amt);
    if (!cat.trim() || !(amount > 0)) return;
    setBusy(true);
    const { error } = await supabase.from("expenses").insert({
      expense_date: date,
      category: normalizeExpenseCategory(cat),
      note: note.trim() || null,
      amount,
      spread_days: 1,
      source: "manual",
    });
    setBusy(false);
    if (error) return alert(error.message);
    setCat("");
    setNote("");
    setAmt("");
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  };

  return (
    <>
      <div className={`${card} grid grid-cols-2 gap-3 text-center`}>
        <div>
          <div className="text-2xl font-bold text-red-500">{inr(total)}</div>
          <div className="text-xs text-slate-500">{t("total_cost_period")}</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-800">{rows.length}</div>
          <div className="text-xs text-slate-500">{t("entries")}</div>
        </div>
      </div>

      <form onSubmit={add} className={`${card} space-y-3`}>
        <h2 className="font-semibold text-sm">{t("add_expense_shop")}</h2>
        <p className="text-xs text-slate-500">
          {t("expense_hint")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input type="date" className={input} value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
          <input className={input} list="exp-cats" placeholder={t("category")} value={cat} onChange={(e) => setCat(e.target.value)} required />
          <datalist id="exp-cats">
            {PRESETS.map((p) => (
              <option key={p} value={t(p)} />
            ))}
          </datalist>
          <input className={input} type="number" min="0" step="1" placeholder={t("amount_rs")} value={amt} onChange={(e) => setAmt(e.target.value)} required />
          <input className={input} placeholder={t("note_optional")} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button type="button" key={p} onClick={() => setCat(t(p))} className={btn2 + " !text-xs !py-1"}>
              {t(p)}
            </button>
          ))}
        </div>
        <button className={btn} disabled={busy}>
          {busy ? t("loading") : t("add_expense")}
        </button>
      </form>

      <div className={`${card} space-y-2`}>
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" className={input + " !w-auto"} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">→</span>
          <input type="date" className={input + " !w-auto"} value={to} max={todayIST()} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className={btn2} onClick={() => { setFrom(todayIST().slice(0, 8) + "01"); setTo(todayIST()); }}>
            This month
          </button>
        </div>
        {msg && <p className="text-red-500 text-sm">{msg}</p>}
      </div>

      {byCat.length > 0 && (
        <div className={card}>
          <h2 className="font-semibold text-sm mb-2">{t("category")}</h2>
          <Table cols={[{ key: "category", label: t("category") }, { key: "amount", label: t("total"), money: true }]} rows={byCat} totals />
        </div>
      )}

      <div className={card}>
        <h2 className="font-semibold text-sm mb-2">All entries</h2>
        {rows.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">No expenses in this period</p>
        ) : (
          <ul className="divide-y divide-orange-50">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{expenseCategoryLabel(r.category, t)}</div>
                  <div className="text-xs text-slate-500">
                    {r.expense_date}
                    {r.note ? ` · ${r.note}` : ""}
                    {r.source === "stock_in" ? " · from stock purchase" : ""}
                  </div>
                </div>
                <div className="font-bold text-red-500">{inr(r.amount)}</div>
                {r.source === "manual" && (
                  <button type="button" className="text-xs text-red-500" onClick={() => del(r.id)}>
                    Del
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
