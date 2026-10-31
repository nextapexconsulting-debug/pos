"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccess, logout } from "./AuthGate";
import { useRef, useEffect } from "react";

type NavLink = { href: string; label: string };

/** Title Case for menu labels */
function titleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export default function NavLinks() {
  const a = useAccess();
  const owner = a.role === "owner";
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  // Fixed order: Orders → Online Order → Online Total Amount → Edit Order → rest
  const links: NavLink[] =
    a.role === "super_admin"
      ? [{ href: "/admin", label: "Admin" }]
      : [
          { href: "/orders", label: "Orders" },
          { href: "/online-orders", label: "Online Order" },
          { href: "/online-order-details", label: "Online Total Amount" },
          { href: "/orders/edit", label: "Edit Orders" },
          { href: "/customers", label: "Customers" },
          ...(owner
            ? [
                { href: "/dashboard", label: "Today / Profit" },
                { href: "/expenses", label: "Expenses" },
                { href: "/stock", label: "Stock" },
                { href: "/recipes", label: "Item Recipes" },
                { href: "/reports", label: "Reports" },
                { href: "/menu", label: "Add / Edit Product" },
                { href: "/printer", label: "Printer" },
                { href: "/settings", label: "Configuration" },
                { href: "/marketing", label: "Marketing / Qr" },
                { href: "/scanners", label: "Qr Scanners" },
                { href: "/staff", label: "Staff" },
                { href: "/billing", label: "Billing" },
              ]
            : [
                { href: "/menu", label: "Add / Edit Product" },
                { href: "/recipes", label: "Item Recipes" },
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

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap">
      <Link
        href="/"
        className="inline-flex items-center gap-1 rounded-full bg-white/95 text-[var(--pos-primary-dark)] text-xs sm:text-sm font-bold px-3 py-1.5 shadow-sm hover:bg-white transition-colors border border-white/40"
      >
        <span className="text-base leading-none">+</span>
        <span>New Order</span>
      </Link>

      <details ref={detailsRef} className="relative">
        <summary
          className="list-none cursor-pointer select-none inline-flex items-center gap-1.5 rounded-full bg-white/95 text-[var(--pos-primary-dark)] text-xs sm:text-sm font-bold px-3 py-1.5 shadow-sm hover:bg-white transition-colors border border-white/40 [&::-webkit-details-marker]:hidden"
        >
          <span className="text-base leading-none" aria-hidden>
            ☰
          </span>
          <span>Menu</span>
        </summary>
        <div
          className="absolute right-0 mt-2 w-60 max-h-[min(70vh,28rem)] overflow-y-auto rounded-2xl z-30 py-1.5 shadow-2xl border border-black/5"
          style={{
            background: "linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--pos-soft) 55%, white) 100%)",
          }}
        >
          <div className="px-3 py-2 border-b border-black/5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              GenZPOS
            </p>
          </div>
          {links.map(({ href, label }, i) => {
            const active = isActive(href);
            const showDivider = i === 3; // after Edit Orders
            return (
              <div key={href}>
                {showDivider && (
                  <div className="my-1.5 mx-3 border-t border-black/8" />
                )}
                <Link
                  href={href}
                  className={`mx-1.5 flex items-center rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "font-semibold text-white shadow-sm"
                      : "text-slate-800 hover:bg-white/80"
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: "var(--pos-primary)",
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (detailsRef.current) detailsRef.current.open = false;
                  }}
                >
                  {titleCase(label)}
                </Link>
              </div>
            );
          })}
          <div className="my-1.5 mx-3 border-t border-black/8" />
          <button
            type="button"
            onClick={logout}
            className="mx-1.5 mb-1 w-[calc(100%-0.75rem)] text-left rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Log Out
          </button>
        </div>
      </details>
    </div>
  );
}
