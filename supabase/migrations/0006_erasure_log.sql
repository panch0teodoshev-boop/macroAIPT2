-- ============================================================================
-- ProNutrition — 0006: журнал на заличаванията (GDPR, чл. 17 и чл. 5(2) — отчетност)
-- Само ДОБАВЯ таблица, тригер и функция. Не пипа и не трие съществуващи данни.
-- Идемпотентна: може да се пусне повторно. Тествана: tests/rls/erasure.test.mjs
--
-- Журналът НЕ съдържа лични данни: само кога, кой нутриционист, вътрешния номер (uuid) на
-- изтрития запис и колко реда са изтрити. Името, мерките и режимите не се пазят никъде.
-- ============================================================================

create table if not exists public.erasure_log (
  id              bigint generated always as identity primary key,
  client_ref      uuid not null,         -- вътрешен номер на изтрития клиент (вече не сочи към нищо)
  nutritionist_id uuid,                  -- без FK: записът трябва да остане и ако профилът бъде изтрит
  erased_by       uuid,                  -- кой е изтрил (auth.uid()); null = SQL Editor / системно
  source          text not null check (source in ('gdpr_request', 'other')),
  counts          jsonb not null default '{}'::jsonb,
  erased_at       timestamptz not null default now()
);
create index if not exists erasure_log_nut_idx on public.erasure_log (nutritionist_id, erased_at desc);

alter table public.erasure_log enable row level security;
-- Само четене: нутриционистът вижда своите записи, админът — всички. Няма политики за
-- insert/update/delete → през API никой не може да добави, промени или изтрие запис.
grant select on public.erasure_log to authenticated;
revoke insert, update, delete, truncate on public.erasure_log from authenticated, anon;
revoke all on public.erasure_log from anon;
drop policy if exists erasure_read on public.erasure_log;
create policy erasure_read on public.erasure_log for select
  using (((select auth.uid()) = nutritionist_id and (select is_active())) or (select is_admin()));

-- Тригер: всяко изтриване на клиент (от приложението, от SQL Editor или при изтриване на профил)
-- оставя запис. BEFORE DELETE → броим свързаните редове преди каскадата; при неуспешно изтриване
-- записът се отменя заедно с транзакцията.
create or replace function public.log_client_erasure() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.erasure_log (client_ref, nutritionist_id, erased_by, source, counts)
  values (
    old.id, old.nutritionist_id, auth.uid(),
    coalesce(nullif(current_setting('pn.erase_source', true), ''), 'other'),
    jsonb_build_object(
      'measurements', (select count(*) from public.client_measurements where client_id = old.id),
      'plans', (select count(*) from public.plans where client_id = old.id),
      'plan_items', (select count(*) from public.plan_meal_items i
                       join public.plan_meals m on m.id = i.meal_id
                       join public.plan_days d on d.id = m.day_id
                       join public.plan_versions v on v.id = d.version_id
                       join public.plans p on p.id = v.plan_id
                      where p.client_id = old.id),
      'ai_conversations', coalesce(nullif(current_setting('pn.erase_ai', true), '')::int,
                                   (select count(*) from public.ai_conversations where client_id = old.id))
    )
  );
  return old;
end $$;
revoke all on function public.log_client_erasure() from public;

drop trigger if exists clients_erasure_log on public.clients;
create trigger clients_erasure_log before delete on public.clients
  for each row execute function public.log_client_erasure();

-- Заличаване по заявка на клиента: AI разговори + клиентът (каскадно мерки и режими) в ЕДНА
-- транзакция — или всичко, или нищо. SECURITY INVOKER: важат RLS правилата на нутрициониста,
-- т.е. може да заличи само свой клиент.
create or replace function public.erase_client(p_client uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n_ai int; n int; result jsonb;
begin
  if not exists (select 1 from public.clients where id = p_client) then
    raise exception 'Клиентът не е намерен или нямате достъп до него.' using errcode = '42501';
  end if;
  delete from public.ai_conversations where client_id = p_client;
  get diagnostics n_ai = row_count;
  perform set_config('pn.erase_source', 'gdpr_request', true);
  perform set_config('pn.erase_ai', n_ai::text, true);
  delete from public.clients where id = p_client;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Клиентът не беше изтрит.' using errcode = '42501';
  end if;
  select counts into result from public.erasure_log where client_ref = p_client order by id desc limit 1;
  perform set_config('pn.erase_source', '', true);
  perform set_config('pn.erase_ai', '', true);
  return coalesce(result, '{}'::jsonb);
end $$;
revoke all on function public.erase_client(uuid) from public, anon;
grant execute on function public.erase_client(uuid) to authenticated;

-- Проверка след пускане (трябва да върне 1 ред: erasure_log | true | 1):
-- select c.relname, c.relrowsecurity, (select count(*) from pg_trigger where tgname = 'clients_erasure_log') as trg
--   from pg_class c where c.relname = 'erasure_log';
