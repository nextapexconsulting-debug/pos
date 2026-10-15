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
  // ===== SANDWICH =====
  {
    id: "veg-sandwich",
    nameEn: "Veg Sandwich",
    nameGu: "વેજ સેન્ડવિચ",
    keywords: ["veg", "sandwich", "વેજ", "સેન્ડવિચ", "વેજસેન્ડવિચ"],
    price: 50,
  },
  {
    id: "aloo-mutter-sandwich",
    nameEn: "Aloo Mutter Sandwich",
    nameGu: "આલૂ મટર સેન્ડવિચ",
    keywords: ["aloo", "mutter", "sandwich", "આલૂ", "મટર", "સેન્ડવિચ"],
    price: 50,
  },
  {
    id: "bread-butter-sandwich",
    nameEn: "Bread Butter Sandwich",
    nameGu: "બ્રેડ બટર સેન્ડવિચ",
    keywords: ["bread", "butter", "sandwich", "બ્રેડ", "બટર", "સેન્ડવિચ"],
    price: 50,
  },
  {
    id: "chatni-sandwich",
    nameEn: "Chatni Sandwich",
    nameGu: "ચટણી સેન્ડવિચ",
    keywords: ["chatni", "chutney", "sandwich", "ચટણી", "સેન્ડવિચ"],
    price: 50,
  },
  {
    id: "jam-sandwich",
    nameEn: "Jam Sandwich",
    nameGu: "જામ સેન્ડવિચ",
    keywords: ["jam", "sandwich", "જામ", "સેન્ડવિચ"],
    price: 50,
  },
  {
    id: "veg-jam-sandwich",
    nameEn: "Veg Jam Sandwich",
    nameGu: "વેજ જામ સેન્ડવિચ",
    keywords: ["veg", "jam", "sandwich", "વેજ", "જામ", "સેન્ડવિચ"],
    price: 90,
  },
  {
    id: "cheese-sandwich",
    nameEn: "Cheese Sandwich",
    nameGu: "ચીઝ સેન્ડવિચ",
    keywords: ["cheese", "sandwich", "ચીઝ", "સેન્ડવિચ", "ચીઝસેન્ડવિચ"],
    price: 100,
  },
  {
    id: "cheese-jam-sandwich",
    nameEn: "Cheese Jam Sandwich",
    nameGu: "ચીઝ જામ સેન્ડવિચ",
    keywords: ["cheese", "jam", "sandwich", "ચીઝ", "જામ", "સેન્ડવિચ"],
    price: 100,
  },
  {
    id: "aloo-mutter-cheese",
    nameEn: "Aloo Mutter Cheese",
    nameGu: "આલૂ મટર ચીઝ",
    keywords: ["aloo", "mutter", "cheese", "આલૂ", "મટર", "ચીઝ"],
    price: 100,
  },
  {
    id: "chatni-cheese",
    nameEn: "Chatni Cheese",
    nameGu: "ચટણી ચીઝ",
    keywords: ["chatni", "chutney", "cheese", "ચટણી", "ચીઝ"],
    price: 100,
  },
  {
    id: "vegetable-cheese",
    nameEn: "Vegetable Cheese",
    nameGu: "વેજીટેબલ ચીઝ",
    keywords: ["vegetable", "cheese", "વેજીટેબલ", "ચીઝ"],
    price: 100,
  },
  {
    id: "three-in-one-sandwich",
    nameEn: "Three in One Sandwich",
    nameGu: "થ્રી ઇન વન સેન્ડવિચ",
    keywords: ["three", "one", "sandwich", "થ્રી", "વન", "સેન્ડવિચ"],
    price: 140,
  },

  // ===== SPECIAL SANDWICH =====
  {
    id: "sp-ghooghara-sandwich",
    nameEn: "Sp. Ghooghara Sandwich",
    nameGu: "સ્પે. ઘૂઘરા સેન્ડવિચ",
    keywords: ["ghooghara", "ghughra", "special", "sandwich", "ઘૂઘરા", "સેન્ડવિચ"],
    price: 160,
  },
  {
    id: "sp-paneer-tandoori",
    nameEn: "Sp. Paneer Tandoori",
    nameGu: "સ્પે. પનીર તંદૂરી",
    keywords: ["paneer", "tandoori", "special", "પનીર", "તંદૂરી"],
    price: 200,
  },
  {
    id: "sp-maxican-sandwich",
    nameEn: "Sp. Maxican Sandwich",
    nameGu: "સ્પે. મેક્સિકન સેન્ડવિચ",
    keywords: ["maxican", "mexican", "special", "sandwich", "મેક્સિકન", "સેન્ડવિચ"],
    price: 200,
  },
  {
    id: "sp-tandoori-sandwich",
    nameEn: "Sp. Tandoori Sandwich",
    nameGu: "સ્પે. તંદૂરી સેન્ડવિચ",
    keywords: ["tandoori", "special", "sandwich", "તંદૂરી", "સેન્ડવિચ"],
    price: 190,
  },

  // ===== PIZZA =====
  {
    id: "italian-pizza",
    nameEn: "Italian Pizza",
    nameGu: "ઈટાલિયન પિઝા",
    keywords: ["italian", "pizza", "ઈટાલિયન", "પિઝા"],
    price: 160,
  },
  {
    id: "jain-pizza",
    nameEn: "Jain Pizza",
    nameGu: "જૈન પિઝા",
    keywords: ["jain", "pizza", "જૈન", "પિઝા"],
    price: 170,
  },
  {
    id: "cheese-bake-pizza",
    nameEn: "Cheese Bake Pizza",
    nameGu: "ચીઝ બેક પિઝા",
    keywords: ["cheese", "bake", "pizza", "ચીઝ", "બેક", "પિઝા"],
    price: 170,
  },
  {
    id: "vegetable-pizza",
    nameEn: "Vegetable Pizza",
    nameGu: "વેજીટેબલ પિઝા",
    keywords: ["vegetable", "veg", "pizza", "વેજીટેબલ", "પિઝા"],
    price: 200,
  },
  {
    id: "double-cheese-pizza",
    nameEn: "Double Cheese Pizza",
    nameGu: "ડબલ ચીઝ પિઝા",
    keywords: ["double", "cheese", "pizza", "ડબલ", "ચીઝ", "પિઝા"],
    price: 200,
  },
  {
    id: "double-vegetable-pizza",
    nameEn: "Double Vegetable Pizza",
    nameGu: "ડબલ વેજીટેબલ પિઝા",
    keywords: ["double", "vegetable", "pizza", "ડબલ", "વેજીટેબલ", "પિઝા"],
    price: 190,
  },
  {
    id: "pineapple-pizza",
    nameEn: "Pineapple Pizza",
    nameGu: "પાઈનેપલ પિઝા",
    keywords: ["pineapple", "pizza", "પાઈનેપલ", "પિઝા"],
    price: 190,
  },
  {
    id: "dry-fruit-pizza",
    nameEn: "Dry Fruit Pizza",
    nameGu: "ડ્રાય ફ્રૂટ પિઝા",
    keywords: ["dry", "fruit", "pizza", "ડ્રાય", "ફ્રૂટ", "પિઝા"],
    price: 200,
  },
  {
    id: "chocolate-pineapple-pizza",
    nameEn: "Chocolate Pineapple Pizza",
    nameGu: "ચોકલેટ પાઈનેપલ પિઝા",
    keywords: ["chocolate", "pineapple", "pizza", "ચોકલેટ", "પાઈનેપલ", "પિઝા"],
    price: 190,
  },

  // ===== KRISHNA SP. VARIETY =====
  {
    id: "sp-pineapple-sandwich",
    nameEn: "Sp. Pineapple Sandwich",
    nameGu: "સ્પે. પાઈનેપલ સેન્ડવિચ",
    keywords: ["pineapple", "special", "sandwich", "પાઈનેપલ", "સેન્ડવિચ"],
    price: 150,
  },
  {
    id: "sp-chocolate-sandwich",
    nameEn: "Sp. Chocolate Sandwich",
    nameGu: "સ્પે. ચોકલેટ સેન્ડવિચ",
    keywords: ["chocolate", "special", "sandwich", "ચોકલેટ", "સેન્ડવિચ"],
    price: 160,
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
    nameGu: "કુલ્ફી સેન્ડવિચ",
    keywords: ["kulfi", "sandwich", "કુલ્ફી", "સેન્ડવિચ"],
    price: 250,
  },
  {
    id: "chocolate-rabdi-sandwich",
    nameEn: "Chocolate Rabdi Sandwich",
    nameGu: "ચોકલેટ રબડી સેન્ડવિચ",
    keywords: ["chocolate", "rabdi", "sandwich", "ચોકલેટ", "રબડી", "સેન્ડવિચ"],
    price: 200,
  },
  {
    id: "chocolate-rabdi-icecream",
    nameEn: "Chocolate Rabdi Ice Cream",
    nameGu: "ચોકલેટ રબડી આઈસ્ક્રીમ",
    keywords: ["chocolate", "rabdi", "ice", "cream", "ચોકલેટ", "રબડી", "આઈસ્ક્રીમ"],
    price: 190,
  },
  {
    id: "ice-cream-sandwich",
    nameEn: "Ice Cream Sandwich",
    nameGu: "આઈસ્ક્રીમ સેન્ડવિચ",
    keywords: ["ice", "cream", "sandwich", "આઈસ્ક્રીમ", "સેન્ડવિચ"],
    price: 220,
  },
  {
    id: "double-ice-cream-sandwich",
    nameEn: "Double Ice Cream Sandwich",
    nameGu: "ડબલ આઈસ્ક્રીમ સેન્ડવિચ",
    keywords: ["double", "ice", "cream", "sandwich", "ડબલ", "આઈસ્ક્રીમ", "સેન્ડવિચ"],
    price: 250,
  },
  {
    id: "chocolate-pineapple-mix",
    nameEn: "Chocolate Pineapple Mix",
    nameGu: "ચોકલેટ પાઈનેપલ મિક્સ",
    keywords: ["chocolate", "pineapple", "mix", "ચોકલેટ", "પાઈનેપલ", "મિક્સ"],
    price: 190,
  },
  {
    id: "choco-pineapple-mix-icecream",
    nameEn: "Choco Pineapple Mix Icecream",
    nameGu: "ચોકો પાઈનેપલ મિક્સ આઈસ્ક્રીમ",
    keywords: ["choco", "chocolate", "pineapple", "mix", "icecream", "ચોકો", "પાઈનેપલ", "આઈસ્ક્રીમ"],
    price: 220,
  },
  {
    id: "chocolate-ice-cream",
    nameEn: "Chocolate Ice Cream",
    nameGu: "ચોકલેટ આઈસ્ક્રીમ",
    keywords: ["chocolate", "ice", "cream", "ચોકલેટ", "આઈસ્ક્રીમ"],
    price: 200,
  },
  {
    id: "pineapple-ice-cream-sandwich",
    nameEn: "Pineapple Ice Cream Sandwich",
    nameGu: "પાઈનેપલ આઈસ્ક્રીમ સેન્ડવિચ",
    keywords: ["pineapple", "ice", "cream", "sandwich", "પાઈનેપલ", "આઈસ્ક્રીમ", "સેન્ડવિચ"],
    price: 200,
  },

  // ===== TOAST SANDWICH =====
  {
    id: "vegetable-toast",
    nameEn: "Vegetable Toast",
    nameGu: "વેજીટેબલ ટોસ્ટ",
    keywords: ["vegetable", "toast", "વેજીટેબલ", "ટોસ્ટ"],
    price: 100,
  },
  {
    id: "aloo-mutter-toast",
    nameEn: "Aloo Mutter Toast",
    nameGu: "આલૂ મટર ટોસ્ટ",
    keywords: ["aloo", "mutter", "toast", "આલૂ", "મટર", "ટોસ્ટ"],
    price: 100,
  },
  {
    id: "bread-butter-toast",
    nameEn: "Bread Butter Toast",
    nameGu: "બ્રેડ બટર ટોસ્ટ",
    keywords: ["bread", "butter", "toast", "બ્રેડ", "બટર", "ટોસ્ટ"],
    price: 90,
  },
  {
    id: "cheese-veg-toast",
    nameEn: "Cheese Veg Toast",
    nameGu: "ચીઝ વેજ ટોસ્ટ",
    keywords: ["cheese", "veg", "toast", "ચીઝ", "વેજ", "ટોસ્ટ"],
    price: 150,
  },
  {
    id: "cheese-aloomutter-toast",
    nameEn: "Cheese Aloomutter Toast",
    nameGu: "ચીઝ આલૂમટર ટોસ્ટ",
    keywords: ["cheese", "aloo", "mutter", "toast", "ચીઝ", "આલૂ", "મટર", "ટોસ્ટ"],
    price: 150,
  },
  {
    id: "cheese-chatni-toast",
    nameEn: "Cheese Chatni Toast",
    nameGu: "ચીઝ ચટણી ટોસ્ટ",
    keywords: ["cheese", "chatni", "chutney", "toast", "ચીઝ", "ચટણી", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "jam-toast",
    nameEn: "Jam Toast",
    nameGu: "જામ ટોસ્ટ",
    keywords: ["jam", "toast", "જામ", "ટોસ્ટ"],
    price: 90,
  },
  {
    id: "cheese-toast",
    nameEn: "Cheese Toast",
    nameGu: "ચીઝ ટોસ્ટ",
    keywords: ["cheese", "toast", "ચીઝ", "ટોસ્ટ"],
    price: 160,
  },
  {
    id: "cheese-jam-toast",
    nameEn: "Cheese Jam Toast",
    nameGu: "ચીઝ જામ ટોસ્ટ",
    keywords: ["cheese", "jam", "toast", "ચીઝ", "જામ", "ટોસ્ટ"],
    price: 170,
  },
  {
    id: "three-in-one-club-toast",
    nameEn: "Three in One Club Toast",
    nameGu: "થ્રી ઇન વન ક્લબ ટોસ્ટ",
    keywords: ["three", "one", "club", "toast", "થ્રી", "ક્લબ", "ટોસ્ટ"],
    price: 190,
  },
  {
    id: "selfi-toast-sandwich",
    nameEn: "Selfi Toast Sandwich",
    nameGu: "સેલ્ફી ટોસ્ટ સેન્ડવિચ",
    keywords: ["selfi", "selfie", "toast", "sandwich", "સેલ્ફી", "ટોસ્ટ", "સેન્ડવિચ"],
    price: 190,
  },
  {
    id: "pineapple-toast-sandwich",
    nameEn: "Pineapple Toast Sandwich",
    nameGu: "પાઈનેપલ ટોસ્ટ સેન્ડવિચ",
    keywords: ["pineapple", "toast", "sandwich", "પાઈનેપલ", "ટોસ્ટ", "સેન્ડવિચ"],
    price: 170,
  },
  {
    id: "bread-butter-slice",
    nameEn: "Bread Butter Slice",
    nameGu: "બ્રેડ બટર સ્લાઇસ",
    keywords: ["bread", "butter", "slice", "બ્રેડ", "બટર", "સ્લાઇસ"],
    price: 20,
  },
];

const STORAGE_KEY = "pos-voice-products";

export function loadProducts(): Product[] {
  if (typeof window === "undefined") return DEFAULT_PRODUCTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_PRODUCTS;
}

export function saveProducts(products: Product[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
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
