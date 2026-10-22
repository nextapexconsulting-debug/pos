"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Product, loadProducts, fetchShopProducts } from "@/lib/products";
import { supabase } from "@/lib/supabase";
import AuthGate from "@/components/AuthGate";
import AppHeader from "@/components/AppHeader";
import { loadPrinterCfg, printOrderReceipt } from "@/lib/printer";
import {
  OrderItem,
  parseSpokenOrder,
  mergeOrderItems,
  calculateTotal,
} from "@/lib/parseOrder";

export default function Page() {
  return (
    <AuthGate roles={["owner", "staff"]}>
      <VoicePOS />
    </AuthGate>
  );
}

function VoicePOS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [status, setStatus] = useState<string>("Ready");
  const [error, setError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ id: string; no: number; total: number; paid?: string; items: { name: string; qty: number; price: number }[]; parcel?: boolean; jain?: boolean; orderedAt?: string; customerName?: string; customerMobile?: string } | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [priceTab, setPriceTab] = useState<string>("all");
  const [isParcel, setIsParcel] = useState(false);
  const [isJain, setIsJain] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerHint, setCustomerHint] = useState("");
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Mobile bottom-sheet drag
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef(0);

  const onSheetTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragDelta.current = 0;
  };
  const onSheetTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    dragDelta.current = e.touches[0].clientY - dragStartY.current;
  };
  const onSheetTouchEnd = () => {
    if (dragStartY.current === null) return;
    const d = dragDelta.current;
    dragStartY.current = null;
    // swipe up (negative delta) → expand; swipe down → collapse
    if (d < -40) setSheetExpanded(true);
    else if (d > 40) setSheetExpanded(false);
  };

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const productsRef = useRef<Product[]>([]);
  const wantListeningRef = useRef(false); // keeps mic alive on mobile (auto-restart)
  const isMobileRef = useRef(false);

  useEffect(() => {
    // Fast paint from cache, then refresh from shop DB
    const cached = loadProducts();
    setProducts(cached);
    productsRef.current = cached;

    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await fetchShopProducts();
        if (cancelled) return;
        setProducts(list);
        productsRef.current = list;
      } catch (e) {
        console.warn("Could not load shop menu", e);
      }
    };
    refresh();

    // When user comes back to this tab/device, pull latest prices from shop menu
    const onFocus = () => { refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    isMobileRef.current = mobile;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    const supported = !!SpeechRecognitionAPI;
    setIsSupported(supported);

    if (!supported) {
      // iOS Safari does not support Web Speech API
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      setError(
        isIOS
          ? "Voice not supported on iPhone Safari. Use Chrome on Android, or search/tap products."
          : "Speech Recognition not supported. Use Chrome or Edge, or search/tap products."
      );
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    // continuous=true is unreliable on many mobile browsers – use false + auto-restart
    recognition.continuous = !mobile;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    let lastInterim = "";

    const processSpoken = (spoken: string) => {
      const cleaned = spoken.trim();
      if (!cleaned) return;
      setTranscript((prev) => (prev ? prev + " " + cleaned : cleaned));
      setInterimTranscript("");

      const parsed = parseSpokenOrder(cleaned, productsRef.current);
      if (parsed.length > 0) {
        setOrder((prev) => mergeOrderItems(prev, parsed));
        const names = parsed
          .map((p) => `${p.quantity} × ${p.product.nameEn}`)
          .join(", ");
        setLastAdded(names);
        setStatus(`Added: ${names}`);
      } else {
        setStatus(`Heard: "${cleaned}" (no match – try full name)`);
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
      setStatus("Listening... Speak product name");
      setError(null);
      lastInterim = "";
    };

    recognition.onend = () => {
      // Process any leftover interim text
      if (lastInterim.trim()) {
        processSpoken(lastInterim);
        lastInterim = "";
      }

      // Mobile: browser stops after each phrase – auto-restart if user still wants listening
      if (wantListeningRef.current) {
        setTimeout(() => {
          if (!wantListeningRef.current || !recognitionRef.current) return;
          try {
            recognitionRef.current.start();
          } catch {
            // already starting
          }
        }, 280);
      } else {
        setIsListening(false);
        setStatus("Stopped");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech error:", event.error);
      const err = event.error;

      if (err === "aborted") return;

      if (err === "not-allowed") {
        wantListeningRef.current = false;
        setIsListening(false);
        setError("Microphone blocked. Allow mic in browser settings and tap 🎤 again.");
        return;
      }
      if (err === "no-speech") {
        // keep listening on mobile via onend restart; just show tip
        setStatus("No speech – speak again");
        return;
      }
      if (err === "network") {
        // network errors are common on mobile; don't kill the session hard
        setStatus("Network hiccup – speak again");
        return;
      }
      if (err === "audio-capture") {
        wantListeningRef.current = false;
        setIsListening(false);
        setError("No microphone found. Check phone mic permissions.");
        return;
      }
      // Other errors: stop so user can retry
      wantListeningRef.current = false;
      setIsListening(false);
      setError(`Speech error: ${err}. Tap mic to retry.`);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        lastInterim = interim;
        setInterimTranscript(interim);
      }

      if (final.trim()) {
        lastInterim = "";
        processSpoken(final.trim());
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      try { recognition.stop(); } catch {}
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setTranscript("");
    setInterimTranscript("");
    setLastAdded(null);
    setError(null);
    wantListeningRef.current = true;
    try {
      recognitionRef.current.start();
    } catch {
      // If already started, stop then start fresh (mobile quirk)
      try {
        recognitionRef.current.stop();
      } catch {}
      setTimeout(() => {
        if (!wantListeningRef.current || !recognitionRef.current) return;
        try {
          recognitionRef.current.start();
        } catch {}
      }, 200);
    }
  }, []);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {}
    setIsListening(false);
    setStatus("Stopped");
  }, []);

  const toggleListening = () => {
    if (isListening || wantListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setOrder((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setOrder((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearOrder = () => {
    setOrder([]);
    setTranscript("");
    setLastAdded(null);
    setIsParcel(false);
    setIsJain(false);
    setStatus("Order cleared");
  };


  // Customer quick-pick: mobile → known name
  useEffect(() => {
    const digits = customerMobile.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      setCustomerHint("");
      return;
    }
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      try {
        const key = digits.length >= 10 ? digits.slice(-10) : digits;
        // Stored mobiles are digit-only from upsert_customer
        let row: { name: string; mobile: string } | null = null;
        const { data: exact } = await supabase
          .from("customers")
          .select("name, mobile")
          .eq("mobile", digits)
          .maybeSingle();
        row = exact;
        if (!row && key !== digits) {
          const { data: by10 } = await supabase
            .from("customers")
            .select("name, mobile")
            .eq("mobile", key)
            .maybeSingle();
          row = by10;
        }
        if (!row) {
          const { data: list } = await supabase
            .from("customers")
            .select("name, mobile")
            .like("mobile", `%${key}`)
            .limit(5);
          row = (list || []).find((c) => (c.mobile || "").endsWith(key)) || null;
        }
        if (row?.name) {
          setCustomerName((prev) => (prev.trim() ? prev : row!.name));
          setCustomerHint(`Known customer: ${row.name}`);
        } else {
          setCustomerHint("New customer");
        }
      } catch {
        setCustomerHint("");
      }
    }, 400);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [customerMobile]);

  const confirmOrder = async () => {
    if (order.length === 0) {
      setStatus("No items in order");
      return;
    }

    setIsSending(true);
    setStatus("Saving order...");

    // P / J ONLY if user turned the toggle ON (default off every order)
    const parcelOn = isParcel === true;
    const jainOn = isJain === true;

    const rpcArgs: Record<string, unknown> = {
      p_items: order.map((i) => ({
        product_id: i.product.id,
        name_en: i.product.nameEn,
        name_gu: i.product.nameGu,
        category: i.product.id.includes("pizza") ? "pizza" : "sandwich",
        price: i.product.price,
        qty: i.quantity,
      })),
      p_is_parcel: false,
      p_is_jain: false,
    };
    // Only set true when button was pressed — never leave undefined/null
    if (parcelOn) rpcArgs.p_is_parcel = true;
    if (jainOn) rpcArgs.p_is_jain = true;
    if (customerName.trim()) rpcArgs.p_customer_name = customerName.trim();
    if (customerMobile.trim()) rpcArgs.p_customer_mobile = customerMobile.trim();

    const { data: saved, error: saveErr } = await supabase.rpc("place_order", rpcArgs);

    if (saveErr || !saved) {
      setStatus(`❌ Not saved: ${saveErr?.message ?? "unknown error"}`);
      setIsSending(false);
      return;
    }
    const newOrderNumber: number = saved.order_no;
    const placedAt = new Date().toISOString();
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("New order #" + newOrderNumber, {
          body: "Total Rs " + saved.total,
          icon: "/icon-192.png",
        });
      }
    } catch {}
    const custName = customerName.trim() || undefined;
    const custMobile = customerMobile.trim() || undefined;
    setLastOrder({
      id: saved.order_id,
      no: newOrderNumber,
      total: saved.total,
      items: order.map((i) => ({ name: i.product.nameEn, qty: i.quantity, price: i.product.price })),
      parcel: parcelOn,
      jain: jainOn,
      orderedAt: placedAt,
      customerName: custName,
      customerMobile: custMobile,
    });

    const now = new Date();
    const timeStr = now.toLocaleTimeString("gu-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    try {
      const pcfg = loadPrinterCfg();
      if (pcfg.enabled) {
        printOrderReceipt({
          orderNo: newOrderNumber,
          items: order.map((i) => ({ name: i.product.nameEn, qty: i.quantity, price: i.product.price })),
          total,
          parcel: parcelOn,
          jain: jainOn,
          orderedAt: placedAt,
          customerName: custName,
          customerMobile: custMobile,
        });
      }
    } catch {}

        const itemsText = order
      .map(
        (i) =>
          `• <b>${i.product.nameGu}</b>\n    ${i.quantity} × ₹${i.product.price} = <b>₹${i.product.price * i.quantity}</b>`
      )
      .join("\n\n");

    // Telegram: NO [P] / [J] / પાર્સલ / જૈન unless toggle was ON
    const lines = [
      "══════════════════",
      `🆕 <b>નવો ઓર્ડર</b>`,
      `<b>#${newOrderNumber}</b>`,
      "══════════════════",
      `⏰ <b>${timeStr}</b>`,
    ];
    if (parcelOn) {
      lines[2] = `<b>#${newOrderNumber}  [P]</b>`;
      lines.push("📦 <b>પાર્સલ (P)</b>");
    }
    if (jainOn) {
      if (parcelOn) lines[2] = `<b>#${newOrderNumber}  [PJ]</b>`;
      else lines[2] = `<b>#${newOrderNumber}  [J]</b>`;
      lines.push("🥗 <b>જૈન (J)</b>");
    }
    lines.push("", itemsText, "", "──────────────────", `💰 <b>કુલ: ₹${total}</b>`, "──────────────────", "📌 સ્થિતિ: <b>નવો</b>");
    const message = lines.join("\n");

    try {
      const res = await fetch("/api/send-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderText: message,
          orderNumber: newOrderNumber,
        }),
      });

      const data = await res.json();
      setStatus(
        data.success
          ? `✅ Order #${newOrderNumber} saved & sent to Telegram`
          : `✅ Order #${newOrderNumber} saved (Telegram: ${data.error})`
      );
    } catch (err: any) {
      setStatus(`✅ Order #${newOrderNumber} saved (Telegram offline)`);
    } finally {
      setOrder([]);
      setTranscript("");
      setLastAdded(null);
      setIsParcel(false);
      setIsJain(false);
      setCustomerName("");
      setCustomerMobile("");
      setIsSending(false);
    }
  };

  const markPaid = async (method: "cash" | "upi") => {
    if (!lastOrder) return;
    const { error } = await supabase.rpc("set_payment", { p_order: lastOrder.id, p_method: method });
    if (error) setStatus(`❌ ${error.message}`);
    else {
      setStatus(`💰 Order #${lastOrder.no} paid by ${method.toUpperCase()}`);
      setLastOrder({ ...lastOrder, paid: method });
    }
  };

  const addProductManually = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setOrder((prev) => mergeOrderItems(prev, [{ product, quantity: 1 }]));
    setLastAdded(`1 × ${product.nameEn}`);
    setStatus(`Added: 1 × ${product.nameEn}`);
  };

  const total = calculateTotal(order);

  const PRICE_TABS = [
    { id: "all", label: "All" },
    { id: "0-50", label: "≤ ₹50" },
    { id: "51-100", label: "₹51–100" },
    { id: "101-150", label: "₹101–150" },
    { id: "151-200", label: "₹151–200" },
    { id: "201+", label: "> ₹200" },
  ] as const;

  const filteredProducts = products.filter((p) => {
    // Search filter (English, Gujarati, keywords)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const hit =
        p.nameEn.toLowerCase().includes(q) ||
        p.nameGu.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (priceTab === "all") return true;
    if (priceTab === "0-50") return p.price <= 50;
    if (priceTab === "51-100") return p.price > 50 && p.price <= 100;
    if (priceTab === "101-150") return p.price > 100 && p.price <= 150;
    if (priceTab === "151-200") return p.price > 150 && p.price <= 200;
    if (priceTab === "201+") return p.price > 200;
    return true;
  });

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col pb-36 md:pb-0">
      <AppHeader title="New Order" breadcrumb="New Order" />

      <main className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full min-h-0">
        {/* Left: Voice + Products */}
        <section className="flex-1 p-3 flex flex-col gap-3 min-h-0 overflow-hidden">
          {lastOrder && (
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-200 flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">Order #{lastOrder.no} · ₹{lastOrder.total}</div>
                <div className="text-xs text-slate-500">
                  {lastOrder.paid ? `Paid by ${lastOrder.paid.toUpperCase()} ✓` : "Mark payment (or do it later from Orders)"}
                </div>
              </div>
              {!lastOrder.paid && (
                <>
                  <button type="button" onClick={() => markPaid("cash")} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-2 rounded-lg">💵 Cash</button>
                  <button type="button" onClick={() => markPaid("upi")} className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold px-3 py-2 rounded-lg">📱 UPI</button>
                </>
              )}
              <button
                type="button"
                onClick={() =>
                  printOrderReceipt({
                    orderNo: lastOrder.no,
                    items: lastOrder.items,
                    total: lastOrder.total,
                    parcel: lastOrder.parcel,
                    jain: lastOrder.jain,
                    orderedAt: lastOrder.orderedAt,
                    customerName: lastOrder.customerName,
                    customerMobile: lastOrder.customerMobile,
                  })
                }
                className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-2 rounded-lg"
              >
                🖨 Print
              </button>
              <button type="button" onClick={() => setLastOrder(null)} className="text-slate-400 hover:text-slate-600 px-1">✕</button>
            </div>
          )}

          {/* Mic Control */}
          <div className="bg-orange-50 rounded-xl p-3 flex items-center gap-4 border border-orange-200 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleListening();
              }}
              disabled={!isSupported}
              className={`relative w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all shrink-0 touch-manipulation ${
                isListening
                  ? "mic-active mic-pulse bg-orange-500 text-white"
                  : "bg-white border-2 border-orange-400 text-orange-600 hover:bg-orange-100"
              } ${!isSupported ? "opacity-50 cursor-not-allowed" : ""}`}
              aria-label={isListening ? "Stop listening" : "Start voice"}
            >
              {isListening ? "🎙️" : "🎤"}
            </button>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium truncate ${
                  isListening ? "text-orange-600" : "text-slate-500"
                }`}
              >
                {status}
              </p>
              {(transcript || interimTranscript) && (
                <p className="text-xs text-slate-500 truncate">
                  {transcript}{" "}
                  <span className="italic text-slate-400">{interimTranscript}</span>
                </p>
              )}
              {lastAdded && (
                <p className="text-xs text-orange-600 truncate">✓ {lastAdded}</p>
              )}
              {error && <p className="text-xs text-red-500 truncate">{error}</p>}
            </div>
          </div>

          {/* Search + Price Tabs + Products */}
          
          {/* Review order + customer — above menu */}
          <div className="bg-white rounded-xl border border-orange-200 p-3 shadow-sm shrink-0 space-y-2">
            <div className="text-sm font-semibold text-slate-800">Review order</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                className="bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-orange-500"
                placeholder="Customer name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input
                type="tel"
                inputMode="numeric"
                className="bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-orange-500"
                placeholder="Mobile number (optional)"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
              />
            </div>
            {customerHint && (
              <p className={`text-xs ${customerHint.startsWith("Known") ? "text-emerald-600" : "text-slate-400"}`}>
                {customerHint}
              </p>
            )}
            {order.length === 0 ? (
              <p className="text-xs text-slate-400">Add items from the menu below</p>
            ) : (
              <ul className="text-sm max-h-28 overflow-y-auto divide-y divide-orange-50">
                {order.map((item) => (
                  <li key={item.product.id} className="py-1.5 flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-medium">{item.product.nameEn}</span>
                      <span className="text-slate-400 text-xs ml-1">{item.product.nameGu}</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="w-7 h-7 rounded-lg bg-orange-50 text-orange-700 font-bold"
                        onClick={() => {
                          setOrder((prev) =>
                            prev
                              .map((x) =>
                                x.product.id === item.product.id
                                  ? { ...x, quantity: x.quantity - 1 }
                                  : x
                              )
                              .filter((x) => x.quantity > 0)
                          );
                        }}
                      >
                        −
                      </button>
                      <span className="w-6 text-center tabular-nums font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        className="w-7 h-7 rounded-lg bg-orange-50 text-orange-700 font-bold"
                        onClick={() => {
                          setOrder((prev) =>
                            prev.map((x) =>
                              x.product.id === item.product.id
                                ? { ...x, quantity: x.quantity + 1 }
                                : x
                            )
                          );
                        }}
                      >
                        +
                      </button>
                    </div>
                    <span className="w-14 text-right tabular-nums text-orange-600 font-semibold shrink-0">
                      ₹{item.product.price * item.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {order.length > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-orange-100">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold text-orange-600">₹{calculateTotal(order)}</span>
              </div>
            )}
          </div>

<div className="bg-white rounded-xl border border-orange-200 flex flex-col flex-1 min-h-0 overflow-hidden shadow-sm">
            {/* Search bar */}
            <div className="p-2 border-b border-orange-100 shrink-0 bg-orange-50">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search product (English / Gujarati)..."
                  className="w-full bg-white border border-orange-200 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-orange-100 text-orange-600 text-xs font-bold"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-1 p-2 border-b border-orange-100 overflow-x-auto shrink-0 bg-orange-50">
              {PRICE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPriceTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    priceTab === tab.id
                      ? "bg-orange-500 text-white"
                      : "bg-white text-slate-600 hover:bg-orange-100 border border-orange-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredProducts.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  {searchQuery.trim()
                    ? `No products match "${searchQuery}"`
                    : "No products in this range"}
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProductManually(p.id)}
                      className="bg-white hover:bg-orange-50 active:bg-orange-100 border border-orange-200 rounded-xl px-3 py-3 text-left transition-colors shadow-sm"
                    >
                      <div className="text-sm font-medium leading-tight text-slate-800">
                        {p.nameEn}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {p.nameGu}
                      </div>
                      <div className="text-orange-600 text-sm font-bold mt-1">
                        ₹{p.price}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right: Current Order – sticky on mobile via fixed bottom bar */}
        <section className="hidden md:flex w-full md:w-96 bg-orange-50 border-t md:border-t-0 md:border-l border-orange-200 flex-col max-h-[50vh] md:max-h-none">
          <div className="p-3 border-b border-orange-200 flex items-center gap-2 shrink-0 bg-white">
            <h2 className="font-semibold flex-1 text-slate-800">Current Order</h2>
            {order.length > 0 && (
              <button
                onClick={clearOrder}
                className="text-xs text-red-500 hover:text-red-600 px-2"
              >
                Clear
              </button>
            )}
            <button
              onClick={confirmOrder}
              disabled={order.length === 0 || isSending}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {isSending ? "Sending..." : "Okay"}
            </button>
          </div>

          {/* P / J toggles */}
          <div className="px-3 py-2 flex gap-2 border-b border-orange-100 bg-white">
            <button
              type="button"
              onClick={() => setIsParcel((v) => !v)}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                isParcel
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-slate-600 border-orange-200 hover:bg-orange-50"
              }`}
            >
              {isParcel ? "📦 P ✓ Parcel" : "P"}
            </button>
            <button
              type="button"
              onClick={() => setIsJain((v) => !v)}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                isJain
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-slate-600 border-orange-200 hover:bg-orange-50"
              }`}
            >
              {isJain ? "🥗 J ✓ Jain" : "J"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {order.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                <div className="text-3xl mb-1">🛒</div>
                <p className="text-sm">No items yet</p>
                <p className="text-xs mt-1">Tap products or use mic</p>
              </div>
            ) : (
              order.map((item) => (
                <div
                  key={item.product.id}
                  className="bg-white rounded-xl p-2.5 flex items-center gap-2 border border-orange-200 shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate text-slate-800">
                      {item.product.nameEn}
                    </div>
                    <div className="text-xs text-slate-500">
                      ₹{item.product.price} each
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 flex items-center justify-center text-base"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-semibold text-sm text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 flex items-center justify-center text-base"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right min-w-[48px]">
                    <div className="font-semibold text-orange-600 text-sm">
                      ₹{item.product.price * item.quantity}
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-[10px] text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-orange-200 bg-white flex items-center justify-between shrink-0">
            <span className="text-slate-600 font-medium">Total</span>
            <span className="font-bold text-xl text-orange-600">₹{total}</span>
          </div>
        </section>
      </main>

      {/* Mobile bottom sheet – collapsed: chips + Okay; expanded: full list with +/- */}
      <div
        ref={sheetRef}
        className={`md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t-2 border-orange-400 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] transition-[max-height] duration-300 ease-out flex flex-col ${
          sheetExpanded ? "max-h-[75vh]" : "max-h-[42vh]"
        }`}
      >
        {/* Drag handle – tap or swipe up/down */}
        <div
          className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none shrink-0"
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
          onClick={() => setSheetExpanded((v) => !v)}
        >
          <div className="w-10 h-1 rounded-full bg-orange-300 mb-1" />
          <span className="text-[10px] text-slate-400 font-medium">
            {sheetExpanded ? "▼ swipe down to collapse" : "▲ swipe up for + / −"}
          </span>
        </div>

        {/* Flags */}
        <div className="flex gap-2 px-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsParcel((v) => !v)}
            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border ${
              isParcel
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-slate-600 border-orange-200"
            }`}
          >
            📦 P
          </button>
          <button
            type="button"
            onClick={() => setIsJain((v) => !v)}
            className={`flex-1 text-xs font-bold py-1.5 rounded-lg border ${
              isJain
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-slate-600 border-orange-200"
            }`}
          >
            🥗 J
          </button>
        </div>

        {/* Collapsed: horizontal chips */}
        {!sheetExpanded && order.length > 0 && (
          <div
            className="px-3 py-1.5 flex gap-2 overflow-x-auto text-xs text-slate-600 shrink-0"
            onClick={() => setSheetExpanded(true)}
          >
            {order.map((i) => (
              <span
                key={i.product.id}
                className="shrink-0 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5"
              >
                {i.quantity}× {i.product.nameEn}
              </span>
            ))}
          </div>
        )}

        {/* Expanded: full list with + / − (scrollable) */}
        {sheetExpanded && (
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {order.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">No items yet</p>
            ) : (
              order.map((item) => (
                <div
                  key={item.product.id}
                  className="bg-orange-50 rounded-xl p-2.5 flex items-center gap-2 border border-orange-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate text-slate-800">
                      {item.product.nameEn}
                    </div>
                    <div className="text-xs text-slate-500">
                      ₹{item.product.price} each
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="w-8 h-8 rounded-full bg-white border border-orange-300 text-orange-700 flex items-center justify-center text-lg font-bold active:bg-orange-100"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-semibold text-sm text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="w-8 h-8 rounded-full bg-white border border-orange-300 text-orange-700 flex items-center justify-center text-lg font-bold active:bg-orange-100"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right min-w-[44px]">
                    <div className="font-semibold text-orange-600 text-sm">
                      ₹{item.product.price * item.quantity}
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-[10px] text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Always-visible footer: total + Okay */}
        <div className="flex items-center gap-2 p-3 border-t border-orange-100 shrink-0 bg-white">
          <div className="flex-1" onClick={() => setSheetExpanded((v) => !v)}>
            <div className="text-xs text-slate-500">
              {order.length} item{order.length === 1 ? "" : "s"}
              {!sheetExpanded && order.length > 0 ? " · tap to edit" : ""}
            </div>
            <div className="text-lg font-bold text-orange-600">₹{total}</div>
          </div>
          {order.length > 0 && (
            <button onClick={clearOrder} className="text-xs text-red-500 px-2 py-2">
              Clear
            </button>
          )}
          <button
            onClick={confirmOrder}
            disabled={order.length === 0 || isSending}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base px-6 py-3 rounded-xl transition-colors shadow-md"
          >
            {isSending ? "..." : "Okay"}
          </button>
        </div>
      </div>
    </div>
  );
}
