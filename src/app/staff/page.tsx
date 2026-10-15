"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn } from "@/components/PageShell";
import { supabase } from "@/lib/supabase";

interface P { id: string; email: string; full_name: string | null; role: string; is_blocked: boolean }

export default function StaffPage() {
  return (
    <PageShell title="Staff" roles={["owner"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [list, setList] = useState<P[]>([]);
  const [f, setF] = useState({ email: "", password: "", full_name: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id,email,full_name,role,is_blocked").eq("role", "staff").order("created_at");
    setList((data as P[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
      body: JSON.stringify(f),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j.error);
    setMsg("Staff account created ✓"); setF({ email: "", password: "", full_name: "" }); load();
  };

  const toggle = async (p: P) => {
    const { error } = await supabase.from("profiles").update({ is_blocked: !p.is_blocked, blocked_reason: p.is_blocked ? null : "Blocked by shop owner" }).eq("id", p.id);
    if (error) alert(error.message); else load();
  };

  return (
    <>
      <form onSubmit={add} className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">Add staff login</h2>
        <p className="text-xs text-slate-400">Staff can take orders and mark Cash / UPI. They cannot see expenses, stock, reports or billing.</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input className={input} placeholder="Name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <input className={input} type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <input className={input} type="text" placeholder="Password (min 6)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} />
        </div>
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
        <button className={btn}>Create staff</button>
      </form>
      <div className={card}>
        {list.length === 0 && <p className="text-slate-500 text-sm">No staff yet</p>}
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-2 py-2 border-b border-slate-800 text-sm">
            <span className="flex-1">{p.full_name || p.email}<span className="text-xs text-slate-500 ml-2">{p.email}</span></span>
            {p.is_blocked && <span className="text-xs text-red-400">Blocked</span>}
            <button className="text-xs bg-slate-700 px-3 py-1.5 rounded-lg" onClick={() => toggle(p)}>{p.is_blocked ? "Unblock" : "Block"}</button>
          </div>
        ))}
      </div>
    </>
  );
}
