"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    setIsIos(ios);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!isStandalone) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    if (ios && !isStandalone && !localStorage.getItem("pwa-ios-dismiss")) setShow(true);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferred(null);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-3 right-3 z-50 max-w-sm mx-auto">
      <div className="bg-white border-2 border-orange-400 rounded-2xl shadow-xl p-3 flex gap-2 items-center">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 font-bold text-slate-900 text-sm">Install Voice POS</div>
        {deferred ? (
          <button type="button" onClick={install} className="bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
            Install
          </button>
        ) : isIos ? (
          <span className="text-[10px] text-slate-500">Share → Add to Home</span>
        ) : null}
        <button type="button" onClick={() => { setShow(false); if (isIos) localStorage.setItem("pwa-ios-dismiss", "1"); }} className="text-slate-400 text-lg px-1">
          ×
        </button>
      </div>
    </div>
  );
}
