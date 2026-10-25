export type ThemeId =
  | "saffron_gold"
  | "emerald_spice"
  | "royal_maroon"
  | "copper_bronze"
  | "deep_teal"
  | "charcoal_amber";

export const THEMES: {
  id: ThemeId;
  name: string;
  primary: string;
  primaryDark: string;
  soft: string;
}[] = [
  { id: "saffron_gold", name: "Saffron Gold", primary: "#c2410c", primaryDark: "#9a3412", soft: "#ffedd5" },
  { id: "emerald_spice", name: "Emerald Spice", primary: "#047857", primaryDark: "#065f46", soft: "#d1fae5" },
  { id: "royal_maroon", name: "Royal Maroon", primary: "#9f1239", primaryDark: "#881337", soft: "#ffe4e6" },
  { id: "copper_bronze", name: "Copper Bronze", primary: "#b45309", primaryDark: "#92400e", soft: "#fef3c7" },
  { id: "deep_teal", name: "Deep Teal", primary: "#0f766e", primaryDark: "#115e59", soft: "#ccfbf1" },
  { id: "charcoal_amber", name: "Charcoal Amber", primary: "#d97706", primaryDark: "#1c1917", soft: "#fef3c7" },
];

const KEY = "pos-theme";

export function getThemeId(): ThemeId {
  if (typeof window === "undefined") return "saffron_gold";
  const t = localStorage.getItem(KEY) as ThemeId | null;
  if (t && THEMES.some((x) => x.id === t)) return t;
  // migrate old ids
  const legacy: Record<string, ThemeId> = {
    sunset_orange: "saffron_gold",
    ocean_blue: "deep_teal",
    forest_green: "emerald_spice",
    royal_purple: "royal_maroon",
    midnight_slate: "charcoal_amber",
    rose_pink: "copper_bronze",
  };
  if (t && legacy[t]) return legacy[t];
  return "saffron_gold";
}

export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.setProperty("--pos-primary", theme.primary);
    root.style.setProperty("--pos-primary-dark", theme.primaryDark);
    root.style.setProperty("--pos-soft", theme.soft);
    root.style.setProperty("--accent", theme.primary);
    root.dataset.theme = theme.id;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, theme.id);
  }
}

export function initThemeFromStorage() {
  applyTheme(getThemeId());
}
