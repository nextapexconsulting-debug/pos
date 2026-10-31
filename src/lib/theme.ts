export type ThemeId = "ink_snow" | "charcoal_brass" | "night_snow";

export const THEMES: {
  id: ThemeId;
  name: string;
  primary: string;
  primaryDark: string;
  soft: string;
}[] = [
  // A = ink, B = snow — actions use ink fill; surfaces snow
  { id: "ink_snow", name: "Ink & Snow", primary: "#0f172a", primaryDark: "#020617", soft: "#f1f5f9" },
  { id: "charcoal_brass", name: "Charcoal & Brass", primary: "#1c1917", primaryDark: "#0c0a09", soft: "#f5f5f4" },
  { id: "night_snow", name: "Night & Snow", primary: "#18181b", primaryDark: "#09090b", soft: "#fafafa" },
];

const KEY = "pos-theme";

export function getThemeId(): ThemeId {
  if (typeof window === "undefined") return "ink_snow";
  const t = localStorage.getItem(KEY) as ThemeId | null;
  if (t && THEMES.some((x) => x.id === t)) return t;
  const legacy: Record<string, ThemeId> = {
    saffron_gold: "ink_snow",
    sunset_orange: "ink_snow",
    emerald_spice: "ink_snow",
    royal_maroon: "charcoal_brass",
    copper_bronze: "charcoal_brass",
    deep_teal: "night_snow",
    ocean_blue: "night_snow",
    forest_green: "ink_snow",
    royal_purple: "charcoal_brass",
    midnight_slate: "night_snow",
    rose_pink: "charcoal_brass",
  };
  if (t && legacy[t]) return legacy[t];
  return "ink_snow";
}

export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.setProperty("--pos-primary", theme.primary);
    root.style.setProperty("--pos-primary-dark", theme.primaryDark);
    root.style.setProperty("--pos-soft", theme.soft);
    root.style.setProperty("--pos-ink", theme.primary);
    root.style.setProperty("--pos-paper", "#ffffff");
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
