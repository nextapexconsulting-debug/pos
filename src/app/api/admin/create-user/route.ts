import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Creates a login. Needs the SERVICE ROLE key (server only – never expose it).
 *  - super_admin: can create a new shop + owner, or add any user to any shop
 *  - owner:       can only add STAFF to their own shop
 * shop_id / role are written to app_metadata, which users cannot forge.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server not configured (SUPABASE_SERVICE_ROLE_KEY)" }, { status: 500 });
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { data: me } = await admin.from("profiles").select("role,shop_id,is_blocked").eq("id", u.user.id).single();
  if (!me || me.is_blocked) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const b = await req.json();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!email || password.length < 6) return NextResponse.json({ error: "Email and a password of 6+ characters are required" }, { status: 400 });

  let shopId: string | null = null;
  let role: "owner" | "staff" = "staff";

  if (me.role === "super_admin") {
    role = b.role === "staff" ? "staff" : "owner";
    if (b.shop_id) shopId = b.shop_id;
    else {
      const { data: shop, error } = await admin.from("shops").insert({ name: String(b.shop_name || "New Shop") }).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      shopId = shop.id;
      await admin.rpc("seed_shop", { p_shop: shopId });
    }
  } else if (me.role === "owner" && me.shop_id) {
    shopId = me.shop_id; role = "staff";
  } else {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: b.full_name || null },
    app_metadata: { shop_id: shopId, role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, user_id: data.user.id, shop_id: shopId, role });
}
