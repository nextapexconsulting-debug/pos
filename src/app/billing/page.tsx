"use client";

import { useEffect, useState } from "react";
import PageShell, { card, Table, btn2 } from "@/components/PageShell";
import { supabase, todayIST, inr } from "@/lib/supabase";

interface Inv {
  id: string;
  period_start: string;
  items_count: number;
  amount: number;
  due_date: string;
  status: "paid" | "unpaid";
  paid_on: string | null;
}

type DayCost = {
  day: string;
  orders: number;
  items: number;
  sales: number;
  fee: number;
};

const SINCE = "2026-10-14";

export default function BillingPage() {
  return (
    <PageShell title="Billing" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [rows, setRows] = useState<Inv[]>([]);
  const [daily, setDaily] = useState<DayCost[]>([]);
  const [err, setErr] = useState("");
  const [feeRate, setFeeRate] = useState(1);

  useEffect(() => {
    supabase
      .from("invoices")
      .select("*")
      .order("period_start", { ascending: false })
      .then(({ data }) => setRows((data as Inv[]) ?? []));

    supabase.from("shops").select("fee_per_order,fee_per_item").limit(1).maybeSingle().then(({ data }) => {
      if (data?.fee_per_order != null) setFeeRate(Number(data.fee_per_order) || 1);
      else if (data?.fee_per_item != null) setFeeRate(Number(data.fee_per_item) || 1);
    });

    loadDaily();
  }, []);

  const loadDaily = async () => {
    setErr("");
    // Prefer usage_fees day totals since 14 Oct
    const { data: fees, error: e1 } = await supabase
      .from("usage_fees")
      .select("fee_date, amount, qty")
      .gte("fee_date", SINCE)
      .order("fee_date", { ascending: false });

    if (!e1 && fees && fees.length) {
      const map = new Map<string, DayCost>();
      for (const f of fees) {
        const d = f.fee_date as string;
        const cur = map.get(d) || { day: d, orders: 0, items: 0, sales: 0, fee: 0 };
        cur.fee += Number(f.amount || 0);
        cur.items += Number(f.qty || 0);
        map.set(d, cur);
      }
      // order counts + sales from orders
      const { data: ords } = await supabase
        .from("orders")
        .select("order_date, total, status")
        .gte("order_date", SINCE)
        .eq("status", "active");
      for (const o of ords || []) {
        const d = o.order_date as string;
        const cur = map.get(d) || { day: d, orders: 0, items: 0, sales: 0, fee: 0 };
        cur.orders += 1;
        cur.sales += Number(o.total || 0);
        map.set(d, cur);
      }
      setDaily([...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1)));
      return;
    }

    // Fallback: derive fee as Rs 1 per order
    const { data: ords, error } = await supabase
      .from("orders")
      .select("order_date, total, status")
      .gte("order_date", SINCE)
      .eq("status", "active");
    if (error) {
      setErr(error.message);
      return;
    }
    const map = new Map<string, DayCost>();
    for (const o of ords || []) {
      const d = o.order_date as string;
      const cur = map.get(d) || { day: d, orders: 0, items: 0, sales: 0, fee: 0 };
      cur.orders += 1;
      cur.sales += Number(o.total || 0);
      cur.fee += feeRate; // ₹1 per order default
      map.set(d, cur);
    }
    setDaily([...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1)));
  };

  const t = todayIST();
  const shaped = rows.map((r) => ({
    ...r,
    month: r.period_start.slice(0, 7),
    state: r.status === "paid" ? `Paid ${r.paid_on ?? ""}` : r.due_date < t ? "OVERDUE" : "Due",
  }));

  const feeTotal = daily.reduce((s, d) => s + d.fee, 0);
  const salesTotal = daily.reduce((s, d) => s + d.sales, 0);
  const orderTotal = daily.reduce((s, d) => s + d.orders, 0);

  return (
    <>
      <div className={card + " space-y-2"}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Daily cost report (since 14 Oct 2026)</h2>
          <button type="button" className={btn2} onClick={loadDaily}>
            Refresh
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Platform fee / day from usage. Default assumption ₹{feeRate} per order when fee rows are
          missing.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg border pos-border p-2">
            <div className="font-bold">{orderTotal}</div>
            <div className="text-[11px] text-slate-500">Orders</div>
          </div>
          <div className="rounded-lg border pos-border p-2">
            <div className="font-bold">{inr(salesTotal)}</div>
            <div className="text-[11px] text-slate-500">Sales</div>
          </div>
          <div className="rounded-lg border pos-border p-2">
            <div className="font-bold pos-text">{inr(feeTotal)}</div>
            <div className="text-[11px] text-slate-500">Fee cost</div>
          </div>
        </div>
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <Table
          cols={[
            { key: "day", label: "Date" },
            { key: "orders", label: "Orders", num: true },
            { key: "sales", label: "Sales", money: true },
            { key: "fee", label: "Cost (fee)", money: true },
          ]}
          rows={daily}
        />
        {daily.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No orders since 14 Oct yet</p>
        )}
      </div>

      <div className={card}>
        <h2 className="font-semibold mb-2">Monthly invoices</h2>
        <p className="text-xs text-slate-400 mb-2">
          App usage is billed periodically. Pay outstanding bills so the app does not pause.
        </p>
        <Table
          cols={[
            { key: "month", label: "Month" },
            { key: "items_count", label: "Items sold", num: true },
            { key: "amount", label: "Amount", money: true },
            { key: "due_date", label: "Pay by" },
            { key: "state", label: "Status" },
          ]}
          rows={shaped}
        />
        {rows.some((r) => r.status === "unpaid") && (
          <p className="text-amber-600 text-sm mt-3">
            Outstanding:{" "}
            {inr(rows.filter((r) => r.status === "unpaid").reduce((s, r) => s + Number(r.amount), 0))}
          </p>
        )}
      </div>
    </>
  );
}
