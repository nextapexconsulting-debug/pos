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

    if (ios && !isStandalone && !localStorage.getItem("pwa-ios-dismiss")) {
      setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (standalone || !show) return null;

  return (
    <div className="fixed bottom-4 right-3 z-40 max-w-xs">
      <div
        className="bg-white border-2 rounded-2xl shadow-xl p-3"
        style={{ borderColor: "var(--pos-primary)" }}
      >
        <div className="font-bold text-slate-900 text-sm">Install GenZPOS to homescreen</div>
        {isIos ? (
          <p className="text-[11px] text-slate-600 mt-1 leading-snug">
            iPhone: Safari → Share → Add to Home Screen
          </p>
        ) : null}
        <div className="flex gap-2 mt-2">
          {deferred && (
            <button
              type="button"
              onClick={async () => {
                await deferred.prompt();
                const { outcome } = await deferred.userChoice;
                if (outcome === "accepted") setShow(false);
                setDeferred(null);
              }}
              className="text-white text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: "var(--pos-primary)" }}
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShow(false);
              if (isIos) localStorage.setItem("pwa-ios-dismiss", "1");
            }}
            className="text-xs text-slate-500 px-2 py-1.5"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
