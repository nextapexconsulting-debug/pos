"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthGate from "./AuthGate";
import NavLinks from "./NavLinks";

export const card = "bg-white border border-orange-200 rounded-xl p-3 shadow-sm";
export const input =
  "bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-orange-500 text-slate-800";
export const btn =
  "bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors";
export const btn2 =
  "bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium";

const CRUMBS: Record<string, string> = {
  "/": "New Order",
  "/orders": "Orders",
  "/orders/edit": "Edit Order",
  "/dashboard": "Today / Profit",
  "/expenses": "Expenses",
  "/stock": "Stock",
  "/reports": "Reports",
  "/menu": "Add / Edit Product",
  "/menu/import": "Import Menu",
  "/printer": "Printer",
  "/staff": "Staff",
  "/billing": "Billing",
};

export default function PageShell({
  title,
  roles,
  children,
}: {
  title: string;
  roles?: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const crumb = CRUMBS[pathname] || title;

  return (
    <AuthGate roles={roles}>
      <div className="min-h-screen bg-white text-slate-900">
        <header className="bg-orange-500 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-md">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{title}</h1>
            <nav className="text-[11px] text-orange-100 flex items-center gap-1 truncate">
              <Link href="/" className="hover:underline">
                Home
              </Link>
              {pathname !== "/" && (
                <>
                  <span>/</span>
                  <span className="text-white font-medium">{crumb}</span>
                </>
              )}
            </nav>
          </div>
          <NavLinks />
        </header>
        <main className="max-w-5xl mx-auto p-3 space-y-3">{children}</main>
      </div>
    </AuthGate>
  );
}

export function Table({
  cols,
  rows,
  totals,
}: {
  cols: { key: string; label: string; money?: boolean; num?: boolean }[];
  rows: Record<string, any>[];
  totals?: boolean;
}) {
  const fmt = (c: { money?: boolean; num?: boolean }, v: any) =>
    v === null || v === undefined || v === ""
      ? "—"
      : c.money
        ? "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })
        : c.num
          ? Number(v).toLocaleString("en-IN")
          : String(v);
  if (!rows.length)
    return <p className="text-slate-500 text-sm text-center py-6">No data for this period</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs border-b border-orange-200">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`py-2 px-2 font-medium ${c.money || c.num ? "text-right" : "text-left"}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-orange-50">
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 px-2 whitespace-nowrap ${c.money || c.num ? "text-right tabular-nums" : ""}`}
                >
                  {fmt(c, r[c.key])}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className="font-semibold bg-orange-50">
              {cols.map((c, i) => (
                <td
                  key={c.key}
                  className={`py-2 px-2 ${c.money || c.num ? "text-right tabular-nums" : ""}`}
                >
                  {i === 0
                    ? "Total"
                    : c.money || c.num
                      ? fmt(
                          c,
                          rows.reduce((s, r) => s + Number(r[c.key] || 0), 0)
                        )
                      : ""}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
