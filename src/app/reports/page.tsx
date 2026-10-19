"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell, { card, input, btn, btn2, Table } from "@/components/PageShell";
import { supabase, todayIST, addDays, downloadCSV, fetchAll } from "@/lib/supabase";

type Col = { key: string; label: string; money?: boolean; num?: boolean };
type Rep = {
  id: string;
  label: string;
  hint: string;
  cols: Col[];
  load: (f: string, t: string) => Promise<Record<string, any>[]>;
  totals?: boolean;
};

const rpc = async (fn: string, f: string, t: string) => {
  const { data, error } = await supabase.rpc(fn, { p_from: f, p_to: t });
  if (error) throw new Error(error.message);
  return (data as Record<string, any>[]) ?? [];
};

const inr = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const REPORTS: Rep[] = [
  {
    id: "daily",
    label: "Daily profit & loss",
    totals: true,
    hint: "Sales − expenses for every day. Your main report.",
    cols: [
      { key: "day", label: "Date" },
      { key: "orders", label: "Orders", num: true },
      { key: "items", label: "Items", num: true },
      { key: "sales", label: "Sales", money: true },
      { key: "expenses", label: "Expenses", money: true },
      { key: "profit", label: "Profit", money: true },
    ],
    load: (f, t) => rpc("report_daily", f, t),
  },
  {
    id: "monthly",
    label: "Monthly summary",
    totals: true,
    hint: "Same as daily, rolled up by month.",
    cols: [
      { key: "month", label: "Month" },
      { key: "orders", label: "Orders", num: true },
      { key: "items", label: "Items", num: true },
      { key: "sales", label: "Sales", money: true },
      { key: "expenses", label: "Expenses", money: true },
      { key: "profit", label: "Profit", money: true },
    ],
    load: async (f, t) => {
      const days = await rpc("report_daily", f, t);
      const m = new Map<string, any>();
      for (const d of days) {
        const k = String(d.day).slice(0, 7);
        const r = m.get(k) ?? { month: k, orders: 0, items: 0, sales: 0, expenses: 0, profit: 0 };
        for (const c of ["orders", "items", "sales", "expenses", "profit"]) r[c] += Number(d[c]);
        m.set(k, r);
      }
      return [...m.values()];
    },
  },
  {
    id: "payments",
    label: "Cash vs UPI vs unpaid",
    totals: true,
    hint: "How each day's sales were collected. Unpaid = still to collect.",
    cols: [
      { key: "day", label: "Date" },
      { key: "cash", label: "Cash", money: true },
      { key: "upi", label: "UPI", money: true },
      { key: "unpaid", label: "Unpaid", money: true },
      { key: "sales", label: "Total", money: true },
    ],
    load: (f, t) => rpc("report_daily", f, t),
  },
  {
    id: "unpaid",
    label: "Unpaid orders list",
    totals: true,
    hint: "Every order in the period that has not been marked paid.",
    cols: [
      { key: "order_date", label: "Date" },
      { key: "order_no", label: "Order #" },
      { key: "total", label: "Amount", money: true },
    ],
    load: async (f, t) =>
      fetchAll((a, b) =>
        supabase
          .from("orders")
          .select("order_date,order_no,total")
          .eq("status", "active")
          .eq("payment_status", "unpaid")
          .gte("order_date", f)
          .lte("order_date", t)
          .order("order_date")
          .range(a, b)
      ),
  },
  {
    id: "items",
    label: "Item-wise sales",
    totals: true,
    hint: "Best sellers by revenue (highest first).",
    cols: [
      { key: "item", label: "Item" },
      { key: "qty", label: "Qty", num: true },
      { key: "orders", label: "Orders", num: true },
      { key: "revenue", label: "Revenue", money: true },
    ],
    load: async (f, t) => {
      const rows = await rpc("report_items", f, t);
      // Highest revenue first
      return rows
        .slice()
        .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
    },
  },
  {
    id: "expenses",
    label: "Expenses by category",
    totals: true,
    hint: "Where the money goes: vegetables, tea, salary, stock purchases…",
    cols: [
      { key: "category", label: "Category" },
      { key: "entries", label: "Entries", num: true },
      { key: "total", label: "Total", money: true },
    ],
    load: async (f, t) => {
      const rows = await rpc("report_expenses", f, t);
      return rows.slice().sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    },
  },
  {
    id: "expense_lines",
    label: "Expense details (every entry)",
    hint: "All expense entries with your free-text notes.",
    cols: [
      { key: "expense_date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "note", label: "Note" },
      { key: "amount", label: "Amount", money: true },
    ],
    load: async (f, t) =>
      fetchAll((a, b) =>
        supabase
          .from("expenses")
          .select("expense_date,category,note,amount")
          .gte("expense_date", f)
          .lte("expense_date", t)
          .order("expense_date")
          .range(a, b)
      ),
  },
  {
    id: "stock",
    label: "Stock movement",
    hint: "Opening, new stock, closing and usage for bread, pizza, butter, cheese…",
    cols: [
      { key: "day", label: "Date" },
      { key: "item", label: "Item" },
      { key: "opening", label: "Opening", num: true },
      { key: "stock_in", label: "+ New", num: true },
      { key: "closing", label: "Closing", num: true },
      { key: "used", label: "Used", num: true },
    ],
    load: (f, t) => rpc("report_stock", f, t),
  },
  {
    id: "hourly",
    label: "Peak hours",
    totals: true,
    hint: "Which hours of the day bring the most orders.",
    cols: [
      { key: "hour", label: "Hour (24h)" },
      { key: "orders", label: "Orders", num: true },
      { key: "sales", label: "Sales", money: true },
    ],
    load: async (f, t) => {
      const rows = await rpc("report_hourly", f, t);
      return rows.slice().sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0));
    },
  },
];

export default function ReportsPage() {
  return (
    <PageShell title="Reports" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [id, setId] = useState("daily");
  const [from, setFrom] = useState(todayIST().slice(0, 8) + "01");
  const [to, setTo] = useState(todayIST());
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [err, setErr] = useState("");
  const rep = useMemo(() => REPORTS.find((r) => r.id === id)!, [id]);

  const run = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      setRows(await rep.load(from, to));
    } catch (e: any) {
      setErr(e.message);
      setRows([]);
    }
    setBusy(false);
  }, [rep, from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const t = todayIST();
  const firstOfMonth = (iso: string) => iso.slice(0, 8) + "01";
  const lastMonthStart = (() => {
    const d = new Date(firstOfMonth(t) + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const presets: [string, string, string][] = [
    ["Today", t, t],
    ["Yesterday", addDays(t, -1), addDays(t, -1)],
    ["Last 7 days", addDays(t, -6), t],
    ["This month", firstOfMonth(t), t],
    ["Last month", lastMonthStart, addDays(firstOfMonth(t), -1)],
    ["Last 6 months", addDays(t, -182), t],
  ];

  const archive = async () => {
    if (
      !confirm(
        "Move all orders & expenses older than 6 months into the archive?\n\nDaily totals stay in your reports. Download CSVs first if you want the full detail."
      )
    )
      return;
    const { data, error } = await supabase.rpc("archive_old_data", { p_months: 6 });
    alert(
      error
        ? error.message
        : `Archived ${data.orders_archived} orders and ${data.expenses_archived} expenses older than ${data.before}.`
    );
  };

  /** Real PDF file download — stays on this page (jsPDF). */
  const downloadSummaryPdf = async (f: string, e: string, label: string) => {
    setPdfBusy(true);
    setErr("");
    try {
      const [{ default: jsPDF }, daily, items, expenses, hourly] = await Promise.all([
        import("jspdf"),
        rpc("report_daily", f, e),
        rpc("report_items", f, e),
        rpc("report_expenses", f, e),
        rpc("report_hourly", f, e),
      ]);

      const sum = (arr: any[], key: string) =>
        arr.reduce((s, r) => s + Number(r[key] || 0), 0);

      const sales = sum(daily, "sales");
      const expTotal = sum(daily, "expenses");
      const profit = sum(daily, "profit");
      const orders = sum(daily, "orders");
      const cash = sum(daily, "cash");
      const upi = sum(daily, "upi");
      const unpaid = sum(daily, "unpaid");

      const topItems = items
        .slice()
        .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
        .slice(0, 10);

      const topExp = expenses
        .slice()
        .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
        .slice(0, 8);

      const topHours = hourly
        .slice()
        .sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0))
        .slice(0, 5);

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      let y = 16;

      const line = (txt: string, size = 11, style: "normal" | "bold" = "normal") => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.text(txt, 14, y);
        y += size * 0.45 + 2;
      };

      doc.setTextColor(15, 23, 42);
      line("Business summary", 18, "bold");
      doc.setTextColor(100, 100, 100);
      line(`${label}  |  ${f} to ${e}`, 10);
      line(`Generated ${new Date().toLocaleString("en-IN")}`, 9);
      y += 2;

      doc.setDrawColor(249, 115, 22);
      doc.setLineWidth(0.4);
      doc.line(14, y, pageW - 14, y);
      y += 8;

      doc.setTextColor(15, 23, 42);
      const metrics: [string, string][] = [
        ["Orders", String(orders)],
        ["Sales", inr(sales)],
        ["Expenses", inr(expTotal)],
        ["Profit", inr(profit)],
        ["Cash", inr(cash)],
        ["UPI", inr(upi)],
        ["Unpaid", inr(unpaid)],
      ];

      // 2-column metrics
      const col2 = pageW / 2 + 2;
      metrics.forEach(([labelM, val], i) => {
        const x = i % 2 === 0 ? 14 : col2;
        if (i % 2 === 0 && i > 0) y += 1;
        const rowY = y + Math.floor(i / 2) * 12;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(labelM, x, rowY);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(val, x, rowY + 5);
      });
      y += Math.ceil(metrics.length / 2) * 12 + 6;

      doc.setDrawColor(230, 230, 230);
      doc.line(14, y, pageW - 14, y);
      y += 8;

      // Top items
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("Top items by revenue", 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("#", 14, y);
      doc.text("Item", 22, y);
      doc.text("Qty", 130, y, { align: "right" });
      doc.text("Revenue", pageW - 14, y, { align: "right" });
      y += 5;
      doc.setDrawColor(240, 240, 240);
      doc.line(14, y, pageW - 14, y);
      y += 5;

      if (!topItems.length) {
        doc.setTextColor(150, 150, 150);
        doc.text("No item data", 14, y);
        y += 6;
      } else {
        topItems.forEach((r, i) => {
          if (y > 270) {
            doc.addPage();
            y = 16;
          }
          doc.setTextColor(15, 23, 42);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const name = String(r.item ?? "").slice(0, 42);
          doc.text(String(i + 1), 14, y);
          doc.text(name, 22, y);
          doc.text(String(Number(r.qty || 0)), 130, y, { align: "right" });
          doc.text(inr(Number(r.revenue || 0)), pageW - 14, y, { align: "right" });
          y += 5.5;
        });
      }

      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("Expenses by category", 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("Category", 14, y);
      doc.text("Total", pageW - 14, y, { align: "right" });
      y += 5;
      doc.setDrawColor(240, 240, 240);
      doc.line(14, y, pageW - 14, y);
      y += 5;

      if (!topExp.length) {
        doc.setTextColor(150, 150, 150);
        doc.text("No expenses", 14, y);
        y += 6;
      } else {
        topExp.forEach((r) => {
          if (y > 270) {
            doc.addPage();
            y = 16;
          }
          doc.setTextColor(15, 23, 42);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(String(r.category ?? "").slice(0, 50), 14, y);
          doc.text(inr(Number(r.total || 0)), pageW - 14, y, { align: "right" });
          y += 5.5;
        });
      }

      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text("Peak hours", 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("Hour", 14, y);
      doc.text("Orders", 80, y, { align: "right" });
      doc.text("Sales", pageW - 14, y, { align: "right" });
      y += 5;
      doc.line(14, y, pageW - 14, y);
      y += 5;

      if (!topHours.length) {
        doc.setTextColor(150, 150, 150);
        doc.text("No data", 14, y);
      } else {
        topHours.forEach((r) => {
          if (y > 275) {
            doc.addPage();
            y = 16;
          }
          doc.setTextColor(15, 23, 42);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(`${String(r.hour)}:00`, 14, y);
          doc.text(String(Number(r.orders || 0)), 80, y, { align: "right" });
          doc.text(inr(Number(r.sales || 0)), pageW - 14, y, { align: "right" });
          y += 5.5;
        });
      }

      y = Math.max(y + 10, 280);
      if (y > 285) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Summary only — not a GST tax invoice.", 14, 290);

      const safeLabel = label.replace(/[^\w\-]+/g, "_").slice(0, 40);
      doc.save(`report_${safeLabel}_${f}_${e}.pdf`);
    } catch (e: any) {
      setErr(e.message || "PDF failed");
    }
    setPdfBusy(false);
  };

  return (
    <>
      <p className="text-sm text-slate-600">
        Pick a report below. Use date range and presets. Download a one-page PDF summary anytime.
      </p>

      {/* PDF summary — period presets */}
      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Download PDF summary</h2>
        <p className="text-xs text-slate-500">
          One page: sales, profit, cash/UPI, top items, expenses, peak hours. Use print dialog →{" "}
          <b>Save as PDF</b>.
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {presets.map(([label, f, e]) => (
            <button
              key={label}
              type="button"
              disabled={pdfBusy}
              className={btn2 + " !text-xs"}
              onClick={() => downloadSummaryPdf(f, e, label)}
            >
              📄 {label}
            </button>
          ))}
        </div>
        {pdfBusy && <p className="text-xs text-orange-600">Preparing PDF…</p>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setId(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors ${
              id === r.id
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-slate-700 border-orange-200 hover:bg-orange-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className={`${card} space-y-2`}>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="date"
            className={input + " !w-auto"}
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-slate-500">→</span>
          <input
            type="date"
            className={input + " !w-auto"}
            value={to}
            min={from}
            max={t}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {presets.map(([l, f, e]) => (
            <button
              key={l}
              type="button"
              className={btn2 + " !text-xs"}
              onClick={() => {
                setFrom(f);
                setTo(e);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-start gap-2 mb-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">{rep.label}</h2>
            <p className="text-xs text-slate-500">{rep.hint}</p>
          </div>
          <button
            type="button"
            className={btn2}
            disabled={!rows.length}
            onClick={() =>
              downloadCSV(
                `${rep.id}_${from}_${to}.csv`,
                rows.map((r) => Object.fromEntries(rep.cols.map((c) => [c.label, r[c.key]])))
              )
            }
          >
            ⬇ CSV
          </button>
          <button
            type="button"
            className={btn2}
            disabled={pdfBusy}
            onClick={() => downloadSummaryPdf(from, to, `${from} to ${to}`)}
          >
            📄 PDF
          </button>
        </div>
        {busy ? (
          <p className="text-slate-500 text-sm py-6 text-center">Loading…</p>
        ) : err ? (
          <p className="text-red-500 text-sm">{err}</p>
        ) : (
          <Table cols={rep.cols} rows={rows} totals={rep.totals} />
        )}
      </div>

      <div className={`${card} flex items-center gap-3 flex-wrap`}>
        <p className="text-xs text-slate-500 flex-1">
          After ~6 months you can archive old detail. Daily totals stay in reports.
        </p>
        <button type="button" className={btn2} onClick={archive}>
          🗄 Archive &gt; 6 months
        </button>
      </div>
    </>
  );
}
