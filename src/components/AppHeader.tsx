"use client";

import Link from "next/link";
import NavLinks from "./NavLinks";

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
      style={{ backgroundColor: "var(--pos-primary)" }}
    >
      <div className="flex items-center gap-3 px-4 sm:px-5 min-h-[3.25rem] sm:min-h-[3.5rem]">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-white/50 truncate">
            GenZPOS
          </p>
          <h1 className="text-[1.05rem] sm:text-lg font-semibold truncate leading-tight text-white -mt-0.5">
            {title}
          </h1>
        </div>
        <NavLinks />
      </div>
      {breadcrumb && (
        <div className="px-4 sm:px-5 pb-2 text-[11px] text-white/55 truncate border-t border-white/10">
          <Link href="/" className="hover:text-white/90">
            Home
          </Link>
          <span className="mx-1.5 text-white/30">/</span>
          <span className="text-white/90 font-medium">{breadcrumb}</span>
        </div>
      )}
    </header>
  );
}
