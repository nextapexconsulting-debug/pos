import { NUMBER_MAP, Product } from "./products";

export interface OrderItem {
  product: Product;
  quantity: number;
}

/**
 * 100% precise voice matching:
 * - Only exact product name (EN or GU), or exact keyword as the whole spoken phrase
 * - No fuzzy / partial / "sounds like" matches
 */
export function parseSpokenOrder(
  text: string,
  products: Product[]
): OrderItem[] {
  if (!text || !text.trim() || !products?.length) return [];

  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const segments = normalized
    .split(/\s*(?:and|ane|અને|,|&|\+|plus)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts = segments.length > 0 ? segments : [normalized];
  const results: OrderItem[] = [];
  const used = new Set<string>();

  for (const part of parts) {
    const match = matchExactOnly(part, products);
    if (!match) continue;
    if (used.has(match.product.id)) {
      const existing = results.find((r) => r.product.id === match.product.id);
      if (existing) existing.quantity += match.quantity;
      continue;
    }
    used.add(match.product.id);
    results.push(match);
  }

  return results;
}

function matchExactOnly(text: string, products: Product[]): OrderItem | null {
  let qty = 1;
  let itemText = text;

  const numberWords = Object.keys(NUMBER_MAP);
  const qtyRegex = new RegExp(`^(${numberWords.join("|")}|\\d+)\\s+`, "i");
  const qtyMatch = text.match(qtyRegex);
  if (qtyMatch) {
    const numStr = qtyMatch[1].toLowerCase();
    qty = NUMBER_MAP[numStr] || parseInt(numStr, 10) || 1;
    itemText = text.slice(qtyMatch[0].length).trim();
  }

  if (!itemText) return null;

  const spoken = itemText.toLowerCase().trim();

  // 1) Exact full name (English or Gujarati)
  for (const product of products) {
    const en = product.nameEn.toLowerCase().trim();
    const gu = product.nameGu.toLowerCase().trim();
    if (spoken === en || spoken === gu) {
      return { product, quantity: qty };
    }
  }

  // 2) Exact keyword only (whole spoken phrase equals one keyword)
  let best: Product | null = null;
  let bestLen = 0;
  for (const product of products) {
    for (const kw of product.keywords) {
      const k = kw.toLowerCase().trim();
      if (k.length < 3) continue;
      if (spoken === k && k.length > bestLen) {
        best = product;
        bestLen = k.length;
      }
    }
  }
  if (best) return { product: best, quantity: qty };

  // 3) "N x Name" style already handled via qty strip — nothing else
  return null;
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
