"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase, todayIST, fetchBusinessDay } from "@/lib/supabase";
import { useT } from "@/lib/i18n";

type InvItem = { id: string; name: string; unit: string };

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
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

export default function AiClosingCountPage() {
  const { t } = useT();
  return (
    <PageShell title={t("nav_ai_closing")} roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const { t } = useT();
  const [date, setDate] = useState(todayIST());
  const [items, setItems] = useState<InvItem[]>([]);
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("");
  const [aiStatus, setAiStatus] = useState<"off" | "checking" | "using" | "unavailable">("off");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef<InvItem[]>([]);
  const recRef = useRef<SpeechRec | null>(null);
  const wantListen = useRef(false);
  const lastFinal = useRef("");

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    fetchBusinessDay().then(setDate);
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id,name,unit")
      .order("name");
    if (error) {
      setStatus(error.message);
      return;
    }
    setItems((data as InvItem[]) || []);
    // seed from stock_sheet closing if any
    const { data: sheet } = await supabase.rpc("stock_sheet", { p_date: date });
    const rows = (sheet as { item_id: string; closing: number | null }[]) || [];
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.closing != null) map[r.item_id] = String(r.closing);
    }
    setClosing((prev) => ({ ...map, ...prev }));
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySpoken = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || clean === lastFinal.current) return;
    lastFinal.current = clean;
    setTranscript(clean);
    setAiStatus("checking");

    try {
      const res = await fetch("/api/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "stock_closing",
          transcript: clean,
          menu: itemsRef.current.map((i) => ({
            id: i.id,
            nameEn: i.name,
            nameGu: i.name,
            keywords: [i.name, i.unit, ...i.name.toLowerCase().split(/\s+/)],
          })),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ai && Array.isArray(data.items) && data.items.length > 0) {
        setAiStatus("using");
        setClosing((prev) => {
          const next = { ...prev };
          for (const row of data.items) {
            const id = String(row.product_id);
            if (!itemsRef.current.some((i) => i.id === id)) continue;
            next[id] = String(row.qty);
          }
          return next;
        });
        setStatus(
          "AI updated: " +
            data.items
              .map((row: { product_id: string; qty: number }) => {
                const name = itemsRef.current.find((i) => i.id === row.product_id)?.name || row.product_id;
                return `${name}=${row.qty}`;
              })
              .join(", ")
        );
        return;
      }
      setAiStatus(res.status === 503 ? "unavailable" : "unavailable");
      setStatus(data.error || "AI could not map counts — type values in the table");
    } catch {
      setAiStatus("unavailable");
      setStatus("Network error — type closing counts manually");
    }
  }, []);

  const stopListen = useCallback(() => {
    wantListen.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const startListen = useCallback(async () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setStatus("Use Chrome on Android/desktop for voice");
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((tr) => tr.stop());
      }
    } catch {
      setStatus("Allow microphone permission for this app");
      return;
    }
    stopListen();
    lastFinal.current = "";
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (ev: any) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript + " ";
      }
      finalText = finalText.trim();
      if (finalText) void applySpoken(finalText);
    };
    rec.onerror = (ev: any) => {
      const err = ev?.error || "error";
      if (err === "not-allowed") setStatus("Mic blocked");
      else if (err !== "aborted" && err !== "no-speech") setStatus("Mic: " + err);
    };
    rec.onend = () => {
      if (wantListen.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
          wantListen.current = false;
        }
      } else setListening(false);
    };
    recRef.current = rec;
    wantListen.current = true;
    try {
      rec.start();
      setListening(true);
      setStatus("Listening… e.g. bread 12, butter 3.5, cheese 2, water 40, pizza 15");
    } catch (e: any) {
      setStatus(e?.message || "Could not start mic");
      setListening(false);
    }
  }, [applySpoken, stopListen]);

  useEffect(() => {
    return () => {
      wantListen.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const save = async () => {
    const rows = Object.entries(closing)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([item_id, v]) => ({ item_id, count_date: date, closing_qty: Number(v) }));
    if (!rows.length) {
      setStatus("Enter at least one closing count");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("stock_counts").upsert(rows, {
      onConflict: "item_id,count_date",
    });
    setBusy(false);
    if (error) setStatus(error.message);
    else setStatus("Closing counts saved");
  };

  const supported = typeof window !== "undefined" && !!getSpeechRecognition();

  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <p className="text-sm text-slate-600">
          Speak remaining stock, e.g. “bread 12 packet, butter 3 kg, cheese 2, water 40, pizza 15”.
          AI fills the table — check, then Save.
        </p>
        {aiStatus === "using" && (
          <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            Using AI to find products
          </div>
        )}
        {aiStatus === "checking" && (
          <div className="text-xs text-slate-600 bg-slate-50 border rounded-xl px-3 py-2">Checking AI…</div>
        )}
        {aiStatus === "unavailable" && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            AI not active — type numbers in the table
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-sm text-slate-600">{t("business_day")}</label>
          <input
            type="date"
            className={input + " !w-auto"}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {!listening ? (
            <button type="button" className={btn} disabled={!supported} onClick={() => void startListen()}>
              🎤 Start listening
            </button>
          ) : (
            <button type="button" className={btn2} onClick={stopListen}>
              ⏹ Stop
            </button>
          )}
          {listening && <span className="text-sm text-red-600 animate-pulse">Listening…</span>}
        </div>
        {transcript && (
          <p className="text-xs text-slate-500">
            Heard: <span className="text-slate-800">{transcript}</span>
          </p>
        )}
        {status && <p className="text-sm text-slate-700">{status}</p>}
      </div>

      <div className={card}>
        <h2 className="font-semibold text-sm mb-2">{t("closing")} counts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-left py-2">{t("item")}</th>
                <th className="text-right py-2">{t("closing")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-slate-50">
                  <td className="py-2 font-medium">
                    {it.name}{" "}
                    <span className="text-xs text-slate-400">({it.unit})</span>
                  </td>
                  <td className="py-2 text-right">
                    <input
                      className={input + " !w-24 !inline-block text-right"}
                      inputMode="decimal"
                      value={closing[it.id] ?? ""}
                      onChange={(e) => setClosing({ ...closing, [it.id]: e.target.value })}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-slate-400 py-6">
                    No inventory items — add them under Stock first
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className={btn + " mt-3"} disabled={busy} onClick={save}>
          {busy ? t("loading") : t("save_closing")}
        </button>
      </div>
    </div>
  );
}
