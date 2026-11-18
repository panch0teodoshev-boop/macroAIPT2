// ProNutrition — AI прокси (Cloudflare Worker). Държи ключа за Anthropic на сървъра.
//
// Променливи (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secret)  — задължителна
//   SUPABASE_URL                 — напр. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY            — публичният (publishable) ключ
//   REQUIRE_AUTH                 — "1" → отказва заявки без валидна Supabase сесия
//   SUPABASE_SERVICE_ROLE_KEY (secret) — само за покани на нови нутриционисти (/admin/invite).
//                                  Без нея AI работи, а поканите връщат ясна грешка.
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

async function getUser(token, env) {
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json().catch(() => ({}));
    return u && typeof u === "object" ? u : {};
  } catch { return null; }
}
const verifyUser = async (token, env) => (await getUser(token, env)) !== null;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// Покана за нов нутриционист: само активен super_admin. Ролята се проверява с токена на
// викащия (RLS му дава да чете само собствения профил), а service-ключът се ползва само за
// самата покана — никога не се връща към браузъра.
async function handleInvite(request, env, cors, token) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail("Поканите не са настроени: липсва SUPABASE_SERVICE_ROLE_KEY в Cloudflare.", 501, cors);
  const user = await getUser(token, env);
  if (!user || !user.id) return fail("Unauthorized", 401, cors);
  let prof = null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status`, { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } });
    prof = r.ok ? (await r.json())[0] : null;
  } catch { prof = null; }
  if (!prof || prof.role !== "super_admin" || prof.status !== "active") return fail("Само администратор може да кани нутриционисти.", 403, cors);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return fail("Invalid JSON", 400, cors); }
  const email = String(body?.email || "").trim().toLowerCase();
  const fullName = String(body?.full_name || "").trim().slice(0, 120);
  if (!EMAIL_RE.test(email) || email.length > 254) return fail("Невалиден имейл.", 400, cors);

  const redirect = ALLOWED_ORIGINS[0];
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(redirect)}`, {
    method: "POST",
    // стар service_role ключ (JWT, „eyJ…") → и в Authorization; нов secret ключ (sb_secret_…) → само apikey
    headers: { "content-type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY, ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } : {}) },
    body: JSON.stringify({ email, data: fullName ? { full_name: fullName } : {} }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(out?.msg || out?.message || out?.error_description || out?.error || "");
    if (r.status === 422 || /already/i.test(msg)) return fail("Този имейл вече има акаунт. Използвай „Ръчно (с UID)\".", 409, cors);
    if (r.status === 429 || /rate limit/i.test(msg)) return fail("Достигнат е лимитът за изпращане на имейли. Опитай по-късно.", 429, cors);
    return fail("Поканата не можа да се изпрати: " + (msg || "HTTP " + r.status), 502, cors);
  }
  const id = out?.id || out?.user?.id;
  if (!id) return fail("Supabase не върна идентификатор на потребителя.", 502, cors);
  return json({ id, email }, 200, cors);
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
    if (new URL(request.url).pathname === "/admin/invite") return handleInvite(request, env, cors, token);
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
