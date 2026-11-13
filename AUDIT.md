# Клон `audit-fixes` — какво съдържа и как се пуска

Резултат от техническия одит (ноември 2026). **Нищо от този клон не е в production.**

## Тестове (136, всички минават)
| Команда | Какво проверява | Брой |
|---|---|---|
| `npm test` | калкулатори, сметки на режима, AI прокси (с подменен fetch) | 57 |
| `npm run test:rls` | схема + RLS в изолирана Postgres (PGlite): преди и след миграция 0004 | 65 |
| `npm run test:e2e` | браузър (Chromium) срещу реалния build и симулиран бекенд | 14 |

`tests/e2e/probe-before-after.mjs <dist> <етикет>` — възпроизвежда дефектите и брои заявките върху произволен build.

## Ред на пускане (важен)
1. **Supabase → SQL Editor:** `supabase/migrations/0004_security_hardening.sql` (идемпотентна, не трие данни).
   Преди това провери за дублирани дни: `select version_id, weekday, count(*) from plan_days group by 1,2 having count(*) > 1;`
2. **Cloudflare Worker:** замени кода с `cloudflare/worker.js`; добави променливи `SUPABASE_URL`, `SUPABASE_ANON_KEY`; остави `REQUIRE_AUTH` празна.
3. **Merge на клона в `main`** (Vercel деплойва). Провери вход, режим, AI.
4. **Cloudflare Worker:** задай `REQUIRE_AUTH = 1` → проксито отказва заявки без валидна сесия.

Стъпка 1 е независима и най-спешна (затваря ескалацията на права).
