// Единна точка за заявки към AI проксито (Cloudflare Worker).
// - праща сесийния токен на Supabase, за да може проксито да откаже неавтентикирани заявки;
// - ограничава историята и размера на отговора (контрол на разходите);
// - връща ясни грешки на български.
import { supabase } from "./supabase.js";

export const AI_ENDPOINT = import.meta.env.VITE_AI_PROXY_URL || "";
export const AI_MODEL = "claude-sonnet-4-6";
export const MAX_HISTORY = 20; // последните N съобщения отиват към модела

/** Подрязва историята: последните MAX_HISTORY съобщения, започващи с потребителско. */
export function trimHistory(messages, max = MAX_HISTORY) {
  let out = messages.slice(-max);
  while (out.length && out[0].role !== "user") out = out.slice(1);
  return out.map((m) => ({ role: m.role, content: m.content }));
}

export async function aiRequest({ system, messages, maxTokens = 1024, timeoutMs = 90000 }) {
  if (!AI_ENDPOINT) throw new Error("AI не е конфигуриран (липсва прокси адрес).");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "AI не отговори навреме. Опитай отново." : "Няма връзка с AI услугата. Провери интернет връзката.");
  } finally { clearTimeout(timer); }
  let body = null;
  try { body = await res.json(); } catch { /* не-JSON отговор */ }
  if (!res.ok || body?.error) {
    if (res.status === 401) throw new Error("Сесията е изтекла. Влез отново.");
    if (res.status === 429) throw new Error("Твърде много AI заявки. Изчакай малко и опитай пак.");
    throw new Error(body?.error?.message || `AI услугата върна грешка (HTTP ${res.status}).`);
  }
  const text = (body?.content || []).map((b) => b.text || "").join("").trim();
  return { text, truncated: body?.stop_reason === "max_tokens" };
}
