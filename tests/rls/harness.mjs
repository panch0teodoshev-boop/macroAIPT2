// Изолирана Postgres среда (PGlite, in-memory) за тестове на схемата и RLS политиките.
// Имитира Supabase: schema auth, auth.uid(), роля "authenticated". Никакви реални данни.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIG = join(here, "..", "..", "supabase", "migrations");

export const U = {
  admin: "00000000-0000-0000-0000-00000000000a",
  nutA: "00000000-0000-0000-0000-0000000000a1",
  nutB: "00000000-0000-0000-0000-0000000000b1",
  disabled: "00000000-0000-0000-0000-0000000000d1",
};

/** migrations: списък файлове за прилагане върху базовата среда. */
export async function makeDb(migrations) {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role anon nologin;
  `);
  for (const f of migrations) await db.exec(readFileSync(join(MIG, f), "utf8"));
  // Supabase дава пълни table-права на authenticated; защитата е изцяло в RLS.
  await db.exec(`
    grant usage on schema public, auth to authenticated, anon;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  // seed (като superuser, заобикаля RLS): 1 админ, 2 активни нутрициониста, 1 деактивиран
  await db.exec(`
    insert into auth.users values ('${U.admin}'),('${U.nutA}'),('${U.nutB}'),('${U.disabled}');
    insert into profiles (id,email,full_name,role,status) values
      ('${U.admin}','admin@test.local','Admin','super_admin','active'),
      ('${U.nutA}','a@test.local','Nut A','nutritionist','active'),
      ('${U.nutB}','b@test.local','Nut B','nutritionist','active'),
      ('${U.disabled}','d@test.local','Nut D','nutritionist','disabled');
    insert into foods (id,owner_id,name_bg,kcal,protein_g,carbs_g,fat_g) values
      ('f0000000-0000-0000-0000-000000000001',null,'Глобална храна',100,10,10,2),
      ('f0000000-0000-0000-0000-0000000000a1','${U.nutA}','Храна на A',200,5,30,5),
      ('f0000000-0000-0000-0000-0000000000b1','${U.nutB}','Храна на B',300,5,30,5);
  `);
  for (const [k, uid] of [["a", U.nutA], ["b", U.nutB], ["d", U.disabled]]) {
    await db.exec(`
      insert into clients (id,nutritionist_id,first_name,private_notes) values ('c0000000-0000-0000-0000-00000000000${k}','${uid}','Клиент ${k}','поверително ${k}');
      insert into client_measurements (client_id,weight_kg) values ('c0000000-0000-0000-0000-00000000000${k}',80);
      insert into plans (id,client_id,nutritionist_id,title) values ('a0000000-0000-0000-0000-00000000000${k}','c0000000-0000-0000-0000-00000000000${k}','${uid}','План ${k}');
      insert into plan_versions (id,plan_id,version) values ('b0000000-0000-0000-0000-00000000000${k}','a0000000-0000-0000-0000-00000000000${k}',1);
      insert into plan_days (id,version_id,weekday) values ('d0000000-0000-0000-0000-00000000000${k}','b0000000-0000-0000-0000-00000000000${k}',0);
      insert into plan_meals (id,day_id,name) values ('e0000000-0000-0000-0000-00000000000${k}','d0000000-0000-0000-0000-00000000000${k}','Закуска');
      insert into plan_meal_items (meal_id,food_id,qty,snapshot) values ('e0000000-0000-0000-0000-00000000000${k}','f0000000-0000-0000-0000-000000000001',100,'{"kcal":100}');
      insert into ai_conversations (nutritionist_id,client_id,messages) values ('${uid}','c0000000-0000-0000-0000-00000000000${k}','[{"role":"user","content":"тайна ${k}"}]');
    `);
  }
  await db.exec(`
    insert into recipes (id,owner_id,name) values
      ('10000000-0000-0000-0000-00000000000a','${U.admin}','Библиотечна рецепта'),
      ('10000000-0000-0000-0000-0000000000a1','${U.nutA}','Рецепта на A'),
      ('10000000-0000-0000-0000-0000000000b1','${U.nutB}','Рецепта на B');
    insert into recipe_ingredients (recipe_id,food_id,qty,snapshot) values
      ('10000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-000000000001',100,'{"kcal":100}'),
      ('10000000-0000-0000-0000-0000000000b1','f0000000-0000-0000-0000-000000000001',100,'{"kcal":100}');
  `);
  return db;
}

/** Изпълнява SQL като даден потребител (роля authenticated + JWT sub), както PostgREST. */
export async function as(db, uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid || ""}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Връща { rows, error } без да хвърля — за проверки „трябва да бъде отказано". */
export async function tryAs(db, uid, sql, params = []) {
  try { const r = await as(db, uid, sql, params); return { rows: r.rows, affected: r.affectedRows ?? 0, error: null }; }
  catch (e) { return { rows: [], affected: 0, error: e.message }; }
}

export const PROD_MIGRATIONS = ["0001_init.sql", "0002_shared_recipes.sql", "0003_fix_shared_recipes.sql"];
// политика, добавена ръчно в production (не е в миграциите) — възпроизвеждаме я за вярна картина
export const PROD_MANUAL = `create policy audit_admin_insert on public.admin_audit for insert with check (is_admin());`;
