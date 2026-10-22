"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase } from "@/lib/supabase";

function qrUrl(data: string, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

export default function MarketingPage() {
  return (
    <PageShell title="Marketing" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [ig, setIg] = useState("");
  const [wa, setWa] = useState("");
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
    (async () => {
      const { data } = await supabase.from("shop_settings").select("instagram_url,whatsapp_number,public_order_code").maybeSingle();
      if (data) {
        setIg(data.instagram_url || "");
        setWa(data.whatsapp_number || "");
        setCode(data.public_order_code || "");
      }
      const { data: c } = await supabase.rpc("ensure_public_order_code");
      if (c) setCode(String(c));
      const { data: reqs } = await supabase
        .from("order_requests")
        .select("id,customer_name,customer_mobile,items_text,status,created_at")
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .limit(20);
      setRequests(reqs || []);
    })();
  }, []);

  const igLink = useMemo(() => {
    const v = ig.trim();
    if (!v) return "";
    if (v.startsWith("http")) return v;
    const handle = v.replace(/^@/, "");
    return `https://instagram.com/${handle}`;
  }, [ig]);

  const waLink = useMemo(() => {
    const digits = wa.replace(/[^0-9]/g, "");
    if (digits.length < 10) return "";
    // India default 91 if 10 digits
    const full = digits.length === 10 ? `91${digits}` : digits;
    const text = encodeURIComponent("Hi! I want to place an order.");
    return `https://wa.me/${full}?text=${text}`;
  }, [wa]);

  const orderLink = code && origin ? `${origin}/r/${code}` : "";

  const save = async () => {
    setBusy(true);
    setMsg("");
    const { data: me } = await supabase.from("profiles").select("shop_id").maybeSingle();
    const sid = me?.shop_id;
    if (!sid) {
      setMsg("No shop");
      setBusy(false);
      return;
    }
    let pub = code;
    if (!pub) {
      const { data: c } = await supabase.rpc("ensure_public_order_code");
      pub = String(c || "");
      setCode(pub);
    }
    const { error } = await supabase.from("shop_settings").upsert({
      shop_id: sid,
      instagram_url: ig.trim() || null,
      whatsapp_number: wa.replace(/[^0-9]/g, "") || null,
      public_order_code: pub || null,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setMsg(error ? error.message : "Saved — print the QR codes below");
  };

  return (
    <>
      <p className="text-sm text-slate-600">
        Put these QR codes on the counter, parcel bag, or menu. Customer scans → Instagram, WhatsApp, or
        order form with <b>mobile number</b>.
      </p>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Links</h2>
        <div>
          <label className="text-xs text-slate-500">Instagram (@handle or full URL)</label>
          <input className={input} value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@krishnasandwich" />
        </div>
        <div>
          <label className="text-xs text-slate-500">WhatsApp number (for orders)</label>
          <input className={input} value={wa} onChange={(e) => setWa(e.target.value)} placeholder="9876543210" />
        </div>
        <button type="button" className={btn} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save & refresh QR"}
        </button>
        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {igLink && (
          <div className={`${card} text-center space-y-2`}>
            <div className="font-semibold text-sm">Instagram</div>
            <img src={qrUrl(igLink)} alt="Instagram QR" className="mx-auto w-40 h-40 bg-white" />
            <a href={igLink} target="_blank" rel="noreferrer" className="text-xs text-orange-600 break-all">
              {igLink}
            </a>
            <a href={qrUrl(igLink, 400)} download="instagram-qr.png" className={btn2 + " inline-block"}>
              Download QR
            </a>
          </div>
        )}
        {waLink && (
          <div className={`${card} text-center space-y-2`}>
            <div className="font-semibold text-sm">WhatsApp order</div>
            <img src={qrUrl(waLink)} alt="WhatsApp QR" className="mx-auto w-40 h-40 bg-white" />
            <p className="text-[11px] text-slate-500">Opens chat: “Hi! I want to place an order.”</p>
            <a href={qrUrl(waLink, 400)} download="whatsapp-order-qr.png" className={btn2 + " inline-block"}>
              Download QR
            </a>
          </div>
        )}
        {orderLink && (
          <div className={`${card} text-center space-y-2`}>
            <div className="font-semibold text-sm">Order by mobile (form)</div>
            <img src={qrUrl(orderLink)} alt="Order form QR" className="mx-auto w-40 h-40 bg-white" />
            <p className="text-[11px] text-slate-500 break-all">{orderLink}</p>
            <a href={qrUrl(orderLink, 400)} download="order-form-qr.png" className={btn2 + " inline-block"}>
              Download QR
            </a>
          </div>
        )}
      </div>

      {requests.length > 0 && (
        <div className={`${card} space-y-2`}>
          <h2 className="font-semibold text-sm">New order requests (from QR form)</h2>
          {requests.map((r) => (
            <div key={r.id} className="border border-orange-100 rounded-lg p-2 text-xs">
              <div className="font-medium">
                {r.customer_name || "Customer"} · {r.customer_mobile}
              </div>
              <div className="text-slate-600 whitespace-pre-wrap mt-1">{r.items_text}</div>
              <div className="text-slate-400 mt-1">
                {new Date(r.created_at).toLocaleString("en-IN")}
              </div>
              <button
                type="button"
                className="text-orange-600 mt-1 font-medium"
                onClick={async () => {
                  await supabase.from("order_requests").update({ status: "done" }).eq("id", r.id);
                  setRequests((prev) => prev.filter((x) => x.id !== r.id));
                }}
              >
                Mark done
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`${card} text-xs text-slate-500 space-y-1`}>
        <p>
          <b>Instagram QR</b> — follow / reels traffic.
        </p>
        <p>
          <b>WhatsApp QR</b> — customer messages you; you enter order in POS with their mobile (quick-pick).
        </p>
        <p>
          <b>Order form QR</b> — customer enters name, mobile, items; you get Telegram + list under Orders requests.
        </p>
      </div>
    </>
  );
}
