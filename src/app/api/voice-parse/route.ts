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

async function callClaude(key: string, model: string, prompt: string): Promise<CallResult> {
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
    return {
      ok: false,
      error: String(raw?.error?.message || raw?.error?.type || `Claude HTTP ${res.status}`),
    };
  }
  const text = Array.isArray(raw?.content)
    ? raw.content.map((p: { text?: string }) => p.text || "").join("")
    : "";
  if (!text) return { ok: false, error: "Empty Claude reply" };
  return { ok: true, text };
}

/** Generic OpenAI-compatible chat completions (used by OpenAI and Groq) */
async function callOpenAICompatible(
  baseUrl: string,
  label: string,
  key: string,
  model: string,
  prompt: string
): Promise<CallResult> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
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
      error: String(raw?.error?.message || `${label} HTTP ${res.status}`),
    };
  }
  const text = raw?.choices?.[0]?.message?.content || "";
  if (!text) return { ok: false, error: `Empty ${label} reply` };
  return { ok: true, text };
}

/** OpenAI ChatGPT */
function callOpenAI(key: string, model: string, prompt: string) {
  return callOpenAICompatible("https://api.openai.com/v1", "OpenAI", key, model, prompt);
}

/** Groq (free tier, OpenAI-compatible) */
function callGroq(key: string, model: string, prompt: string) {
  return callOpenAICompatible("https://api.groq.com/openai/v1", "Groq", key, model, prompt);
}

async function callGemini(key: string, model: string, prompt: string): Promise<CallResult> {
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

type Provider = "claude" | "openai" | "gemini" | "groq";

const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

function pickProvider(): {
  provider: Provider;
  key: string;
} | null {
  // Explicit force: AI_PROVIDER=openai|claude|gemini|groq
  const force = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (force === "openai" && openAiKey) return { provider: "openai", key: openAiKey };
  if (force === "claude" && claudeKey) return { provider: "claude", key: claudeKey };
  if (force === "gemini" && geminiKey) return { provider: "gemini", key: geminiKey };
  if (force === "groq" && groqKey) return { provider: "groq", key: groqKey };

  // Default priority: Claude → ChatGPT → Gemini → Groq
  if (claudeKey) return { provider: "claude", key: claudeKey };
  if (openAiKey) return { provider: "openai", key: openAiKey };
  if (geminiKey) return { provider: "gemini", key: geminiKey };
  if (groqKey) return { provider: "groq", key: groqKey };
  return null;
}

export async function GET() {
  const picked = pickProvider();
  if (!picked) {
    return NextResponse.json({
      ok: false,
      ai: false,
      error:
        "Set GROQ_API_KEY, OPENAI_API_KEY (ChatGPT), ANTHROPIC_API_KEY (Claude), or GEMINI_API_KEY — then redeploy",
    });
  }

  const { provider, key } = picked;
  if (provider === "openai") {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const r = await callOpenAI(key, model, 'Reply with only this JSON: {"ok":true}');
    return NextResponse.json({
      ok: r.ok,
      ai: r.ok,
      provider: "openai",
      model,
      error: r.ok ? undefined : r.error,
      keyPrefix: key.slice(0, 7) + "…",
    });
  }
  if (provider === "groq") {
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
  if (provider === "claude") {
    const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const r = await callClaude(key, model, 'Reply with only this JSON: {"ok":true}');
    return NextResponse.json({
      ok: r.ok,
      ai: r.ok,
      provider: "claude",
      model,
      error: r.ok ? undefined : r.error,
    });
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const r = await callGemini(key, model, 'Reply with only this JSON: {"ok":true}');
  return NextResponse.json({
    ok: r.ok,
    ai: r.ok,
    provider: "gemini",
    model,
    error: r.ok ? undefined : r.error,
  });
}

export async function POST(req: NextRequest) {
  const picked = pickProvider();
  if (!picked) {
    return NextResponse.json(
      {
        error:
          "No AI key: set GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY on Vercel + redeploy",
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
  const { provider, key } = picked;

  let text = "";
  let model = "";

  if (provider === "openai") {
    const models = [
      process.env.OPENAI_MODEL || "gpt-4o-mini",
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
    ];
    const tried: string[] = [];
    let lastErr = "";
    for (const m of models) {
      if (tried.includes(m)) continue;
      tried.push(m);
      const r = await callOpenAI(key, m, prompt);
      if (!r.ok) {
        lastErr = r.error;
        if (/model|not found|invalid/i.test(r.error)) continue;
        return NextResponse.json(
          { error: r.error, items: [], ai: false, provider: "openai", model: m },
          { status: 502 }
        );
      }
      text = r.text;
      model = m;
      break;
    }
    if (!text) {
      return NextResponse.json(
        { error: lastErr || "OpenAI failed", items: [], ai: false, provider: "openai", tried },
        { status: 502 }
      );
    }
  } else if (provider === "groq") {
    // Fallback chain: if a model is retired/unavailable, try the next one
    const models = [
      process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
      GROQ_DEFAULT_MODEL,
      "openai/gpt-oss-120b",
      "llama-3.1-8b-instant",
    ];
    const tried: string[] = [];
    let lastErr = "";
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
  } else if (provider === "claude") {
    model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const r = await callClaude(key, model, prompt);
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error, items: [], ai: false, provider: "claude", model },
        { status: 502 }
      );
    }
    text = r.text;
  } else {
    model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const r = await callGemini(key, model, prompt);
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error, items: [], ai: false, provider: "gemini", model },
        { status: 502 }
      );
    }
    text = r.text;
  }

  const items = normalizeItems(extractJson(text) as { items?: ParsedLine[] }, idSet, mode);
  return NextResponse.json({
    items,
    source: provider,
    ai: true,
    provider,
    model,
  });
}