"use client";

import { useEffect, useState } from "react";
import PageShell, { card, Table } from "@/components/PageShell";
import { supabase, todayIST, inr } from "@/lib/supabase";

interface Inv { id: string; period_start: string; items_count: number; amount: number; due_date: string; status: "paid" | "unpaid"; paid_on: string | null }

export default function BillingPage() {
  return (
    <PageShell title="Billing" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [rows, setRows] = useState<Inv[]>([]);
  useEffect(() => {
    supabase.from("invoices").select("*").order("period_start", { ascending: false })
      .then(({ data }) => setRows((data as Inv[]) ?? []));
  }, []);
  const t = todayIST();
  const shaped = rows.map((r) => ({
    ...r,
    month: r.period_start.slice(0, 7),
    state: r.status === "paid" ? `Paid ${r.paid_on ?? ""}` : r.due_date < t ? "OVERDUE" : "Due",
  }));
  return (
    <div className={card}>
      <p className="text-xs text-slate-400 mb-2">
        App usage is billed once a month, after the month ends. You then have a few days to pay before the app pauses.
      </p>
      <Table
        cols={[{ key: "month", label: "Month" }, { key: "items_count", label: "Items sold", num: true }, { key: "amount", label: "Amount", money: true },
          { key: "due_date", label: "Pay by" }, { key: "state", label: "Status" }]}
        rows={shaped}
      />
      {rows.some((r) => r.status === "unpaid") && (
        <p className="text-amber-300 text-sm mt-3">Outstanding: {inr(rows.filter((r) => r.status === "unpaid").reduce((s, r) => s + Number(r.amount), 0))}</p>
      )}
    </div>
  );
}
