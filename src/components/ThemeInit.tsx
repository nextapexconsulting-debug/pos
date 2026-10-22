"use client";
import { useEffect } from "react";
import { initThemeFromStorage } from "@/lib/theme";

export default function ThemeInit() {
  useEffect(() => {
    initThemeFromStorage();
  }, []);
  return null;
}
