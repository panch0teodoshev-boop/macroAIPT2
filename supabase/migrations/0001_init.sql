-- ============================================================================
-- PulseMacro Pro — начална схема (PostgreSQL / Supabase)
-- Роли: super_admin, nutritionist. Изолация на данните чрез Row Level Security.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm"; -- бързо търсене по име (BG/EN)

-- ---------- роли и профили ----------
create type user_role as enum ('super_admin', 'nutritionist');
create type account_status as enum ('invited', 'active', 'disabled', 'blocked');

-- Профилът огледва auth.users (Supabase Auth пази самите идентификационни данни).
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'nutritionist',
  status      account_status not null default 'invited',
  client_limit integer,                       -- NULL = без лимит
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- помощни функции за политиките (SECURITY DEFINER, за да четат profiles без рекурсия)
create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(auth_role() = 'super_admin', false) $$;

create or replace function is_active() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce((select status = 'active' from profiles where id = auth.uid()), false) $$;

-- ---------- клиенти (всеки принадлежи на един нутриционист) ----------
create type client_goal as enum ('reduction', 'maintenance', 'muscle_gain', 'recomposition');
create type work_type   as enum ('sedentary', 'moderate', 'physical');

create table clients (
  id             uuid primary key default gen_random_uuid(),
  nutritionist_id uuid not null references profiles(id) on delete cascade,
  first_name     text not null,
  last_name      text,
  birth_date     date,
  sex            text check (sex in ('male','female') or sex is null),
  height_cm      numeric(5,1),
  weight_kg      numeric(5,1),
  goal_weight_kg numeric(5,1),
  main_goal      client_goal,
  work_type      work_type,
  steps_per_day  integer,
  workouts_per_week integer,
  activity_level text,                        -- sedentary..extreme
  -- хранителни предпочитания/ограничения
  meals_per_day  integer,
  diet           text,                        -- вег/веган/др.
  allergies      text,
  excluded_foods text,
  -- конфиденциални бележки (медицински особености; без диагнози)
  private_notes  text,
  next_review    date,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on clients (nutritionist_id);

-- история на измерванията и телесния състав
create table client_measurements (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg   numeric(5,1),
  body_fat_pct numeric(4,1),
  lean_mass_kg numeric(5,1),
  skeletal_muscle_kg numeric(5,1),
  waist_cm    numeric(5,1),
  extra       jsonb,
  created_at  timestamptz not null default now()
);
create index on client_measurements (client_id, measured_on);

-- ---------- хранителна база ----------
-- Централни продукти (owner_id NULL = глобални, управлявани от админа)
-- + собствени продукти на нутриционист (owner_id = неговото id).
create table foods (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles(id) on delete cascade, -- NULL = глобален
  name_bg     text not null,
  name_en     text,
  category    text,
  unit        text not null default '100g' check (unit in ('100g','piece')),
  state       text check (state in ('raw','cooked') or state is null),
  -- макроси на 100 g (или на 1 бр.)
  kcal        numeric(7,2),
  protein_g   numeric(6,2),
  carbs_g     numeric(6,2),
  fat_g       numeric(6,2),
  fiber_g     numeric(6,2),
  sugar_g     numeric(6,2),
  satfat_g    numeric(6,2),
  -- микронутриенти като jsonb {key: value|null}; NULL ключ = липсва (не 0)
  micros      jsonb not null default '{}'::jsonb,
  source      text,
  updated_at  timestamptz not null default now(),
  archived    boolean not null default false
);
create index on foods using gin (name_bg gin_trgm_ops);
create index on foods using gin (name_en gin_trgm_ops);
create index on foods (owner_id);

-- рецепти + съставки (със съхранен снапшот на стойностите)
create table recipes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  category    text,
  tags        text[] default '{}',
  servings    numeric(5,1) not null default 1,
  yield_g     numeric(7,1),                   -- краен добив след готвене
  notes       text,
  created_at  timestamptz not null default now()
);
create index on recipes (owner_id);

create table recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes(id) on delete cascade,
  food_id     uuid references foods(id) on delete set null,
  qty         numeric(7,2) not null,
  unit        text not null default '100g',
  -- снапшот на нутриентите към момента на добавяне (изискване 8: без неочаквана промяна)
  snapshot    jsonb not null
);
create index on recipe_ingredients (recipe_id);

-- ---------- хранителни режими (планове) ----------
create type plan_status as enum ('draft', 'final', 'archived');

create table plans (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  nutritionist_id uuid not null references profiles(id) on delete cascade,
  title       text not null,
  created_at  timestamptz not null default now()
);
create index on plans (client_id);

create table plan_versions (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references plans(id) on delete cascade,
  version     integer not null,
  status      plan_status not null default 'draft',
  -- цели (снапшот от калкулатора), за да са проверими и стабилни
  targets     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (plan_id, version)
);

create table plan_days (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references plan_versions(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6)
);
create table plan_meals (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references plan_days(id) on delete cascade,
  name        text not null,
  position    smallint not null default 0
);
create table plan_meal_items (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references plan_meals(id) on delete cascade,
  food_id     uuid references foods(id) on delete set null,
  recipe_id   uuid references recipes(id) on delete set null,
  qty         numeric(7,2) not null,
  unit        text not null default '100g',
  snapshot    jsonb not null,                 -- заключени нутриенти (изискване 8/14)
  check (food_id is not null or recipe_id is not null)
);
create index on plan_meal_items (meal_id);

-- ---------- AI разговори (минимизирани данни) ----------
create table ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  nutritionist_id uuid not null references profiles(id) on delete cascade,
  client_id   uuid references clients(id) on delete set null,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on ai_conversations (nutritionist_id);

-- ---------- одит на административни действия ----------
create table admin_audit (
  id          bigint generated always as identity primary key,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  target      text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- системни настройки ----------
create table app_settings (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles            enable row level security;
alter table clients             enable row level security;
alter table client_measurements enable row level security;
alter table foods               enable row level security;
alter table recipes             enable row level security;
alter table recipe_ingredients  enable row level security;
alter table plans               enable row level security;
alter table plan_versions       enable row level security;
alter table plan_days           enable row level security;
alter table plan_meals          enable row level security;
alter table plan_meal_items     enable row level security;
alter table ai_conversations    enable row level security;
alter table admin_audit         enable row level security;
alter table app_settings        enable row level security;

-- profiles: всеки чете своя профил; админът чете/пише всички
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_upd  on profiles for update using (id = auth.uid() or is_admin());
create policy profiles_admin_ins on profiles for insert with check (is_admin());

-- clients: само собственикът-нутриционист (активен). Админът НЯМА рутинен достъп до
-- здравни данни на клиенти (изискване 2 — ограничен и логван достъп, не през RLS по подразбиране).
create policy clients_owner_all on clients for all
  using (nutritionist_id = auth.uid() and is_active())
  with check (nutritionist_id = auth.uid() and is_active());

create policy meas_owner_all on client_measurements for all
  using (exists (select 1 from clients c where c.id = client_id and c.nutritionist_id = auth.uid()))
  with check (exists (select 1 from clients c where c.id = client_id and c.nutritionist_id = auth.uid()));

-- foods: глобалните се четат от всички активни; собствените — само от собственика.
-- Глобалните се управляват само от админа.
create policy foods_read on foods for select
  using (is_active() and (owner_id is null or owner_id = auth.uid()));
create policy foods_own_write on foods for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy foods_admin_global on foods for all
  using (is_admin()) with check (is_admin());

-- recipes: само собственика
create policy recipes_owner_all on recipes for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ringredients_owner on recipe_ingredients for all
  using (exists (select 1 from recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

-- планове и всичко вложено: достъпни само за нутрициониста-собственик
create policy plans_owner_all on plans for all
  using (nutritionist_id = auth.uid()) with check (nutritionist_id = auth.uid());
create policy pver_owner on plan_versions for all
  using (exists (select 1 from plans p where p.id = plan_id and p.nutritionist_id = auth.uid()))
  with check (exists (select 1 from plans p where p.id = plan_id and p.nutritionist_id = auth.uid()));
create policy pday_owner on plan_days for all
  using (exists (select 1 from plan_versions v join plans p on p.id=v.plan_id
                 where v.id = version_id and p.nutritionist_id = auth.uid()))
  with check (exists (select 1 from plan_versions v join plans p on p.id=v.plan_id
                 where v.id = version_id and p.nutritionist_id = auth.uid()));
create policy pmeal_owner on plan_meals for all
  using (exists (select 1 from plan_days d join plan_versions v on v.id=d.version_id
                 join plans p on p.id=v.plan_id where d.id = day_id and p.nutritionist_id = auth.uid()))
  with check (exists (select 1 from plan_days d join plan_versions v on v.id=d.version_id
                 join plans p on p.id=v.plan_id where d.id = day_id and p.nutritionist_id = auth.uid()));
create policy pitem_owner on plan_meal_items for all
  using (exists (select 1 from plan_meals m join plan_days d on d.id=m.day_id
                 join plan_versions v on v.id=d.version_id join plans p on p.id=v.plan_id
                 where m.id = meal_id and p.nutritionist_id = auth.uid()))
  with check (exists (select 1 from plan_meals m join plan_days d on d.id=m.day_id
                 join plan_versions v on v.id=d.version_id join plans p on p.id=v.plan_id
                 where m.id = meal_id and p.nutritionist_id = auth.uid()));

-- AI разговори: само собственика
create policy ai_owner_all on ai_conversations for all
  using (nutritionist_id = auth.uid()) with check (nutritionist_id = auth.uid());

-- одит: само админът чете; запис става през SECURITY DEFINER функция (вмъкване забранено от клиента)
create policy audit_admin_read on admin_audit for select using (is_admin());

-- настройки: четат активните, пише само админът
create policy settings_read on app_settings for select using (is_active());
create policy settings_admin_write on app_settings for all using (is_admin()) with check (is_admin());
