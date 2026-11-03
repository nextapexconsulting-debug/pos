export type AppLang = "en" | "gu" | "mr" | "ta" | "hi";

export const LANG_OPTIONS: { id: AppLang; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { id: "mr", label: "Marathi", native: "मराठी" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
];

const KEY = "pos-lang";

type Dict = Record<string, string>;

const en: Dict = {
  new_order: "New Order",
  menu: "Menu",
  customer: "Customer",
  customer_name: "Customer name (optional)",
  mobile: "Mobile number (optional)",
  search: "Search product (English / local)…",
  current_order: "Current Order",
  okay: "Okay",
  no_items: "No items yet",
  tap_products: "Tap products to add",
  total: "Total",
  parcel: "P",
  jain: "J",
  orders: "Orders",
  save: "Save",
  configuration: "Configuration",
  language: "App language",
  language_hint:
    "UI labels use this language. Product names use English + Gujarati from menu (add local names in menu when available).",
  all: "All",
  install: "Install GenZPOS to homescreen",
  pay_now: "Pay Now",
  amount_to_pay: "Amount to pay",
  scan_to_pay: "Scan to pay",
};

const gu: Dict = {
  ...en,
  new_order: "નવો ઓર્ડર",
  menu: "મેનુ",
  customer: "ગ્રાહક",
  customer_name: "ગ્રાહકનું નામ (વૈકલ્પિક)",
  mobile: "મોબાઇલ નંબર (વૈકલ્પિક)",
  search: "પ્રોડક્ટ શોધો…",
  current_order: "હાલનો ઓર્ડર",
  okay: "ઓકે",
  no_items: "હજુ આઇટમ નથી",
  tap_products: "ઉત્પાદન પર ટેપ કરો",
  total: "કુલ",
  orders: "ઓર્ડર્સ",
  save: "સેવ",
  configuration: "સેટિંગ્સ",
  language: "એપ ભાષા",
  all: "બધા",
  pay_now: "પેમેન્ટ",
  amount_to_pay: "ચૂકવવાની રકમ",
  scan_to_pay: "સ્કેન કરીને પેમેન્ટ",
};

const hi: Dict = {
  ...en,
  new_order: "नया ऑर्डर",
  menu: "मेनू",
  customer: "ग्राहक",
  customer_name: "ग्राहक का नाम (वैकल्पिक)",
  mobile: "मोबाइल नंबर (वैकल्पिक)",
  search: "प्रोडक्ट खोजें…",
  current_order: "वर्तमान ऑर्डर",
  okay: "ओके",
  no_items: "अभी कोई आइटम नहीं",
  tap_products: "प्रोडक्ट पर टैप करें",
  total: "कुल",
  orders: "ऑर्डर",
  save: "सेव",
  configuration: "सेटिंग्स",
  language: "ऐप भाषा",
  all: "सभी",
  pay_now: "पेमेंट",
  amount_to_pay: "देय राशि",
  scan_to_pay: "स्कैन कर भुगतान करें",
};

const mr: Dict = {
  ...en,
  new_order: "नवीन ऑर्डर",
  menu: "मेनू",
  customer: "ग्राहक",
  customer_name: "ग्राहकाचे नाव (ऐच्छिक)",
  mobile: "मोबाइल नंबर (ऐच्छिक)",
  search: "प्रॉडक्ट शोधा…",
  current_order: "सध्याचा ऑर्डर",
  okay: "ओके",
  no_items: "अद्याप आयटम नाही",
  tap_products: "प्रॉडक्ट टॅप करा",
  total: "एकूण",
  orders: "ऑर्डर्स",
  save: "सेव्ह",
  configuration: "सेटिंग्ज",
  language: "अ‍ॅप भाषा",
  all: "सर्व",
  pay_now: "पेमेंट",
  amount_to_pay: "देय रक्कम",
  scan_to_pay: "स्कॅन करून पेमेंट",
};

const ta: Dict = {
  ...en,
  new_order: "புதிய ஆர்டர்",
  menu: "மெனு",
  customer: "வாடிக்கையாளர்",
  customer_name: "பெயர் (விருப்பம்)",
  mobile: "மொபைல் எண் (விருப்பம்)",
  search: "பொருள் தேடு…",
  current_order: "தற்போதைய ஆர்டர்",
  okay: "சரி",
  no_items: "இன்னும் பொருட்கள் இல்லை",
  tap_products: "பொருளைத் தொடவும்",
  total: "மொத்தம்",
  orders: "ஆர்டர்கள்",
  save: "சேமி",
  configuration: "அமைப்புகள்",
  language: "ஆப் மொழி",
  all: "அனைத்தும்",
  pay_now: "பேமென்ட்",
  amount_to_pay: "செலுத்த வேண்டிய தொகை",
  scan_to_pay: "ஸ்கேன் செய்து செலுத்து",
};

const TABLES: Record<AppLang, Dict> = { en, gu, hi, mr, ta };

export function getLang(): AppLang {
  if (typeof window === "undefined") return "en";
  const v = localStorage.getItem(KEY) as AppLang | null;
  if (v && TABLES[v]) return v;
  return "en";
}

export function setLang(lang: AppLang) {
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, lang);
  if (typeof document !== "undefined") {
    document.documentElement.lang =
      lang === "en" ? "en" : lang === "gu" ? "gu" : lang === "hi" ? "hi" : lang === "mr" ? "mr" : "ta";
  }
}

export function t(key: string, lang?: AppLang): string {
  const L = lang || (typeof window !== "undefined" ? getLang() : "en");
  return TABLES[L]?.[key] || TABLES.en[key] || key;
}

/** Primary product label for list/cart */
export function productPrimary(
  p: { nameEn: string; nameGu?: string },
  lang?: AppLang
): string {
  const L = lang || getLang();
  if (L === "gu" && p.nameGu?.trim()) return p.nameGu;
  return p.nameEn;
}

/** Secondary line under product */
export function productSecondary(
  p: { nameEn: string; nameGu?: string },
  lang?: AppLang
): string {
  const L = lang || getLang();
  if (L === "gu" && p.nameGu?.trim()) return p.nameEn;
  if (p.nameGu?.trim() && p.nameGu !== p.nameEn) return p.nameGu;
  return "";
}
