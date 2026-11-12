// СЛЕД миграция 0004: същата изолация + отстранени уязвимости. Регресионни тестове.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { makeDb, as, tryAs, U, PROD_MIGRATIONS, PROD_MANUAL } from "./harness.mjs";
import { isolationSuite } from "./isolation.shared.mjs";
import { readFileSync } from "node:fs";

const M4 = "0004_security_hardening.sql";
const fresh = async () => { const db = await makeDb(PROD_MIGRATIONS); await db.exec(PROD_MANUAL); await db.exec(readFileSync(new URL("../../supabase/migrations/" + M4, import.meta.url), "utf8")); return db; };
let shared;
before(async () => { shared = await fresh(); });
isolationSuite(async () => shared, "0004");

test("[0004] миграцията е идемпотентна (второ пускане без грешка)", async () => {
  const db = await fresh();
  await db.exec(readFileSync(new URL("../../supabase/migrations/" + M4, import.meta.url), "utf8"));
});
test("[0004][SEC-01] нутриционист НЕ може да си смени роля/статус/лимит/имейл", async () => {
  const db = await fresh();
  for (const set of [`role='super_admin'`, `status='blocked'`, `client_limit=999`, `email='x@x.x'`]) {
    const r = await tryAs(db, U.nutA, `update profiles set ${set} where id='${U.nutA}'`);
    assert.match(r.error || "", /Нямате право/, set);
  }
  const { rows } = await as(db, U.nutA, `select role, status from profiles`);
  assert.deepEqual(rows, [{ role: "nutritionist", status: "active" }]);
});
test("[0004][SEC-01] нутриционист МОЖЕ да си смени името", async () => {
  const db = await fresh();
  assert.equal((await tryAs(db, U.nutA, `update profiles set full_name='Ново име' where id='${U.nutA}'`)).affected, 1);
});
test("[0004][SEC-01] деактивиран профил НЕ може да се самоактивира", async () => {
  const db = await fresh();
  const r = await tryAs(db, U.disabled, `update profiles set status='active' where id='${U.disabled}'`);
  assert.match(r.error || "", /Нямате право/);
});
test("[0004] админът продължава да управлява статус, лимит и роля", async () => {
  const db = await fresh();
  assert.equal((await tryAs(db, U.admin, `update profiles set status='disabled', client_limit=5 where id='${U.nutB}'`)).affected, 1);
  const { rows } = await as(db, U.nutB, `select count(*)::int as n from plans`);
  assert.equal(rows[0].n, 0, "деактивираният веднага губи достъп");
});
test("[0004] service role / SQL Editor (без auth.uid) може да променя профили", async () => {
  const db = await fresh();
  await db.exec(`update profiles set role='super_admin' where id='${U.nutB}'`);
});
test("[0004][SEC-03] деактивиран профил не чете нищо свое", async () => {
  const db = await fresh();
  for (const tbl of ["clients", "client_measurements", "plans", "plan_versions", "plan_days", "plan_meals", "plan_meal_items", "ai_conversations", "recipes", "foods"]) {
    const { rows } = await as(db, U.disabled, `select count(*)::int as n from ${tbl}`);
    assert.equal(rows[0].n, 0, tbl);
  }
});
test("[0004][DB-01] рецепта в употреба се трие; редът в режима остава със снапшота", async () => {
  const db = await fresh();
  await db.exec(`insert into plan_meal_items (meal_id, recipe_id, qty, unit, snapshot) values ('e0000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1',1,'serving','{"kcal":450,"name":"Рецепта на B"}')`);
  assert.equal((await tryAs(db, U.nutB, `delete from recipes where id='10000000-0000-0000-0000-0000000000b1'`)).affected, 1);
  const { rows } = await as(db, U.nutB, `select snapshot->>'name' as name, recipe_id from plan_meal_items where unit='serving'`);
  assert.deepEqual(rows, [{ name: "Рецепта на B", recipe_id: null }]);
});
test("[0004][DB-02] отказват се дублиран ден, отрицателно количество и нулеви порции", async () => {
  const db = await fresh();
  assert.match((await tryAs(db, U.nutB, `insert into plan_days (version_id, weekday) values ('b0000000-0000-0000-0000-00000000000b',0)`)).error || "", /plan_days_version_weekday_uq/);
  assert.match((await tryAs(db, U.nutB, `update plan_meal_items set qty = -50`)).error || "", /qty_nonneg/);
  assert.match((await tryAs(db, U.nutB, `update recipes set servings = 0 where owner_id='${U.nutB}'`)).error || "", /servings_pos/);
});
test("[0004][DB-03] client_limit се прилага; архивираните не се броят", async () => {
  const db = await fresh();
  await db.exec(`update profiles set client_limit = 1 where id='${U.nutB}'`);
  assert.match((await tryAs(db, U.nutB, `insert into clients (nutritionist_id, first_name) values ('${U.nutB}','над лимита')`)).error || "", /лимитът/);
  await db.exec(`update clients set archived = true where nutritionist_id='${U.nutB}'`);
  assert.equal((await tryAs(db, U.nutB, `insert into clients (nutritionist_id, first_name) values ('${U.nutB}','ок')`)).error, null);
});
test("[0004][DB-04] план към чужд клиент се отказва", async () => {
  const r = await tryAs(await fresh(), U.nutA, `insert into plans (client_id, nutritionist_id, title) values ('c0000000-0000-0000-0000-00000000000b','${U.nutA}','x')`);
  assert.match(r.error || "", /row-level security/);
});
test("[0004] нормалната работа на нутриционист остава непроменена (CRUD по собствен режим)", async () => {
  const db = await fresh();
  const A = U.nutA;
  const c = await as(db, A, `insert into clients (nutritionist_id, first_name) values ('${A}','Нов') returning id`);
  const p = await as(db, A, `insert into plans (client_id, nutritionist_id, title) values ('${c.rows[0].id}','${A}','Режим') returning id`);
  const v = await as(db, A, `insert into plan_versions (plan_id, version) values ('${p.rows[0].id}',1) returning id`);
  const d = await as(db, A, `insert into plan_days (version_id, weekday) values ('${v.rows[0].id}',3) returning id`);
  const m = await as(db, A, `insert into plan_meals (day_id, name) values ('${d.rows[0].id}','Обяд') returning id`);
  await as(db, A, `insert into plan_meal_items (meal_id, food_id, qty, snapshot) values ('${m.rows[0].id}','f0000000-0000-0000-0000-000000000001',150,'{"kcal":100}')`);
  assert.equal((await tryAs(db, A, `update plan_meal_items set qty = 200 where meal_id='${m.rows[0].id}'`)).affected, 1);
  assert.equal((await tryAs(db, A, `delete from clients where id='${c.rows[0].id}'`)).affected, 1);
  const left = await db.query(`select count(*)::int as n from plan_meal_items where meal_id='${m.rows[0].id}'`);
  assert.equal(left.rows[0].n, 0, "каскадното изтриване (GDPR) работи до последното ниво");
});
test("[0004] одит: админ записва само от свое име; нутриционист не може", async () => {
  const db = await fresh();
  assert.equal((await tryAs(db, U.admin, `insert into admin_audit (actor_id, action) values ('${U.admin}','x')`)).error, null);
  assert.match((await tryAs(db, U.admin, `insert into admin_audit (actor_id, action) values ('${U.nutA}','x')`)).error || "", /row-level security/);
  assert.match((await tryAs(db, U.nutA, `insert into admin_audit (actor_id, action) values ('${U.nutA}','x')`)).error || "", /row-level security/);
});
test("[0004] admin_client_counts: админ вижда броя, нутриционист — нищо", async () => {
  const db = await fresh();
  const a = await as(db, U.admin, `select * from admin_client_counts() order by 1`);
  assert.equal(a.rows.length, 3);
  assert.ok(a.rows.every((r) => Number(r.active_clients) === 1));
  const n = await as(db, U.nutA, `select * from admin_client_counts()`);
  assert.equal(n.rows.length, 0);
});
