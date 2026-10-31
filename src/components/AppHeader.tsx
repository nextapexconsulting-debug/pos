"use client";

import Link from "next/link";
import NavLinks from "./NavLinks";

/**
 * Professional sticky header — theme primary, clean hierarchy.
 */
export default function AppHeader({
  title,
  breadcrumb,
}: {
  title: string;
  breadcrumb?: string;
}) {
  return (
    <header
      className="sticky top-0 z-20 text-white"
      style={{
        background: "linear-gradient(135deg, var(--pos-primary) 0%, var(--pos-primary-dark) 100%)",
        boxShadow: "0 4px 20px color-mix(in srgb, var(--pos-primary-dark) 35%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 px-3 sm:px-5 h-13 sm:h-14 min-h-[3.25rem]">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-[11px] font-medium tracking-wide text-white/70 uppercase truncate">
            GenZPOS
          </p>
          <h1 className="text-base sm:text-lg font-bold truncate leading-tight -mt-0.5">
            {title}
          </h1>
        </div>
        <div className="shrink-0 flex items-center">
          <NavLinks />
        </div>
      </div>
      {breadcrumb && (
        <div className="px-3 sm:px-5 pb-2 text-[10px] sm:text-[11px] text-white/75 truncate border-t border-white/10">
          <Link href="/" className="hover:text-white hover:underline">
            Home
          </Link>
          <span className="mx-1.5 opacity-60">/</span>
          <span className="text-white font-semibold">{breadcrumb}</span>
        </div>
      )}
    </header>
  );
}
