// Възпроизвеждане на дефектите върху build от main (production код) + броене на заявки.
import { createRequire } from "node:module"; import http from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { join, extname } from "node:path";
import { createBackend } from "./fakeBackend.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const DIST = process.argv[2]; const LABEL = process.argv[3];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => { const p = join(DIST, req.url === "/" ? "index.html" : req.url.split("?")[0]); const f = existsSync(p) ? p : join(DIST, "index.html"); res.writeHead(200, { "content-type": MIME[extname(f)] }); res.end(readFileSync(f)); });
await new Promise((r) => server.listen(0, "127.0.0.1", r)); const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const out = {};
async function session(seed, viewport = { width: 1280, height: 900 }) {
  const be = createBackend(); const nutId = be.addUser("nut@test.local", "p", { full_name: "N" });
  be.db.foods.push({ id: be.uuid(), owner_id: null, archived: false, name_bg: "Пилешко филе", unit: "100g", kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, micros: {} });
  const client = { id: be.uuid(), nutritionist_id: nutId, first_name: "Мария", last_name: "Иванова", sex: "female", birth_date: null, height_cm: 168, weight_kg: 65, main_goal: "reduction", activity_level: "moderate", archived: false, created_at: "2026-02-01" };
  be.db.clients.push(client); if (seed) seed(be, nutId, client);
  const ctx = await browser.newContext({ viewport }); await be.install(ctx); const page = await ctx.newPage();
  const dialogs = []; page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await page.goto(BASE); await page.getByLabel("Имейл").fill("nut@test.local"); await page.getByLabel("Парола").fill("p"); await page.getByRole("button", { name: "Вход" }).click();
  await page.getByText("Здравей").waitFor();
  return { be, ctx, page, dialogs };
}
const nav = (page, name) => page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
async function planner(page) { await nav(page, "Седмичен дневник"); await page.locator("select").first().selectOption({ label: "Мария Иванова" }); await page.getByText("Общо за деня:").waitFor(); }
async function addChicken(page) { await page.getByRole("button", { name: "+ Добави продукт / рецепта" }).first().click(); await page.getByRole("button", { name: /^Пилешко филе/ }).click(); await page.getByText(/Общо за деня: 165/).waitFor(); }
const qtyInput = (page) => page.locator('input[aria-label^="Количество"], input[type="number"]').first();

{ // 1. отваряне на режим: брой заявки
  const { be, page, ctx } = await session(); be.state.requests.length = 0; const t0 = Date.now();
  await planner(page); out.openPlanner = { requests: be.state.requests.length, ms: Date.now() - t0 };
  await addChicken(page);
  // 2. въвеждане на „150": брой записи в базата
  be.state.requests.length = 0; const q = qtyInput(page); await q.click(); await q.press("Control+a"); await q.pressSequentially("150", { delay: 60 }); await q.blur(); await page.waitForTimeout(700);
  out.type150 = { patches: be.state.requests.filter((r) => r.startsWith("PATCH")).length, treeReloads: be.state.requests.filter((r) => r === "GET /rest/v1/plan_days").length, saved: Number(be.db.plan_meal_items[0].qty), shown: await q.inputValue() };
  // 3. празно поле
  await q.click(); await q.press("Control+a"); await q.press("Delete"); await q.blur(); await page.waitForTimeout(500);
  out.emptyQty = { savedInDb: Number(be.db.plan_meal_items[0].qty), dayTotal: (await page.getByText(/^Общо за деня:/).innerText()).slice(0, 30) };
  // 4. отрицателно количество
  await q.fill("-200"); await q.blur(); await page.waitForTimeout(500);
  out.negativeQty = { savedInDb: Number(be.db.plan_meal_items[0].qty), dayTotal: (await page.getByText(/^Общо за деня:/).innerText()).slice(0, 34) };
  await q.fill("100"); await q.blur(); await page.waitForTimeout(400);
  // 5. прекъсната връзка при запис
  be.state.failNext = (m, u) => m === "PATCH" && u.pathname.endsWith("/plan_meal_items");
  await q.fill("300"); await q.blur(); await page.waitForTimeout(900);
  out.networkFailure = { errorShown: (await page.getByText(/не успя|Грешка|грешка/).count()) > 0, shown: await q.inputValue(), dayTotal: (await page.getByText(/^Общо за деня:/).innerText()).slice(0, 30), savedInDb: Number(be.db.plan_meal_items[0].qty) };
  await ctx.close();
}
{ // 6. копиране върху непразен ден: пита ли?
  const { be, page, ctx, dialogs } = await session(); await planner(page); await addChicken(page);
  await page.getByRole("button", { name: /^Вторник/ }).click(); await page.getByRole("button", { name: "+ Добави продукт / рецепта" }).first().click(); await page.getByRole("button", { name: /^Пилешко филе/ }).click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Сряда/ }).click(); dialogs.length = 0; be.state.requests.length = 0;
  await page.locator("select", { hasText: "Копирай деня в…" }).selectOption({ label: "Вторник" }); await page.waitForTimeout(900);
  out.copyOverNonEmpty = { askedBeforeOverwrite: dialogs.some((d) => /ЗАМЕНИ|замен|съдържа/i.test(d)), dialogs, requests: be.state.requests.length };
  // 7. изтриване на хранене с продукт
  await page.getByRole("button", { name: /^Понеделник/ }).click(); dialogs.length = 0;
  await page.locator('button[title="Изтрий хранене"]').first().click(); await page.waitForTimeout(500);
  out.deleteMealWithItems = { asked: dialogs.length > 0, itemsLeft: be.db.plan_meal_items.length };
  await ctx.close();
}
{ // 8. цел при липсваща рождена дата + 9. редакция на клиент
  const { be, page, ctx } = await session(); await planner(page);
  out.targetWithoutBirthDate = { goalRow: (await page.locator("tr", { hasText: "Цел/ден" }).innerText()).replace(/\s+/g, " "), warnsAboutAssumedAge: (await page.getByText(/липсва/).count()) > 0 };
  await nav(page, "Моите клиенти");
  out.clientEdit = { hasEditButton: (await page.getByRole("button", { name: "Редактирай" }).count()) > 0 };
  await page.getByRole("button", { name: "+ Нов клиент" }).click();
  out.clientForm = { hasBirthDateField: (await page.getByText(/Рождена дата/).count()) > 0, hasDietField: (await page.getByText(/Диета/).count()) > 0 };
  await ctx.close();
}
{ // 10. рецепта с 0.5 порции (общо 330 kcal → 660 на порция)
  const { be, page, ctx } = await session((be, nutId) => { const food = be.db.foods[0]; const rid = be.uuid(); be.db.recipes.push({ id: rid, owner_id: nutId, name: "Половин порция", servings: 0.5, created_at: "2026-01-01" }); be.db.recipe_ingredients.push({ id: be.uuid(), recipe_id: rid, food_id: food.id, qty: 200, unit: "100g", snapshot: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, name: food.name_bg } }); });
  await nav(page, "База и рецепти"); await page.getByRole("button", { name: "Рецепти", exact: true }).click(); await page.getByText("Половин порция").waitFor();
  out.recipeHalfServing = { perServingShownKcal: Number(/За порция\s*(\d+)/.exec(await page.locator("body").innerText())?.[1]), expectedKcal: 660 };
  await ctx.close();
}
{ // 11. AI асистент: има ли дневни данни в контекста
  const { be, page, ctx } = await session(); await planner(page); await addChicken(page); await nav(page, "AI асистент");
  await page.locator("select").first().selectOption({ label: "Мария Иванова" }); await page.waitForTimeout(600);
  await page.getByPlaceholder(/Въпрос за режима/).fill("В кои дни протеинът е под целта?"); await page.getByRole("button", { name: "Изпрати" }).click(); await page.getByText("Примерен отговор.").waitFor();
  const c = be.state.aiCalls[0];
  out.aiContext = { hasPerDayTotals: /Понеделник/.test(c.body.system), sendsAuthToken: !!c.headers.authorization, tellsModelToEstimate: /Давай приблизителни калории/.test(c.body.system) };
  await ctx.close();
}
{ // 12. производителност на интерфейса: 500 клиента; режим с 280 продукта
  const { be, page, ctx } = await session((be, nutId, client) => {
    for (let i = 0; i < 499; i++) be.db.clients.push({ id: be.uuid(), nutritionist_id: nutId, first_name: "Клиент" + String(i).padStart(3, "0"), last_name: "Тестов", sex: "male", weight_kg: 80, height_cm: 180, birth_date: "1990-01-01", main_goal: "maintenance", archived: false, created_at: "2026-01-01" });
    const food = be.db.foods[0]; const pid = be.uuid(), vid = be.uuid();
    be.db.plans.push({ id: pid, client_id: client.id, nutritionist_id: nutId, title: "x", created_at: "2026-01-01" }); be.db.plan_versions.push({ id: vid, plan_id: pid, version: 1, status: "draft" });
    for (let w = 0; w < 7; w++) { const did = be.uuid(); be.db.plan_days.push({ id: did, version_id: vid, weekday: w }); for (let m = 0; m < 5; m++) { const mid = be.uuid(); be.db.plan_meals.push({ id: mid, day_id: did, name: "Хранене " + (m + 1), position: m }); for (let k = 0; k < 8; k++) be.db.plan_meal_items.push({ id: be.uuid(), meal_id: mid, food_id: food.id, qty: 100 + k, unit: "100g", snapshot: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, name: food.name_bg } }); } }
  });
  let t0 = Date.now(); await nav(page, "Моите клиенти"); await page.getByText("Клиент498").waitFor(); out.clients500 = { renderMs: Date.now() - t0, rowsInDom: await page.locator("tbody tr").count() };
  t0 = Date.now(); be.state.requests.length = 0; await planner(page); out.plan280items = { openMs: Date.now() - t0, requests: be.state.requests.length };
  const q = qtyInput(page); t0 = Date.now(); be.state.requests.length = 0; await q.fill("250"); await q.blur();
  await page.waitForFunction(() => /Общо за деня: \d+/.test(document.body.innerText)); await page.waitForTimeout(600);
  out.plan280items.qtyEditRequests = be.state.requests.length; out.plan280items.reloadsWholeTree = be.state.requests.includes("GET /rest/v1/plan_days");
  be.state.requests.length = 0; t0 = Date.now(); await page.locator("select", { hasText: "Копирай деня в…" }).selectOption({ label: "Неделя" }); await page.waitForTimeout(1500);
  out.plan280items.copyDayRequests = be.state.requests.length;
  await ctx.close();
}
await browser.close(); server.close();
console.log("=== " + LABEL + " ===\n" + JSON.stringify(out, null, 1));
