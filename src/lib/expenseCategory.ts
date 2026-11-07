/** Canonical expense keys stored in DB; UI translates via t() */

export const EXPENSE_PRESETS = [
  "vegetables",
  "tea",
  "salary",
  "gas",
  "electricity",
  "rent",
  "misc",
] as const;

export type ExpensePreset = (typeof EXPENSE_PRESETS)[number];

const ALIASES: Record<string, ExpensePreset> = {
  vegetables: "vegetables",
  sabji: "vegetables",
  sabzi: "vegetables",
  "सब्ज़ी": "vegetables",
  "सब्जी": "vegetables",
  "શાકભાજી": "vegetables",
  tea: "tea",
  "चाय": "tea",
  "ચા": "tea",
  salary: "salary",
  "वेतन": "salary",
  "પગાર": "salary",
  gas: "gas",
  "गैस": "gas",
  "ગેસ": "gas",
  electricity: "electricity",
  "बिजली": "electricity",
  "લાઇટ": "electricity",
  rent: "rent",
  "किराया": "rent",
  "ભાડું": "rent",
  misc: "misc",
  miscellaneous: "misc",
  other: "misc",
  "अन्य": "misc",
  "અન્ય": "misc",
};

/** Map any language label → English key for storage */
export function normalizeExpenseCategory(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return s;
  const lower = s.toLowerCase();
  if (ALIASES[s]) return ALIASES[s];
  if (ALIASES[lower]) return ALIASES[lower];
  // Stock: keep as-is (already English product name)
  if (lower.startsWith("stock:")) return s;
  return lower; // free-text → lowercase english-ish
}

/** Display key for t() or raw */
export function expenseCategoryLabel(key: string, t: (k: string) => string): string {
  const n = normalizeExpenseCategory(key);
  if ((EXPENSE_PRESETS as readonly string[]).includes(n)) return t(n);
  return key; // stock lines etc.
}
