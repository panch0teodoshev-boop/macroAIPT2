-- ============================================================================
-- ProNutrition — 0004: втвърдяване на сигурността и целостта (одит, ноември 2026)
-- НЕ Е ПРИЛОЖЕНА В PRODUCTION. Прегледай и пусни ръчно в Supabase SQL Editor.
-- Идемпотентна: може да се пусне повторно. Не трие и не променя потребителски данни.
-- Тествана в изолирана среда: tests/rls/*.test.mjs
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) P0: profiles — забрана потребител сам да си сменя роля/статус/лимит/имейл.
--    Досега политиката profiles_self_upd позволяваше UPDATE на целия собствен ред,
--    т.е. нутриционист можеше да стане super_admin, а деактивиран — да се активира.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  -- auth.uid() е NULL за service role / SQL Editor → административни операции минават
  if auth.uid() is not null and not is_admin() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.client_limit is distinct from old.client_limit
       or new.email is distinct from old.email then
      raise exception 'Нямате право да променяте роля, статус, лимит или имейл на профила.'
        using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists profiles_self_upd on public.profiles;
create policy profiles_self_upd on public.profiles for update
  using (id = (select auth.uid()) or (select is_admin()))
  with check (id = (select auth.uid()) or (select is_admin()));

-- ---------------------------------------------------------------------------
-- 2) Деактивиран/блокиран профил губи достъп до ВСИЧКИ свои данни през API
--    (досега is_active() се проверяваше само за clients и foods_read).
--    (select ...) обвивката кешира функцията веднъж на заявка → по-бързи политики.
-- ---------------------------------------------------------------------------
drop policy if exists clients_owner_all on public.clients;
create policy clients_owner_all on public.clients for all
  using (nutritionist_id = (select auth.uid()) and (select is_active()))
  with check (nutritionist_id = (select auth.uid()) and (select is_active()));

drop policy if exists meas_owner_all on public.client_measurements;
create policy meas_owner_all on public.client_measurements for all
  using ((select is_active()) and exists (select 1 from clients c where c.id = client_id and c.nutritionist_id = (select auth.uid())))
  with check ((select is_active()) and exists (select 1 from clients c where c.id = client_id and c.nutritionist_id = (select auth.uid())));

drop policy if exists foods_own_write on public.foods;
create policy foods_own_write on public.foods for all
  using (owner_id = (select auth.uid()) and (select is_active()))
  with check (owner_id = (select auth.uid()) and (select is_active()));

drop policy if exists recipes_owner_all on public.recipes;
create policy recipes_owner_all on public.recipes for all
  using (owner_id = (select auth.uid()) and (select is_active()))
  with check (owner_id = (select auth.uid()) and (select is_active()));

drop policy if exists ringredients_owner on public.recipe_ingredients;
create policy ringredients_owner on public.recipe_ingredients for all
  using ((select is_active()) and exists (select 1 from recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())))
  with check ((select is_active()) and exists (select 1 from recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));

-- планове: + проверка, че клиентът принадлежи на същия нутриционист
drop policy if exists plans_owner_all on public.plans;
create policy plans_owner_all on public.plans for all
  using (nutritionist_id = (select auth.uid()) and (select is_active()))
  with check (
    nutritionist_id = (select auth.uid()) and (select is_active())
    and exists (select 1 from clients c where c.id = client_id and c.nutritionist_id = (select auth.uid()))
  );

drop policy if exists pver_owner on public.plan_versions;
create policy pver_owner on public.plan_versions for all
  using ((select is_active()) and exists (select 1 from plans p where p.id = plan_id and p.nutritionist_id = (select auth.uid())))
  with check ((select is_active()) and exists (select 1 from plans p where p.id = plan_id and p.nutritionist_id = (select auth.uid())));

drop policy if exists pday_owner on public.plan_days;
create policy pday_owner on public.plan_days for all
  using ((select is_active()) and exists (select 1 from plan_versions v join plans p on p.id = v.plan_id
                 where v.id = version_id and p.nutritionist_id = (select auth.uid())))
  with check ((select is_active()) and exists (select 1 from plan_versions v join plans p on p.id = v.plan_id
                 where v.id = version_id and p.nutritionist_id = (select auth.uid())));

drop policy if exists pmeal_owner on public.plan_meals;
create policy pmeal_owner on public.plan_meals for all
  using ((select is_active()) and exists (select 1 from plan_days d join plan_versions v on v.id = d.version_id
                 join plans p on p.id = v.plan_id where d.id = day_id and p.nutritionist_id = (select auth.uid())))
  with check ((select is_active()) and exists (select 1 from plan_days d join plan_versions v on v.id = d.version_id
                 join plans p on p.id = v.plan_id where d.id = day_id and p.nutritionist_id = (select auth.uid())));

drop policy if exists pitem_owner on public.plan_meal_items;
create policy pitem_owner on public.plan_meal_items for all
  using ((select is_active()) and exists (select 1 from plan_meals m join plan_days d on d.id = m.day_id
                 join plan_versions v on v.id = d.version_id join plans p on p.id = v.plan_id
                 where m.id = meal_id and p.nutritionist_id = (select auth.uid())))
  with check ((select is_active()) and exists (select 1 from plan_meals m join plan_days d on d.id = m.day_id
                 join plan_versions v on v.id = d.version_id join plans p on p.id = v.plan_id
                 where m.id = meal_id and p.nutritionist_id = (select auth.uid())));

drop policy if exists ai_owner_all on public.ai_conversations;
create policy ai_owner_all on public.ai_conversations for all
  using (nutritionist_id = (select auth.uid()) and (select is_active()))
  with check (nutritionist_id = (select auth.uid()) and (select is_active()));

-- ---------------------------------------------------------------------------
-- 3) Одит: политиката за запис съществуваше само ръчно в production → в миграция,
--    и актьорът трябва да е самият админ (без записи от чуждо име).
-- ---------------------------------------------------------------------------
drop policy if exists audit_admin_insert on public.admin_audit;
create policy audit_admin_insert on public.admin_audit for insert
  with check ((select is_admin()) and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Лимит на клиентите (client_limit) — досега не се прилагаше никъде.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_client_limit() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare lim integer; cnt integer;
begin
  select client_limit into lim from profiles where id = new.nutritionist_id;
  if lim is not null then
    select count(*) into cnt from clients where nutritionist_id = new.nutritionist_id and not archived;
    if cnt >= lim then
      raise exception 'Достигнат е лимитът от % активни клиента за този профил.', lim using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists clients_limit on public.clients;
create trigger clients_limit before insert on public.clients
  for each row execute function public.enforce_client_limit();

-- ---------------------------------------------------------------------------
-- 5) Админ панел: брой клиенти на нутриционист БЕЗ достъп до самите клиентски данни
--    (досега колоната „Клиенти" показваше 0 за всички освен за самия админ).
-- ---------------------------------------------------------------------------
create or replace function public.admin_client_counts()
  returns table (nutritionist_id uuid, active_clients bigint)
  language sql stable security definer set search_path = public as
$$
  select c.nutritionist_id, count(*) filter (where not c.archived)
  from clients c
  where is_admin()
  group by c.nutritionist_id
$$;
revoke all on function public.admin_client_counts() from public;
grant execute on function public.admin_client_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Цялост на данните
-- ---------------------------------------------------------------------------
-- 6a) Изтриване на рецепта/храна, използвана в режим, се проваляше: FK е ON DELETE SET NULL,
--     но check-ът изискваше food_id или recipe_id. Снапшотът пази стойностите и името,
--     затова ред без връзка е валиден.
alter table public.plan_meal_items drop constraint if exists plan_meal_items_check;

-- 6b) Без отрицателни количества и нулеви порции (NOT VALID: важи за нови/променени редове,
--     не се проваля заради евентуални стари записи).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_meal_items_qty_nonneg') then
    alter table public.plan_meal_items add constraint plan_meal_items_qty_nonneg check (qty >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_ingredients_qty_nonneg') then
    alter table public.recipe_ingredients add constraint recipe_ingredients_qty_nonneg check (qty >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipes_servings_pos') then
    alter table public.recipes add constraint recipes_servings_pos check (servings > 0) not valid;
  end if;
end
$$;

-- 6c) Един ред на ден от седмицата във версия. Ако вече има дубликати, индексът се пропуска
--     (нищо не се трие) — провери с:
--     select version_id, weekday, count(*) from plan_days group by 1,2 having count(*) > 1;
do $$
begin
  if exists (select 1 from plan_days group by version_id, weekday having count(*) > 1) then
    raise notice 'plan_days съдържа дублирани дни — уникалният индекс НЕ е създаден. Почисти ръчно и пусни пак.';
  else
    create unique index if not exists plan_days_version_weekday_uq on public.plan_days (version_id, weekday);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 7) Индекси за вложените RLS проверки и честите заявки (липсваха)
-- ---------------------------------------------------------------------------
create index if not exists plan_days_version_idx       on public.plan_days (version_id);
create index if not exists plan_meals_day_idx          on public.plan_meals (day_id);
create index if not exists plans_nutritionist_idx      on public.plans (nutritionist_id);
create index if not exists plan_items_food_idx         on public.plan_meal_items (food_id);
create index if not exists plan_items_recipe_idx       on public.plan_meal_items (recipe_id);
create index if not exists recipe_ingredients_food_idx on public.recipe_ingredients (food_id);
create index if not exists ai_conv_client_idx          on public.ai_conversations (client_id);
create index if not exists clients_owner_active_idx    on public.clients (nutritionist_id, archived);
