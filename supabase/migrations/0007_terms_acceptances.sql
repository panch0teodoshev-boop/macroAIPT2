-- ============================================================================
-- ProNutrition — 0007: приемане на Общите условия (доказателство: кой, коя версия, кога)
-- Само ДОБАВЯ таблица. Не пипа съществуващи данни. Идемпотентна. Тествана: tests/rls/terms.test.mjs
-- ============================================================================
create table if not exists public.terms_acceptances (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  version     text not null check (char_length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);
alter table public.terms_acceptances enable row level security;
grant select, insert on public.terms_acceptances to authenticated;
revoke update, delete, truncate on public.terms_acceptances from authenticated;
revoke all on public.terms_acceptances from anon;

-- всеки записва само собственото си приемане; часът се слага от сървъра (не може да се подправи)
drop policy if exists terms_insert_own on public.terms_acceptances;
create policy terms_insert_own on public.terms_acceptances for insert
  with check (user_id = (select auth.uid()));
-- всеки вижда своите приемания; админът — всички (за справка в админ панела)
drop policy if exists terms_read on public.terms_acceptances;
create policy terms_read on public.terms_acceptances for select
  using (user_id = (select auth.uid()) or (select is_admin()));

create or replace function public.terms_force_now() returns trigger language plpgsql as $$
begin new.accepted_at := now(); return new; end $$;
drop trigger if exists terms_acceptances_now on public.terms_acceptances;
create trigger terms_acceptances_now before insert on public.terms_acceptances
  for each row execute function public.terms_force_now();

-- Проверка (трябва да върне: terms_acceptances | true):
-- select relname, relrowsecurity from pg_class where relname = 'terms_acceptances';
