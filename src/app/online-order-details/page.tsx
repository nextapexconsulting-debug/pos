"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn2, Table } from "@/components/PageShell";
import { supabase, todayIST, addDays, fetchBusinessDay, inr } from "@/lib/supabase";

type Detail = {
  id: string;
  order_date: string;
  created_at: string;
  platform: string;
  external_order_no: string | null;
  amount: number;
  commission_pct: number;
  commission_amt: number;
  net_after_commission: number;
};

type Daily = {
  day: string;
  platform: string;
  orders: number;
  gross: number;
  commission_amt: number;
  net_after_commission: number;
};

export default function OnlineOrderDetailsPage() {
  return (
    <PageShell title="Online Total Amount" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [details, setDetails] = useState<Detail[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [err, setErr] = useState("");
  const [view, setView] = useState<"summary" | "lines">("summary");

  useEffect(() => {
    fetchBusinessDay().then((d) => {
      setFrom(d);
      setTo(d);
    });
  }, []);

  const load = useCallback(async () => {
    setErr("");
    const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
      supabase.rpc("report_online_daily", { p_from: from, p_to: to }),
      supabase.rpc("report_online_details", { p_from: from, p_to: to }),
    ]);
    if (e1 || e2) setErr(e1?.message || e2?.message || "");
    setDaily((d1 as any[]) || []);
    setDetails((d2 as any[]) || []);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const preset = (days: number) => {
    const end = to;
    setFrom(addDays(end, -(days - 1)));
  };

  const grossSum = details.reduce((s, r) => s + Number(r.amount || 0), 0);
  const netSum = details.reduce((s, r) => s + Number(r.net_after_commission || 0), 0);
  const commSum = details.reduce((s, r) => s + Number(r.commission_amt || 0), 0);

  return (
    <>
      <p className="text-sm text-slate-600">
        Gross = amount entered. Net = after platform commission (from Configuration, default 28%).
      </p>

      <div className={`${card} space-y-2`}>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500">From</label>
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500">To</label>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" className={btn2} onClick={load}>
            Apply
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            ["Today", 1],
            ["7 days", 7],
            ["30 days", 30],
          ].map(([lab, n]) => (
            <button
              key={lab as string}
              type="button"
              className={btn2}
              onClick={() => {
                fetchBusinessDay().then((d) => {
                  setTo(d);
                  setFrom(addDays(d, -((n as number) - 1)));
                });
              }}
            >
              {lab as string}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm pt-1">
          <div className="rounded-lg border pos-border p-2">
            <div className="font-bold">{inr(grossSum)}</div>
            <div className="text-[11px] text-slate-500">Gross (no commission cut)</div>
          </div>
          <div className="rounded-lg border pos-border p-2">
            <div className="font-bold text-amber-700">{inr(commSum)}</div>
            <div className="text-[11px] text-slate-500">Commission deducted</div>
          </div>
          <div className="rounded-lg border pos-border p-2">
            <div className="font-bold pos-text">{inr(netSum)}</div>
            <div className="text-[11px] text-slate-500">Net after commission</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={view === "summary" ? "pos-btn text-white text-sm px-3 py-1.5 rounded-lg" : btn2}
          onClick={() => setView("summary")}
        >
          Daily by platform
        </button>
        <button
          type="button"
          className={view === "lines" ? "pos-btn text-white text-sm px-3 py-1.5 rounded-lg" : btn2}
          onClick={() => setView("lines")}
        >
          Each order
        </button>
      </div>

      {err && <p className="text-red-500 text-sm">{err}</p>}

      {view === "summary" ? (
        <div className={card}>
          <Table
            cols={[
              { key: "day", label: "Date" },
              { key: "platform", label: "Platform" },
              { key: "orders", label: "Orders", num: true },
              { key: "gross", label: "Gross", money: true },
              { key: "commission_amt", label: "Commission", money: true },
              { key: "net_after_commission", label: "Net after commission", money: true },
            ]}
            rows={daily}
          />
        </div>
      ) : (
        <div className={card}>
          <Table
            cols={[
              { key: "order_date", label: "Biz day" },
              { key: "platform", label: "Platform" },
              { key: "external_order_no", label: "Order no" },
              { key: "amount", label: "Gross", money: true },
              { key: "commission_pct", label: "Comm %", num: true },
              { key: "commission_amt", label: "Commission", money: true },
              { key: "net_after_commission", label: "Net", money: true },
            ]}
            rows={details.map((r) => ({
              ...r,
              external_order_no: r.external_order_no || "—",
            }))}
          />
        </div>
      )}
    </>
  );
}
