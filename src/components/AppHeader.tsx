"use client";

import Link from "next/link";
import NavLinks from "./NavLinks";

/**
 * Fixed one-row header for all screen sizes.
 * Left: title (truncate). Right: actions (never wrap under title).
 * Breadcrumb sits on a thin second row so it never pushes Menu around.
 */
export default function AppHeader({
  title,
  breadcrumb,
}: {
  title: string;
  breadcrumb?: string;
}) {
  return (
    <header className="sticky top-0 z-20 shadow-md bg-orange-500 text-white">
      <div className="flex items-center gap-2 px-3 sm:px-4 h-12 sm:h-14">
        <h1 className="flex-1 min-w-0 text-base sm:text-lg font-bold truncate leading-tight">
          {title}
        </h1>
        <div className="shrink-0 flex items-center">
          <NavLinks />
        </div>
      </div>
      {breadcrumb && (
        <div className="px-3 sm:px-4 pb-1.5 -mt-0.5 text-[10px] sm:text-[11px] text-orange-100 truncate">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          <span className="mx-1">/</span>
          <span className="text-white font-medium">{breadcrumb}</span>
        </div>
      )}
    </header>
  );
}
