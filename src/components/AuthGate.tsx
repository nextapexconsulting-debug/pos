"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase, inr } from "@/lib/supabase";

export interface Access {
  ok: boolean;
  reason?: "user_blocked" | "shop_blocked" | "bill_overdue" | "no_profile" | "no_shop";
  message?: string | null;
  role?: "super_admin" | "owner" | "staff";
  shop_name?: string;
  email?: string;
  full_name?: string | null;
  amount?: number;
  due_date?: string;
  period_start?: string;
  warning?: { amount: number; due_date: string; period_start: string } | null;
}

const Ctx = createContext<Access>({ ok: false });
export const useAccess = () => useContext(Ctx);

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_CONTACT || "the app administrator";

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

/**
 * Wrap any page: requires login, checks block / overdue-bill status,
 * and optionally restricts by role. (The database enforces the same rules
 * with Row Level Security – this is just the friendly screen.)
 */
export default function AuthGate({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const router = useRouter();
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace("/login");
      const { data, error } = await supabase.rpc("my_access");
      if (!alive) return;
      if (error) setAccess({ ok: false, reason: "no_profile", message: error.message });
      else setAccess(data as Access);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_OUT") router.replace("/login");
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (access?.ok && access.role === "super_admin" && roles && !roles.includes("super_admin")) {
      router.replace("/admin");
    }
  }, [access, roles, router]);

  if (!access) return <Screen><p className="text-slate-400">Loading…</p></Screen>;

  if (!access.ok) {
    const t = {
      user_blocked: ["Your account is blocked", access.message || "Please contact " + SUPPORT + "."],
      shop_blocked: ["This shop is disabled", access.message || "Please contact " + SUPPORT + "."],
      bill_overdue: [
        "Service paused – bill not paid",
        `Your invoice for ${access.period_start?.slice(0, 7)} (${inr(access.amount)}) was due on ${access.due_date}. Pay it to ${SUPPORT} and access is restored immediately.`,
      ],
      no_profile: ["Account not set up", access.message || "Please contact " + SUPPORT + "."],
      no_shop: ["No shop linked to this account", "Please contact " + SUPPORT + "."],
    }[access.reason || "no_profile"];
    return (
      <Screen>
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-xl font-bold mb-2">{t[0]}</h1>
        <p className="text-slate-400 text-sm max-w-sm mb-6">{t[1]}</p>
        <button onClick={logout} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm">Log out</button>
      </Screen>
    );
  }

  if (roles && access.role && !roles.includes(access.role) && access.role !== "super_admin") {
    return (
      <Screen>
        <h1 className="text-lg font-bold mb-2">Not allowed</h1>
        <p className="text-slate-400 text-sm mb-4">Your role ({access.role}) can't open this page.</p>
        <a href="/" className="bg-slate-700 px-4 py-2 rounded-lg text-sm">Back to POS</a>
      </Screen>
    );
  }

  return (
    <Ctx.Provider value={access}>
      {access.warning && access.role === "owner" && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-xs px-4 py-2 text-center">
          ⚠️ Bill for {access.warning.period_start.slice(0, 7)}: {inr(access.warning.amount)} — pay by{" "}
          <b>{access.warning.due_date}</b> or the app will be disabled.
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center text-center p-6">
      {children}
    </div>
  );
}
