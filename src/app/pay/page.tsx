"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, inr } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import AuthGate from "@/components/AuthGate";

function PayBody() {
  const sp = useSearchParams();
  const router = useRouter();
  const orderNo = sp.get("orderNo") || "—";
  const total = Number(sp.get("total") || 0);
  const [qr, setQr] = useState<string | null>(null);
  const [shop, setShop] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("shop_settings")
        .select("payment_qr")
        .maybeSingle();
      if (data?.payment_qr) setQr(data.payment_qr);
      try {
        const { data: access } = await supabase.rpc("my_access");
        if ((access as any)?.shop_name) setShop((access as any).shop_name);
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <AppHeader title="Pay Now" breadcrumb="Payment" />
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {shop || "GenZPOS"}
          </p>
          <div>
            <p className="text-sm text-slate-500">Order #{orderNo}</p>
            <p className="text-4xl sm:text-5xl font-bold tabular-nums text-slate-900 mt-1">
              {inr(total)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Amount to pay</p>
          </div>

          <div className="border-t border-slate-100 pt-5">
            {loading ? (
              <p className="text-sm text-slate-400">Loading scanner…</p>
            ) : qr ? (
              <>
                <p className="text-sm font-medium text-slate-700 mb-3">
                  Scan to pay
                </p>
                <div className="inline-block p-3 bg-white border border-slate-200 rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt="Payment QR"
                    className="w-56 h-56 sm:w-64 sm:h-64 object-contain mx-auto"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Open UPI / bank app → scan this code → pay {inr(total)}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed">
                No payment QR uploaded yet.
                <br />
                Owner: <b>Menu → Configuration → Payment scanner</b> → upload
                your UPI QR image.
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/orders")}
              className="flex-1 pos-btn text-white font-semibold text-sm py-3 rounded-xl"
            >
              Mark paid later · Orders
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex-1 bg-white border border-slate-200 text-slate-800 font-semibold text-sm py-3 rounded-xl hover:bg-slate-50"
            >
              New order
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PayPage() {
  return (
    <AuthGate roles={["owner", "staff"]}>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
            …
          </div>
        }
      >
        <PayBody />
      </Suspense>
    </AuthGate>
  );
}
