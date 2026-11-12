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
