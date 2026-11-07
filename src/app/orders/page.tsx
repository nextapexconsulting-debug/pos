"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn2, btn } from "@/components/PageShell";
import { useAccess } from "@/components/AuthGate";
import { supabase, todayIST, fetchBusinessDay, inr } from "@/lib/supabase";
import { printOrderReceipt } from "@/lib/printer";
import Link from "next/link";
import { useT } from "@/lib/i18n";

interface Item {
  name_en: string;
  qty: number;
  price: number;
  line_total: number;
}
interface Order {
  id: string;
  order_no: number;
  created_at: string;
  total: number;
  status: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  payment_status: "paid" | "unpaid";
  payment_method: "cash" | "upi" | "split" | null;
  cash_paid?: number | null;
  upi_paid?: number | null;
  is_parcel?: boolean;
  is_jain?: boolean;
  order_items: Item[];
}

export default function OrdersPage() {
  const { t } = useT();
  return (
    <PageShell title={t("orders")} roles={["owner", "staff"]}>
      <Orders />
    </PageShell>
  );
}

function Orders() {
  const { t } = useT();
  const me = useAccess();
  const owner = me.role === "owner";
  const [date, setDate] = useState(todayIST());
  useEffect(() => {
    fetchBusinessDay().then((d) => setDate(d));
  }, []);

  const [filter, setFilter] = useState<"all" | "unpaid">("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState("");
  const [splitFor, setSplitFor] = useState<string | null>(null);
  const [splitCash, setSplitCash] = useState("");
  const [splitUpi, setSplitUpi] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,order_no,created_at,total,status,payment_status,payment_method,cash_paid,upi_paid,is_parcel,is_jain,customer_name,customer_mobile,order_items(name_en,qty,price,line_total)"
      )
      .eq("order_date", date)
      .order("order_no", { ascending: false });
    if (error) setErr(error.message);
    else {
      setErr("");
      setOrders((data as unknown as Order[]) ?? []);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: string, args: Record<string, unknown>) => {
    try {
      const { error } = await supabase.rpc(fn, args);
      if (error) {
        alert(error.message);
        return;
      }
      setSplitFor(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Action failed");
    }
  };

  const openSplit = (o: Order) => {
    setSplitFor(o.id);
    setSplitCash("");
    setSplitUpi("");
  };

  const onCashChange = (o: Order, val: string) => {
    setSplitCash(val);
    const c = parseFloat(val);
    if (!isNaN(c) && c >= 0) {
      const rest = Math.max(0, Math.round((Number(o.total) - c) * 100) / 100);
      setSplitUpi(String(rest));
    }
  };

  const onUpiChange = (o: Order, val: string) => {
    setSplitUpi(val);
    const u = parseFloat(val);
    if (!isNaN(u) && u >= 0) {
      const rest = Math.max(0, Math.round((Number(o.total) - u) * 100) / 100);
      setSplitCash(String(rest));
    }
  };

  const confirmSplit = async (o: Order) => {
    const cash = parseFloat(splitCash);
    const upi = parseFloat(splitUpi);
    if (isNaN(cash) || isNaN(upi) || cash < 0 || upi < 0) {
      alert("Enter valid cash and UPI amounts");
      return;
    }
    if (Math.abs(cash + upi - Number(o.total)) > 0.05) {
      alert(`Cash + UPI must equal ${inr(o.total)}`);
      return;
    }
    await act("set_payment", {
      p_order: o.id,
      p_method: "split",
      p_cash: cash,
      p_upi: upi,
    });
  };

  const live = orders.filter((o) => o.status === "active");
  const cashSum = (o: Order) => {
    if (o.payment_method === "cash") return Number(o.total);
    if (o.payment_method === "split") return Number(o.cash_paid || 0);
    return 0;
  };
  const upiSum = (o: Order) => {
    if (o.payment_method === "upi") return Number(o.total);
    if (o.payment_method === "split") return Number(o.upi_paid || 0);
    return 0;
  };
  const sum = (f: (o: Order) => number) => live.reduce((s, o) => s + f(o), 0);
  const unpaidSum = () =>
    live.filter((o) => o.payment_status === "unpaid").reduce((s, o) => s + Number(o.total), 0);
  const shown = orders.filter(
    (o) => filter === "all" || (o.payment_status === "unpaid" && o.status === "active")
  );

  const paidLabel = (o: Order) => {
    if (o.payment_method === "split") {
      return `Paid · Split · Cash ${inr(o.cash_paid || 0)} + UPI ${inr(o.upi_paid || 0)}`;
    }
    return `Paid · ${(o.payment_method || "").toUpperCase()}`;
  };

  return (
    <>
      <div className={`${card} grid grid-cols-2 sm:grid-cols-4 gap-2 text-center`}>
        <Stat label="Total sales" v={sum((o) => Number(o.total))} c="text-slate-800" />
        <Stat label="Cash" v={sum(cashSum)} c="pos-text" />
        <Stat label="UPI" v={sum(upiSum)} c="text-indigo-600" />
        <Stat label="Not paid yet" v={unpaidSum()} c="text-amber-600" />
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        {owner ? (
          <input
            type="date"
            className={input + " !w-auto"}
            value={date}
            max={todayIST()}
            onChange={(e) => setDate(e.target.value)}
          />
        ) : (
          <span className="text-sm text-slate-500">Today</span>
        )}
        <button
          className={btn2 + (filter === "all" ? " !pos-btn !text-white" : "")}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={btn2 + (filter === "unpaid" ? " !bg-amber-500 !text-white" : "")}
          onClick={() => setFilter("unpaid")}
        >
          Unpaid only
        </button>
        <Link href="/orders/edit" className={btn2 + " ml-auto"}>
          ✏️ Edit Order
        </Link>
        <button className={btn2} onClick={load}>
          ↻ Refresh
        </button>
      </div>
      {err && <p className="text-red-500 text-sm">{err}</p>}

      {shown.length === 0 && (
        <p className="text-slate-400 text-center py-10 text-sm">{t("no_orders")}</p>
      )}
      {shown.map((o) => (
        <div key={o.id} className={`${card} ${o.status === "cancelled" ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="font-bold">#{o.order_no}</span>
            {(o.is_parcel === true || o.is_jain === true) && (
              <span className="text-xs font-bold pos-text pos-soft-bg px-1.5 py-0.5 rounded">
                {[o.is_parcel === true ? "P" : null, o.is_jain === true ? "J" : null]
                  .filter(Boolean)
                  .join("")}
              </span>
            )}
            <span className="text-xs text-slate-400">
              {new Date(o.created_at).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata",
              })}
            </span>
            <span className="ml-auto font-bold pos-text">{inr(o.total)}</span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {o.order_items.map((i) => `${i.qty}× ${i.name_en}`).join(", ")}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {o.status === "cancelled" ? (
              <span className="text-xs text-red-500">Cancelled</span>
            ) : o.payment_status === "paid" ? (
              <>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    o.payment_method === "cash"
                      ? "pos-soft-bg pos-text-dark"
                      : o.payment_method === "split"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {paidLabel(o)}
                </span>
                {owner && (
                  <button
                    className="text-xs text-slate-400 underline"
                    onClick={() => act("set_payment", { p_order: o.id, p_method: null, p_cash: null, p_upi: null })}
                  >
                    undo
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-amber-600">{t("unpaid")}</span>
                <button
                  className="pos-btn hover:opacity-90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  onClick={() => act("set_payment", { p_order: o.id, p_method: "cash", p_cash: null, p_upi: null })}
                >
                  💵 Cash
                </button>
                <button
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  onClick={() => act("set_payment", { p_order: o.id, p_method: "upi", p_cash: null, p_upi: null })}
                >
                  📱 UPI
                </button>
                <button
                  type="button"
                  className="bg-white border border-slate-300 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  onClick={() => openSplit(o)}
                >
                  Split
                </button>
              </>
            )}
            <button
              type="button"
              className="text-xs pos-btn hover:opacity-90 text-white font-semibold px-3 py-1.5 rounded-lg ml-auto"
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
                onClick={() =>
                  confirm(`Cancel order #${o.order_no}?`) &&
                  act("cancel_order", { p_order: o.id })
                }
              >
                Cancel
              </button>
            )}
          </div>

          {splitFor === o.id && o.payment_status === "unpaid" && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-800">
                Split payment · {inr(o.total)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500">Cash ₹</label>
                  <input
                    className={input}
                    inputMode="decimal"
                    placeholder="0"
                    value={splitCash}
                    onChange={(e) => onCashChange(o, e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">UPI ₹ (remaining)</label>
                  <input
                    className={input}
                    inputMode="decimal"
                    placeholder="0"
                    value={splitUpi}
                    onChange={(e) => onUpiChange(o, e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Cash + UPI must equal {inr(o.total)}
                {splitCash !== "" &&
                  splitUpi !== "" &&
                  !isNaN(parseFloat(splitCash)) &&
                  !isNaN(parseFloat(splitUpi)) && (
                    <span
                      className={
                        Math.abs(parseFloat(splitCash) + parseFloat(splitUpi) - Number(o.total)) <=
                        0.05
                          ? " text-emerald-600 font-medium"
                          : " text-red-500"
                      }
                    >
                      {" "}
                      · now {inr(parseFloat(splitCash) + parseFloat(splitUpi))}
                    </span>
                  )}
              </p>
              <div className="flex gap-2">
                <button type="button" className={btn} onClick={() => confirmSplit(o)}>
                  Confirm split
                </button>
                <button
                  type="button"
                  className="text-xs text-slate-500 underline"
                  onClick={() => setSplitFor(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

const Stat = ({ label, v, c }: { label: string; v: number; c: string }) => (
  <div>
    <div className={`text-lg font-bold ${c}`}>{inr(v)}</div>
    <div className="text-[11px] text-slate-500">{label}</div>
  </div>
);
