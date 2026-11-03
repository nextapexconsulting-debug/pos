import { NUMBER_MAP, Product } from "./products";

export interface OrderItem {
  product: Product;
  quantity: number;
}

/** Common mic / accent mistakes → canonical tokens */
const SPEECH_FIX: Record<string, string> = {
  sandwitch: "sandwich",
  sandwiche: "sandwich",
  sanwich: "sandwich",
  sandwhich: "sandwich",
  sandwch: "sandwich",
  sandvic: "sandwich",
  sandwichs: "sandwich",
  sandwishes: "sandwich",
  vege: "veg",
  vegetable: "veg",
  vegitable: "veg",
  vegetables: "veg",
  pizzaa: "pizza",
  piza: "pizza",
  pizzza: "pizza",
  peetza: "pizza",
  cheeze: "cheese",
  cheez: "cheese",
  chese: "cheese",
  chesse: "cheese",
  butterr: "butter",
  buter: "butter",
  muttar: "mutter",
  matar: "mutter",
  mater: "mutter",
  aalu: "aloo",
  alu: "aloo",
  potato: "aloo",
  chatney: "chutney",
  chatni: "chutney",
  chutni: "chutney",
  paneerr: "paneer",
  panir: "paneer",
  panear: "paneer",
  corn: "corn",
  capsicum: "capsicum",
  onion: "onion",
  tomato: "tomato",
  // Hindi / Hinglish qty leftovers
  ek: "one",
  do: "two",
  teen: "three",
  char: "four",
  paanch: "five",
  panch: "five",
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "please",
  "give",
  "me",
  "my",
  "order",
  "for",
  "only",
  "just",
  "want",
  "i",
  "we",
  "need",
  "get",
  "and",
  "or",
  "with",
  "of",
  "to",
  "bhai",
  "bhaiya",
  "dalo",
  "do",
  "dena",
  "den",
  "karo",
  "ek",
]);

function norm(s: string): string {
  let x = s
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = x.split(" ").map((w) => SPEECH_FIX[w] || w);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .map((w) => SPEECH_FIX[w] || w)
    .filter((w) => w.length > 0 && !STOP.has(w));
}

/** Simple edit distance (small strings only) */
function editDist(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function fuzzyWord(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))))
    return true;
  const d = editDist(a, b);
  if (a.length <= 4) return d <= 1;
  return d <= 2;
}

/** Extra qty words (Hindi / Hinglish) */
const QTY_EXTRA: Record<string, number> = {
  ...NUMBER_MAP,
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  chhah: 6,
  saat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  das: 10,
  half: 1,
  single: 1,
  double: 2,
};

function extractQty(text: string): { qty: number; itemText: string } {
  const n = norm(text);
  const words = n.split(" ");
  let qty = 1;
  let start = 0;
  // leading qty
  if (words.length && QTY_EXTRA[words[0]] != null) {
    qty = QTY_EXTRA[words[0]];
    start = 1;
    if (words[1] === "x" || words[1] === "times") start = 2;
  } else {
    const m = n.match(/^(\d+)\s*(x|×|times)?\s*/i);
    if (m) {
      qty = parseInt(m[1], 10) || 1;
      return { qty, itemText: n.slice(m[0].length).trim() };
    }
  }
  // trailing "x 2"
  const trail = n.match(/\s+(\d+)\s*$/);
  if (trail && start === 0) {
    qty = parseInt(trail[1], 10) || 1;
    return { qty, itemText: n.slice(0, trail.index).trim() };
  }
  return { qty, itemText: words.slice(start).join(" ") };
}

function productBagBag(p: Product): string[] {
  const bag = new Set<string>();
  for (const w of tokens(p.nameEn)) bag.add(w);
  for (const w of tokens(p.nameGu || "")) bag.add(w);
  for (const k of p.keywords || []) {
    for (const w of tokens(k)) bag.add(w);
  }
  // also full phrases
  bag.add(norm(p.nameEn));
  if (p.nameGu) bag.add(norm(p.nameGu));
  return [...bag].filter(Boolean);
}

function scoreProduct(spoken: string, spokenToks: string[], p: Product): number {
  const nameEn = norm(p.nameEn);
  const nameGu = norm(p.nameGu || "");
  if (!spoken) return 0;

  // Exact name
  if (spoken === nameEn || (nameGu && spoken === nameGu)) return 200;
  if (nameEn.includes(spoken) && spoken.length >= 4) return 160;
  if (spoken.includes(nameEn) && nameEn.length >= 4) return 150;

  const bag = productBagBag(p);
  if (!spokenToks.length) return 0;

  let hits = 0;
  let fuzzyHits = 0;
  for (const st of spokenToks) {
    if (bag.some((b) => b === st)) hits += 1;
    else if (bag.some((b) => fuzzyWord(st, b))) fuzzyHits += 1;
  }

  // keyword array direct
  for (const k of p.keywords || []) {
    const kn = norm(k);
    if (spoken.includes(kn) || kn.includes(spoken)) hits += 0.5;
  }

  const coverage = (hits + fuzzyHits * 0.75) / Math.max(spokenToks.length, 1);
  let score = coverage * 100;

  // bonus if distinctive token matches (not just "sandwich")
  const distinctive = spokenToks.filter((w) => w !== "sandwich" && w !== "pizza");
  for (const st of distinctive) {
    if (bag.some((b) => b === st || fuzzyWord(st, b))) score += 25;
  }

  // all spoken tokens hit something
  if (hits + fuzzyHits >= spokenToks.length && spokenToks.length >= 1) score += 20;

  // single distinctive word of length >= 4 matching product
  if (spokenToks.length === 1 && spokenToks[0].length >= 4) {
    if (bag.some((b) => b === spokenToks[0] || fuzzyWord(spokenToks[0], b))) score += 40;
  }

  return score;
}

function matchOne(text: string, products: Product[]): OrderItem | null {
  const { qty, itemText } = extractQty(text);
  const spoken = norm(itemText || text);
  if (!spoken || spoken.length < 2) return null;
  const spokenToks = tokens(spoken);
  if (!spokenToks.length) return null;

  const cands = products
    .map((product) => ({
      product,
      score: scoreProduct(spoken, spokenToks, product),
    }))
    .filter((c) => c.score >= 28)
    .sort((a, b) => b.score - a.score);

  if (!cands.length) return null;

  // Prefer best; only skip if two tops are almost equal AND both weak
  const top = cands[0];
  if (cands.length > 1 && cands[1].score >= top.score - 3 && top.score < 50) {
    // still take top — better to add something than nothing for shop use
  }
  return { product: top.product, quantity: Math.max(1, qty) };
}

/**
 * Parse spoken text into order lines.
 * Also tries sliding windows so “please give 2 cheese sandwich pizza” finds both.
 */
export function parseSpokenOrder(text: string, products: Product[]): OrderItem[] {
  if (!text?.trim() || !products?.length) return [];

  const normalized = norm(text);
  if (!normalized) return [];

  // Split on and / comma / plus / Gujarati ane
  const segments = normalized
    .split(/\s*(?:and|ane|aur|અને|,|&|\+|plus|with|phir|then)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const parts = segments.length ? segments : [normalized];
  const results: OrderItem[] = [];
  const used = new Set<string>();

  const add = (m: OrderItem | null) => {
    if (!m) return;
    if (used.has(m.product.id)) {
      const ex = results.find((r) => r.product.id === m.product.id);
      if (ex) ex.quantity += m.quantity;
      return;
    }
    used.add(m.product.id);
    results.push(m);
  };

  for (const part of parts) add(matchOne(part, products));

  // Whole phrase
  if (!results.length) add(matchOne(normalized, products));

  // Sliding windows of 1–4 tokens over full phrase
  if (!results.length) {
    const toks = tokens(normalized);
    for (let n = Math.min(4, toks.length); n >= 1; n--) {
      for (let i = 0; i + n <= toks.length; i++) {
        const slice = toks.slice(i, i + n).join(" ");
        add(matchOne(slice, products));
      }
      if (results.length) break;
    }
  }

  return results;
}

/** Top product suggestions for UI when auto-match fails */
export function suggestProducts(
  text: string,
  products: Product[],
  limit = 5
): Product[] {
  if (!text?.trim() || !products?.length) return [];
  const spoken = norm(text);
  const spokenToks = tokens(spoken);
  return products
    .map((product) => ({ product, score: scoreProduct(spoken, spokenToks, product) }))
    .filter((c) => c.score >= 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.product);
}

export function mergeOrderItems(
  current: OrderItem[],
  incoming: OrderItem[]
): OrderItem[] {
  const map = new Map<string, OrderItem>();
  for (const item of current) map.set(item.product.id, { ...item });
  for (const item of incoming) {
    const existing = map.get(item.product.id);
    if (existing) existing.quantity += item.quantity;
    else map.set(item.product.id, { ...item });
  }
  return Array.from(map.values());
}

export function calculateTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}
