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
          { href: "/customers", label: "Customers" },
          ...(owner
            ? [
                { href: "/dashboard", label: "Today / Profit" },
                { href: "/expenses", label: "Expenses" },
                { href: "/stock", label: "Stock" },
                { href: "/recipes", label: "Item recipes" },
                { href: "/reports", label: "Reports" },
                { href: "/menu", label: "Add / Edit Product" },
                { href: "/printer", label: "Printer" },
                { href: "/settings", label: "Configuration" },
                { href: "/marketing", label: "Marketing / QR" },
                { href: "/staff", label: "Staff" },
                { href: "/billing", label: "Billing" },
              ]
            : [
            { href: "/menu", label: "Add / Edit Product" },
            { href: "/recipes", label: "Item recipes" },
          ]),
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
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap">
      {pathname !== "/" && (
        <Link
          href="/"
          className="inline-flex items-center justify-center h-8 sm:h-9 px-2.5 sm:px-3 text-xs sm:text-sm bg-white font-bold rounded-lg shadow-sm"
          style={{ color: "var(--pos-primary)" }}
        >
          <span className="sm:hidden">+ Order</span>
          <span className="hidden sm:inline">+ New Order</span>
        </Link>
      )}
      <details ref={detailsRef} className="relative">
        <summary className="list-none cursor-pointer inline-flex items-center justify-center h-8 sm:h-9 px-2.5 sm:px-3 text-xs sm:text-sm bg-white font-bold rounded-lg border border-orange-100 shadow-sm select-none"
          style={{ color: "var(--pos-primary-dark)" }}>
          ☰ Menu
        </summary>
        <div className="absolute right-0 mt-2 w-52 max-h-[70vh] overflow-y-auto bg-white border border-orange-200 rounded-xl shadow-xl z-30 text-slate-800">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-4 py-2.5 text-sm hover:bg-orange-50 ${
                pathname === href || (href !== "/" && pathname.startsWith(href + "/"))
                  ? "bg-orange-50 font-semibold"
                  : "text-slate-800"
              }`}
              style={
                pathname === href || (href !== "/" && pathname.startsWith(href + "/"))
                  ? { color: "var(--pos-primary-dark)" }
                  : undefined
              }
              onClick={() => {
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
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
