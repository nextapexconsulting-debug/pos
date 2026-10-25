"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageShell, { card } from "@/components/PageShell";
import { supabase, inr } from "@/lib/supabase";

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>}>
      <CustomerDetailInner />
    </Suspense>
  );
}

function CustomerDetailInner() {
  return (
    <PageShell title="Customer history" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [cust, setCust] = useState<{ name: string; mobile: string; notes: string | null } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const [{ data: c, error: e1 }, { data: o, error: e2 }] = await Promise.all([
        supabase.from("customers").select("name,mobile,notes").eq("id", id).maybeSingle(),
        supabase
          .from("orders")
          .select(
            "id,order_no,order_date,created_at,total,status,payment_status,payment_method,is_parcel,is_jain,order_items(name_en,qty,price,line_total)"
          )
          .eq("customer_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (!alive) return;
      if (e1 || e2) setErr(e1?.message || e2?.message || "");
      setCust(c);
      setOrders(o ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <>
      <Link href="/customers" className="text-sm pos-text">
        ← All customers
      </Link>
      {err && <p className="text-red-500 text-sm">{err}</p>}
      {cust && (
        <div className={card}>
          <div className="font-bold text-lg">{cust.name}</div>
          <div className="text-slate-600">{cust.mobile}</div>
          {cust.notes && <div className="text-xs text-slate-500 mt-1">{cust.notes}</div>}
        </div>
      )}
      <div className="space-y-2">
        {orders.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">No orders</p>}
        {orders.map((o) => (
          <div key={o.id} className={`${card} ${o.status === "cancelled" ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold">#{o.order_no}</span>
              <span className="text-slate-500">{o.order_date}</span>
              <span className="text-slate-400 text-xs">
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
              {(o.order_items || []).map((i: any) => `${i.qty}× ${i.name_en}`).join(", ")}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {o.status} · {o.payment_status}
              {o.payment_method ? ` · ${o.payment_method}` : ""}
              {o.is_parcel ? " · P" : ""}
              {o.is_jain ? " · J" : ""}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
