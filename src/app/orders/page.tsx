"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn2 } from "@/components/PageShell";
import { useAccess } from "@/components/AuthGate";
import { supabase, todayIST, inr } from "@/lib/supabase";
import { printOrderReceipt } from "@/lib/printer";
import Link from "next/link";

interface Item { name_en: string; qty: number; price: number; line_total: number }
interface Order {
  id: string; order_no: number; created_at: string; total: number; status: string; customer_name?: string | null; customer_mobile?: string | null;
  payment_status: "paid" | "unpaid"; payment_method: "cash" | "upi" | null;
  is_parcel?: boolean; is_jain?: boolean;
  order_items: Item[];
}

export default function OrdersPage() {
  return (
    <PageShell title="Orders" roles={["owner", "staff"]}>
      <Orders />
    </PageShell>
  );
}

function Orders() {
  const me = useAccess();
  const owner = me.role === "owner";
  const [date, setDate] = useState(todayIST());
  const [filter, setFilter] = useState<"all" | "unpaid">("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_no,created_at,total,status,payment_status,payment_method,is_parcel,is_jain,customer_name,customer_mobile,order_items(name_en,qty,price,line_total)")
      .eq("order_date", date)
      .order("order_no", { ascending: false });
    if (error) setErr(error.message);
    else { setErr(""); setOrders((data as unknown as Order[]) ?? []); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) alert(error.message); else load();
  };

  const live = orders.filter((o) => o.status === "active");
  const sum = (f: (o: Order) => boolean) => live.filter(f).reduce((s, o) => s + Number(o.total), 0);
  const shown = orders.filter((o) => filter === "all" || (o.payment_status === "unpaid" && o.status === "active"));

  return (
    <>
      <div className={`${card} grid grid-cols-2 sm:grid-cols-4 gap-2 text-center`}>
        <Stat label="Total sales" v={sum(() => true)} c="text-slate-800" />
        <Stat label="Cash" v={sum((o) => o.payment_method === "cash")} c="text-orange-600" />
        <Stat label="UPI" v={sum((o) => o.payment_method === "upi")} c="text-indigo-600" />
        <Stat label="Not paid yet" v={sum((o) => o.payment_status === "unpaid")} c="text-amber-600" />
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        {owner ? (
          <input type="date" className={input + " !w-auto"} value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        ) : (
          <span className="text-sm text-slate-500">Today</span>
        )}
        <button className={btn2 + (filter === "all" ? " !bg-orange-500 !text-white" : "")} onClick={() => setFilter("all")}>All</button>
        <button className={btn2 + (filter === "unpaid" ? " !bg-amber-500 !text-white" : "")} onClick={() => setFilter("unpaid")}>Unpaid only</button>
        <Link href="/orders/edit" className={btn2 + " ml-auto"}>✏️ Edit Order</Link>
        <button className={btn2} onClick={load}>↻ Refresh</button>
      </div>
      {err && <p className="text-red-500 text-sm">{err}</p>}

      {shown.length === 0 && <p className="text-slate-400 text-center py-10 text-sm">No orders</p>}
      {shown.map((o) => (
        <div key={o.id} className={`${card} ${o.status === "cancelled" ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="font-bold">#{o.order_no}</span>
            {(o.is_parcel === true || o.is_jain === true) && (
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                {[o.is_parcel === true ? "P" : null, o.is_jain === true ? "J" : null].filter(Boolean).join("")}
              </span>
            )}
            <span className="text-xs text-slate-400">
              {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}
            </span>
            <span className="ml-auto font-bold text-orange-600">{inr(o.total)}</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {o.order_items.map((i) => `${i.qty}× ${i.name_en}`).join(", ")}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {o.status === "cancelled" ? (
              <span className="text-xs text-red-500">Cancelled</span>
            ) : o.payment_status === "paid" ? (
              <>
                <span className={`text-xs px-2 py-1 rounded-full ${o.payment_method === "cash" ? "bg-orange-100 text-orange-700" : "bg-indigo-100 text-indigo-700"}`}>
                  Paid · {o.payment_method?.toUpperCase()}
                </span>
                {owner && <button className="text-xs text-slate-400 underline" onClick={() => act("set_payment", { p_order: o.id, p_method: null })}>undo</button>}
              </>
            ) : (
              <>
                <span className="text-xs text-amber-600">Unpaid</span>
                <button className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg" onClick={() => act("set_payment", { p_order: o.id, p_method: "cash" })}>💵 Paid Cash</button>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg" onClick={() => act("set_payment", { p_order: o.id, p_method: "upi" })}>📱 Paid UPI</button>
              </>
            )}
            <button
              type="button"
              className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-lg ml-auto"
              onClick={() =>
                printOrderReceipt({
                  orderNo: o.order_no,
                  items: o.order_items.map((i) => ({
                    name: i.name_en,
                    qty: i.qty,
                    price: i.price,
                  })),
                  total: Number(o.total),
                  parcel: o.is_parcel === true,
                  jain: o.is_jain === true,
                  orderedAt: o.created_at,
                  customerName: o.customer_name,
                  customerMobile: o.customer_mobile,
                })
              }
            >
              🖨 Print
            </button>
            {owner && o.status === "active" && (
              <button
                type="button"
                className="text-xs text-red-500"
                onClick={() => confirm(`Cancel order #${o.order_no}?`) && act("cancel_order", { p_order: o.id })}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

const Stat = ({ label, v, c }: { label: string; v: number; c: string }) => (
  <div><div className={`text-lg font-bold ${c}`}>{inr(v)}</div><div className="text-[11px] text-slate-500">{label}</div></div>
);
