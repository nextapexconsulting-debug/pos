import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildShiftSummaryMessage } from "@/lib/shiftSummary";

/**
 * End-of-shift summary → Telegram (profit, expenses, stock).
 * Shop hours 2 PM → 9 AM IST. Cron: 0 4 * * * UTC ≈ 9:30 AM IST.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!botToken || !chatId) {
    return NextResponse.json({ error: "Telegram not configured" }, { status: 500 });
  }
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase service key not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let dayStr: string;
  const { data: bizDay, error: dayErr } = await supabase.rpc("today_business_ist");
  if (dayErr || !bizDay) {
    const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    ist.setHours(ist.getHours() - 14);
    dayStr = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  } else {
    dayStr = String(bizDay);
  }

  const { data: shops, error: shopsErr } = await supabase
    .from("shops")
    .select("id, name")
    .eq("status", "active");

  if (shopsErr) {
    return NextResponse.json({ error: shopsErr.message }, { status: 500 });
  }

  const results: { shop: string; ok: boolean; error?: string }[] = [];

  for (const shop of shops ?? []) {
    const { data: summary, error } = await supabase.rpc("daily_summary_for_shop", {
      p_shop: shop.id,
      p_day: dayStr,
    });

    if (error || !summary) {
      results.push({ shop: shop.name, ok: false, error: error?.message });
      continue;
    }

    const s = summary as {
      shop_name: string;
      day: string;
      orders: number;
      sales: number;
      cash: number;
      upi: number;
      unpaid: number;
      expenses: number;
      profit: number;
    };

    // Stock sheet for this shop (service role — query tables directly)
    const stock = await loadStockForShop(supabase, shop.id, dayStr);

    const message = buildShiftSummaryMessage(
      {
        day: s.day || dayStr,
        shopName: s.shop_name || shop.name,
        orders: Number(s.orders) || 0,
        sales: Number(s.sales) || 0,
        cash: Number(s.cash) || 0,
        upi: Number(s.upi) || 0,
        unpaid: Number(s.unpaid) || 0,
        expenses: Number(s.expenses) || 0,
        profit: Number(s.profit) || 0,
      },
      stock,
      { title: "SHIFT END SUMMARY" }
    );

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });
      const tgData = await tgRes.json();
      results.push({
        shop: shop.name,
        ok: !!tgData.ok,
        error: tgData.ok ? undefined : tgData.description,
      });
    } catch (e: any) {
      results.push({ shop: shop.name, ok: false, error: e.message });
    }
  }

  return NextResponse.json({ day: dayStr, results });
}

async function loadStockForShop(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  shopId: string,
  day: string
) {
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, unit")
    .eq("shop_id", shopId)
    .eq("active", true);

  type ItemRow = { id: string; name: string; unit: string | null };
  type QtyRow = { qty: number | null };
  type CloseRow = { closing_qty: number | null };

  const list = (items ?? []) as ItemRow[];
  if (!list.length) return [];

  const lines: {
    name: string;
    unit: string | null;
    opening: number;
    stock_in: number;
    closing: number | null;
    used: number | null;
  }[] = [];

  for (const item of list) {
    const { data: prevClose } = await supabase
      .from("stock_counts")
      .select("closing_qty")
      .eq("item_id", item.id)
      .lt("count_date", day)
      .order("count_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ins } = await supabase
      .from("stock_in")
      .select("qty")
      .eq("item_id", item.id)
      .eq("entry_date", day);

    const { data: todayClose } = await supabase
      .from("stock_counts")
      .select("closing_qty")
      .eq("item_id", item.id)
      .eq("count_date", day)
      .maybeSingle();

    const prev = prevClose as CloseRow | null;
    const insRows = (ins ?? []) as QtyRow[];
    const today = todayClose as CloseRow | null;

    const opening = Number(prev?.closing_qty ?? 0);
    const stock_in = insRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const closing =
      today?.closing_qty === null || today?.closing_qty === undefined
        ? null
        : Number(today.closing_qty);
    const used = closing === null ? null : opening + stock_in - closing;

    lines.push({
      name: item.name,
      unit: item.unit,
      opening,
      stock_in,
      closing,
      used,
    });
  }
  return lines;
}
