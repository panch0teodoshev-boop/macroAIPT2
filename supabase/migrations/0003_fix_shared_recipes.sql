-- PulseMacro Pro — КОРЕКЦИЯ на споделянето на рецепти.
-- Проблем: политиките проверяваха ролята на собственика през таблицата profiles,
-- но RLS върху profiles крие реда на админа от нутрициониста → EXISTS връща 0.
-- Решение: SECURITY DEFINER функция, която проверява ролята, заобикаляйки RLS.

create or replace function public.is_owner_admin(uid uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'super_admin' from profiles where id = uid), false) $$;

-- Рецепти: библиотечните (на админа) се четат от всички активни.
drop policy if exists recipes_global_read on public.recipes;
create policy recipes_global_read on public.recipes for select
  using (is_active() and public.is_owner_admin(owner_id));

-- Съставки: видими, когато родителската рецепта е библиотечна.
drop policy if exists ringredients_global_read on public.recipe_ingredients;
create policy ringredients_global_read on public.recipe_ingredients for select
  using (is_active() and exists (
    select 1 from public.recipes r
    where r.id = recipe_ingredients.recipe_id and public.is_owner_admin(r.owner_id)
  ));
