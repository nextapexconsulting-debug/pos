"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccess, logout } from "./AuthGate";
import { useRef, useEffect } from "react";

type NavLink = { href: string; label: string };

export default function NavLinks() {
  const a = useAccess();
  const owner = a.role === "owner";
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  const links: NavLink[] =
    a.role === "super_admin"
      ? [{ href: "/admin", label: "Admin" }]
      : [
          { href: "/orders", label: "Orders" },
          { href: "/orders/edit", label: "Edit Order" },
          ...(owner
            ? [
                { href: "/dashboard", label: "Today / Profit" },
                { href: "/expenses", label: "Expenses" },
                { href: "/stock", label: "Stock" },
                { href: "/reports", label: "Reports" },
                { href: "/menu", label: "Add / Edit Product" },
                { href: "/printer", label: "Printer" },
                { href: "/staff", label: "Staff" },
                { href: "/billing", label: "Billing" },
              ]
            : [{ href: "/menu", label: "Add / Edit Product" }]),
        ];

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
      if (!el.contains(target)) close();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {pathname !== "/" && (
        <Link
          href="/"
          className="text-xs bg-white text-orange-600 hover:bg-orange-50 font-bold px-3 py-1.5 rounded-lg shadow-sm"
        >
          + New Order
        </Link>
      )}
      <details ref={detailsRef} className="relative">
        <summary className="list-none cursor-pointer text-xs bg-white text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg select-none font-bold border border-orange-100 shadow-sm">
          ☰ Menu
        </summary>
        <div className="absolute right-0 mt-2 w-52 bg-white border border-orange-200 rounded-xl shadow-xl z-30 overflow-hidden text-slate-800">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-4 py-2.5 text-sm hover:bg-orange-50 ${
                pathname === href || (href !== "/" && pathname.startsWith(href + "/"))
                  ? "bg-orange-50 font-semibold text-orange-700"
                  : "text-slate-800"
              }`}
              onClick={() => {
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={logout}
            className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-orange-50 border-t border-orange-100"
          >
            Log out
          </button>
        </div>
      </details>
    </div>
  );
}
