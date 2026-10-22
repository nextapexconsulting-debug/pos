import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body.code || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").replace(/[^0-9]/g, "");
    const items = String(body.items || "").trim();

    if (!code || mobile.length < 10 || !items) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
    }

    const supabase = createClient(url, key);

    const { data: settings, error: sErr } = await supabase
      .from("shop_settings")
      .select("shop_id")
      .eq("public_order_code", code)
      .maybeSingle();

    if (sErr || !settings?.shop_id) {
      return NextResponse.json({ ok: false, error: "Invalid order link" }, { status: 404 });
    }

    const shopId = settings.shop_id;

    const { error: insErr } = await supabase.from("order_requests").insert({
      shop_id: shopId,
      customer_name: name || null,
      customer_mobile: mobile,
      items_text: items,
      status: "new",
    });

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    // Best-effort Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      const text = [
        "📲 <b>Online order request</b>",
        name ? `👤 ${name}` : "",
        `📱 ${mobile}`,
        "",
        items,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        });
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 500 });
  }
}
