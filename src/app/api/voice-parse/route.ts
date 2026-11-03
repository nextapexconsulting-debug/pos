import { NextRequest, NextResponse } from "next/server";

type MenuItem = {
  id: string;
  nameEn: string;
  nameGu?: string;
  keywords?: string[];
  price?: number;
};

type ParsedLine = { product_id: string; qty: number };
type CallResult = { ok: true; text: string } | { ok: false; error: string };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

function extractJson(text: string): unknown {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
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

function buildPrompt(
  mode: "order" | "stock_closing",
  transcript: string,
  menuSlim: { id: string; nameEn: string; nameGu: string; keywords: string[] }[]
) {
  if (mode === "stock_closing") {
    return `You parse spoken CLOSING STOCK counts for a sandwich shop inventory.

Speech (may be messy STT, Hinglish/Gujarati/English):
"""${transcript.replace(/"/g, "'")}"""

INVENTORY (use ONLY these product_id values):
${JSON.stringify(menuSlim)}

Return ONLY valid JSON, no markdown:
{"items":[{"product_id":"<id>","qty":<number>}]}

qty = remaining/closing amount (decimals allowed for kg).
Map bread, butter, cheese, water bottle, pizza base carefully.
Omit items you cannot map confidently. If nothing: {"items":[]}`;
  }

  return `You match a spoken food order to a fixed sandwich/pizza menu.

Speech (speech-to-text errors common; Hinglish/Gujarati/Hindi/English OK):
"""${transcript.replace(/"/g, "'")}"""

MENU (use ONLY these product_id values — never invent ids):
${JSON.stringify(menuSlim)}

Return ONLY valid JSON, no markdown, no explanation:
{"items":[{"product_id":"<id from menu>","qty":<integer>}]}

Rules:
- Prefer the MOST SPECIFIC product (Cheese Sandwich not plain Sandwich if "cheese" is said).
- qty integer >= 1, default 1, max 50.
- Merge duplicate product_ids by summing qty.
- Ignore please, bhai, dena, order, give me.
- If unsure about an item, omit it. If nothing matches: {"items":[]}`;
}

function normalizeItems(
  parsed: { items?: ParsedLine[] } | null,
  idSet: Set<string>,
  mode: "order" | "stock_closing"
) {
  const qtyMap = new Map<string, number>();
  for (const row of parsed?.items || []) {
    const id = String(row?.product_id || "").trim();
    if (!idSet.has(id)) continue;
    let qty = Number(row?.qty);
    if (!Number.isFinite(qty) || qty < 0) continue;
    if (mode === "order") {
      qty = Math.floor(qty) || 1;
      if (qty > 50) qty = 50;
    } else if (qty > 9999) qty = 9999;
    qtyMap.set(id, (qtyMap.get(id) || 0) + qty);
  }
  return [...qtyMap.entries()].map(([product_id, qty]) => ({ product_id, qty }));
}

async function callGroq(key: string, model: string, prompt: string): Promise<CallResult> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You map spoken shop orders to a fixed menu. Reply with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: String(raw?.error?.message || `Groq HTTP ${res.status}`),
    };
  }
  const text = raw?.choices?.[0]?.message?.content || "";
  if (!text) return { ok: false, error: "Empty Groq reply" };
  return { ok: true, text };
}

function getGroqKey(): string | null {
  return process.env.GROQ_API_KEY || null;
}

export async function GET() {
  const key = getGroqKey();
  if (!key) {
    return NextResponse.json({
      ok: false,
      ai: false,
      error: "Set GROQ_API_KEY — then redeploy",
    });
  }

  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  const r = await callGroq(key, model, 'Reply with only this JSON: {"ok":true}');
  return NextResponse.json({
    ok: r.ok,
    ai: r.ok,
    provider: "groq",
    model,
    error: r.ok ? undefined : r.error,
  });
}

export async function POST(req: NextRequest) {
  const key = getGroqKey();
  if (!key) {
    return NextResponse.json(
      {
        error: "No AI key: set GROQ_API_KEY on Vercel + redeploy",
        items: [],
        ai: false,
      },
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
  const prompt = buildPrompt(mode, transcript, menuSlim);
  const idSet = new Set(menuSlim.map((m) => m.id));

  // Fallback chain: if a model is retired/unavailable, try the next one
  const models = [
    process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
    GROQ_DEFAULT_MODEL,
    "openai/gpt-oss-120b",
    "llama-3.1-8b-instant",
  ];
  const tried: string[] = [];
  let lastErr = "";
  let text = "";
  let model = "";

  for (const m of models) {
    if (tried.includes(m)) continue;
    tried.push(m);
    const r = await callGroq(key, m, prompt);
    if (!r.ok) {
      lastErr = r.error;
      // Model problems → try next model. Rate limit / auth → stop.
      if (/model|not found|decommissioned|invalid/i.test(r.error)) continue;
      return NextResponse.json(
        { error: r.error, items: [], ai: false, provider: "groq", model: m },
        { status: 502 }
      );
    }
    text = r.text;
    model = m;
    break;
  }

  if (!text) {
    return NextResponse.json(
      { error: lastErr || "Groq failed", items: [], ai: false, provider: "groq", tried },
      { status: 502 }
    );
  }

  const items = normalizeItems(extractJson(text) as { items?: ParsedLine[] }, idSet, mode);
  return NextResponse.json({
    items,
    source: "groq",
    ai: true,
    provider: "groq",
    model,
  });
}
