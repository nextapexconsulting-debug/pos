"use client";

import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function PublicOrderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading…</div>}>
      <Form />
    </Suspense>
  );
}

function Form() {
  const params = useParams();
  const code = String(params?.code || "");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [items, setItems] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const m = mobile.replace(/[^0-9]/g, "");
    if (m.length < 10) {
      setErr("Enter a valid mobile number");
      return;
    }
    if (!items.trim()) {
      setErr("Write what you want to order");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: name.trim(),
          mobile: m,
          items: items.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      setDone(true);
    } catch (e: any) {
      setErr(e.message || "Failed");
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="min-h-screen pos-soft-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full text-center space-y-2">
          <div className="text-3xl">✓</div>
          <h1 className="text-lg font-bold text-slate-900">Request sent</h1>
          <p className="text-sm text-slate-600">Shop will confirm on your mobile number.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pos-soft-bg flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-lg p-5 max-w-sm w-full space-y-3">
        <h1 className="text-lg font-bold text-center" style={{ color: "var(--pos-primary)" }}>
          Place order request
        </h1>
        <p className="text-xs text-slate-500 text-center">Enter mobile so the shop can call / WhatsApp you.</p>
        <div>
          <label className="text-xs text-slate-500">Your name</label>
          <input
            className="w-full border pos-border rounded-lg px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Mobile *</label>
          <input
            className="w-full border pos-border rounded-lg px-3 py-2 text-sm"
            type="tel"
            inputMode="numeric"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            required
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Order *</label>
          <textarea
            className="w-full border pos-border rounded-lg px-3 py-2 text-sm min-h-[100px]"
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder={"e.g.\n2 Veg Sandwich\n1 Cheese Toast\nParcel"}
            required
          />
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full pos-btn hover:opacity-90 text-white font-bold rounded-xl py-3 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send order request"}
        </button>
      </form>
    </div>
  );
}
