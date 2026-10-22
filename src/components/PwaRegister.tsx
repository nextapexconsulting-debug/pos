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

    // iOS never fires beforeinstallprompt — always show tip until dismissed
    if (ios && !isStandalone && !localStorage.getItem("pwa-ios-dismiss")) {
      setShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (standalone || !show) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-3 right-3 z-50 max-w-sm mx-auto">
      <div className="bg-white border-2 rounded-2xl shadow-xl p-3" style={{ borderColor: "var(--pos-primary)" }}>
        <div className="flex gap-2 items-start">
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-900 text-sm">Install Voice POS</div>
            {isIos ? (
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                On <b>iPhone</b> open this site in <b>Safari</b> → tap <b>Share</b> (□↑) →{" "}
                <b>Add to Home Screen</b>. Chrome on iPhone cannot install.
              </p>
            ) : deferred ? (
              <p className="text-[11px] text-slate-600 mt-1">Add to home screen — full screen app.</p>
            ) : (
              <p className="text-[11px] text-slate-600 mt-1">Use browser menu → Install app / Add to Home screen.</p>
            )}
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
      </div>
    </div>
  );
}
