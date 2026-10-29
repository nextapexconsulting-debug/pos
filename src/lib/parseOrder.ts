import { NUMBER_MAP, Product } from "./products";

export interface OrderItem {
  product: Product;
  quantity: number;
}

/** Normalize for matching: lower case, strip noise, common speech fixes */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}]/g, " ")
    .replace(/\bsandwitch\b/g, "sandwich")
    .replace(/\bsandwitch\b/g, "sandwich")
    .replace(/\bvege\b/g, "veg")
    .replace(/\bvegetable\b/g, "veg")
    .replace(/\bpizzaa\b/g, "pizza")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match spoken text to products.
 * Priority: exact name → unique keyword → strong contains → token score.
 * Tries to be usable with real mic output, not only perfect lab speech.
 */
export function parseSpokenOrder(
  text: string,
  products: Product[]
): OrderItem[] {
  if (!text || !text.trim() || !products?.length) return [];

  const normalized = norm(text);
  if (!normalized) return [];

  const segments = normalized
    .split(/\s*(?:and|ane|અને|,|&|\+|plus|with)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts = segments.length > 0 ? segments : [normalized];
  const results: OrderItem[] = [];
  const used = new Set<string>();

  for (const part of parts) {
    const match = matchOne(part, products);
    if (!match) continue;
    if (used.has(match.product.id)) {
      const existing = results.find((r) => r.product.id === match.product.id);
      if (existing) existing.quantity += match.quantity;
      continue;
    }
    used.add(match.product.id);
    results.push(match);
  }

  // If nothing from segments, try whole phrase once
  if (results.length === 0) {
    const one = matchOne(normalized, products);
    if (one) results.push(one);
  }

  return results;
}

function extractQty(text: string): { qty: number; itemText: string } {
  let qty = 1;
  let itemText = text;

  const numberWords = Object.keys(NUMBER_MAP);
  const qtyRegex = new RegExp(`^(${numberWords.join("|")}|\\d+)\\s*(x|×)?\\s*`, "i");
  const qtyMatch = text.match(qtyRegex);
  if (qtyMatch) {
    const numStr = qtyMatch[1].toLowerCase();
    qty = NUMBER_MAP[numStr] || parseInt(numStr, 10) || 1;
    itemText = text.slice(qtyMatch[0].length).trim();
  }
  return { qty, itemText };
}

function matchOne(text: string, products: Product[]): OrderItem | null {
  const { qty, itemText } = extractQty(text);
  const spoken = norm(itemText || text);
  if (!spoken || spoken.length < 2) return null;

  // 1) Exact full name EN / GU
  for (const product of products) {
    const en = norm(product.nameEn);
    const gu = norm(product.nameGu || "");
    if (spoken === en || (gu && spoken === gu)) {
      return { product, quantity: qty };
    }
  }

  // 2) Exact keyword (whole phrase)
  let bestKw: Product | null = null;
  let bestKwLen = 0;
  for (const product of products) {
    for (const kw of product.keywords || []) {
      const k = norm(kw);
      if (k.length < 2) continue;
      if (spoken === k && k.length >= bestKwLen) {
        bestKw = product;
        bestKwLen = k.length;
      }
    }
  }
  if (bestKw) return { product: bestKw, quantity: qty };

  // 3) Spoken contains full product name (or name contains spoken if spoken is long enough)
  type Cand = { product: Product; score: number };
  const cands: Cand[] = [];

  for (const product of products) {
    const en = norm(product.nameEn);
    const gu = norm(product.nameGu || "");
    let score = 0;

    if (en && (spoken.includes(en) || (spoken.length >= 4 && en.includes(spoken)))) {
      score = Math.max(score, 100 + en.length);
    }
    if (gu && (spoken.includes(gu) || (spoken.length >= 4 && gu.includes(spoken)))) {
      score = Math.max(score, 100 + gu.length);
    }

    for (const kw of product.keywords || []) {
      const k = norm(kw);
      if (k.length < 3) continue;
      if (spoken === k) score = Math.max(score, 90 + k.length);
      else if (spoken.includes(k)) score = Math.max(score, 70 + k.length);
      else if (k.includes(spoken) && spoken.length >= 4) score = Math.max(score, 50 + spoken.length);
    }

    // Token overlap (at least 2 meaningful tokens shared)
    const st = spoken.split(" ").filter((w) => w.length > 2);
    const pt = (en + " " + (product.keywords || []).map(norm).join(" "))
      .split(" ")
      .filter((w) => w.length > 2);
    if (st.length && pt.length) {
      const set = new Set(pt);
      const hit = st.filter((w) => set.has(w)).length;
      if (hit > 0) {
        const ratio = hit / st.length;
        if (ratio >= 0.5) score = Math.max(score, 40 + hit * 15 + ratio * 20);
      }
    }

    if (score > 0) cands.push({ product, score });
  }

  if (!cands.length) return null;

  cands.sort((a, b) => b.score - a.score);
  const top = cands[0];
  // Ambiguous: two close scores → skip (avoid wrong item)
  if (cands.length > 1 && cands[1].score >= top.score - 5 && cands[1].score >= 70) {
    return null;
  }
  // Minimum confidence
  if (top.score < 40) return null;

  return { product: top.product, quantity: qty };
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
