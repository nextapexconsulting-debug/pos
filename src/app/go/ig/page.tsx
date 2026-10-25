"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * QR lands here → try Instagram app, then browser profile.
 * Paper QR should point to /go/ig?u=handle (not instagram.com directly).
 */
function Redirect() {
  const sp = useSearchParams();
  const raw = (sp.get("u") || sp.get("user") || "").trim().replace(/^@/, "");

  useEffect(() => {
    if (!raw) return;
    const web = `https://www.instagram.com/${encodeURIComponent(raw)}/`;
    const app = `instagram://user?username=${encodeURIComponent(raw)}`;

    // Try app scheme first (works when opened from many phone cameras)
    const t = setTimeout(() => {
      window.location.href = web;
    }, 800);
    window.location.href = app;

    return () => clearTimeout(t);
  }, [raw]);

  if (!raw) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-slate-600">
        Missing Instagram handle
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Opening Instagram…</p>
        <a
          className="pos-text font-semibold text-sm underline"
          href={`https://www.instagram.com/${encodeURIComponent(raw)}/`}
        >
          Open profile in browser
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
