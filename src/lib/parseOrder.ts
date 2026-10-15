import { NUMBER_MAP, Product } from "./products";

export interface OrderItem {
  product: Product;
  quantity: number;
}

/**
 * Parse spoken text into order items.
 * Strict matching: only add what was clearly spoken — no weak/false positives.
 * Strategy:
 * 1. Prefer full product name match (English or Gujarati)
 * 2. Fall back to longest exact keyword match (whole-word preferred)
 * 3. Support quantity before the item name
 * 4. High threshold + require substantial match length to avoid extras
 */
export function parseSpokenOrder(
  text: string,
  products: Product[]
): OrderItem[] {
  if (!text || !text.trim() || !products?.length) return [];

  // Normalize: lowercase, collapse spaces, remove punctuation
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  // Split into segments by common separators (and, અને, comma, etc.)
  const segments = normalized
    .split(/\s*(?:and|ane|અને|,|&|\+|plus)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts = segments.length > 0 ? segments : [normalized];

  const results: OrderItem[] = [];
  const usedProductIds = new Set<string>();

  for (const part of parts) {
    const match = matchOneProduct(part, products);
    if (!match) continue;

    // Avoid adding same product twice from one utterance
    if (usedProductIds.has(match.product.id)) {
      const existing = results.find((r) => r.product.id === match.product.id);
      if (existing) existing.quantity += match.quantity;
      continue;
    }

    usedProductIds.add(match.product.id);
    results.push(match);
  }

  return results;
}

function matchOneProduct(
  text: string,
  products: Product[]
): OrderItem | null {
  // Extract leading quantity if present
  let qty = 1;
  let itemText = text;

  const numberWords = Object.keys(NUMBER_MAP);
  const qtyRegex = new RegExp(
    `^(${numberWords.join("|")}|\\d+)\\s+`,
    "i"
  );
  const qtyMatch = text.match(qtyRegex);
  if (qtyMatch) {
    const numStr = qtyMatch[1].toLowerCase();
    qty = NUMBER_MAP[numStr] || parseInt(numStr, 10) || 1;
    itemText = text.slice(qtyMatch[0].length).trim();
  }

  if (!itemText || itemText.length < 2) return null;

  // Score each product by how well it matches
  let best: { product: Product; score: number } | null = null;

  for (const product of products) {
    const score = scoreMatch(itemText, product);
    if (score > 0 && (!best || score > best.score)) {
      best = { product, score };
    }
  }

  // Strict minimum score — avoid weak / partial / wrong matches
  if (!best || best.score < 70) return null;

  return { product: best.product, quantity: qty };
}

/**
 * Score how well spoken text matches a product.
 * Higher = better match. Designed to be strict.
 */
function scoreMatch(spoken: string, product: Product): number {
  const spokenNorm = spoken.toLowerCase().trim();
  const nameEn = product.nameEn.toLowerCase();
  const nameGu = product.nameGu.toLowerCase();

  // Exact full name match (best)
  if (spokenNorm === nameEn || spokenNorm === nameGu) return 100;

  // Spoken is the full English/Gujarati name (contains or equal after normalize)
  if (spokenNorm === nameEn.replace(/\s+/g, " ") || spokenNorm === nameGu.replace(/\s+/g, " "))
    return 100;

  // Spoken contains full English name as whole phrase
  if (nameEn.length >= 3 && spokenNorm.includes(nameEn)) return 95;
  if (nameGu.length >= 2 && spokenNorm.includes(nameGu)) return 95;

  // Full English name contains spoken only if spoken is long enough (avoid "pizza" matching everything)
  if (nameEn.includes(spokenNorm) && spokenNorm.length >= 5) return 80;

  // Keywords – prefer exact whole-word / longer matches only
  let bestKeywordScore = 0;
  for (const kw of product.keywords) {
    const k = kw.toLowerCase().trim();
    if (k.length < 3) continue;

    // Exact keyword match
    if (spokenNorm === k) {
      bestKeywordScore = Math.max(bestKeywordScore, 90);
      continue;
    }

    // Whole-word match inside spoken (stricter than includes)
    const wordRe = new RegExp(`(?:^|\\s)${escapeRegExp(k)}(?:\\s|$)`, "i");
    if (wordRe.test(spokenNorm)) {
      // Longer keyword = higher score
      const score = 70 + Math.min(k.length, 20);
      bestKeywordScore = Math.max(bestKeywordScore, Math.min(score, 88));
    }
  }

  // Word-overlap only for multi-word names and high overlap
  const spokenWords = spokenNorm.split(/\s+/).filter((w) => w.length > 2);
  const nameWords = nameEn.split(/\s+/).filter((w) => w.length > 2);
  if (spokenWords.length >= 2 && nameWords.length >= 2) {
    let overlap = 0;
    for (const sw of spokenWords) {
      if (nameWords.some((nw) => nw === sw || (nw.length >= 4 && (nw.includes(sw) || sw.includes(nw))))) {
        overlap++;
      }
    }
    const overlapRatio = overlap / Math.max(spokenWords.length, nameWords.length);
    if (overlapRatio >= 0.75) {
      bestKeywordScore = Math.max(bestKeywordScore, Math.round(overlapRatio * 85));
    }
  }

  return bestKeywordScore;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge new items into existing order
 */
export function mergeOrderItems(
  current: OrderItem[],
  incoming: OrderItem[]
): OrderItem[] {
  const map = new Map<string, OrderItem>();

  for (const item of current) {
    map.set(item.product.id, { ...item });
  }

  for (const item of incoming) {
    const existing = map.get(item.product.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(item.product.id, { ...item });
    }
  }

  return Array.from(map.values());
}

export function calculateTotal(items: OrderItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
}
