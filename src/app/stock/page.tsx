"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase, todayIST, inr } from "@/lib/supabase";

interface Sheet {
  item_id: string;
  name: string;
  unit: string;
  opening: number;
  stock_in: number;
  closing: number | null;
  used: number | null;
}
interface In {
  id: string;
  qty: number;
  total_cost: number;
  note: string | null;
  inventory_items: { name: string; unit: string } | null;
}

export default function StockPage() {
  return (
    <PageShell title="Stock" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [date, setDate] = useState(todayIST());
  const [sheet, setSheet] = useState<Sheet[]>([]);
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [ins, setIns] = useState<In[]>([]);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [{ data: s, error: e1 }, { data: i, error: e2 }] = await Promise.all([
      supabase.rpc("stock_sheet", { p_date: date }),
      supabase
        .from("stock_in")
        .select("id,qty,total_cost,note,inventory_items(name,unit)")
        .eq("entry_date", date)
        .order("created_at", { ascending: false }),
    ]);
    if (e1) setMsg(e1.message);
    else setMsg("");
    const rows = (s as Sheet[]) ?? [];
    setSheet(rows);
    // Prefer saved closing; else leave blank so user can enter today's count
    setClosing(
      Object.fromEntries(
        rows.map((r) => [r.item_id, r.closing === null || r.closing === undefined ? "" : String(r.closing)])
      )
    );
    setIns((i as unknown as In[]) ?? []);
    if (rows[0] && !item) setItem(rows[0].item_id);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const dayPurchaseCost = ins.reduce((s, x) => s + Number(x.total_cost || 0), 0);

  const saveClosing = async () => {
    const rows = Object.entries(closing)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([item_id, v]) => ({ item_id, count_date: date, closing_qty: Number(v) }));
    if (!rows.length) {
      alert("Enter at least one closing count");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("stock_counts").upsert(rows, { onConflict: "item_id,count_date" });
    setBusy(false);
    if (error) alert(error.message);
    else {
      setMsg("Closing saved — this becomes tomorrow's opening");
      load();
    }
  };

  const addIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !qty) return;
    setBusy(true);
    const { error } = await supabase.from("stock_in").insert({
      item_id: item,
      entry_date: date,
      qty: Number(qty),
      total_cost: Number(cost || 0),
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return alert(error.message);
    setQty("");
    setCost("");
    setNote("");
    load();
  };

  const delIn = async (id: string) => {
    if (!confirm("Delete this purchase? Related expense is removed too.")) return;
    const { error } = await supabase.from("stock_in").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase
      .from("inventory_items")
      .insert({ name: newName.trim(), unit: newUnit.trim() || "pcs" });
    if (error) return alert(error.message);
    setNewName("");
    load();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm text-slate-600">Business day</label>
        <input
          type="date"
          className={input + " !w-auto"}
          value={date}
          max={todayIST()}
          onChange={(e) => setDate(e.target.value)}
        />
        <button type="button" className={btn2} onClick={() => setDate(todayIST())}>
          Today
        </button>
      </div>

      {msg && <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">{msg}</p>}

      {/* Summary strip */}
      <div className={`${card} grid grid-cols-2 gap-2 text-center`}>
        <div>
          <div className="text-lg font-bold text-red-500">{inr(dayPurchaseCost)}</div>
          <div className="text-[11px] text-slate-500">Stock purchase cost today</div>
        </div>
        <div>
          <div className="text-lg font-bold text-slate-800">{ins.length}</div>
          <div className="text-[11px] text-slate-500">Purchase entries</div>
        </div>
      </div>

      {/* Day sheet */}
      <div className={card}>
        <h2 className="font-semibold text-sm mb-1">Day sheet</h2>
        <p className="text-xs text-slate-500 mb-3">
          <b>Opening</b> = previous day’s closing. Enter <b>Closing</b> at end of day. Used = Opening + New − Closing.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-orange-200">
                <th className="text-left py-2 px-1">Item</th>
                <th className="text-right px-1">Opening</th>
                <th className="text-right px-1">+ New</th>
                <th className="text-right px-1">Closing</th>
                <th className="text-right px-1">Used</th>
              </tr>
            </thead>
            <tbody>
              {sheet.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 py-6">
                    No inventory items yet — add one below
                  </td>
                </tr>
              )}
              {sheet.map((r) => {
                const cl = closing[r.item_id];
                const used =
                  cl === "" || cl === undefined
                    ? null
                    : Number(r.opening) + Number(r.stock_in) - Number(cl);
                return (
                  <tr key={r.item_id} className="border-b border-orange-50">
                    <td className="py-2 px-1 font-medium">
                      {r.name}{" "}
                      <span className="text-xs text-slate-400">({r.unit})</span>
                    </td>
                    <td className="text-right px-1 tabular-nums text-slate-600">{r.opening}</td>
                    <td className="text-right px-1 tabular-nums text-orange-600">
                      {Number(r.stock_in) ? `+${r.stock_in}` : "—"}
                    </td>
                    <td className="text-right px-1">
                      <input
                        className={input + " !w-20 text-right !py-1"}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="?"
                        value={cl ?? ""}
                        onChange={(e) => setClosing({ ...closing, [r.item_id]: e.target.value })}
                      />
                    </td>
                    <td className="text-right px-1 tabular-nums text-slate-500">
                      {used === null ? "—" : used}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className={btn + " mt-3 w-full sm:w-auto"} disabled={busy} onClick={saveClosing}>
          {busy ? "Saving…" : "Save closing counts"}
        </button>
      </div>

      {/* New stock purchase */}
      <form onSubmit={addIn} className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">New stock in (purchase)</h2>
        <p className="text-xs text-slate-500">
          Enter qty + total price paid. Creates <b>one expense</b> for that purchase (not per product line).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select className={input} value={item} onChange={(e) => setItem(e.target.value)} required>
            <option value="">Select item…</option>
            {sheet.map((r) => (
              <option key={r.item_id} value={r.item_id}>
                {r.name} ({r.unit})
              </option>
            ))}
          </select>
          <input className={input} type="number" min="0" step="0.01" placeholder="Qty received" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <input className={input} type="number" min="0" step="1" placeholder="Total cost ₹ (expense)" value={cost} onChange={(e) => setCost(e.target.value)} />
          <input className={input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className={btn} disabled={busy || !item}>
          Add purchase
        </button>
      </form>

      {ins.length > 0 && (
        <div className={card}>
          <h2 className="font-semibold text-sm mb-2">Purchases this day</h2>
          <ul className="divide-y divide-orange-50 text-sm">
            {ins.map((x) => (
              <li key={x.id} className="py-2 flex items-center gap-2">
                <div className="flex-1">
                  <div className="font-medium">{x.inventory_items?.name ?? "Item"}</div>
                  <div className="text-xs text-slate-500">
                    Qty {x.qty}
                    {x.note ? ` · ${x.note}` : ""}
                  </div>
                </div>
                <div className="font-bold text-red-500">{inr(x.total_cost)}</div>
                <button type="button" className="text-xs text-red-500" onClick={() => delIn(x.id)}>
                  Del
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={addItem} className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Add inventory item</h2>
        <div className="flex gap-2">
          <input className={input} placeholder="Name (e.g. Bread)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className={input + " !w-24"} placeholder="Unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
          <button className={btn2} type="submit">
            Add
          </button>
        </div>
      </form>
    </>
  );
}
