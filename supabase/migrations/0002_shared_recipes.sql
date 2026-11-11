-- PulseMacro Pro — споделяне на рецептите на администратора (библиотека).
-- Рецептите, чийто собственик е super_admin, стават видими (само за ЧЕТЕНЕ)
-- за всички активни нутриционисти. Писането остава само за собственика.

-- Рецепти: четене на библиотечните (на админа) от всички активни.
drop policy if exists recipes_global_read on public.recipes;
create policy recipes_global_read on public.recipes for select
  using (is_active() and exists (
    select 1 from public.profiles p
    where p.id = recipes.owner_id and p.role = 'super_admin'
  ));

-- Съставки: видими, когато родителската рецепта е библиотечна.
drop policy if exists ringredients_global_read on public.recipe_ingredients;
create policy ringredients_global_read on public.recipe_ingredients for select
  using (is_active() and exists (
    select 1 from public.recipes r
    join public.profiles p on p.id = r.owner_id
    where r.id = recipe_ingredients.recipe_id and p.role = 'super_admin'
  ));
