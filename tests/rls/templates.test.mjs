// Миграция 0005 (шаблони): изолация между нутриционисти, валидации, идемпотентност.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { makeDb, as, tryAs, U, PROD_MIGRATIONS, PROD_MANUAL } from "./harness.mjs";
import { readFileSync } from "node:fs";

const sql = (f) => readFileSync(new URL("../../supabase/migrations/" + f, import.meta.url), "utf8");
const fresh = async () => {
  const db = await makeDb(PROD_MIGRATIONS); await db.exec(PROD_MANUAL);
  await db.exec(sql("0004_security_hardening.sql")); await db.exec(sql("0005_plan_templates.sql"));
  return db;
};
const CONTENT = JSON.stringify([{ weekday: 0, meals: [{ name: "Закуска", position: 0, items: [{ food_id: null, recipe_id: null, qty: 100, unit: "100g", snapshot: { kcal: 100 } }] }] }]);
const ins = (name = "Ден 1800", kind = "day", content = CONTENT) =>
  `insert into plan_templates (name, kind, content, kcal_avg, item_count) values ('${name}', '${kind}', '${content}', 100, 1)`;
let db;
before(async () => { db = await fresh(); });

test("[0005] собственикът създава и чете шаблона си; owner_id идва от сесията", async () => {
  assert.equal((await tryAs(db, U.nutA, ins())).affected, 1);
  const { rows } = await as(db, U.nutA, `select name, owner_id from plan_templates`);
  assert.deepEqual(rows, [{ name: "Ден 1800", owner_id: U.nutA }]);
});
test("[0005] друг нутриционист не вижда, не променя и не трие чужд шаблон", async () => {
  assert.equal((await as(db, U.nutB, `select count(*)::int n from plan_templates`)).rows[0].n, 0);
  assert.equal((await tryAs(db, U.nutB, `update plan_templates set name='x'`)).affected, 0);
  assert.equal((await tryAs(db, U.nutB, `delete from plan_templates`)).affected, 0);
  assert.equal((await as(db, U.nutA, `select count(*)::int n from plan_templates`)).rows[0].n, 1);
});
test("[0005] не може да се създаде шаблон от чуждо име (owner_id на друг)", async () => {
  const r = await tryAs(db, U.nutB, `insert into plan_templates (owner_id, name, kind, content) values ('${U.nutA}', 'подправен', 'day', '[]')`);
  assert.match(r.error || "", /row-level security/);
});
test("[0005] деактивиран профил и анонимен потребител нямат достъп", async () => {
  assert.match((await tryAs(db, U.disabled, ins())).error || "", /row-level security/);
  assert.equal((await as(db, null, `select count(*)::int n from plan_templates`)).rows[0].n, 0);
});
test("[0005] валидации: празно име, грешен вид, съдържание не-масив", async () => {
  assert.match((await tryAs(db, U.nutA, ins("   "))).error || "", /check/);
  assert.match((await tryAs(db, U.nutA, ins("x", "month"))).error || "", /check/);
  assert.match((await tryAs(db, U.nutA, ins("x", "day", '{"a":1}'))).error || "", /check/);
});
test("[0005] изтриване на профила изтрива и шаблоните му; миграцията е идемпотентна", async () => {
  const d = await fresh();
  await tryAs(d, U.nutB, ins("B"));
  await d.exec(sql("0005_plan_templates.sql"));
  assert.equal((await as(d, U.nutB, `select count(*)::int n from plan_templates`)).rows[0].n, 1, "повторното пускане не губи данни");
  await d.exec(`delete from profiles where id='${U.nutB}'`);
  assert.equal((await d.query(`select count(*)::int n from plan_templates`)).rows[0].n, 0);
});
