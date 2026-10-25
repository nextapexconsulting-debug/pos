"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageShell, { card, input, btn2 } from "@/components/PageShell";
import { supabase, todayIST, addDays, inr } from "@/lib/supabase";

type Row = {
  customer_id: string;
  name: string;
  mobile: string;
  orders: number;
  total: number;
  last_order: string | null;
};

export default function CustomersPage() {
  return (
    <PageShell title="Customers" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [from, setFrom] = useState(addDays(todayIST(), -90));
  const [to, setTo] = useState(todayIST());
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("report_customers", { p_from: from, p_to: to });
    if (error) setErr(error.message);
    else {
      setErr("");
      setRows((data as Row[]) ?? []);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return r.name?.toLowerCase().includes(s) || r.mobile?.includes(s);
  });

  return (
    <>
      <p className="text-sm text-slate-600">Tap a customer to see full order history.</p>
      <div className="flex gap-2 flex-wrap items-center">
        <input type="date" className={input + " !w-auto"} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span>→</span>
        <input type="date" className={input + " !w-auto"} value={to} onChange={(e) => setTo(e.target.value)} />
        <input className={input + " !max-w-xs"} placeholder="Search name / mobile" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p className="text-red-500 text-sm">{err}</p>}
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">No customers yet</p>}
        {filtered.map((r) => (
          <Link
            key={r.customer_id}
            href={`/customers/${r.customer_id}`}
            className={`${card} block hover:pos-border transition-colors`}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{r.name}</div>
                <div className="text-xs text-slate-500">{r.mobile}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold pos-text">{inr(r.total)}</div>
                <div className="text-[11px] text-slate-500">{r.orders} orders</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
