"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { useAccess } from "@/components/AuthGate";
import { supabase, todayIST, inr } from "@/lib/supabase";
import { Product, loadProducts, fetchShopProducts } from "@/lib/products";

interface Item {
  id?: string;
  product_id?: string;
  name_en: string;
  name_gu?: string;
  qty: number;
  price: number;
  line_total?: number;
  category?: string;
}

interface Order {
  id: string;
  order_no: number;
  created_at: string;
  total: number;
  status: string;
  payment_status: "paid" | "unpaid";
  payment_method: "cash" | "upi" | null;
  is_parcel?: boolean;
  is_jain?: boolean;
  order_items: Item[];
}

export default function EditOrderPage() {
  return (
    <PageShell title="Edit Order" roles={["owner", "staff"]}>
      <EditOrder />
    </PageShell>
  );
}

function EditOrder() {
  const me = useAccess();
  const [date, setDate] = useState(todayIST());
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [isParcel, setIsParcel] = useState(false);
  const [isJain, setIsJain] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [addProductId, setAddProductId] = useState("");

  useEffect(() => {
    setProducts(loadProducts());
    fetchShopProducts().then(setProducts).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id,order_no,created_at,total,status,payment_status,payment_method,is_parcel,is_jain,order_items(id,product_id,name_en,name_gu,qty,price,line_total,category)")
      .eq("order_date", date)
      .eq("status", "active")
      .order("order_no", { ascending: false });
    if (error) setErr(error.message);
    else {
      setErr("");
      setOrders((data as unknown as Order[]) ?? []);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const selectOrder = (o: Order) => {
    setSelected(o);
    setItems(o.order_items.map((i) => ({ ...i })));
    setIsParcel(o.is_parcel === true);
    setIsJain(o.is_jain === true);
    setMsg("");
  };

  const updateQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((it, i) =>
          i === idx ? { ...it, qty: Math.max(0, it.qty + delta) } : it
        )
        .filter((it) => it.qty > 0)
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addProduct = () => {
    if (!addProductId) return;
    const p = products.find((x) => x.id === addProductId);
    if (!p) return;
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.product_id === p.id || i.name_en === p.nameEn);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], qty: next[existing].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name_en: p.nameEn,
          name_gu: p.nameGu,
          price: p.price,
          qty: 1,
          category: p.id.includes("pizza") ? "pizza" : "sandwich",
        },
      ];
    });
    setAddProductId("");
  };

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  const save = async () => {
    if (!selected || items.length === 0) {
      setMsg("Order must have at least one item");
      return;
    }
    setBusy(true);
    setMsg("");
    const parcelOn = isParcel === true;
    const jainOn = isJain === true;
    const { data, error } = await supabase.rpc("update_order", {
      p_order: selected.id,
      p_items: items.map((i) => ({
        product_id: i.product_id || null,
        name_en: i.name_en,
        name_gu: i.name_gu || i.name_en,
        category: i.category || "sandwich",
        price: i.price,
        qty: i.qty,
      })),
      p_is_parcel: parcelOn ? true : false,
      p_is_jain: jainOn ? true : false,
    });
    setBusy(false);
    if (error) {
      setMsg(`❌ ${error.message}`);
      return;
    }
    setMsg(`✅ Order #${selected.order_no} updated · ₹${data?.total ?? total}`);

    const itemsText = items
      .map((i) => `• <b>${i.name_gu || i.name_en}</b>\n    ${i.qty} × ₹${i.price} = <b>₹${i.price * i.qty}</b>`)
      .join("\n\n");
    const lines = [
      "══════════════════",
      `✏️ <b>ઓર્ડર અપડેટ</b>`,
      `<b>#${selected.order_no}</b>`,
      "══════════════════",
    ];
    if (parcelOn) {
      lines[2] = `<b>#${selected.order_no}  [P]</b>`;
      lines.push("📦 <b>પાર્સલ (P)</b>");
    }
    if (jainOn) {
      lines[2] = parcelOn
        ? `<b>#${selected.order_no}  [PJ]</b>`
        : `<b>#${selected.order_no}  [J]</b>`;
      lines.push("🥗 <b>જૈન (J)</b>");
    }
    lines.push("", itemsText, "", "──────────────────", `💰 <b>કુલ: ₹${data?.total ?? total}</b>`, "──────────────────");
    const message = lines.join("\n");

    try {
      await fetch("/api/send-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderText: message, orderNumber: selected.order_no }),
      });
    } catch {}

    setSelected(null);
    load();
  };

  return (
    <>
      <div className="flex gap-2 items-center flex-wrap">
        {me.role === "owner" ? (
          <input
            type="date"
            className={input + " !w-auto"}
            value={date}
            max={todayIST()}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected(null);
            }}
          />
        ) : (
          <span className="text-sm text-slate-500">Today</span>
        )}
        <button className={btn2 + " ml-auto"} onClick={load}>
          ↻ Refresh
        </button>
      </div>
      {err && <p className="text-red-500 text-sm">{err}</p>}
      {msg && <p className="text-sm pos-text-dark pos-soft-bg border pos-border rounded-lg px-3 py-2">{msg}</p>}

      {!selected ? (
        <>
          <p className="text-sm text-slate-500">Select an order to edit items, quantities, Parcel (P) or Jain (J).</p>
          {orders.length === 0 && <p className="text-slate-400 text-center py-10 text-sm">No active orders</p>}
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => selectOrder(o)}
              className={`${card} w-full text-left hover:pos-border transition-colors`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold">#{o.order_no}</span>
                {(o.is_parcel === true || o.is_jain === true) && (
                  <span className="text-xs font-bold pos-text">
                    [{[o.is_parcel === true ? "P" : null, o.is_jain === true ? "J" : null].filter(Boolean).join("")}]
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {new Date(o.created_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
                <span className="ml-auto font-bold pos-text">{inr(o.total)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {o.order_items.map((i) => `${i.qty}× ${i.name_en}`).join(", ")}
              </div>
            </button>
          ))}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button className={btn2} onClick={() => setSelected(null)}>
              ← Back
            </button>
            <h2 className="font-semibold text-lg">Editing #{selected.order_no}</h2>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsParcel((v) => !v)}
              className={`flex-1 text-sm font-bold py-2 rounded-lg border ${
                isParcel ? "pos-btn text-white border-[var(--pos-primary)]" : "bg-white text-slate-600 pos-border"
              }`}
            >
              📦 P · Parcel
            </button>
            <button
              type="button"
              onClick={() => setIsJain((v) => !v)}
              className={`flex-1 text-sm font-bold py-2 rounded-lg border ${
                isJain ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 pos-border"
              }`}
            >
              🥗 J · Jain
            </button>
          </div>

          <div className={`${card} space-y-2`}>
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 border-b border-[var(--pos-soft)] pb-2 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.name_en}</div>
                  <div className="text-xs text-slate-500">₹{item.price} each</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(idx, -1)}
                    className="w-7 h-7 rounded-full pos-soft-bg pos-text-dark flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold text-sm">{item.qty}</span>
                  <button
                    onClick={() => updateQty(idx, 1)}
                    className="w-7 h-7 rounded-full pos-soft-bg pos-text-dark flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <div className="pos-text font-semibold text-sm min-w-[48px] text-right">
                  ₹{item.price * item.qty}
                </div>
                <button onClick={() => removeItem(idx)} className="text-xs text-red-500">
                  ✕
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No items</p>}
          </div>

          <div className={`${card} flex gap-2 items-end`}>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Add product</label>
              <select
                className={input}
                value={addProductId}
                onChange={(e) => setAddProductId(e.target.value)}
              >
                <option value="">Select…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameEn} · ₹{p.price}
                  </option>
                ))}
              </select>
            </div>
            <button className={btn2} onClick={addProduct} disabled={!addProductId}>
              + Add
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-lg font-bold pos-text">Total: ₹{total}</span>
            <button className={btn} onClick={save} disabled={busy || items.length === 0}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
