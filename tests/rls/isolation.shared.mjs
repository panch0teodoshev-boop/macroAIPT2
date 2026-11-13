// Общи проверки за изолация между наематели — трябва да минават И преди, И след 0004.
import { test } from "node:test";
import assert from "node:assert/strict";
import { as, tryAs, U } from "./harness.mjs";

const TABLES = ["clients", "client_measurements", "plans", "plan_versions", "plan_days", "plan_meals", "plan_meal_items", "ai_conversations"];
const B_CLIENT = "c0000000-0000-0000-0000-00000000000b";
const B_MEAL = "e0000000-0000-0000-0000-00000000000b";
const GLOBAL_FOOD = "f0000000-0000-0000-0000-000000000001";

export function isolationSuite(getDb, label) {
  for (const tbl of TABLES) {
    test(`[${label}] нутриционист A вижда точно 1 свой ред в ${tbl} (нищо на B)`, async () => {
      const db = await getDb();
      const { rows } = await as(db, U.nutA, `select count(*)::int as n from ${tbl}`);
      assert.equal(rows[0].n, 1);
    });
  }
  test(`[${label}] A не може да прочете клиент на B по id (вкл. поверителните бележки)`, async () => {
    const { rows } = await as(await getDb(), U.nutA, `select private_notes from clients where id = '${B_CLIENT}'`);
    assert.equal(rows.length, 0);
  });
  test(`[${label}] A не може да промени или изтрие клиент на B`, async () => {
    const db = await getDb();
    assert.equal((await tryAs(db, U.nutA, `update clients set first_name='hack' where id='${B_CLIENT}'`)).affected, 0);
    assert.equal((await tryAs(db, U.nutA, `delete from clients where id='${B_CLIENT}'`)).affected, 0);
    const { rows } = await as(db, U.nutB, `select first_name from clients where id='${B_CLIENT}'`);
    assert.equal(rows[0].first_name, "Клиент b");
  });
  test(`[${label}] A не може да създаде клиент от името на B`, async () => {
    const r = await tryAs(await getDb(), U.nutA, `insert into clients (nutritionist_id, first_name) values ('${U.nutB}','x')`);
    assert.match(r.error || "", /row-level security/);
  });
  test(`[${label}] A не може да добави продукт в хранене на B`, async () => {
    const r = await tryAs(await getDb(), U.nutA, `insert into plan_meal_items (meal_id, food_id, qty, snapshot) values ('${B_MEAL}','${GLOBAL_FOOD}',1,'{}')`);
    assert.match(r.error || "", /row-level security/);
  });
  test(`[${label}] A не може да чете AI разговорите на B`, async () => {
    const { rows } = await as(await getDb(), U.nutA, `select messages::text as m from ai_conversations`);
    assert.ok(rows.every((r) => !r.m.includes("тайна b")));
  });
  test(`[${label}] храни: A вижда глобалните и своите, но не и собствените на B`, async () => {
    const { rows } = await as(await getDb(), U.nutA, `select name_bg from foods order by 1`);
    assert.deepEqual(rows.map((r) => r.name_bg), ["Глобална храна", "Храна на A"]);
  });
  test(`[${label}] A не може да променя глобална храна`, async () => {
    assert.equal((await tryAs(await getDb(), U.nutA, `update foods set kcal = 1 where owner_id is null`)).affected, 0);
  });
  test(`[${label}] рецепти: A вижда библиотечните (на админа) + своите, не и тези на B`, async () => {
    const { rows } = await as(await getDb(), U.nutA, `select name from recipes order by 1`);
    assert.deepEqual(rows.map((r) => r.name), ["Библиотечна рецепта", "Рецепта на A"]);
  });
  test(`[${label}] A не може да изтрие или промени библиотечна рецепта`, async () => {
    const db = await getDb();
    assert.equal((await tryAs(db, U.nutA, `delete from recipes where owner_id = '${U.admin}'`)).affected, 0);
    assert.equal((await tryAs(db, U.nutA, `update recipes set name='x' where owner_id = '${U.admin}'`)).affected, 0);
  });
  test(`[${label}] A вижда само собствения си профил`, async () => {
    const { rows } = await as(await getDb(), U.nutA, `select email from profiles`);
    assert.deepEqual(rows.map((r) => r.email), ["a@test.local"]);
  });
  test(`[${label}] администраторът НЯМА достъп до клиентски/здравни данни`, async () => {
    const db = await getDb();
    for (const tbl of ["clients", "client_measurements", "plans", "plan_meal_items", "ai_conversations"]) {
      const { rows } = await as(db, U.admin, `select count(*)::int as n from ${tbl}`);
      assert.equal(rows[0].n, 0, tbl);
    }
  });
  test(`[${label}] нутриционист не чете журнала на администратора`, async () => {
    const { rows } = await as(await getDb(), U.nutA, `select count(*)::int as n from admin_audit`);
    assert.equal(rows[0].n, 0);
  });
  test(`[${label}] неавтентикиран потребител не вижда нищо`, async () => {
    const db = await getDb();
    for (const tbl of [...TABLES, "foods", "recipes", "profiles"]) {
      const { rows } = await as(db, "", `select count(*)::int as n from ${tbl}`);
      assert.equal(rows[0].n, 0, tbl);
    }
  });
  test(`[${label}] деактивиран профил не вижда клиентите си`, async () => {
    const { rows } = await as(await getDb(), U.disabled, `select count(*)::int as n from clients`);
    assert.equal(rows[0].n, 0);
  });
}
