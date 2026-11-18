// Тестове на проксито с подменен fetch (без реални заявки към Anthropic/Supabase).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const ORIGIN = "https://www.pronutrition.food";
const env = { ANTHROPIC_API_KEY: "sk-test", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", REQUIRE_AUTH: "1" };
let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/user")) return new Response("{}", { status: init.headers.Authorization === "Bearer good" ? 200 : 401 });
    return new Response(JSON.stringify({ content: [{ text: "ok" }] }), { status: 200 });
  };
});
const post = (body, headers = {}) => new Request("https://proxy.test/", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const good = { model: "claude-sonnet-4-6", max_tokens: 500, system: "s", messages: [{ role: "user", content: "hi" }] };
const anthropicCalls = () => calls.filter((c) => c.url.includes("anthropic.com"));

test("без токен → 401 и НЯМА заявка към Anthropic (ключът не се харчи)", async () => {
  const r = await worker.fetch(post(good), env);
  assert.equal(r.status, 401); assert.equal(anthropicCalls().length, 0);
});
test("невалиден токен → 401", async () => {
  const r = await worker.fetch(post(good, { Authorization: "Bearer bad" }), env);
  assert.equal(r.status, 401); assert.equal(anthropicCalls().length, 0);
});
test("подправен Origin от curl без сесия вече не стига (старото поведение го пускаше)", async () => {
  const r = await worker.fetch(post({ ...good, max_tokens: 64000 }), env);
  assert.equal(r.status, 401);
});
test("валидна сесия → препраща и връща отговора с CORS за домейна", async () => {
  const r = await worker.fetch(post(good, { Authorization: "Bearer good" }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal((await r.json()).content[0].text, "ok");
  assert.equal(anthropicCalls()[0].init.headers["x-api-key"], "sk-test");
});
test("чужд Origin → 403", async () => {
  const r = await worker.fetch(post(good, { Origin: "https://evil.example", Authorization: "Bearer good" }), env);
  assert.equal(r.status, 403); assert.equal(anthropicCalls().length, 0);
});
test("непозволен модел → 400", async () => {
  const r = await worker.fetch(post({ ...good, model: "claude-opus-4-8" }, { Authorization: "Bearer good" }), env);
  assert.equal(r.status, 400); assert.equal(anthropicCalls().length, 0);
});
test("max_tokens се ограничава до тавана; излишни полета не се препращат", async () => {
  await worker.fetch(post({ ...good, max_tokens: 999999, tools: [{ name: "x" }], metadata: { a: 1 } }, { Authorization: "Bearer good" }), env);
  const sent = JSON.parse(anthropicCalls()[0].init.body);
  assert.equal(sent.max_tokens, 4096);
  assert.deepEqual(Object.keys(sent).sort(), ["max_tokens", "messages", "model", "system"]);
});
test("невалиден JSON / празни съобщения → 400", async () => {
  assert.equal((await worker.fetch(post("{oops", { Authorization: "Bearer good" }), env)).status, 400);
  assert.equal((await worker.fetch(post({ ...good, messages: [] }, { Authorization: "Bearer good" }), env)).status, 400);
});
test("preflight позволява заглавката Authorization", async () => {
  const r = await worker.fetch(new Request("https://proxy.test/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env);
  assert.match(r.headers.get("Access-Control-Allow-Headers"), /Authorization/);
});
test("преходен режим (REQUIRE_AUTH изключен): без токен минава, с невалиден токен — не", async () => {
  const soft = { ...env, REQUIRE_AUTH: "0" };
  assert.equal((await worker.fetch(post(good), soft)).status, 200);
  assert.equal((await worker.fetch(post(good, { Authorization: "Bearer bad" }), soft)).status, 401);
});

// ---------- покани (/admin/invite) ----------
const envI = { ...env, SUPABASE_SERVICE_ROLE_KEY: "eyJservice-secret" };
const invite = (body, token = "admin") => new Request("https://proxy.test/admin/invite", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
function fakeSupabase({ role = "super_admin", status = "active", inviteStatus = 200, inviteBody = { id: "new-user-id", email: "x" } } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    url = String(url); calls.push({ url, init });
    if (url.includes("/auth/v1/user")) {
      const t = init.headers.Authorization;
      return t === "Bearer admin" ? new Response(JSON.stringify({ id: "admin-id" })) : t === "Bearer nut" ? new Response(JSON.stringify({ id: "nut-id" })) : new Response("{}", { status: 401 });
    }
    if (url.includes("/rest/v1/profiles")) return new Response(JSON.stringify(url.includes("admin-id") ? [{ role, status }] : [{ role: "nutritionist", status: "active" }]));
    if (url.includes("/auth/v1/invite")) return new Response(JSON.stringify(inviteBody), { status: inviteStatus });
    return new Response("{}", { status: 500 });
  };
}
const inviteCalls = () => calls.filter((c) => c.url.includes("/auth/v1/invite"));

test("покана: админ → Supabase invite с service ключа, redirect към сайта; връща само id и имейл", async () => {
  fakeSupabase();
  const r = await worker.fetch(invite({ email: " Nova@Test.bg ", full_name: "Нова Нутриционистка" }), envI);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, { id: "new-user-id", email: "nova@test.bg" });
  assert.equal(JSON.stringify(body).includes("service-secret"), false, "ключът не се връща");
  const c = inviteCalls()[0];
  assert.equal(c.init.headers.Authorization, "Bearer eyJservice-secret"); assert.equal(c.init.headers.apikey, "eyJservice-secret");
  assert.match(c.url, /redirect_to=https%3A%2F%2Fwww\.pronutrition\.food/);
  assert.deepEqual(JSON.parse(c.init.body), { email: "nova@test.bg", data: { full_name: "Нова Нутриционистка" } });
  // ролята е проверена с токена на викащия, не със service ключа
  assert.equal(calls.find((x) => x.url.includes("/rest/v1/profiles")).init.headers.Authorization, "Bearer admin");
});
test("покана: нутриционист, деактивиран админ, без сесия → отказ и НЯМА покана", async () => {
  fakeSupabase();
  assert.equal((await worker.fetch(invite({ email: "a@b.bg" }, "nut"), envI)).status, 403);
  assert.equal((await worker.fetch(invite({ email: "a@b.bg" }, "bad"), envI)).status, 401);
  fakeSupabase({ status: "disabled" });
  assert.equal((await worker.fetch(invite({ email: "a@b.bg" }), envI)).status, 403);
  assert.equal(inviteCalls().length, 0);
});
test("покана: невалиден имейл → 400; съществуващ акаунт → 409; лимит → 429; без service ключ → 501", async () => {
  fakeSupabase();
  assert.equal((await worker.fetch(invite({ email: "не-е-имейл" }), envI)).status, 400);
  fakeSupabase({ inviteStatus: 422, inviteBody: { msg: "A user with this email address has already been registered" } });
  const r = await worker.fetch(invite({ email: "a@b.bg" }), envI);
  assert.equal(r.status, 409); assert.match((await r.json()).error.message, /вече има акаунт/);
  fakeSupabase({ inviteStatus: 429, inviteBody: { msg: "email rate limit exceeded" } });
  assert.equal((await worker.fetch(invite({ email: "a@b.bg" }), envI)).status, 429);
  fakeSupabase();
  const r5 = await worker.fetch(invite({ email: "a@b.bg" }), env);
  assert.equal(r5.status, 501); assert.equal(inviteCalls().length, 0);
});
test("покана: чужд Origin → 403 преди всичко друго", async () => {
  fakeSupabase();
  const req = new Request("https://proxy.test/admin/invite", { method: "POST", headers: { Origin: "https://evil.example", Authorization: "Bearer admin" }, body: "{}" });
  assert.equal((await worker.fetch(req, envI)).status, 403); assert.equal(calls.length, 0);
});
test("покана с нов secret ключ (sb_secret_…): само apikey, без Authorization", async () => {
  fakeSupabase();
  const r = await worker.fetch(invite({ email: "a@b.bg" }), { ...env, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc" });
  assert.equal(r.status, 200);
  const h = inviteCalls()[0].init.headers;
  assert.equal(h.apikey, "sb_secret_abc"); assert.equal(h.Authorization, undefined);
});
