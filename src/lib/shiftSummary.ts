/** Build end-of-shift Telegram HTML message */

export type ShiftMoney = {
  day: string;
  shopName?: string;
  orders: number;
  sales: number;
  cash: number;
  upi: number;
  unpaid: number;
  expenses: number;
  profit: number;
};

export type ShiftStockLine = {
  name: string;
  unit?: string;
  opening: number;
  stock_in: number;
  closing: number | null;
  used: number | null;
};

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function buildShiftSummaryMessage(
  money: ShiftMoney,
  stock: ShiftStockLine[],
  opts?: { title?: string }
): string {
  const title = opts?.title || "SHIFT END SUMMARY";
  const stockLines =
    stock.length === 0
      ? "No stock counts recorded"
      : stock
          .map((r) => {
            const close = r.closing === null || r.closing === undefined ? "?" : String(r.closing);
            const used = r.used === null || r.used === undefined ? "—" : String(r.used);
            const unit = r.unit ? ` ${r.unit}` : "";
            return `• <b>${r.name}</b>${unit}\n   Open ${r.opening} · +In ${r.stock_in} · Close ${close} · Used ${used}`;
          })
          .join("\n");

  return `
══════════════════
🏁 <b>${title}</b>
📅 <b>${money.day}</b>
══════════════════
${money.shopName ? `🏪 <b>${money.shopName}</b>\n` : ""}
🧾 Orders: <b>${money.orders}</b>
💰 Sales: <b>${inr(money.sales)}</b>
  💵 Cash: <b>${inr(money.cash)}</b>
  📱 UPI: <b>${inr(money.upi)}</b>
  ⏳ Unpaid: <b>${inr(money.unpaid)}</b>

📉 Expenses: <b>${inr(money.expenses)}</b>
──────────────────
✅ <b>Profit: ${inr(money.profit)}</b>
──────────────────
📦 <b>Stock (day sheet)</b>
${stockLines}
══════════════════
`.trim();
}
