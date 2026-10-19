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
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setStandalone(isStandalone);

    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/i.test(ua);
    setIsIos(ios);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!isStandalone) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS: show tip if not installed
    if (ios && !isStandalone) {
      const dismissed = localStorage.getItem("pwa-ios-dismiss");
      if (!dismissed) setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferred(null);
  };

  const dismiss = () => {
    setShow(false);
    if (isIos) localStorage.setItem("pwa-ios-dismiss", "1");
  };

  if (standalone || !show) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-3 right-3 z-50 max-w-md mx-auto">
      <div className="bg-white border-2 border-orange-400 rounded-2xl shadow-xl p-4 flex gap-3 items-start">
        <img src="/icon-192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 text-sm">Install Voice POS</div>
          {isIos && !deferred ? (
            <p className="text-xs text-slate-600 mt-1">
              Tap <b>Share</b> → <b>Add to Home Screen</b> for full-screen app (no browser bar).
            </p>
          ) : (
            <p className="text-xs text-slate-600 mt-1">
              Add to home screen — open like an app, no URL bar.
            </p>
          )}
          <div className="flex gap-2 mt-2">
            {deferred && (
              <button
                type="button"
                onClick={install}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-slate-500 px-2 py-1.5"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
