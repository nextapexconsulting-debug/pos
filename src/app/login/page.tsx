"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { input, btn } from "@/components/PageShell";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "err" | "ok"; s: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace("/"); });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ t: "err", s: error.message });
      else router.replace("/");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { shop_name: shopName, full_name: fullName } },
      });
      if (error) setMsg({ t: "err", s: error.message });
      else if (!data.session) setMsg({ t: "ok", s: "Account created. Check your email to confirm, then log in." });
      else router.replace("/");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="text-center mb-2">
          <div className="text-3xl">🥪🍕</div>
          <h1 className="text-xl font-bold">Voice POS</h1>
          <p className="text-xs text-slate-400">{mode === "login" ? "Log in to your shop" : "Create your shop account"}</p>
        </div>
        {mode === "signup" && (
          <>
            <input className={input} placeholder="Shop name" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
            <input className={input} placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </>
        )}
        <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="Password (min 6)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {msg && <p className={`text-xs ${msg.t === "err" ? "text-red-400" : "text-emerald-400"}`}>{msg.s}</p>}
        <button className={btn + " w-full"} disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}</button>
        <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}
          className="w-full text-xs text-slate-400 hover:text-slate-200">
          {mode === "login" ? "New shop? Create account" : "Already have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
