// Миграция 0006 (журнал на заличаванията): атомарно заличаване, запис без лични данни,
// изолация, журналът не може да се подправи през API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb, as, tryAs, U, PROD_MIGRATIONS, PROD_MANUAL } from "./harness.mjs";
import { readFileSync } from "node:fs";

const sql = (f) => readFileSync(new URL("../../supabase/migrations/" + f, import.meta.url), "utf8");
const fresh = async () => {
  const db = await makeDb(PROD_MIGRATIONS); await db.exec(PROD_MANUAL);
  for (const f of ["0004_security_hardening.sql", "0005_plan_templates.sql", "0006_erasure_log.sql"]) await db.exec(sql(f));
  return db;
};
const CA = "c0000000-0000-0000-0000-00000000000a", CB = "c0000000-0000-0000-0000-00000000000b";
const count = async (db, q) => (await db.query(q)).rows[0].n;

test("[0006] нутриционистът заличава свой клиент: всичко изчезва, журналът има запис без лични данни", async () => {
  const db = await fresh();
  const { rows } = await as(db, U.nutA, `select erase_client($1) as c`, [CA]);
  assert.deepEqual(rows[0].c, { measurements: 1, plans: 1, plan_items: 1, ai_conversations: 1 });
  for (const t of ["clients where id='" + CA + "'", "client_measurements where client_id='" + CA + "'", "plans where client_id='" + CA + "'", "ai_conversations where client_id='" + CA + "'"])
    assert.equal(await count(db, `select count(*)::int n from ${t}`), 0, t);
  const log = (await db.query(`select * from erasure_log`)).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].client_ref, CA); assert.equal(log[0].nutritionist_id, U.nutA); assert.equal(log[0].erased_by, U.nutA);
  assert.equal(log[0].source, "gdpr_request");
  const txt = JSON.stringify(log[0]);
  assert.equal(/Клиент a|поверително|тайна/.test(txt), false, "журналът не съдържа име, бележки или разговори");
  // клиентът на B е непокътнат
  assert.equal(await count(db, `select count(*)::int n from clients where id='${CB}'`), 1);
});
test("[0006] чужд клиент не може да се заличи; нищо не се трие и не се записва", async () => {
  const db = await fresh();
  const r = await tryAs(db, U.nutA, `select erase_client($1)`, [CB]);
  assert.match(r.error || "", /не е намерен или нямате достъп/);
  assert.equal(await count(db, `select count(*)::int n from clients where id='${CB}'`), 1);
  assert.equal(await count(db, `select count(*)::int n from ai_conversations where client_id='${CB}'`), 1);
  assert.equal(await count(db, `select count(*)::int n from erasure_log`), 0);
});
test("[0006] деактивиран профил не може да заличава", async () => {
  const db = await fresh();
  const r = await tryAs(db, U.disabled, `select erase_client('c0000000-0000-0000-0000-00000000000d')`);
  assert.match(r.error || "", /не е намерен или нямате достъп/);
});
test("[0006] журналът: всеки вижда само своите записи, админът всички; никой не може да пише, променя или трие", async () => {
  const db = await fresh();
  await as(db, U.nutA, `select erase_client($1)`, [CA]);
  await as(db, U.nutB, `select erase_client($1)`, [CB]);
  assert.deepEqual((await as(db, U.nutA, `select client_ref from erasure_log`)).rows, [{ client_ref: CA }]);
  assert.deepEqual((await as(db, U.nutB, `select client_ref from erasure_log`)).rows, [{ client_ref: CB }]);
  assert.equal((await as(db, U.admin, `select count(*)::int n from erasure_log`)).rows[0].n, 2);
  assert.match((await tryAs(db, U.nutA, `insert into erasure_log (client_ref, source) values ('${CB}', 'other')`)).error || "", /permission denied/);
  assert.match((await tryAs(db, U.nutA, `update erasure_log set source='other'`)).error || "", /permission denied/);
  assert.match((await tryAs(db, U.nutA, `delete from erasure_log`)).error || "", /permission denied/);
  assert.match((await tryAs(db, U.admin, `delete from erasure_log`)).error || "", /permission denied/);
  assert.equal(await count(db, `select count(*)::int n from erasure_log`), 2);
  assert.equal((await as(db, null, `select count(*)::int n from erasure_log`)).rows[0].n, 0, "анонимен не вижда нищо");
});
test("[0006] изтриване извън функцията (директно / SQL Editor / при изтрит профил) също се записва", async () => {
  const db = await fresh();
  assert.equal((await tryAs(db, U.nutA, `delete from clients where id='${CA}'`)).affected, 1);
  await db.exec(`delete from profiles where id='${U.nutB}'`); // каскадно трие клиента на B
  const log = (await db.query(`select client_ref, source, erased_by, nutritionist_id from erasure_log order by id`)).rows;
  assert.deepEqual(log, [
    { client_ref: CA, source: "other", erased_by: U.nutA, nutritionist_id: U.nutA },
    { client_ref: CB, source: "other", erased_by: null, nutritionist_id: U.nutB },
  ]);
});
test("[0006] миграцията е идемпотентна и не губи журнала", async () => {
  const db = await fresh();
  await as(db, U.nutA, `select erase_client($1)`, [CA]);
  await db.exec(sql("0006_erasure_log.sql"));
  assert.equal(await count(db, `select count(*)::int n from erasure_log`), 1);
  assert.equal(await count(db, `select count(*)::int n from pg_trigger where tgname='clients_erasure_log'`), 1);
});
