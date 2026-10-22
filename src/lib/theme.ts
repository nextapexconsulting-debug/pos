export type ThemeId =
  | "sunset_orange"
  | "ocean_blue"
  | "forest_green"
  | "royal_purple"
  | "midnight_slate"
  | "rose_pink";

export const THEMES: {
  id: ThemeId;
  name: string;
  primary: string; // hex for CSS var
  primaryDark: string;
  soft: string;
}[] = [
  { id: "sunset_orange", name: "Sunset Orange", primary: "#f97316", primaryDark: "#ea580c", soft: "#ffedd5" },
  { id: "ocean_blue", name: "Ocean Blue", primary: "#0ea5e9", primaryDark: "#0284c7", soft: "#e0f2fe" },
  { id: "forest_green", name: "Forest Green", primary: "#16a34a", primaryDark: "#15803d", soft: "#dcfce7" },
  { id: "royal_purple", name: "Royal Purple", primary: "#9333ea", primaryDark: "#7e22ce", soft: "#f3e8ff" },
  { id: "midnight_slate", name: "Midnight Slate", primary: "#475569", primaryDark: "#334155", soft: "#e2e8f0" },
  { id: "rose_pink", name: "Rose Pink", primary: "#e11d48", primaryDark: "#be123c", soft: "#ffe4e6" },
];

const KEY = "pos-theme";

export function getThemeId(): ThemeId {
  if (typeof window === "undefined") return "sunset_orange";
  const t = localStorage.getItem(KEY) as ThemeId | null;
  if (t && THEMES.some((x) => x.id === t)) return t;
  return "sunset_orange";
}

export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.setProperty("--pos-primary", theme.primary);
    root.style.setProperty("--pos-primary-dark", theme.primaryDark);
    root.style.setProperty("--pos-soft", theme.soft);
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, theme.id);
  }
}

export function initThemeFromStorage() {
  applyTheme(getThemeId());
}
