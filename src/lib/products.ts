export interface Product {
  id: string;
  nameEn: string;
  nameGu: string;
  keywords: string[];
  price: number;
}

export const NUMBER_MAP: Record<string, number> = {
  // English
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  // Gujarati
  એક: 1,
  બે: 2,
  ત્રણ: 3,
  ચાર: 4,
  પાંચ: 5,
  છ: 6,
  સાત: 7,
  આઠ: 8,
  નવ: 9,
  દસ: 10,
  // Digits
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
};

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: "veg-sandwich",
    nameEn: "Veg Sandwich",
    nameGu: "વેજીટેબલ સેન્ડવીચ",
    keywords: ["veg", "vegetable", "sandwich", "વેજ", "વેજીટેબલ", "સેન્ડવીચ"],
    price: 60,
  },
  {
    id: "aloo-mutter-sandwich",
    nameEn: "Aloo Mutter Sandwich",
    nameGu: "આલુમટર સેન્ડવીચ",
    keywords: ["aloo", "mutter", "sandwich", "આલુ", "મટર", "સેન્ડવીચ"],
    price: 60,
  },
  {
    id: "bread-butter-sandwich",
    nameEn: "Bread Butter Sandwich",
    nameGu: "બ્રેડ બટર સેન્ડવીચ",
    keywords: ["bread", "butter", "sandwich", "બ્રેડ", "બટર", "સેન્ડવીચ"],
    price: 60,
  },
  {
    id: "chatni-sandwich",
    nameEn: "Chatni Sandwich",
    nameGu: "ચટણી સેન્ડવીચ",
    keywords: ["chatni", "chutney", "sandwich", "ચટણી", "સેન્ડવીચ"],
    price: 60,
  },
  {
    id: "jam-sandwich",
    nameEn: "Jam Sandwich",
    nameGu: "જામ સેન્ડવીચ",
    keywords: ["jam", "sandwich", "જામ", "સેન્ડવીચ"],
    price: 60,
  },
  {
    id: "veg-jam-sandwich",
    nameEn: "Veg Jam Sandwich",
    nameGu: "વેજીટેબલ જામ સેન્ડવીચ",
    keywords: ["veg", "jam", "sandwich", "વેજ", "જામ", "સેન્ડવીચ"],
    price: 70,
  },
  {
    id: "cheese-sandwich",
    nameEn: "Cheese Sandwich",
    nameGu: "ચીઝ સેન્ડવીચ",
    keywords: ["cheese", "sandwich", "ચીઝ", "સેન્ડવીચ"],
    price: 100,
  },
  {
    id: "cheese-jam-sandwich",
    nameEn: "Cheese Jam Sandwich",
    nameGu: "ચીઝ જામ સેન્ડવીચ",
    keywords: ["cheese", "jam", "sandwich", "ચીઝ", "જામ", "સેન્ડવીચ"],
    price: 120,
  },
  {
    id: "aloo-mutter-cheese",
    nameEn: "Aloo Mutter Cheese",
    nameGu: "આલુમટર ચીઝ",
    keywords: ["aloo", "mutter", "cheese", "આલુ", "મટર", "ચીઝ"],
    price: 120,
  },
  {
    id: "chatni-cheese",
    nameEn: "Chatni Cheese",
    nameGu: "ચીઝ ચટણી",
    keywords: ["chatni", "chutney", "cheese", "ચટણી", "ચીઝ"],
    price: 120,
  },
  {
    id: "vegetable-cheese",
    nameEn: "Vegetable Cheese",
    nameGu: "વેજીટેબલ ચીઝ",
    keywords: ["vegetable", "cheese", "વેજીટેબલ", "ચીઝ"],
    price: 120,
  },
  {
    id: "choco-2-slice-sandwich",
    nameEn: "Choco 2 Slice Sandwich",
    nameGu: "ચોકલેટ 2 સ્લાઈસ સેન્ડવીચ",
    keywords: ["choco", "chocolate", "slice", "sandwich", "ચોકલેટ", "સ્લાઈસ", "સેન્ડવીચ"],
    price: 120,
  },
  {
    id: "three-in-one-sandwich",
    nameEn: "Three in One Sandwich",
    nameGu: "3 ઈન 1 સેન્ડવીચ",
    keywords: ["three", "one", "sandwich", "થ્રી", "સેન્ડવીચ"],
    price: 150,
  },
  {
    id: "sp-ghooghara-sandwich",
    nameEn: "Sp. Ghooghra Sandwich",
    nameGu: "સ્પે. ઘુઘરા સેન્ડવીચ",
    keywords: ["ghooghra", "ghooghara", "ghughra", "special", "sandwich", "ઘુઘરા", "સેન્ડવીચ"],
    price: 160,
  },
  {
    id: "sp-maxican-sandwich",
    nameEn: "Sp. Maxican Sandwich",
    nameGu: "સ્પે. મેક્સીકન સેન્ડવીચ",
    keywords: ["maxican", "mexican", "special", "sandwich", "મેક્સીકન", "સેન્ડવીચ"],
    price: 210,
  },
  {
    id: "cheese-corn-sandwich",
    nameEn: "Cheese Corn Sandwich",
    nameGu: "ચીઝ કોર્ન સેન્ડવીચ",
    keywords: ["cheese", "corn", "sandwich", "ચીઝ", "કોર્ન", "સેન્ડવીચ"],
    price: 200,
  },
  {
    id: "sp-paneer-tandoori",
    nameEn: "Sp. Paneer Tandoori",
    nameGu: "સ્પે. પનીર તંદુરી",
    keywords: ["paneer", "tandoori", "special", "પનીર", "તંદુરી"],
    price: 210,
  },
  {
    id: "sp-tandoori-sandwich",
    nameEn: "Sp. Tandoori Sandwich",
    nameGu: "સ્પે. તંદુરી સેન્ડવીચ",
    keywords: ["tandoori", "special", "sandwich", "તંદુરી", "સેન્ડવીચ"],
    price: 200,
  },
  {
    id: "italian-pizza",
    nameEn: "Italian Pizza",
    nameGu: "ઈટાલીયન પીઝા",
    keywords: ["italian", "pizza", "ઈટાલીયન", "પીઝા"],
    price: 150,
  },
  {
    id: "jain-pizza",
    nameEn: "Jain Pizza",
    nameGu: "જૈન પીઝા",
    keywords: ["jain", "pizza", "જૈન", "પીઝા"],
    price: 150,
  },
  {
    id: "cheese-bake-pizza",
    nameEn: "Cheese Bake Pizza",
    nameGu: "ચીઝ બેક પીઝા",
    keywords: ["cheese", "bake", "pizza", "ચીઝ", "બેક", "પીઝા"],
    price: 180,
  },
  {
    id: "vegetable-pizza",
    nameEn: "Vegetable Pizza",
    nameGu: "વેજીટેબલ પીઝા",
    keywords: ["vegetable", "veg", "pizza", "વેજીટેબલ", "પીઝા"],
    price: 180,
  },
  {
    id: "double-cheese-pizza",
    nameEn: "Double Cheese Pizza",
    nameGu: "ડબલ ચીઝ પીઝા",
    keywords: ["double", "cheese", "pizza", "ડબલ", "ચીઝ", "પીઝા"],
    price: 210,
  },
  {
    id: "double-cheese-bake-pizza",
    nameEn: "Double Cheese Bake Pizza",
    nameGu: "ડબલ ચીઝ બેક પીઝા",
    keywords: ["double", "cheese", "bake", "pizza", "ડબલ", "ચીઝ", "બેક", "પીઝા"],
    price: 210,
  },
  {
    id: "pineapple-pizza",
    nameEn: "Pineapple Pizza",
    nameGu: "પાઈનેપલ પીઝા",
    keywords: ["pineapple", "pizza", "પાઈનેપલ", "પીઝા"],
    price: 200,
  },
  {
    id: "chocolate-pizza",
    nameEn: "Chocolate Pizza",
    nameGu: "ચોકલેટ પીઝા",
    keywords: ["chocolate", "choco", "pizza", "ચોકલેટ", "પીઝા"],
    price: 200,
  },
  {
    id: "dry-fruit-pizza",
    nameEn: "Dry Fruit Pizza",
    nameGu: "ડ્રાયફ્રુટ પીઝા",
    keywords: ["dry", "fruit", "pizza", "ડ્રાય", "ફ્રુટ", "પીઝા"],
    price: 210,
  },
  {
    id: "chocolate-pineapple-pizza",
    nameEn: "Chocolate Pineapple Pizza",
    nameGu: "ચોકલેટ પાઈનેપલ પીઝા",
    keywords: ["chocolate", "pineapple", "pizza", "ચોકલેટ", "પાઈનેપલ", "પીઝા"],
    price: 200,
  },
  {
    id: "margherita-pizza",
    nameEn: "Margherita Pizza",
    nameGu: "માર્ગેરીટા પિઝા",
    keywords: ["margherita", "pizza", "માર્ગેરીટા", "પિઝા", "પીઝા"],
    price: 170,
  },
  {
    id: "sp-pineapple-sandwich",
    nameEn: "Sp. Pineapple Sandwich",
    nameGu: "સ્પે. પાઈનેપલ સેન્ડવીચ",
    keywords: ["pineapple", "special", "sandwich", "પાઈનેપલ", "સેન્ડવીચ"],
    price: 170,
  },
  {
    id: "sp-chocolate-sandwich",
    nameEn: "Sp. Chocolate Sandwich",
    nameGu: "સ્પે. ચોકલેટ સેન્ડવીચ",
    keywords: ["chocolate", "choco", "special", "sandwich", "ચોકલેટ", "સેન્ડવીચ"],
    price: 200,
  },
  {
    id: "chilli-cheese-toast",
    nameEn: "Chilli Cheese Toast",
    nameGu: "ચિલી ચીઝ ટોસ્ટ",
    keywords: ["chilli", "chili", "cheese", "toast", "ચિલી", "ચીઝ", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "cheese-onion-toast",
    nameEn: "Cheese Onion Toast",
    nameGu: "ચીઝ ઓનિયન ટોસ્ટ",
    keywords: ["cheese", "onion", "toast", "ચીઝ", "ઓનિયન", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "kulfi-sandwich",
    nameEn: "Kulfi Sandwich",
    nameGu: "કુલ્ફી સેન્ડવીચ",
    keywords: ["kulfi", "sandwich", "કુલ્ફી", "સેન્ડવીચ"],
    price: 260,
  },
  {
    id: "chocolate-rabdi-sandwich",
    nameEn: "Chocolate Rabdi Sandwich",
    nameGu: "ચોકલેટ રબડી સેન્ડવીચ",
    keywords: ["chocolate", "rabdi", "sandwich", "ચોકલેટ", "રબડી", "સેન્ડવીચ"],
    price: 200,
  },
  {
    id: "chocolate-rabdi-icecream",
    nameEn: "Chocolate Rabdi Ice Cream",
    nameGu: "ચોકલેટ રબડી આઈસક્રીમ",
    keywords: ["chocolate", "rabdi", "ice", "cream", "ચોકલેટ", "રબડી", "આઈસક્રીમ"],
    price: 250,
  },
  {
    id: "ice-cream-sandwich",
    nameEn: "Ice Cream Sandwich",
    nameGu: "આઈસક્રીમ સેન્ડવીચ",
    keywords: ["ice", "cream", "sandwich", "આઈસક્રીમ", "સેન્ડવીચ"],
    price: 220,
  },
  {
    id: "double-ice-cream-sandwich",
    nameEn: "Double Ice Cream Sandwich",
    nameGu: "ડબલ આઈસક્રીમ સેન્ડવીચ",
    keywords: ["double", "ice", "cream", "sandwich", "ડબલ", "આઈસક્રીમ", "સેન્ડવીચ"],
    price: 260,
  },
  {
    id: "chocolate-pineapple-mix",
    nameEn: "Chocolate Pineapple Mix",
    nameGu: "ચોકલેટ પાઈનેપલ મીક્ષ",
    keywords: ["chocolate", "pineapple", "mix", "ચોકલેટ", "પાઈનેપલ", "મીક્ષ"],
    price: 210,
  },
  {
    id: "chocolate-ice-cream",
    nameEn: "Chocolate Ice Cream",
    nameGu: "ચોકલેટ આઈસક્રીમ",
    keywords: ["chocolate", "ice", "cream", "ચોકલેટ", "આઈસક્રીમ"],
    price: 240,
  },
  {
    id: "choco-pineapple-mix-icecream",
    nameEn: "Choco Pineapple Mix Icecream",
    nameGu: "ચોકલેટ પાઈનેપલ મીક્ષ આઈસક્રીમ",
    keywords: ["choco", "chocolate", "pineapple", "mix", "ice", "cream", "ચોકલેટ", "પાઈનેપલ", "આઈસક્રીમ"],
    price: 250,
  },
  {
    id: "pineapple-ice-cream-sandwich",
    nameEn: "Pineapple Ice Cream Sandwich",
    nameGu: "પાઈનેપલ આઈસક્રીમ સેન્ડવીચ",
    keywords: ["pineapple", "ice", "cream", "sandwich", "પાઈનેપલ", "આઈસક્રીમ", "સેન્ડવીચ"],
    price: 240,
  },
  {
    id: "vegetable-toast",
    nameEn: "Vegetable Toast",
    nameGu: "વેજીટેબલ ટોસ્ટ",
    keywords: ["vegetable", "veg", "toast", "વેજીટેબલ", "ટોસ્ટ"],
    price: 100,
  },
  {
    id: "aloo-mutter-toast",
    nameEn: "Aloo Mutter Toast",
    nameGu: "આલુમટર ટોસ્ટ",
    keywords: ["aloo", "mutter", "toast", "આલુ", "મટર", "ટોસ્ટ"],
    price: 100,
  },
  {
    id: "bread-butter-toast",
    nameEn: "Bread Butter Toast",
    nameGu: "બ્રેડ બટર ટોસ્ટ",
    keywords: ["bread", "butter", "toast", "બ્રેડ", "બટર", "ટોસ્ટ"],
    price: 100,
  },
  {
    id: "cheese-veg-toast",
    nameEn: "Cheese Veg Toast",
    nameGu: "ચીઝ વેજ ટોસ્ટ",
    keywords: ["cheese", "veg", "toast", "ચીઝ", "વેજ", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "cheese-aloo-mutter-toast",
    nameEn: "Cheese Aloo Mutter Toast",
    nameGu: "ચીઝ આલુમટર ટોસ્ટ",
    keywords: ["cheese", "aloo", "mutter", "toast", "ચીઝ", "આલુ", "મટર", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "cheese-chatni-toast",
    nameEn: "Cheese Chatni Toast",
    nameGu: "ચીઝ ચટની ટોસ્ટ",
    keywords: ["cheese", "chatni", "chutney", "toast", "ચીઝ", "ચટની", "ટોસ્ટ"],
    price: 170,
  },
  {
    id: "jam-toast",
    nameEn: "Jam Toast",
    nameGu: "જામ ટોસ્ટ",
    keywords: ["jam", "toast", "જામ", "ટોસ્ટ"],
    price: 100,
  },
  {
    id: "cheese-toast",
    nameEn: "Cheese Toast",
    nameGu: "ચીઝ ટોસ્ટ",
    keywords: ["cheese", "toast", "ચીઝ", "ટોસ્ટ"],
    price: 170,
  },
  {
    id: "cheese-jam-toast",
    nameEn: "Cheese Jam Toast",
    nameGu: "ચીઝ જામ ટોસ્ટ",
    keywords: ["cheese", "jam", "toast", "ચીઝ", "જામ", "ટોસ્ટ"],
    price: 180,
  },
  {
    id: "three-in-one-club-toast",
    nameEn: "Three in One Club Toast",
    nameGu: "3 ઈન 1 (ક્લબ) ટોસ્ટ",
    keywords: ["three", "one", "club", "toast", "ક્લબ", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "selfi-toast-sandwich",
    nameEn: "Selfi Toast Sandwich",
    nameGu: "સેલ્ફી ટોસ્ટ સેન્ડવીચ",
    keywords: ["selfi", "selfie", "toast", "sandwich", "સેલ્ફી", "ટોસ્ટ", "સેન્ડવીચ"],
    price: 200,
  },
  {
    id: "pineapple-toast-sandwich",
    nameEn: "Pineapple Toast Sandwich",
    nameGu: "પાઈનેપલ ટોસ્ટ સેન્ડવીચ",
    keywords: ["pineapple", "toast", "sandwich", "પાઈનેપલ", "ટોસ્ટ", "સેન્ડવીચ"],
    price: 180,
  },
  {
    id: "bread-butter-slice",
    nameEn: "Bread Butter Slice",
    nameGu: "બ્રેડ બટર સ્લાઈસ",
    keywords: ["bread", "butter", "slice", "બ્રેડ", "બટર", "સ્લાઈસ"],
    price: 30,
  },
  {
    id: "sing-sev-slice",
    nameEn: "Sing Sev Slice",
    nameGu: "સીંગ સેવ સ્લાઈસ",
    keywords: ["sing", "sev", "slice", "સીંગ", "સેવ", "સ્લાઈસ"],
    price: 30,
  },
];

const CACHE_KEY = "pos-voice-products";

/** Sync read from local cache only (fast paint). Prefer fetchShopProducts for real data. */
export function loadProducts(): Product[] {
  if (typeof window === "undefined") return DEFAULT_PRODUCTS;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Product[];
    }
  } catch {
    // ignore
  }
  return DEFAULT_PRODUCTS;
}

function cacheLocally(products: Product[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(products));
  } catch {
    // ignore quota
  }
}

/** @deprecated Use saveShopProducts – kept so old call sites compile during migration */
export function saveProducts(products: Product[]): void {
  cacheLocally(products);
}

/**
 * Load menu for the logged-in user's shop from Supabase.
 * If the shop has no products yet, seeds DEFAULT_PRODUCTS once.
 * Always updates local cache for offline/fast start.
 */
export async function fetchShopProducts(): Promise<Product[]> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("list_menu_products");
  if (error) {
    console.warn("list_menu_products failed, using cache:", error.message);
    return loadProducts();
  }
  const list = (data as Product[]) || [];
  if (list.length > 0) {
    cacheLocally(list);
    return list;
  }
  // Empty shop menu → seed defaults so POS is usable immediately
  const seeded = await saveShopProducts(DEFAULT_PRODUCTS);
  return seeded;
}

/** Replace entire shop menu in DB + local cache. */
export async function saveShopProducts(products: Product[]): Promise<Product[]> {
  const { supabase } = await import("./supabase");
  const payload = products.map((p) => ({
    id: p.id,
    nameEn: p.nameEn,
    nameGu: p.nameGu,
    price: p.price,
    keywords: p.keywords,
  }));
  const { error } = await supabase.rpc("replace_menu_products", { p_items: payload });
  if (error) {
    console.error("replace_menu_products:", error.message);
    // still cache locally so UI works; user can retry
    cacheLocally(products);
    throw new Error(error.message);
  }
  cacheLocally(products);
  return products;
}

/** Add or update one product for this shop. */
export async function upsertShopProduct(product: Product): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.rpc("upsert_menu_product", {
    p_code: product.id,
    p_name_en: product.nameEn,
    p_name_gu: product.nameGu,
    p_price: product.price,
    p_keywords: product.keywords,
  });
  if (error) throw new Error(error.message);
  // refresh cache
  const current = loadProducts();
  const idx = current.findIndex((p) => p.id === product.id);
  if (idx >= 0) current[idx] = product;
  else current.push(product);
  cacheLocally(current);
}

/** Soft-delete one product for this shop. */
export async function deleteShopProduct(productId: string): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.rpc("delete_menu_product", { p_code: productId });
  if (error) throw new Error(error.message);
  cacheLocally(loadProducts().filter((p) => p.id !== productId));
}

export function makeProductId(nameEn: string): string {
  return (
    nameEn
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `item-${Date.now()}`
  );
}

export function makeKeywords(nameEn: string, nameGu: string): string[] {
  const enParts = nameEn.toLowerCase().split(/\s+/).filter(Boolean);
  const guParts = nameGu.split(/\s+/).filter(Boolean);
  const combined =
    nameEn.toLowerCase().replace(/\s+/g, "") +
    " " +
    nameGu.replace(/\s+/g, "");
  const set = new Set<string>([...enParts, ...guParts, ...combined.split(" ")]);
  return Array.from(set).filter(Boolean);
}
