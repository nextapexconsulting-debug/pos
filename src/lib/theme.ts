/** All ids accepted by TypeScript (includes legacy so old pages still compile). */
export type ThemeId =
  | "ink_snow"
  | "charcoal_brass"
  | "night_snow"
  | "saffron_gold"
  | "sunset_orange"
  | "emerald_spice"
  | "royal_maroon"
  | "copper_bronze"
  | "deep_teal"
  | "ocean_blue"
  | "forest_green"
  | "royal_purple"
  | "midnight_slate"
  | "rose_pink";

type ThemeRow = {
  id: ThemeId;
  name: string;
  primary: string;
  primaryDark: string;
  soft: string;
};

const INK: Omit<ThemeRow, "id" | "name"> = {
  primary: "#0f172a",
  primaryDark: "#020617",
  soft: "#f1f5f9",
};
const CHARCOAL: Omit<ThemeRow, "id" | "name"> = {
  primary: "#1c1917",
  primaryDark: "#0c0a09",
  soft: "#f5f5f4",
};
const NIGHT: Omit<ThemeRow, "id" | "name"> = {
  primary: "#18181b",
  primaryDark: "#09090b",
  soft: "#fafafa",
};

/** UI picker: only 3 professional options. */
export const THEMES: ThemeRow[] = [
  { id: "ink_snow", name: "Ink & Snow", ...INK },
  { id: "charcoal_brass", name: "Charcoal & Brass", ...CHARCOAL },
  { id: "night_snow", name: "Night & Snow", ...NIGHT },
];

/** Resolve any stored/legacy id to real colors. */
const RESOLVE: Record<string, Omit<ThemeRow, "id" | "name">> = {
  ink_snow: INK,
  charcoal_brass: CHARCOAL,
  night_snow: NIGHT,
  saffron_gold: INK,
  sunset_orange: INK,
  emerald_spice: INK,
  forest_green: INK,
  royal_maroon: CHARCOAL,
  copper_bronze: CHARCOAL,
  royal_purple: CHARCOAL,
  rose_pink: CHARCOAL,
  deep_teal: NIGHT,
  ocean_blue: NIGHT,
  midnight_slate: NIGHT,
};

const KEY = "pos-theme";

export function getThemeId(): ThemeId {
  if (typeof window === "undefined") return "ink_snow";
  const t = localStorage.getItem(KEY);
  if (t && RESOLVE[t]) return t as ThemeId;
  return "ink_snow";
}

export function applyTheme(id: ThemeId | string) {
  const colors = RESOLVE[id] || INK;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.setProperty("--pos-primary", colors.primary);
    root.style.setProperty("--pos-primary-dark", colors.primaryDark);
    root.style.setProperty("--pos-soft", colors.soft);
    root.style.setProperty("--pos-ink", colors.primary);
    root.style.setProperty("--pos-paper", "#ffffff");
    root.style.setProperty("--accent", colors.primary);
    root.dataset.theme = id;
  }
  if (typeof localStorage !== "undefined") {
    // Persist modern id only
    const modern =
      id === "charcoal_brass" || id === "night_snow" ? id : "ink_snow";
    localStorage.setItem(KEY, modern);
  }
}

export function initThemeFromStorage() {
  applyTheme(getThemeId());
}
