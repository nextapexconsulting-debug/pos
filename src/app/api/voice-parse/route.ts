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
      { error: "GEMINI_API_KEY not set on server", items: [] },
      { status: 503 }
    );
  }

  let body: { transcript?: string; menu?: MenuItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", items: [] }, { status: 400 });
  }

  const transcript = String(body.transcript || "").trim();
  const menu = Array.isArray(body.menu) ? body.menu : [];

  if (!transcript) {
    return NextResponse.json({ error: "Empty transcript", items: [] }, { status: 400 });
  }
  if (!menu.length) {
    return NextResponse.json({ error: "Empty menu", items: [] }, { status: 400 });
  }

  // Cap menu size for token safety
  const menuSlim = menu.slice(0, 120).map((m) => ({
    id: m.id,
    nameEn: m.nameEn,
    nameGu: m.nameGu || "",
    keywords: (m.keywords || []).slice(0, 8),
  }));

  const prompt = `You match spoken food orders to a fixed menu for an Indian sandwich/pizza shop.
User said (speech-to-text, may have errors, Hinglish, Gujarati, Hindi, English):
"""${transcript.replace(/"/g, "'")}"""

MENU (you may ONLY use these product ids):
${JSON.stringify(menuSlim)}

Rules:
- Return ONLY valid JSON, no markdown, no explanation.
- Shape: {"items":[{"product_id":"<id from menu>","qty":<number>}]}
- qty is integer >= 1. Default 1 if unclear.
- Multiple items allowed. Merge same product_id by summing qty.
- Ignore greetings and words like please, bhai, dena, order.
- If nothing matches, return {"items":[]}
- Never invent product_id not in the menu list.`;

  const model =
    process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    });

    const raw = await res.json();
    if (!res.ok) {
      const msg =
        raw?.error?.message ||
        raw?.error?.status ||
        `Gemini HTTP ${res.status}`;
      return NextResponse.json({ error: msg, items: [] }, { status: 502 });
    }

    const text =
      raw?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ||
      "";

    const parsed = extractJson(text) as { items?: ParsedLine[] } | null;
    const idSet = new Set(menuSlim.map((m) => m.id));
    const items: ParsedLine[] = [];
    const qtyMap = new Map<string, number>();

    for (const row of parsed?.items || []) {
      const id = String(row?.product_id || "").trim();
      let qty = Math.floor(Number(row?.qty) || 1);
      if (!idSet.has(id)) continue;
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      if (qty > 50) qty = 50;
      qtyMap.set(id, (qtyMap.get(id) || 0) + qty);
    }
    for (const [product_id, qty] of qtyMap) {
      items.push({ product_id, qty });
    }

    return NextResponse.json({ items, source: "gemini" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gemini request failed";
    return NextResponse.json({ error: msg, items: [] }, { status: 502 });
  }
}
