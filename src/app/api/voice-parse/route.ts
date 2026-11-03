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

/** Anthropic Claude Messages API */
async function callClaude(
  key: string,
  model: string,
  prompt: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      raw?.error?.message ||
      raw?.error?.type ||
      `Claude HTTP ${res.status}`;
    return { ok: false, error: String(msg) };
  }
  const parts = raw?.content;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p.text || "").join("")
    : "";
  if (!text) return { ok: false, error: "Empty Claude reply" };
  return { ok: true, text };
}

/** Google Gemini (optional fallback) */
async function callGemini(
  key: string,
  model: string,
  prompt: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: String(raw?.error?.message || `Gemini HTTP ${res.status}`),
    };
  }
  const text =
    raw?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") || "";
  if (!text) return { ok: false, error: "Empty Gemini reply" };
  return { ok: true, text };
}

export async function GET() {
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (claudeKey) {
    const model =
      process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const r = await callClaude(
      claudeKey,
      model,
      'Reply with only this JSON: {"ok":true}'
    );
    if (r.ok) {
      return NextResponse.json({
        ok: true,
        ai: true,
        provider: "claude",
        model,
        keyPrefix: claudeKey.slice(0, 8) + "…",
      });
    }
    return NextResponse.json({
      ok: false,
      ai: false,
      provider: "claude",
      error: r.error,
    });
  }

  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const r = await callGemini(
      geminiKey,
      model,
      'Reply with only this JSON: {"ok":true}'
    );
    return NextResponse.json({
      ok: r.ok,
      ai: r.ok,
      provider: "gemini",
      model,
      error: r.ok ? undefined : r.error,
    });
  }

  return NextResponse.json({
    ok: false,
    ai: false,
    error: "Set ANTHROPIC_API_KEY (preferred) or GEMINI_API_KEY on Vercel, then redeploy",
  });
}

export async function POST(req: NextRequest) {
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!claudeKey && !geminiKey) {
    return NextResponse.json(
      {
        error: "No AI key: set ANTHROPIC_API_KEY or GEMINI_API_KEY on Vercel + redeploy",
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

  // Prefer Claude
  if (claudeKey) {
    const models = [
      process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ];
    const tried: string[] = [];
    let lastErr = "";
    for (const model of models) {
      if (tried.includes(model)) continue;
      tried.push(model);
      const r = await callClaude(claudeKey, model, prompt);
      if (!r.ok) {
        lastErr = r.error;
        if (/not_found|model/i.test(r.error)) continue;
        return NextResponse.json(
          { error: r.error, items: [], ai: false, provider: "claude", model },
          { status: 502 }
        );
      }
      const items = normalizeItems(extractJson(r.text) as { items?: ParsedLine[] }, idSet, mode);
      return NextResponse.json({
        items,
        source: "claude",
        ai: true,
        provider: "claude",
        model,
      });
    }
    return NextResponse.json(
      {
        error: lastErr || "Claude model failed",
        items: [],
        ai: false,
        provider: "claude",
        tried,
      },
      { status: 502 }
    );
  }

  // Gemini fallback only if no Claude key
  const gModels = [
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    "gemini-3.8-flash",
    "gemini-2.5-flash",
  ];
  for (const model of gModels) {
    const r = await callGemini(geminiKey!, model, prompt);
    if (!r.ok) {
      if (/no longer available|not found/i.test(r.error)) continue;
      return NextResponse.json(
        { error: r.error, items: [], ai: false, provider: "gemini", model },
        { status: 502 }
      );
    }
    const items = normalizeItems(extractJson(r.text) as { items?: ParsedLine[] }, idSet, mode);
    return NextResponse.json({
      items,
      source: "gemini",
      ai: true,
      provider: "gemini",
      model,
    });
  }

  return NextResponse.json(
    { error: "All AI providers failed", items: [], ai: false },
    { status: 502 }
  );
}
