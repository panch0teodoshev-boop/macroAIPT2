// Симулиран Supabase (Auth + PostgREST) и AI прокси за браузърни тестове.
// Данните живеят в паметта на тестовия процес. Никакви реални услуги или лични данни.
export const SUPA = "https://test.supabase.co";
export const AI = "https://ai.test/";
const uuid = () => crypto.randomUUID();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

const CHILDREN = { // таблица → [вложено име, външен ключ]
  plan_days: [["plan_meals", "day_id"]],
  plan_meals: [["plan_meal_items", "meal_id"]],
  recipes: [["recipe_ingredients", "recipe_id"]],
};
const PARENTS = { plan_meal_items: [["foods", "food_id"], ["recipes", "recipe_id"]], recipe_ingredients: [["foods", "food_id"]] };
const CASCADE = { clients: [["plans", "client_id"], ["client_measurements", "client_id"]], plans: [["plan_versions", "plan_id"]], plan_versions: [["plan_days", "version_id"]], plan_days: [["plan_meals", "day_id"]], plan_meals: [["plan_meal_items", "meal_id"]], recipes: [["recipe_ingredients", "recipe_id"]] };

export function createBackend() {
  const db = {
    profiles: [], clients: [], client_measurements: [], foods: [], recipes: [], recipe_ingredients: [], plans: [], plan_versions: [],
    plan_days: [], plan_meals: [], plan_meal_items: [], ai_conversations: [], admin_audit: [],
  };
  const users = {}; // email → {id, password}
  const state = { failNext: null, aiCalls: [], aiReply: "Примерен отговор.", aiStatus: 200, requests: [] };
  let tick = 0;

  function addUser(email, password, profile) {
    const id = uuid(); users[email] = { id, password };
    db.profiles.push({ id, email, full_name: profile.full_name, role: profile.role || "nutritionist", status: profile.status || "active", client_limit: null, created_at: new Date().toISOString() });
    return id;
  }
  const session = (email) => { const u = users[email]; return { access_token: jwt(u.id), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r-" + u.id, user: { id: u.id, email, aud: "authenticated", role: "authenticated" } }; };

  function embed(table, row) {
    const out = { ...row };
    for (const [child, fk] of CHILDREN[table] || []) out[child] = db[child].filter((c) => c[fk] === row.id).map((c) => embed(child, c));
    for (const [parent, fk] of PARENTS[table] || []) out[parent] = row[fk] ? (db[parent].find((p) => p.id === row[fk]) || null) : null;
    return out;
  }
  function matcher(params) {
    const conds = [];
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      const m = /^(eq|neq|in|is)\.(.*)$/s.exec(v); if (!m) continue;
      const [, op, raw] = m;
      const norm = (x) => (x === "true" ? true : x === "false" ? false : x === "null" ? null : x);
      if (op === "eq") conds.push((r) => String(r[k]) === String(norm(raw)));
      else if (op === "neq") conds.push((r) => String(r[k]) !== String(norm(raw)));
      else if (op === "is") conds.push((r) => (r[k] ?? null) === norm(raw));
      else if (op === "in") { const set = raw.slice(1, -1).split(",").map((s) => s.replace(/^"|"$/g, "")); conds.push((r) => set.includes(String(r[k]))); }
    }
    return (r) => conds.every((c) => c(r));
  }
  function remove(table, rows) {
    for (const r of rows) {
      for (const [child, fk] of CASCADE[table] || []) remove(child, db[child].filter((c) => c[fk] === r.id));
      if (table === "recipes") db.plan_meal_items.forEach((i) => { if (i.recipe_id === r.id) i.recipe_id = null; });
      if (table === "clients") db.ai_conversations.forEach((i) => { if (i.client_id === r.id) i.client_id = null; });
      db[table].splice(db[table].indexOf(r), 1);
    }
  }
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" };
  const send = (route, status, body, extra = {}) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json", ...extra }, body: body === undefined ? "" : JSON.stringify(body) });

  async function handle(route) {
    const req = route.request(); const url = new URL(req.url()); const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    state.requests.push(`${method} ${url.pathname}`);
    if (state.failNext && state.failNext(method, url)) { state.failNext = null; return route.abort("internetdisconnected"); }

    // ---------- AI прокси ----------
    if (req.url().startsWith(AI)) {
      state.aiCalls.push({ headers: req.headers(), body: JSON.parse(req.postData() || "{}") });
      if (state.aiStatus !== 200) return send(route, state.aiStatus, { error: { message: "upstream error" } });
      return send(route, 200, { content: [{ type: "text", text: typeof state.aiReply === "function" ? state.aiReply(JSON.parse(req.postData())) : state.aiReply }], stop_reason: "end_turn" });
    }
    // ---------- Auth ----------
    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse(req.postData() || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const u = users[body.email];
        if (!u || u.password !== body.password) return send(route, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(route, 200, session(body.email));
      }
      const email = Object.keys(users).find((e) => "r-" + users[e].id === body.refresh_token);
      return email ? send(route, 200, session(email)) : send(route, 400, { msg: "invalid refresh" });
    }
    if (url.pathname === "/auth/v1/logout") return send(route, 204);
    if (url.pathname === "/auth/v1/user") { const sub = JSON.parse(Buffer.from((req.headers().authorization || "").split(".")[1] || "e30", "base64url").toString()).sub; const email = Object.keys(users).find((e) => users[e].id === sub); return email ? send(route, 200, session(email).user) : send(route, 401, { msg: "no" }); }

    // ---------- PostgREST ----------
    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
    if (!m) return send(route, 404, { message: "not mocked: " + url.pathname });
    const sub = (() => { try { return JSON.parse(Buffer.from(req.headers().authorization.split(".")[1], "base64url").toString()).sub; } catch { return null; } })();
    const me = db.profiles.find((p) => p.id === sub);
    if (m[1]) { // rpc
      if (m[2] === "admin_client_counts") { if (me?.role !== "super_admin") return send(route, 200, []); const c = {}; db.clients.filter((x) => !x.archived).forEach((x) => (c[x.nutritionist_id] = (c[x.nutritionist_id] || 0) + 1)); return send(route, 200, Object.entries(c).map(([nutritionist_id, active_clients]) => ({ nutritionist_id, active_clients }))); }
      return send(route, 404, { message: "no rpc" });
    }
    const table = m[2]; if (!db[table]) return send(route, 404, { message: "no table " + table });
    // опростен RLS: наемателят вижда само своите редове
    const own = (r) => {
      if (!me || me.status !== "active") return table === "profiles" && r.id === sub;
      if (table === "profiles") return r.id === sub || me.role === "super_admin";
      if (table === "clients" || table === "plans" || table === "ai_conversations") return r.nutritionist_id === sub;
      if (table === "foods") return r.owner_id == null || r.owner_id === sub;
      if (table === "recipes") return r.owner_id === sub || db.profiles.find((p) => p.id === r.owner_id)?.role === "super_admin";
      return true;
    };
    const match = matcher(url.searchParams);
    const wantObject = (req.headers().accept || "").includes("vnd.pgrst.object");
    const prefer = req.headers().prefer || "";
    const reply = (rows) => {
      if (wantObject) {
        if (rows.length === 1) return send(route, 200, rows[0]);
        if (rows.length === 0 && !/strip|plain/.test("") ) return send(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows" });
        return send(route, 406, { code: "PGRST116", message: "multiple rows" });
      }
      return send(route, 200, rows);
    };
    if (method === "GET" || method === "HEAD") {
      let rows = db[table].filter(own).filter(match);
      for (const o of (url.searchParams.get("order") || "").split(",").filter(Boolean).reverse()) {
        const [col, dir] = o.split("."); rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1));
      }
      const limit = Number(url.searchParams.get("limit")); if (limit) rows = rows.slice(0, limit);
      if (method === "HEAD") return route.fulfill({ status: 200, headers: { ...cors, "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
      return reply(rows.map((r) => embed(table, r)));
    }
    if (method === "POST") {
      const body = JSON.parse(req.postData()); const list = Array.isArray(body) ? body : [body];
      if (table === "plan_meal_items" && list.some((r) => Number(r.qty) < 0)) return send(route, 400, { code: "23514", message: "violates check constraint qty_nonneg" });
      const created = list.map((r) => { const row = { id: uuid(), created_at: new Date(Date.now() + tick++).toISOString(), archived: table === "clients" || table === "foods" ? false : undefined, ...r }; db[table].push(row); return row; });
      return prefer.includes("return=representation") ? reply(created.map((r) => embed(table, r))) : send(route, 201);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(req.postData()); const rows = db[table].filter(own).filter(match);
      rows.forEach((r) => Object.assign(r, patch));
      return prefer.includes("return=representation") ? reply(rows) : send(route, 204);
    }
    if (method === "DELETE") { remove(table, db[table].filter(own).filter(match)); return send(route, 204); }
    return send(route, 405, {});
  }
  async function install(context) { await context.route(SUPA + "/**", handle); await context.route(AI + "**", handle); }
  return { db, state, addUser, install, uuid };
}
