// СЪСТОЯНИЕ В PRODUCTION (миграции 0001–0003 + ръчната политика за одит).
// Част 1: изолацията между наематели. Част 2: ДОКАЗАНИ уязвимости/дефекти (тестовете
// минават, когато дефектът Е НАЛИЧЕН — служат като доказателство; 0004 ги отстранява).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { makeDb, as, tryAs, U, PROD_MIGRATIONS, PROD_MANUAL } from "./harness.mjs";
import { isolationSuite } from "./isolation.shared.mjs";

let shared;
before(async () => { shared = await makeDb(PROD_MIGRATIONS); await shared.exec(PROD_MANUAL); });
isolationSuite(async () => shared, "prod");

const fresh = async () => { const db = await makeDb(PROD_MIGRATIONS); await db.exec(PROD_MANUAL); return db; };

test("[prod][SEC-01 НАЛИЧНА] нутриционист сам си дава роля super_admin", async () => {
  const db = await fresh();
  const r = await tryAs(db, U.nutA, `update profiles set role='super_admin' where id='${U.nutA}'`);
  assert.equal(r.affected, 1, "ескалацията минава");
  const { rows } = await as(db, U.nutA, `select count(*)::int as n from profiles`);
  assert.equal(rows[0].n, 4, "вече чете всички профили (имейли)");
  assert.equal((await tryAs(db, U.nutA, `update profiles set status='blocked' where id='${U.nutB}'`)).affected, 1, "може да блокира колега");
  assert.equal((await tryAs(db, U.nutA, `update foods set kcal=9999 where owner_id is null`)).affected, 1, "може да подмени глобалната хранителна база");
  assert.equal((await tryAs(db, U.nutA, `delete from foods where owner_id='${U.nutB}'`)).affected, 1, "може да трие храни на колега");
  const c = await as(db, U.nutA, `select count(*)::int as n from clients`);
  assert.equal(c.rows[0].n, 1, "клиентските данни на другите ОСТАВАТ недостъпни и след ескалация");
});
test("[prod][SEC-01 НАЛИЧНА] деактивиран профил сам се активира и си връща достъпа", async () => {
  const db = await fresh();
  assert.equal((await tryAs(db, U.disabled, `update profiles set status='active' where id='${U.disabled}'`)).affected, 1);
  const { rows } = await as(db, U.disabled, `select count(*)::int as n from clients`);
  assert.equal(rows[0].n, 1);
});
test("[prod][SEC-03 НАЛИЧНА] деактивиран профил още чете режимите и AI разговорите си", async () => {
  const db = await fresh();
  for (const tbl of ["plans", "plan_meal_items", "ai_conversations"]) {
    const { rows } = await as(db, U.disabled, `select count(*)::int as n from ${tbl}`);
    assert.equal(rows[0].n, 1, tbl);
  }
});
test("[prod][DB-01 НАЛИЧЕН] рецепта, използвана в режим, не може да се изтрие (check срещу ON DELETE SET NULL)", async () => {
  const db = await fresh();
  await db.exec(`insert into plan_meal_items (meal_id, recipe_id, qty, unit, snapshot) values ('e0000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1',1,'serving','{}')`);
  const r = await tryAs(db, U.nutB, `delete from recipes where id='10000000-0000-0000-0000-0000000000b1'`);
  assert.match(r.error || "", /plan_meal_items_check/);
});
test("[prod][DB-02 НАЛИЧЕН] допускат се дублирани дни във версия и отрицателни количества", async () => {
  const db = await fresh();
  assert.equal((await tryAs(db, U.nutB, `insert into plan_days (version_id, weekday) values ('b0000000-0000-0000-0000-00000000000b',0)`)).affected, 1);
  assert.equal((await tryAs(db, U.nutB, `update plan_meal_items set qty = -50`)).affected, 1);
});
test("[prod][DB-03 НАЛИЧЕН] client_limit не се прилага", async () => {
  const db = await fresh();
  await db.exec(`update profiles set client_limit = 1 where id='${U.nutB}'`);
  const r = await tryAs(db, U.nutB, `insert into clients (nutritionist_id, first_name) values ('${U.nutB}','над лимита')`);
  assert.equal(r.error, null);
});
test("[prod][DB-04 НАЛИЧЕН] може да се създаде план към клиент на друг нутриционист (осиротял запис, без изтичане)", async () => {
  const db = await fresh();
  const r = await tryAs(db, U.nutA, `insert into plans (client_id, nutritionist_id, title) values ('c0000000-0000-0000-0000-00000000000b','${U.nutA}','x')`);
  assert.equal(r.error, null);
});
