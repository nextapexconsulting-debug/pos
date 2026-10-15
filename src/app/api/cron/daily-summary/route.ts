import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Daily midnight summary → Telegram.
 * Vercel cron: 0 18 * * *  (18:00 UTC = 00:00 IST next day)
 * Secured by CRON_SECRET header.
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

  // Shop hours 2 PM → 9 AM. Run cron ~9:30 AM IST.
  // At that time today_business_ist() is the night that just closed.
  let dayStr: string;
  const { data: bizDay, error: dayErr } = await supabase.rpc("today_business_ist");
  if (dayErr || !bizDay) {
    const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    ist.setHours(ist.getHours() - 14);
    dayStr = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  } else {
    dayStr = String(bizDay);
  }

  // Get all active shops
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

    const message = `
══════════════════
📊 <b>દૈનિક સારાંશ</b>
<b>${s.day}</b>
══════════════════
🏪 <b>${s.shop_name || shop.name}</b>

🧾 ઓર્ડર: <b>${s.orders}</b>
💰 કુલ વેચાણ: <b>₹${Number(s.sales).toLocaleString("en-IN")}</b>
  💵 Cash: <b>₹${Number(s.cash).toLocaleString("en-IN")}</b>
  📱 UPI: <b>₹${Number(s.upi).toLocaleString("en-IN")}</b>
  ⏳ Unpaid: <b>₹${Number(s.unpaid).toLocaleString("en-IN")}</b>

📉 ખર્ચ: <b>₹${Number(s.expenses).toLocaleString("en-IN")}</b>
──────────────────
✅ <b>નફો: ₹${Number(s.profit).toLocaleString("en-IN")}</b>
──────────────────
`.trim();

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
