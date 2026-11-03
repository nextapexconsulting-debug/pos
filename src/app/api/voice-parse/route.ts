import { NextRequest, NextResponse } from "next/server";

type MenuItem = {
  id: string;
  nameEn: string;
  nameGu?: string;
  keywords?: string[];
  price?: number;
};

type ParsedLine = { product_id: string; qty: number };

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not set on server", items: [], ai: false },
      { status: 503 }
    );
  }

  let body: {
    transcript?: string;
    menu?: MenuItem[];
    mode?: "order" | "stock_closing";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", items: [], ai: false }, { status: 400 });
  }

  const transcript = String(body.transcript || "").trim();
  const menu = Array.isArray(body.menu) ? body.menu : [];
  const mode = body.mode === "stock_closing" ? "stock_closing" : "order";

  if (!transcript) {
    return NextResponse.json({ error: "Empty transcript", items: [], ai: false }, { status: 400 });
  }
  if (!menu.length) {
    return NextResponse.json({ error: "Empty menu", items: [], ai: false }, { status: 400 });
  }

  const menuSlim = menu.slice(0, 120).map((m) => ({
    id: m.id,
    nameEn: m.nameEn,
    nameGu: m.nameGu || "",
    keywords: (m.keywords || []).slice(0, 12),
  }));

  const orderPrompt = `You match spoken food orders to a fixed menu for an Indian sandwich/pizza shop.
User said (speech-to-text; may have errors; Hinglish/Gujarati/Hindi/English):
"""${transcript.replace(/"/g, "'")}"""

MENU (ONLY these product ids are allowed):
${JSON.stringify(menuSlim)}

Rules:
- Return ONLY valid JSON. No markdown.
- Shape: {"items":[{"product_id":"<id from menu>","qty":<integer>}]}
- qty >= 1. Default 1 if unclear. Max 50.
- Prefer the MOST SPECIFIC product (e.g. Cheese Sandwich over plain Sandwich when "cheese" is said).
- Do NOT guess weakly. If unsure about an item, omit it.
- Multiple items OK. Merge same product_id by summing qty.
- Ignore please, bhai, dena, order, give me.
- If nothing is clear: {"items":[]}`;

  const stockPrompt = `You parse spoken CLOSING STOCK counts for a sandwich shop.
User said remaining/closing quantities (speech-to-text may be messy):
"""${transcript.replace(/"/g, "'")}"""

INVENTORY ITEMS (ONLY these ids):
${JSON.stringify(menuSlim)}

Typical names: bread (packet), butter (kg), cheese (kg), water bottle, pizza base (pieces).

Rules:
- Return ONLY JSON: {"items":[{"product_id":"<id>","qty":<number>}]}
- qty = remaining/closing count (can be decimal for kg e.g. 2.5).
- Map speech to the closest inventory item by name/keywords.
- "water" / "bottle" → water item; "pizza" / "base" → pizza base; "bread" → bread.
- If a number is spoken with an item, use that number as qty.
- Omit items you cannot map confidently.
- If nothing clear: {"items":[]}`;

  const prompt = mode === "stock_closing" ? stockPrompt : orderPrompt;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.05,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    });

    const raw = await res.json();
    if (!res.ok) {
      const msg = raw?.error?.message || raw?.error?.status || `Gemini HTTP ${res.status}`;
      return NextResponse.json({ error: msg, items: [], ai: false }, { status: 502 });
    }

    const text =
      raw?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ||
      "";

    const parsed = extractJson(text) as { items?: ParsedLine[] } | null;
    const idSet = new Set(menuSlim.map((m) => m.id));
    const qtyMap = new Map<string, number>();

    for (const row of parsed?.items || []) {
      const id = String(row?.product_id || "").trim();
      if (!idSet.has(id)) continue;
      let qty = Number(row?.qty);
      if (!Number.isFinite(qty) || qty < 0) continue;
      if (mode === "order") {
        qty = Math.floor(qty);
        if (qty < 1) qty = 1;
        if (qty > 50) qty = 50;
      } else {
        // stock can be decimal
        if (qty > 9999) qty = 9999;
      }
      qtyMap.set(id, (qtyMap.get(id) || 0) + qty);
    }

    const items = [...qtyMap.entries()].map(([product_id, qty]) => ({ product_id, qty }));
    return NextResponse.json({ items, source: "gemini", ai: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gemini request failed";
    return NextResponse.json({ error: msg, items: [], ai: false }, { status: 502 });
  }
}
