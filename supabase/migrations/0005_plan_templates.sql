-- ============================================================================
-- ProNutrition — 0005: шаблони на ден / седмица (версия 1.1)
-- Само ДОБАВЯ нова таблица. Не пипа и не трие съществуващи данни.
-- Идемпотентна: може да се пусне повторно. Тествана: tests/rls/templates.test.mjs
-- ============================================================================

create table if not exists public.plan_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  kind        text not null check (kind in ('day', 'week')),
  -- [{ weekday, meals: [{ name, position, items: [{ food_id, recipe_id, qty, unit, snapshot }] }] }]
  -- Снапшотите пазят хранителните стойности, така че шаблонът работи и ако продуктът по-късно се изтрие.
  content     jsonb not null check (jsonb_typeof(content) = 'array' and octet_length(content::text) <= 300000),
  kcal_avg    numeric check (kcal_avg is null or kcal_avg >= 0),
  item_count  int not null default 0 check (item_count >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists plan_templates_owner_idx on public.plan_templates (owner_id, created_at desc);

alter table public.plan_templates enable row level security;
-- права на ниво таблица (в Supabase се дават по подразбиране; явно — за сигурност). Достъпът реално се решава от RLS.
grant select, insert, update, delete on public.plan_templates to authenticated;
revoke all on public.plan_templates from anon;

-- Само собственикът (активен) вижда и управлява шаблоните си. Шаблоните не съдържат данни за клиенти.
drop policy if exists templates_owner_all on public.plan_templates;
create policy templates_owner_all on public.plan_templates for all
  using (owner_id = (select auth.uid()) and (select is_active()))
  with check (owner_id = (select auth.uid()) and (select is_active()));

-- Проверка след пускане (трябва да върне 1 ред: plan_templates | true):
-- select tablename, rowsecurity from pg_tables where tablename = 'plan_templates';
