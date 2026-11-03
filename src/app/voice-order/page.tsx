"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase } from "@/lib/supabase";
import { Product, fetchShopProducts } from "@/lib/products";
import { parseSpokenOrder, suggestProducts, OrderItem } from "@/lib/parseOrder";
import { loadPrinterCfg, printOrderReceipt } from "@/lib/printer";
import { useT, productPrimary } from "@/lib/i18n";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function VoiceOrderPage() {
  const { t } = useT();
  return (
    <PageShell title={t("nav_voice_order")} roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const { t } = useT();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [isParcel, setIsParcel] = useState(false);
  const [isJain, setIsJain] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const productsRef = useRef<Product[]>([]);
  const wantListen = useRef(false);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchShopProducts();
        setProducts(list || []);
      } catch {
        setStatus("Could not load menu");
      }
    })();
  }, []);

  const mergeItems = useCallback((incoming: OrderItem[]) => {
    if (!incoming.length) return;
    setOrder((prev) => {
      const next = [...prev];
      for (const it of incoming) {
        const idx = next.findIndex((x) => x.product.id === it.product.id);
        if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + it.quantity };
        else next.push({ ...it });
      }
      return next;
    });
  }, []);

  const handleHeard = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setTranscript(clean);

      // 1) Gemini AI (server) when key is configured
      try {
        const res = await fetch("/api/voice-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: clean,
            menu: productsRef.current.map((p) => ({
              id: p.id,
              nameEn: p.nameEn,
              nameGu: p.nameGu,
              keywords: p.keywords,
              price: p.price,
            })),
          }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.items) && data.items.length > 0) {
          const byId = new Map(productsRef.current.map((p) => [p.id, p]));
          const matched: OrderItem[] = [];
          for (const row of data.items) {
            const product = byId.get(String(row.product_id));
            const qty = Math.max(1, Math.floor(Number(row.qty) || 1));
            if (product) matched.push({ product, quantity: qty });
          }
          if (matched.length) {
            mergeItems(matched);
            setSuggestions([]);
            setStatus(
              "AI: " + matched.map((m) => `${m.quantity}× ${m.product.nameEn}`).join(", ")
            );
            return;
          }
        }
        // 503 = no key — silent fall through to local
        if (res.status === 503) {
          /* local match */
        } else if (data.error && res.status !== 503) {
          setStatus("AI: " + data.error + " — trying local match…");
        }
      } catch {
        /* offline / network — local match */
      }

      // 2) Local fuzzy match
      const matched = parseSpokenOrder(clean, productsRef.current);
      if (matched.length) {
        mergeItems(matched);
        setSuggestions([]);
        setStatus(
          "Added: " + matched.map((m) => `${m.quantity}× ${m.product.nameEn}`).join(", ")
        );
      } else {
        const sug = suggestProducts(clean, productsRef.current, 6);
        setSuggestions(sug);
        setStatus(
          sug.length
            ? "Not sure — tap a product below (or speak again)"
            : "No match — speak closer to menu name, or type below"
        );
      }
    },
    [mergeItems]
  );

  const stopListen = useCallback(() => {
    wantListen.current = false;
    try {
      recRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  const startListen = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setStatus("Voice needs Chrome on Android / desktop. iPhone Safari is limited.");
      return;
    }
    stopListen();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.maxAlternatives = 3;
    rec.onresult = (ev: any) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
      }
      finalText = finalText.trim();
      if (finalText) handleHeard(finalText);
    };
    rec.onerror = (ev: any) => {
      const err = ev?.error || "error";
      if (err === "not-allowed") setStatus("Microphone permission denied");
      else if (err === "no-speech") setStatus("No speech — tap mic and speak");
      else setStatus("Mic: " + err);
      setListening(false);
      wantListen.current = false;
    };
    rec.onend = () => {
      if (wantListen.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
          wantListen.current = false;
        }
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    wantListen.current = true;
    try {
      rec.start();
      setListening(true);
      setStatus("Listening… speak items");
    } catch (e: any) {
      setStatus(e?.message || "Could not start mic");
      setListening(false);
      wantListen.current = false;
    }
  }, [handleHeard, stopListen]);

  useEffect(() => {
    return () => {
      wantListen.current = false;
      try {
        recRef.current?.abort();
      } catch {}
    };
  }, []);

  const setQty = (id: string, qty: number) => {
    setOrder((prev) =>
      prev
        .map((x) => (x.product.id === id ? { ...x, quantity: qty } : x))
        .filter((x) => x.quantity > 0)
    );
  };

  const total = order.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const confirm = async () => {
    if (!order.length) {
      setStatus("No items");
      return;
    }
    stopListen();
    setBusy(true);
    setStatus("Saving order…");
    const rpcArgs: Record<string, unknown> = {
      p_items: order.map((i) => ({
        product_id: i.product.id,
        name_en: i.product.nameEn,
        name_gu: i.product.nameGu,
        category: i.product.id.includes("pizza") ? "pizza" : "sandwich",
        price: i.product.price,
        qty: i.quantity,
      })),
      p_is_parcel: isParcel === true,
      p_is_jain: isJain === true,
      p_customer_name: customerName.trim() || null,
      p_customer_mobile: customerMobile.trim() || null,
    };
    const { data: saved, error } = await supabase.rpc("place_order", rpcArgs);
    if (error || !saved) {
      setStatus("Not saved: " + (error?.message || "error"));
      setBusy(false);
      return;
    }
    const orderNo = saved.order_no as number;
    const placedAt = new Date().toISOString();
    try {
      const pcfg = loadPrinterCfg();
      if (pcfg.enabled) {
        printOrderReceipt({
          orderNo,
          items: order.map((i) => ({
            name: i.product.nameEn,
            qty: i.quantity,
            price: i.product.price,
          })),
          total: saved.total,
          parcel: isParcel,
          jain: isJain,
          orderedAt: placedAt,
          customerName: customerName.trim() || undefined,
          customerMobile: customerMobile.trim() || undefined,
        });
      }
    } catch {}

    try {
      const { data: payCfg } = await supabase
        .from("shop_settings")
        .select("payment_redirect")
        .maybeSingle();
      if (payCfg?.payment_redirect) {
        const params = new URLSearchParams({
          orderNo: String(orderNo),
          total: String(saved.total),
          id: String(saved.order_id || ""),
        });
        router.push(`/pay?${params.toString()}`);
        return;
      }
    } catch {}

    setOrder([]);
    setIsParcel(false);
    setIsJain(false);
    setCustomerName("");
    setCustomerMobile("");
    setTranscript("");
    setStatus(`Order #${orderNo} saved · ₹${saved.total}`);
    setBusy(false);
  };

  const supported = typeof window !== "undefined" && !!getSpeechRecognition();

  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <p className="text-sm text-slate-600">
          Tap mic, speak items (e.g. “two cheese sandwich and one pizza”). Matches your menu.
          Fix qty if needed, then Okay.
        </p>
        {!supported && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            This browser has no speech recognition. Use Chrome on Android or desktop.
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          {!listening ? (
            <button type="button" className={btn} onClick={startListen} disabled={!supported}>
              🎤 Start listening
            </button>
          ) : (
            <button type="button" className={btn2} onClick={stopListen}>
              ⏹ Stop
            </button>
          )}
          {listening && (
            <span className="text-sm font-medium text-red-600 animate-pulse">Listening…</span>
          )}
        </div>
        {transcript && (
          <p className="text-xs text-slate-500">
            Heard: <span className="text-slate-800">{transcript}</span>
          </p>
        )}
        {status && <p className="text-sm text-slate-700">{status}</p>}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                className={btn2 + " !text-xs"}
                onClick={() => {
                  mergeItems([{ product: p, quantity: 1 }]);
                  setSuggestions([]);
                  setStatus("Added: 1× " + p.nameEn);
                }}
              >
                + {p.nameEn}
              </button>
            ))}
          </div>
        )}
        <div className="pt-2">
          <input
            className={input}
            placeholder="Type to search menu…"
            onChange={(e) => {
              const q = e.target.value.trim();
              if (q.length < 2) {
                setSuggestions([]);
                return;
              }
              const sug = suggestProducts(q, productsRef.current, 8);
              setSuggestions(sug);
            }}
          />
        </div>
      </div>

      <div className={`${card} space-y-2`}>
        <div className="text-sm font-semibold">{t("customer")}</div>
        <input
          className={input}
          placeholder={t("customer_name")}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
        <input
          className={input}
          placeholder={t("mobile_optional")}
          value={customerMobile}
          onChange={(e) => setCustomerMobile(e.target.value)}
          inputMode="tel"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${
              isParcel ? "bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
            onClick={() => setIsParcel((v) => !v)}
          >
            P
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${
              isJain ? "bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
            onClick={() => setIsJain((v) => !v)}
          >
            J
          </button>
        </div>
      </div>

      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold">{t("current_order")}</h2>
        {order.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">{t("no_items")}</p>
        ) : (
          <ul className="space-y-2">
            {order.map((item) => (
              <li
                key={item.product.id}
                className="flex items-center gap-2 border-b border-slate-100 pb-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{productPrimary(item.product)}</div>
                  <div className="text-xs text-slate-500">₹{item.product.price}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={btn2 + " !px-2 !py-1"}
                    onClick={() => setQty(item.product.id, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    className={btn2 + " !px-2 !py-1"}
                    onClick={() => setQty(item.product.id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <div className="w-16 text-right tabular-nums text-sm font-medium">
                  ₹{item.product.price * item.quantity}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between pt-2">
          <span className="font-semibold">
            {t("total")}: ₹{total}
          </span>
          <button
            type="button"
            className={btn}
            disabled={busy || order.length === 0}
            onClick={confirm}
          >
            {busy ? t("loading") : t("okay")}
          </button>
        </div>
        {order.length > 0 && (
          <button
            type="button"
            className="text-xs text-red-600 underline"
            onClick={() => {
              setOrder([]);
              setStatus("");
            }}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
