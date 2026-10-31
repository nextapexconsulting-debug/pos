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
    // Voice / mic disabled — search & tap only
    return;
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
      // Voice removed from UI — no error banner
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    // continuous=true is unreliable on many mobile browsers – use false + auto-restart
    recognition.continuous = !mobile;
    recognition.interimResults = true;
    recognition.lang = "en-IN"; // Indian English; product keywords still match Gujarati names
    recognition.maxAlternatives = 5;

    let lastInterim = "";

    const processSpoken = (spoken: string) => {
      const cleaned = spoken.trim();
      if (!cleaned) return;
      setTranscript((prev) => (prev ? prev + " " + cleaned : cleaned));
      setInterimTranscript("");

      const list = productsRef.current;
      if (!list.length) {
        setStatus("Menu not loaded yet – wait a second and try again");
        return;
      }

      // Try full phrase, then each alternative-style split
      let parsed = parseSpokenOrder(cleaned, list);
      if (!parsed.length) {
        // Retry without filler words
        const stripped = cleaned
          .replace(/\b(please|order|give|me|i want|add|ek|one|the)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (stripped && stripped !== cleaned) {
          parsed = parseSpokenOrder(stripped, list);
        }
      }

      if (parsed.length > 0) {
        setOrder((prev) => mergeOrderItems(prev, parsed));
        const names = parsed
          .map((p) => `${p.quantity} × ${p.product.nameEn}`)
          .join(", ");
        setLastAdded(names);
        setStatus(`Added: ${names}`);
      } else {
        setStatus(`Heard: "${cleaned}" — no product match. Say full name or use search.`);
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
      let finalBest = "";
      const finalAlts: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Collect all alternatives – first match wins in parse
          for (let a = 0; a < result.length; a++) {
            const tx = (result[a]?.transcript || "").trim();
            if (tx) finalAlts.push(tx);
          }
          finalBest += (result[0]?.transcript || "") + " ";
        } else {
          interim += result[0]?.transcript || "";
        }
      }

      if (interim) {
        lastInterim = interim;
        setInterimTranscript(interim);
      }

      if (finalBest.trim() || finalAlts.length) {
        lastInterim = "";
        // Try best transcript first, then other alternatives until one matches
        const tried = new Set<string>();
        const candidates = [finalBest.trim(), ...finalAlts].filter(Boolean);
        let matched = false;
        for (const c of candidates) {
          const key = c.toLowerCase();
          if (tried.has(key)) continue;
          tried.add(key);
          const before = productsRef.current;
          const parsed = parseSpokenOrder(c, before);
          if (parsed.length) {
            processSpoken(c);
            matched = true;
            break;
          }
        }
        if (!matched && finalBest.trim()) {
          processSpoken(finalBest.trim());
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      try { recognition.stop(); } catch {}
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) {
      setError("Voice engine not ready. Use Chrome/Edge (Android) or search/tap.");
      return;
    }
    if (!window.isSecureContext && location.hostname !== "localhost") {
      setError("Voice needs HTTPS. Open the app via https:// link.");
      return;
    }
    setTranscript("");
    setInterimTranscript("");
    setLastAdded(null);
    setError(null);
    setStatus("Starting mic…");
    wantListeningRef.current = true;

    // Warm up mic permission (helps Chrome/Android actually listen)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((tr) => tr.stop());
      }
    } catch {
      wantListeningRef.current = false;
      setError("Microphone blocked. Allow mic for this site and tap 🎤 again.");
      return;
    }

    const kick = () => {
      if (!wantListeningRef.current || !recognitionRef.current) return;
      try {
        recognitionRef.current.start();
      } catch {
        try {
          recognitionRef.current.stop();
        } catch {}
        setTimeout(() => {
          if (!wantListeningRef.current || !recognitionRef.current) return;
          try {
            recognitionRef.current.start();
          } catch (e) {
            setError("Could not start mic. Tap 🎤 again.");
            wantListeningRef.current = false;
          }
        }, 280);
      }
    };
    kick();
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
      // Always send both customer fields (null when empty) so the database
      // can only match the 6-argument place_order – no "best candidate" clash.
      p_customer_name: null,
      p_customer_mobile: null,
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
    <div className="min-h-screen text-slate-900 flex flex-col pb-36 md:pb-0 bg-slate-50">
      <AppHeader title="New Order" breadcrumb="New Order" />

      <main className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full min-h-0">
        {/* Left: Products */}
        <section className="flex-1 p-3 flex flex-col gap-3 min-h-0 overflow-hidden">
          {lastOrder && (
            <div className="pos-soft-bg rounded-xl p-3 border pos-border flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">Order #{lastOrder.no} · ₹{lastOrder.total}</div>
                <div className="text-xs text-slate-500">
                  {lastOrder.paid ? `Paid by ${lastOrder.paid.toUpperCase()} ✓` : "Mark payment (or do it later from Orders)"}
                </div>
              </div>
              {!lastOrder.paid && (
                <>
                  <button type="button" onClick={() => markPaid("cash")} className="pos-btn text-white text-sm font-semibold px-3 py-2 rounded-lg">💵 Cash</button>
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
                className="pos-btn text-white text-sm font-semibold px-3 py-2 rounded-lg"
              >
                🖨 Print
              </button>
              <button type="button" onClick={() => setLastOrder(null)} className="text-slate-400 hover:text-slate-600 px-1">✕</button>
            </div>
          )}

{/* Customer only — order items live in bottom sheet (mobile) / right panel (desktop) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm shrink-0 space-y-2">
            <div className="text-sm font-semibold text-slate-800">Customer</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                className="bg-white border pos-border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
                placeholder="Customer name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input
                type="tel"
                inputMode="numeric"
                className="bg-white border pos-border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
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
          </div>

<div className="bg-white rounded-2xl border border-slate-200/80 flex flex-col flex-1 min-h-0 overflow-hidden shadow-sm">
            {/* Search bar */}
            <div className="p-2 border-b pos-border shrink-0 pos-soft-bg">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search product (English / Gujarati)..."
                  className="w-full bg-white border pos-border rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:pos-border0 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pos-primary)_30%,white)]"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full pos-soft-bg pos-text text-xs font-bold"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-1 p-2 border-b pos-border overflow-x-auto shrink-0 pos-soft-bg">
              {PRICE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPriceTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    priceTab === tab.id
                      ? "pos-btn text-white"
                      : "bg-white text-slate-600 hover:pos-soft-bg border pos-border"
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProductManually(p.id)}
                      className="bg-white hover:shadow-md hover:border-[var(--pos-primary)] active:scale-[0.98] border border-slate-200/80 rounded-2xl px-3.5 py-3.5 text-left transition-all shadow-sm"
                    >
                      <div className="text-sm font-medium leading-tight text-slate-800">
                        {p.nameEn}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {p.nameGu}
                      </div>
                      <div className="pos-text text-base font-bold mt-1.5 tabular-nums">
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
        <section className="hidden md:flex w-full md:w-[22rem] bg-white border-t md:border-t-0 md:border-l border-slate-200/80 flex-col shadow-[-8px_0_24px_rgba(15,23,42,0.04)] max-h-[50vh] md:max-h-none">
          <div className="p-3 border-b pos-border flex items-center gap-2 shrink-0 bg-white">
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
              className="pos-btn hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {isSending ? "Sending..." : "Okay"}
            </button>
          </div>

          {/* P / J toggles */}
          <div className="px-3 py-2 flex gap-2 border-b pos-border bg-white">
            <button
              type="button"
              onClick={() => setIsParcel((v) => !v)}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                isParcel
                  ? "pos-btn text-white pos-border0"
                  : "bg-white text-slate-600 pos-border hover:pos-soft-bg"
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
                  : "bg-white text-slate-600 pos-border hover:pos-soft-bg"
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
                <p className="text-xs mt-1">Tap products to add</p>
              </div>
            ) : (
              order.map((item) => (
                <div
                  key={item.product.id}
                  className="bg-white rounded-xl p-2.5 flex items-center gap-2 border pos-border shadow-sm"
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
                      className="w-7 h-7 rounded-full pos-soft-bg hover:pos-soft-bg pos-text-dark flex items-center justify-center text-base"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-semibold text-sm text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="w-7 h-7 rounded-full pos-soft-bg hover:pos-soft-bg pos-text-dark flex items-center justify-center text-base"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right min-w-[48px]">
                    <div className="font-semibold pos-text text-sm">
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

          <div className="p-3 border-t pos-border bg-white flex items-center justify-between shrink-0">
            <span className="text-slate-600 font-medium">Total</span>
            <span className="font-bold text-xl pos-text">₹{total}</span>
          </div>
        </section>
      </main>

      {/* Mobile bottom sheet – collapsed: chips + Okay; expanded: full list with +/- */}
      <div
        ref={sheetRef}
        className={`md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t-2 pos-border shadow-[0_-4px_20px_rgba(0,0,0,0.12)] transition-[max-height] duration-300 ease-out flex flex-col ${
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
          <div className="w-10 h-1 rounded-full pos-soft-bg mb-1" />
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
                ? "pos-btn text-white pos-border0"
                : "bg-white text-slate-600 pos-border"
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
                : "bg-white text-slate-600 pos-border"
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
                className="shrink-0 pos-soft-bg border pos-border rounded-full px-2 py-0.5"
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
                  className="pos-soft-bg rounded-xl p-2.5 flex items-center gap-2 border pos-border"
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
                      className="w-8 h-8 rounded-full bg-white border pos-border pos-text-dark flex items-center justify-center text-lg font-bold active:pos-soft-bg"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-semibold text-sm text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="w-8 h-8 rounded-full bg-white border pos-border pos-text-dark flex items-center justify-center text-lg font-bold active:pos-soft-bg"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right min-w-[44px]">
                    <div className="font-semibold pos-text text-sm">
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
        <div className="flex items-center gap-2 p-3 border-t pos-border shrink-0 bg-white">
          <div className="flex-1" onClick={() => setSheetExpanded((v) => !v)}>
            <div className="text-xs text-slate-500">
              {order.length} item{order.length === 1 ? "" : "s"}
              {!sheetExpanded && order.length > 0 ? " · tap to edit" : ""}
            </div>
            <div className="text-lg font-bold pos-text">₹{total}</div>
          </div>
          {order.length > 0 && (
            <button onClick={clearOrder} className="text-xs text-red-500 px-2 py-2">
              Clear
            </button>
          )}
          <button
            onClick={confirmOrder}
            disabled={order.length === 0 || isSending}
            className="pos-btn hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base px-6 py-3 rounded-xl transition-colors shadow-md"
          >
            {isSending ? "..." : "Okay"}
          </button>
        </div>
      </div>
    </div>
  );
}
