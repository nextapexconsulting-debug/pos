"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, Table } from "@/components/PageShell";
import { supabase, todayIST, inr } from "@/lib/supabase";

interface Sheet { item_id: string; name: string; unit: string; category: string; opening: number; stock_in: number; closing: number | null; used: number | null }
interface In { id: string; qty: number; total_cost: number; note: string | null; inventory_items: { name: string; unit: string } | null }

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

  const load = useCallback(async () => {
    const [{ data: s }, { data: i }] = await Promise.all([
      supabase.rpc("stock_sheet", { p_date: date }),
      supabase.from("stock_in").select("id,qty,total_cost,note,inventory_items(name,unit)").eq("entry_date", date).order("created_at", { ascending: false }),
    ]);
    const rows = (s as Sheet[]) ?? [];
    setSheet(rows);
    setClosing(Object.fromEntries(rows.map((r) => [r.item_id, r.closing === null ? "" : String(r.closing)])));
    setIns((i as unknown as In[]) ?? []);
    if (!item && rows[0]) setItem(rows[0].item_id);
  }, [date, item]);

  useEffect(() => { load(); }, [load]);

  const saveClosing = async () => {
    const rows = Object.entries(closing).filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([item_id, v]) => ({ item_id, count_date: date, closing_qty: Number(v) }));
    if (!rows.length) return;
    const { error } = await supabase.from("stock_counts").upsert(rows, { onConflict: "item_id,count_date" });
    if (error) alert(error.message); else load();
  };

  const addIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("stock_in").insert({
      item_id: item, entry_date: date, qty: Number(qty), total_cost: Number(cost || 0), note: note.trim() || null,
    });
    if (error) return alert(error.message);
    setQty(""); setCost(""); setNote(""); load();
  };

  const delIn = async (id: string) => {
    if (!confirm("Delete this stock entry? (its expense is removed too)")) return;
    const { error } = await supabase.from("stock_in").delete().eq("id", id);
    if (error) alert(error.message); else load();
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase.from("inventory_items").insert({ name: newName.trim(), unit: newUnit.trim() || "pcs" });
    if (error) return alert(error.message);
    setNewName(""); load();
  };

  return (
    <>
      <input type="date" className={input + " !w-auto"} value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />

      <div className={card}>
        <h2 className="font-semibold text-sm mb-1">Carry forward – count what is left at closing</h2>
        <p className="text-xs text-slate-400 mb-2">Opening = yesterday's closing count. Used = Opening + New stock − Closing. Tomorrow's opening is today's closing.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-400 border-b border-slate-700">
              <th className="text-left py-2 px-2">Item</th><th className="text-right px-2">Opening</th>
              <th className="text-right px-2">+ New</th><th className="text-right px-2">Closing (count)</th><th className="text-right px-2">Used</th>
            </tr></thead>
            <tbody>
              {sheet.map((r) => {
                const cl = closing[r.item_id];
                const used = cl === "" || cl === undefined ? null : Number(r.opening) + Number(r.stock_in) - Number(cl);
                return (
                  <tr key={r.item_id} className="border-b border-slate-800">
                    <td className="py-2 px-2">{r.name} <span className="text-xs text-slate-500">({r.unit})</span></td>
                    <td className="text-right px-2 tabular-nums">{r.opening}</td>
                    <td className="text-right px-2 tabular-nums text-emerald-400">{Number(r.stock_in) ? "+" + r.stock_in : "—"}</td>
                    <td className="text-right px-2">
                      <input className={input + " !w-24 text-right"} type="number" inputMode="decimal" step="0.01" min="0"
                        value={cl ?? ""} onChange={(e) => setClosing({ ...closing, [r.item_id]: e.target.value })} />
                    </td>
                    <td className="text-right px-2 tabular-nums">{used === null ? "—" : used}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className={btn + " mt-3"} onClick={saveClosing}>Save closing counts</button>
      </div>

      <form onSubmit={addIn} className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">New stock came (bread, butter, cheese…)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select className={input} value={item} onChange={(e) => setItem(e.target.value)} required>
            {sheet.map((r) => <option key={r.item_id} value={r.item_id}>{r.name}</option>)}
          </select>
          <input className={input} type="number" step="0.01" min="0.01" inputMode="decimal" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <input className={input} type="number" step="0.01" min="0" inputMode="decimal" placeholder="Total cost ₹" value={cost} onChange={(e) => setCost(e.target.value)} />
          <input className={input + " col-span-2"} placeholder="Note / supplier (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className={btn}>Add stock (cost goes to expenses)</button>
      </form>

      <div className={card}>
        <h2 className="font-semibold text-sm mb-2">Stock received on {date}</h2>
        {ins.length === 0 && <p className="text-slate-500 text-sm">None</p>}
        {ins.map((x) => (
          <div key={x.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 text-sm">
            <span className="flex-1">{x.inventory_items?.name} × {x.qty} {x.inventory_items?.unit} <span className="text-xs text-slate-500">{x.note}</span></span>
            <span className="text-red-300 tabular-nums">{inr(x.total_cost)}</span>
            <button className="text-xs text-slate-500 hover:text-red-400" onClick={() => delIn(x.id)}>✕</button>
          </div>
        ))}
      </div>

      <form onSubmit={addItem} className={`${card} flex gap-2 items-center flex-wrap`}>
        <span className="text-sm font-semibold">Track a new item:</span>
        <input className={input + " !w-40"} placeholder="Name (e.g. Mayonnaise)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className={input + " !w-24"} placeholder="Unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
        <button className="bg-slate-700 hover:bg-slate-600 text-sm px-3 py-2 rounded-lg">Add item</button>
      </form>
    </>
  );
}
