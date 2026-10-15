"use client";

import Link from "next/link";
import { useAccess, logout } from "./AuthGate";
import { useRef, useEffect } from "react";

export default function NavLinks() {
  const a = useAccess();
  const owner = a.role === "owner";
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const links: [string, string][] = a.role === "super_admin"
    ? [["/admin", "Admin"]]
    : [
        ["/", "POS"],
        ["/orders", "Orders"],
        ["/orders/edit", "Edit Order"],
        ...(owner
          ? ([["/dashboard", "Today / Profit"], ["/stock", "Stock"], ["/reports", "Reports"], ["/staff", "Staff"], ["/billing", "Billing"]] as [string, string][])
          : []),
        ["/menu", "Menu"],
      ];

  // Close menu when any link is clicked or when clicking outside
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;

    const close = () => {
      el.open = false;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (el.contains(target) && (target as HTMLElement).closest?.("a")) {
        setTimeout(close, 50);
        return;
      }
      if (!el.contains(target)) {
        close();
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <details ref={detailsRef} className="relative">
      <summary className="list-none cursor-pointer text-xs bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg select-none font-medium">
        ☰ Menu
      </summary>
      <div className="absolute right-0 mt-2 w-44 bg-white border border-orange-200 rounded-xl shadow-xl z-30 overflow-hidden text-slate-800">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="block px-4 py-2.5 text-sm hover:bg-orange-50 text-slate-800"
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            {label}
          </Link>
        ))}
        <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-orange-100 truncate">
          {a.shop_name || a.email}
        </div>
        <button
          onClick={logout}
          className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-orange-50 border-t border-orange-100"
        >
          Log out
        </button>
      </div>
    </details>
  );
}
