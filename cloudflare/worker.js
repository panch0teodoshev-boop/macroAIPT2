// ProNutrition — AI прокси (Cloudflare Worker). Държи ключа за Anthropic на сървъра.
//
// Променливи (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secret)  — задължителна
//   SUPABASE_URL                 — напр. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY            — публичният (publishable) ключ
//   REQUIRE_AUTH                 — "1" → отказва заявки без валидна Supabase сесия
//
// Защо: Origin заглавката се подправя тривиално извън браузър (curl), така че само списък
// с домейни НЕ пази ключа. Затова: (1) проверка на сесията, (2) позволени модели,
// (3) таван на max_tokens, (4) препращат се само нужните полета.
const ALLOWED_ORIGINS = ["https://www.pronutrition.food", "https://pronutrition.food"];
const ALLOWED_MODELS = ["claude-sonnet-4-6"];
const MAX_TOKENS_CAP = 4096;
const MAX_BODY = 200000;

function corsFor(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });
const fail = (message, status, cors) => json({ error: { message } }, status, cors);

async function verifyUser(token, env) {
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } });
    return r.ok;
  } catch { return false; }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsFor(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return fail("Method not allowed", 405, cors);
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return fail("Forbidden", 403, cors);

    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const requireAuth = env.REQUIRE_AUTH === "1";
    if (token || requireAuth) {
      if (!(await verifyUser(token, env))) return fail("Unauthorized", 401, cors);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail("Too large", 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch { return fail("Invalid JSON", 400, cors); }
    if (!ALLOWED_MODELS.includes(body?.model)) return fail("Model not allowed", 400, cors);
    if (!Array.isArray(body.messages) || body.messages.length === 0) return fail("messages required", 400, cors);

    const payload = {
      model: body.model,
      max_tokens: Math.min(Math.max(1, Number(body.max_tokens) || 1024), MAX_TOKENS_CAP),
      messages: body.messages,
      ...(typeof body.system === "string" ? { system: body.system } : {}),
    };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, "content-type": "application/json" } });
  },
};
