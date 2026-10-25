"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * QR lands here → try WhatsApp app, then wa.me.
 * Paper QR: /go/wa?n=919876543210
 */
function Redirect() {
  const sp = useSearchParams();
  let n = (sp.get("n") || sp.get("phone") || "").replace(/[^0-9]/g, "");
  if (n.length === 10) n = "91" + n;
  const text = sp.get("text") || "Hi! I want to order.";

  useEffect(() => {
    if (n.length < 10) return;
    const web = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
    const app = `whatsapp://send?phone=${n}&text=${encodeURIComponent(text)}`;

    const t = setTimeout(() => {
      window.location.href = web;
    }, 800);
    window.location.href = app;

    return () => clearTimeout(t);
  }, [n, text]);

  if (n.length < 10) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-slate-600">
        Missing WhatsApp number
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Opening WhatsApp…</p>
        <a
          className="pos-text font-semibold text-sm underline"
          href={`https://wa.me/${n}?text=${encodeURIComponent(text)}`}
        >
          Open WhatsApp in browser
        </a>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">…</div>}>
      <Redirect />
    </Suspense>
  );
}
