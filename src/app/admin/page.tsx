"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2, Table } from "@/components/PageShell";
import { supabase, todayIST, addDays, inr, fetchAll, downloadCSV } from "@/lib/supabase";

interface Shop { id: string; name: string; status: "active" | "blocked"; blocked_reason: string | null; fee_per_item: number; grace_days: number; created_at: string }
interface Prof { id: string; email: string; full_name: string | null; role: string; shop_id: string | null; is_blocked: boolean }
interface Inv { id: string; shop_id: string; period_start: string; items_count: number; amount: number; due_date: string; status: string; paid_on: string | null }

export default function AdminPage() {
  return (
    <PageShell title="Admin" roles={["super_admin"]}>
      <Body />
    </PageShell>
  );
}

async function createUser(body: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error);
}

function Body() {
  const [tab, setTab] = useState<"shops" | "billing" | "usage">("shops");
  const [shops, setShops] = useState<Shop[]>([]);
  const [profs, setProfs] = useState<Prof[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("shops").select("*").order("created_at"),
      supabase.from("profiles").select("id,email,full_name,role,shop_id,is_blocked").order("created_at"),
      supabase.from("invoices").select("*").order("period_start", { ascending: false }),
    ]);
    setShops((a.data as Shop[]) ?? []); setProfs((b.data as Prof[]) ?? []); setInvs((c.data as Inv[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="flex gap-2">
        {([["shops", "Shops & users"], ["billing", "Invoices"], ["usage", "Usage report (fee)"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === k ? "bg-emerald-600" : "bg-slate-700"}`}>{l}</button>
        ))}
      </div>
      {tab === "shops" && <Shops shops={shops} profs={profs} invs={invs} reload={load} />}
      {tab === "billing" && <Invoices shops={shops} invs={invs} reload={load} />}
      {tab === "usage" && <Usage shops={shops} />}
    </>
  );
}

function Shops({ shops, profs, invs, reload }: { shops: Shop[]; profs: Prof[]; invs: Inv[]; reload: () => void }) {
  const [f, setF] = useState({ shop_name: "", email: "", password: "", full_name: "" });
  const [msg, setMsg] = useState("");
  const t = todayIST();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createUser(f); setMsg("Shop + owner created ✓"); setF({ shop_name: "", email: "", password: "", full_name: "" }); reload(); }
    catch (er: any) { setMsg(er.message); }
  };
  const setShop = async (s: Shop) => {
    if (s.status === "active") {
      const reason = prompt(`Block "${s.name}"? Reason shown to the user:`, "Please contact the administrator.");
      if (reason === null) return;
      await supabase.from("shops").update({ status: "blocked", blocked_reason: reason }).eq("id", s.id);
    } else await supabase.from("shops").update({ status: "active", blocked_reason: null }).eq("id", s.id);
    reload();
  };
  const setUser = async (p: Prof) => {
    let reason: string | null = null;
    if (!p.is_blocked) { reason = prompt(`Block ${p.email}? Reason shown to the user:`, "Please contact the administrator."); if (reason === null) return; }
    await supabase.from("profiles").update({ is_blocked: !p.is_blocked, blocked_reason: reason }).eq("id", p.id);
    reload();
  };
  const editNum = async (s: Shop, field: "fee_per_item" | "grace_days") => {
    const v = prompt(field === "fee_per_item" ? "Fee per item sold (₹)" : "Grace days after month end", String(s[field]));
    if (v === null || isNaN(Number(v))) return;
    await supabase.from("shops").update({ [field]: Number(v) }).eq("id", s.id); reload();
  };

  return (
    <>
      <form onSubmit={create} className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Add a new shop + owner login</h2>
        <div className="grid sm:grid-cols-4 gap-2">
          <input className={input} placeholder="Shop name" value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} required />
          <input className={input} placeholder="Owner name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <input className={input} type="email" placeholder="Owner email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <input className={input} placeholder="Password (min 6)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} />
        </div>
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
        <button className={btn}>Create</button>
      </form>

      {shops.map((s) => {
        const overdue = invs.filter((i) => i.shop_id === s.id && i.status === "unpaid" && i.due_date < t);
        return (
          <div key={s.id} className={card}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">{s.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>{s.status}</span>
              {overdue.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900 text-amber-300">bill overdue → locked</span>}
              <button className="text-xs text-slate-400 underline" onClick={() => editNum(s, "fee_per_item")}>fee ₹{s.fee_per_item}/item</button>
              <button className="text-xs text-slate-400 underline" onClick={() => editNum(s, "grace_days")}>grace {s.grace_days}d</button>
              <button className={btn2 + " ml-auto"} onClick={() => setShop(s)}>{s.status === "active" ? "Block shop" : "Unblock shop"}</button>
            </div>
            {profs.filter((p) => p.shop_id === s.id).map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5 mt-1 border-t border-slate-800 text-sm">
                <span className="flex-1 truncate">{p.email} <span className="text-xs text-slate-500">({p.role}{p.full_name ? ` · ${p.full_name}` : ""})</span></span>
                {p.is_blocked && <span className="text-xs text-red-400">blocked</span>}
                <button className="text-xs bg-slate-700 px-2.5 py-1 rounded-lg" onClick={() => setUser(p)}>{p.is_blocked ? "Unblock" : "Block"}</button>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Invoices({ shops, invs, reload }: { shops: Shop[]; invs: Inv[]; reload: () => void }) {
  const name = (id: string) => shops.find((s) => s.id === id)?.name ?? "?";
  const t = todayIST();
  const gen = async () => {
    const { data, error } = await supabase.rpc("generate_invoices");
    alert(error ? error.message : `${data} new invoice(s) created`); reload();
  };
  const pay = async (i: Inv, paid: boolean) => {
    await supabase.from("invoices").update({ status: paid ? "paid" : "unpaid", paid_on: paid ? t : null }).eq("id", i.id); reload();
  };
  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs text-slate-400 flex-1">Invoices are created automatically (daily cron) for every completed month. Unpaid after the due date = shop locked. Marking paid unlocks instantly.</p>
        <button className={btn} onClick={gen}>Generate now</button>
      </div>
      {invs.length === 0 && <p className="text-slate-500 text-sm text-center py-6">No invoices yet</p>}
      {invs.map((i) => (
        <div key={i.id} className="flex items-center gap-2 py-2 border-b border-slate-800 text-sm flex-wrap">
          <span className="font-medium w-32 truncate">{name(i.shop_id)}</span>
          <span className="text-slate-400 text-xs">{i.period_start.slice(0, 7)} · {i.items_count} items</span>
          <span className="font-bold ml-auto tabular-nums">{inr(i.amount)}</span>
          <span className="text-xs text-slate-400">due {i.due_date}</span>
          {i.status === "paid"
            ? <button className="text-xs text-emerald-400" onClick={() => pay(i, false)}>Paid {i.paid_on} ✓ (undo)</button>
            : <button className={`text-xs px-3 py-1.5 rounded-lg ${i.due_date < t ? "bg-red-600" : "bg-emerald-600"}`} onClick={() => pay(i, true)}>Mark paid</button>}
        </div>
      ))}
    </div>
  );
}

function Usage({ shops }: { shops: Shop[] }) {
  const t = todayIST();
  const [from, setFrom] = useState(t.slice(0, 8) + "01");
  const [to, setTo] = useState(t);
  const [shop, setShop] = useState("");
  const [summary, setSummary] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);

  const run = useCallback(async () => {
    const { data } = await supabase.rpc("admin_usage_summary", { p_from: from, p_to: to });
    setSummary((data as any[]) ?? []);
    if (!shop) return setLines([]);
    const rows = await fetchAll<any>((a, b) => supabase.from("usage_fees")
      .select("fee_date,order_no,product_name,qty,rate,amount,voided,invoice_id")
      .eq("shop_id", shop).gte("fee_date", from).lte("fee_date", to)
      .order("fee_date").order("order_no").range(a, b));
    setLines(rows.map((r) => ({ ...r, status: r.voided ? "cancelled" : r.invoice_id ? "invoiced" : "unbilled" })));
  }, [from, to, shop]);
  useEffect(() => { run(); }, [run]);

  const live = lines.filter((l) => !l.voided);
  return (
    <>
      <div className={`${card} flex gap-2 flex-wrap items-center`}>
        <input type="date" className={input + " !w-auto"} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-slate-500">→</span>
        <input type="date" className={input + " !w-auto"} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className={btn2} onClick={() => { setFrom(t.slice(0, 8) + "01"); setTo(t); }}>This month</button>
        <button className={btn2} onClick={() => { const d = new Date(t.slice(0, 8) + "01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); setFrom(d.toISOString().slice(0, 10)); setTo(addDays(t.slice(0, 8) + "01", -1)); }}>Last month</button>
      </div>
      <div className={card}>
        <h2 className="font-semibold text-sm mb-1">Per shop</h2>
        <Table totals cols={[{ key: "shop_name", label: "Shop" }, { key: "orders", label: "Orders", num: true }, { key: "items", label: "Items sold", num: true }, { key: "amount", label: "Fee", money: true }]} rows={summary} />
      </div>
      <div className={card}>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="font-semibold text-sm">Line-wise detail</h2>
          <select className={input + " !w-auto"} value={shop} onChange={(e) => setShop(e.target.value)}>
            <option value="">Select shop…</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className={btn2 + " ml-auto"} disabled={!lines.length} onClick={() => downloadCSV(`fees_${from}_${to}.csv`, lines.map(({ voided, invoice_id, ...r }) => r))}>⬇ CSV</button>
        </div>
        {lines.length > 0 && <p className="text-xs text-slate-400 mb-1">{live.reduce((s, l) => s + l.qty, 0)} items · {inr(live.reduce((s, l) => s + Number(l.amount), 0))} (cancelled orders excluded)</p>}
        <Table cols={[{ key: "fee_date", label: "Date" }, { key: "order_no", label: "Order #" }, { key: "product_name", label: "Item" }, { key: "qty", label: "Qty", num: true }, { key: "rate", label: "Rate", money: true }, { key: "amount", label: "Fee", money: true }, { key: "status", label: "Status" }]} rows={lines} />
      </div>
    </>
  );
}
