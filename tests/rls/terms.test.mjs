// Миграция 0007: приемане на Общите условия — само собственото, без промяна/изтриване, час от сървъра.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb, as, tryAs, U, PROD_MIGRATIONS, PROD_MANUAL } from "./harness.mjs";
import { readFileSync } from "node:fs";

const sql = (f) => readFileSync(new URL("../../supabase/migrations/" + f, import.meta.url), "utf8");
const fresh = async () => {
  const db = await makeDb(PROD_MIGRATIONS); await db.exec(PROD_MANUAL);
  for (const f of ["0004_security_hardening.sql", "0005_plan_templates.sql", "0006_erasure_log.sql", "0007_terms_acceptances.sql"]) await db.exec(sql(f));
  return db;
};

test("[0007] нутриционист приема; часът е от сървъра; повторно приемане на същата версия се отказва", async () => {
  const db = await fresh();
  const r = await tryAs(db, U.nutA, `insert into terms_acceptances (version, accepted_at) values ('2026-11-20', '2000-01-01')`);
  assert.equal(r.affected, 1);
  const { rows } = await as(db, U.nutA, `select user_id, version, accepted_at > now() - interval '1 minute' as fresh from terms_acceptances`);
  assert.deepEqual(rows, [{ user_id: U.nutA, version: "2026-11-20", fresh: true }]);
  assert.match((await tryAs(db, U.nutA, `insert into terms_acceptances (version) values ('2026-11-20')`)).error || "", /duplicate|unique/);
});
test("[0007] не може да се приеме от чуждо име; не може да се промени или изтрие", async () => {
  const db = await fresh();
  await as(db, U.nutA, `insert into terms_acceptances (version) values ('v1')`);
  assert.match((await tryAs(db, U.nutB, `insert into terms_acceptances (user_id, version) values ('${U.nutA}', 'v2')`)).error || "", /row-level security/);
  assert.match((await tryAs(db, U.nutA, `update terms_acceptances set version='x'`)).error || "", /permission denied/);
  assert.match((await tryAs(db, U.nutA, `delete from terms_acceptances`)).error || "", /permission denied/);
  assert.match((await tryAs(db, U.admin, `delete from terms_acceptances`)).error || "", /permission denied/);
});
test("[0007] всеки вижда своите; админът всички; анонимен нищо", async () => {
  const db = await fresh();
  await as(db, U.nutA, `insert into terms_acceptances (version) values ('v1')`);
  await as(db, U.nutB, `insert into terms_acceptances (version) values ('v1')`);
  assert.equal((await as(db, U.nutA, `select count(*)::int n from terms_acceptances`)).rows[0].n, 1);
  assert.equal((await as(db, U.admin, `select count(*)::int n from terms_acceptances`)).rows[0].n, 2);
  assert.equal((await as(db, null, `select count(*)::int n from terms_acceptances`)).rows[0].n, 0);
});
test("[0007] идемпотентна", async () => {
  const db = await fresh();
  await as(db, U.nutA, `insert into terms_acceptances (version) values ('v1')`);
  await db.exec(sql("0007_terms_acceptances.sql"));
  assert.equal((await db.query(`select count(*)::int n from terms_acceptances`)).rows[0].n, 1);
});
