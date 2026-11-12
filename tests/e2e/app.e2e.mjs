// Браузърни (Playwright/Chromium) тестове на реалния build на приложението срещу СИМУЛИРАН
// бекенд (tests/e2e/fakeBackend.mjs). Проверяват поведението на интерфейса и сметките на екрана.
// НЕ са тест на живата Supabase база — RLS се тества отделно в tests/rls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createBackend } from "./fakeBackend.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist-e2e");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
let server, browser, BASE;

before(async () => {
  server = http.createServer((req, res) => {
    const p = join(DIST, req.url === "/" ? "index.html" : req.url.split("?")[0]);
    const file = existsSync(p) ? p : join(DIST, "index.html");
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const CHICKEN = { name_bg: "Пилешко филе", name_en: "Chicken breast", unit: "100g", kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, micros: { iron_mg: 1, vitB12_ug: 0.3 } };
const RICE = { name_bg: "Ориз", name_en: "Rice", unit: "100g", kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, micros: {} };
const PARTIAL = { name_bg: "Непълна храна", name_en: null, unit: "100g", kcal: 50, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, micros: {} };

async function setup({ viewport = { width: 1280, height: 900 }, seed } = {}) {
  const be = createBackend();
  const nutId = be.addUser("nut@test.local", "parola123", { full_name: "Тест Нутриционист" });
  const otherId = be.addUser("other@test.local", "parola123", { full_name: "Друг Нутриционист" });
  const adminId = be.addUser("admin@test.local", "parola123", { full_name: "Админ", role: "super_admin" });
  be.addUser("off@test.local", "parola123", { full_name: "Изключен", status: "disabled" });
  for (const f of [CHICKEN, RICE, PARTIAL]) be.db.foods.push({ id: be.uuid(), owner_id: null, archived: false, ...f });
  be.db.clients.push({ id: be.uuid(), nutritionist_id: otherId, first_name: "ЧуждКлиент", last_name: "Тайнов", archived: false, created_at: "2026-01-01" });
  const ids = { nutId, otherId, adminId };
  if (seed) seed(be, ids);
  const context = await browser.newContext({ viewport, locale: "bg-BG" });
  await be.install(context);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { page._dialogs = [...(page._dialogs || []), d.message()]; d.type() === "prompt" ? d.accept(page._promptAnswer ?? "") : page._dismissNext ? (page._dismissNext = false, d.dismiss()) : d.accept(); });
  return { be, context, page, errors, ids };
}
async function login(page, email = "nut@test.local", password = "parola123") {
  await page.goto(BASE);
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
}
const nav = (page, name) => page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const addClient = (be, ids, extra = {}) => { const c = { id: be.uuid(), nutritionist_id: ids.nutId, first_name: "Мария", last_name: "Иванова", sex: "female", birth_date: "1986-01-01", height_cm: 168, weight_kg: 65, main_goal: "reduction", activity_level: "moderate", allergies: "ядки", private_notes: "поверителна бележка XYZ", archived: false, created_at: "2026-02-01", ...extra }; be.db.clients.push(c); return c; };
async function openPlanner(page, label = "Мария Иванова") {
  await nav(page, "Седмичен дневник");
  await page.locator("select").first().selectOption({ label });
  await page.getByText("Общо за деня:").waitFor();
}
async function addFood(page, mealIndex, foodName) {
  await page.getByRole("button", { name: "+ Добави продукт / рецепта" }).nth(mealIndex).click();
  await page.getByPlaceholder("Търси…").fill(foodName.slice(0, 4));
  await page.getByRole("button", { name: new RegExp("^" + foodName) }).click();
  await page.getByLabel(`Количество за ${foodName}`).waitFor();
}
const dayTotal = (page) => page.getByText(/^Общо за деня:/).innerText();

test("вход: грешна парола дава ясна грешка; верна → табло; изход връща към вход", async () => {
  const { page, context, errors } = await setup();
  await login(page, "nut@test.local", "грешна");
  await page.getByText("Грешен имейл или парола.").waitFor();
  await login(page);
  await page.getByText("Здравей, Тест Нутриционист").waitFor();
  await page.getByRole("button", { name: "Изход" }).click();
  await page.getByRole("button", { name: "Вход" }).waitFor();
  assert.deepEqual(errors, []); await context.close();
});

test("роли: нутриционист няма „Админ панел“; админ има; деактивиран профил е спрян", async () => {
  let s = await setup(); await login(s.page);
  await s.page.getByText("Здравей").waitFor();
  assert.equal(await s.page.getByRole("button", { name: "Админ панел" }).count(), 0);
  await s.context.close();
  s = await setup(); await login(s.page, "admin@test.local");
  await s.page.getByRole("button", { name: "Админ панел" }).waitFor();
  await nav(s.page, "Админ панел");
  await s.page.getByText("nut@test.local").waitFor();
  await s.context.close();
  s = await setup(); await login(s.page, "off@test.local");
  await s.page.getByText("Профилът не е активен").waitFor();
  assert.equal(await s.page.getByRole("navigation").count(), 0);
  await s.context.close();
});

test("клиенти: валидиране, създаване, редакция, архивиране; чужд клиент не се вижда", async () => {
  const { page, be, context, errors } = await setup(); await login(page);
  await nav(page, "Моите клиенти");
  await page.getByText("Още няма клиенти").waitFor();
  assert.equal(await page.getByText("ЧуждКлиент").count(), 0, "клиент на друг нутриционист");
  await page.getByRole("button", { name: "+ Нов клиент" }).click();
  await page.getByRole("button", { name: "Запази" }).click();
  await page.getByText("Името е задължително.").waitFor();
  await page.getByLabel("Име *").fill("Иван"); await page.getByLabel("Фамилия").fill("Петров");
  await page.getByLabel("Ръст (см)").fill("500");
  await page.getByRole("button", { name: "Запази" }).click();
  await page.getByText("Ръстът трябва да е между 100 и 250 см.").waitFor();
  await page.getByLabel("Ръст (см)").fill("180"); await page.getByLabel("Тегло (кг)", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Запази" }).click();
  await page.getByText("липсва: рождена дата").waitFor();
  // редакция: добавяме рождена дата → възрастта се появява, предупреждението изчезва
  await page.getByRole("button", { name: "Редактирай" }).click();
  await page.getByLabel(/^Рождена дата/).fill("1990-05-20");
  await page.getByRole("button", { name: "Запази" }).click();
  await page.getByText(/М · 36 г\./).waitFor();
  assert.equal(await page.getByText("липсва:").count(), 0);
  const row = be.db.clients.find((c) => c.first_name === "Иван");
  assert.equal(row.birth_date, "1990-05-20"); assert.equal(row.nutritionist_id, be.db.profiles[0].id);
  // архивиране → изчезва от списъка, данните остават
  await page.getByRole("button", { name: "Архивирай" }).click();
  await page.getByText("Няма клиенти по тези критерии.").waitFor();
  assert.equal(be.db.clients.find((c) => c.first_name === "Иван").archived, true);
  assert.deepEqual(errors, []); await context.close();
});

test("планер: добавяне, грамажи, преизчисляване, невалиден вход, запазване след презареждане", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor();
  await openPlanner(page);
  assert.equal(be.db.plan_days.length, 7, "създадени са точно 7 дни");
  assert.equal(be.db.plan_meals.length, 28, "по 4 хранения на ден");
  // цел: жена 65 кг/168 см/40 г., умерена, −15% → 1764 kcal, 130 П, 165 В, 65 М (ръчно пресметнато в unit теста)
  const goalRow = page.locator("tr", { hasText: "Цел/ден" });
  assert.deepEqual(await goalRow.locator("td").allInnerTexts(), ["Цел/ден", "1764", "130", "165", "65"]);
  assert.equal(await page.getByText("В профила на клиента липсва").count(), 0);

  await addFood(page, 0, "Пилешко филе");
  assert.match(await dayTotal(page), /165 kcal · П 31 · В 0 · М 4/);
  // 150 g → 247.5 kcal → показва 248; П 46.5 → 47
  const qty = page.getByLabel("Количество за Пилешко филе");
  await qty.fill("150"); await qty.press("Enter");
  await page.getByText(/Общо за деня: 248 kcal · П 47/).waitFor();
  assert.equal(Number(be.db.plan_meal_items[0].qty), 150, "записано в базата");
  // + ориз 100 g, после 200 g → 247.5 + 260 = 507.5 → 508; П 46.5 + 5.4 = 51.9 → 52; В 56
  await addFood(page, 1, "Ориз");
  const q2 = page.getByLabel("Количество за Ориз"); await q2.fill("200"); await q2.blur();
  await page.getByText(/Общо за деня: 508 kcal · П 52 · В 56 · М 6/).waitFor();
  // таб на деня и средно/ден (507.5 / 7 = 72.5 → 73)
  await page.getByRole("button", { name: /Понеделник\s*508 kcal/ }).waitFor();
  assert.equal((await page.locator("tr", { hasText: "Средно/ден" }).locator("td").allInnerTexts())[1], "73");
  await page.getByText(/попълнени са само 1 от 7 дни \(средно за попълнените: 508 kcal\)/).waitFor();

  // невалидни стойности НЕ се записват
  for (const bad of ["-50", "", "abc"]) {
    await q2.fill(bad); await q2.blur();
    assert.equal(await q2.getAttribute("aria-invalid"), "true", `„${bad}“ е маркирано като невалидно`);
    assert.equal(Number(be.db.plan_meal_items.find((i) => i.snapshot.name === "Ориз").qty), 200, `„${bad}“ не е записано`);
  }
  await q2.press("Escape"); assert.equal(await q2.inputValue(), "200");
  await q2.fill("12,5"); await q2.blur(); // десетична запетая
  await page.getByText(/Общо за деня: 264 kcal/).waitFor(); // 247.5 + 16.25 = 263.75 → 264
  await q2.fill("200"); await q2.blur(); await page.getByText(/Общо за деня: 508 kcal/).waitFor();

  // бързи последователни промени → остава последната стойност
  for (const v of ["210", "220", "230", "240"]) { await q2.fill(v); await q2.blur(); }
  await page.getByText(/Общо за деня: 560 kcal/).waitFor(); // 247.5 + 312 = 559.5 → 560
  assert.equal(Number(be.db.plan_meal_items.find((i) => i.snapshot.name === "Ориз").qty), 240);
  await q2.fill("200"); await q2.blur(); await page.getByText(/Общо за деня: 508 kcal/).waitFor();

  // презареждане на страницата: клиентът и режимът се възстановяват, без дублиране на дни
  await page.reload(); await nav(page, "Седмичен дневник");
  await page.getByText(/Общо за деня: 508 kcal · П 52 · В 56 · М 6/).waitFor();
  assert.equal(be.db.plan_days.length, 7); assert.equal(be.db.plans.length, 1);

  // изтриване на продукт
  await page.getByRole("button", { name: "Премахни Ориз" }).click();
  await page.getByText(/Общо за деня: 248 kcal/).waitFor();
  assert.deepEqual(errors, []); await context.close();
});

test("планер: копиране на ден (с потвърждение при презаписване) и изтриване на хранене", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await addFood(page, 0, "Пилешко филе"); await addFood(page, 2, "Ориз");
  const copy = page.locator("select", { hasText: "Копирай деня в…" });
  await copy.selectOption({ label: "Вторник" });
  await page.getByText("Денят е копиран в Вторник.").waitFor();
  await page.getByRole("button", { name: /Вторник\s*295 kcal/ }).click(); // 165 + 130
  assert.match(await dayTotal(page), /295 kcal/);
  assert.equal((page._dialogs || []).length, 0, "празен целеви ден → без въпрос");
  // промяна във вторник НЕ засяга понеделник (независими копия)
  const q = page.getByLabel("Количество за Ориз"); await q.fill("300"); await q.blur();
  await page.getByText(/Общо за деня: 555 kcal/).waitFor();
  await page.getByRole("button", { name: /Понеделник\s*295 kcal/ }).click();
  // второ копиране върху непразен ден → пита; отказ не променя нищо
  page._dismissNext = true;
  await page.locator("select", { hasText: "Копирай деня в…" }).selectOption({ label: "Вторник" });
  await page.waitForFunction(() => true); await page.waitForTimeout(300);
  assert.match(page._dialogs.at(-1), /Вторник вече съдържа 2 продукта/);
  await page.getByRole("button", { name: /Вторник\s*555 kcal/ }).waitFor();
  // изтриване на хранене с продукти → пита; потвърждаваме
  await page.getByRole("button", { name: "Изтрий хранене Закуска" }).click();
  await page.getByText(/Общо за деня: 130 kcal/).waitFor();
  assert.match(page._dialogs.at(-1), /заедно с 1 продукта/);
  assert.deepEqual(errors, []); await context.close();
});

test("планер: прекъсната връзка при запис → видима грешка, стойността се връща, без тиха загуба", async () => {
  const { page, be, context } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await addFood(page, 0, "Пилешко филе");
  be.state.failNext = (method, url) => method === "PATCH" && url.pathname.endsWith("/plan_meal_items");
  const qty = page.getByLabel("Количество за Пилешко филе");
  await qty.fill("300"); await qty.blur();
  await page.getByRole("alert").getByText(/Записът на количеството не успя/).waitFor();
  await page.getByText(/Общо за деня: 165 kcal/).waitFor();
  assert.equal(await qty.inputValue(), "100", "показва реално записаната стойност");
  assert.equal(Number(be.db.plan_meal_items[0].qty), 100);
  // следващ опит (връзката е възстановена) минава
  await qty.fill("300"); await qty.blur();
  await page.getByText(/Общо за деня: 495 kcal/).waitFor();
  await context.close();
});

test("планер: версии — дублиране, независимост, финализиране заключва редакцията", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await addFood(page, 0, "Пилешко филе");
  await page.locator("select", { hasText: "+ Нова версия…" }).selectOption({ label: "Дублирай текущата" });
  await page.getByText("v2 · чернова").waitFor({ state: "attached" });
  await page.getByText(/Общо за деня: 165 kcal/).waitFor();
  assert.equal(be.db.plan_versions.length, 2); assert.equal(be.db.plan_days.length, 14, "7 дни на версия, без дубликати");
  const qty = page.getByLabel("Количество за Пилешко филе"); await qty.fill("200"); await qty.blur();
  await page.getByText(/Общо за деня: 330 kcal/).waitFor();
  // v1 е непроменена
  await page.locator("select", { hasText: "v2 · чернова" }).selectOption({ label: "v1 · чернова" });
  await page.getByText(/Общо за деня: 165 kcal/).waitFor();
  // финализиране → заключено
  await page.getByRole("button", { name: "✓ Финализирай" }).click();
  await page.getByText(/е финализирана и е заключена/).waitFor();
  assert.equal(await page.getByLabel("Количество за Пилешко филе").isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "+ Добави продукт / рецепта" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "✨ AI чернова" }).count(), 0);
  assert.equal(be.db.plan_versions.find((v) => v.version === 1).status, "final");
  assert.deepEqual(errors, []); await context.close();
});

test("планер: липсващи данни се обявяват (профил без възраст; храна без макроси)", async () => {
  const { page, context } = await setup({ seed: (be, ids) => addClient(be, ids, { birth_date: null, height_cm: null }) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await page.getByText(/В профила на клиента липсва: възраст, ръст/).waitFor();
  await addFood(page, 0, "Непълна храна");
  await page.getByText("· непълни данни").waitFor();
  await page.getByText(/1 продукта в режима нямат пълни данни/).waitFor();
  await context.close();
});

test("микронутриенти: покритие по нутриент, липсата не е нула", async () => {
  const { page, context } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await addFood(page, 0, "Пилешко филе"); await addFood(page, 1, "Ориз");
  await page.getByRole("button", { name: "Микронутриенти" }).click();
  await page.getByText(/1 от 2 продукта \(50%\) имат микронутриенти/).waitFor();
  const iron = page.locator("div", { hasText: /^Желязо · данни за 1\/2/ }).first();
  await iron.waitFor();
  // желязо: 1 mg/100 g × 100 g = 1 mg за седмицата → 0.1/ден (1/7 = 0.142…→ 0.1) от 16 mg (жена)
  assert.match(await page.getByText(/≥ 0\.1 \/ 16 мг/).innerText(), /≥ 1%/);
  assert.equal(await page.getByText("няма данни").count() > 0, true, "нутриенти без никакви данни са означени, не 0");
  await context.close();
});

test("AI чернова: само храни от базата; измислените се отхвърлят; стойностите идват от базата", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  be.state.aiReply = () => "```json\n" + JSON.stringify({ days: [{ weekday: 0, meals: [{ name: "Закуска", items: [{ food: "Ориз", grams: 150 }, { food: "Измислена храна", grams: 80 }, { food: "пилешко филе", grams: 120 }] }] }] }) + "\n```";
  await page.getByRole("button", { name: "✨ AI чернова" }).click();
  await page.locator("select", { hasText: "Цяла седмица" }).selectOption({ label: "Само Понеделник" });
  await page.getByRole("button", { name: "Генерирай" }).click();
  await page.getByText(/Добавени 2 продукта в 1 ден/).waitFor();
  await page.getByText(/1 предложени храни не бяха намерени.*Измислена храна/).waitFor();
  await page.getByRole("button", { name: "Готово" }).click();
  // 150 g ориз = 195; 120 g пилешко = 198 → 393 (стойности от базата, не от модела)
  await page.getByText(/Общо за деня: 393 kcal/).waitFor();
  const call = be.state.aiCalls[0];
  assert.match(call.headers.authorization || "", /^Bearer .+\..+\./, "заявката носи сесиен токен");
  const sent = JSON.stringify(call.body);
  assert.equal(sent.includes("Иванова") || sent.includes("Мария"), false, "името на клиента не се изпраща");
  assert.equal(sent.includes("поверителна бележка"), false, "поверителните бележки не се изпращат");
  assert.equal(sent.includes("ядки"), true, "алергиите се подават като ограничение");
  // невалиден отговор от AI → ясна грешка, нищо не се трие
  be.state.aiReply = "Съжалявам, не мога.";
  await page.getByRole("button", { name: "✨ AI чернова" }).click();
  await page.getByRole("button", { name: "Генерирай" }).click();
  await page.getByText(/AI не върна валиден JSON/).waitFor();
  await page.getByRole("button", { name: "Отказ" }).click();
  await page.getByText(/Общо за деня: 393 kcal/).waitFor();
  assert.deepEqual(errors, []); await context.close();
});

test("AI асистент: минимизиран контекст с дневни суми от приложението; грешките не се записват", async () => {
  const { page, be, context } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await addFood(page, 0, "Пилешко филе");
  await nav(page, "AI асистент");
  await page.locator("select").first().selectOption({ label: "Мария Иванова" });
  await page.getByText(/Данните са минимизирани/).waitFor();
  await page.getByPlaceholder(/Въпрос за режима/).fill("В кои дни протеинът е под целта?");
  await page.getByRole("button", { name: "Изпрати" }).click();
  await page.getByText("Примерен отговор.").waitFor();
  const { body, headers } = be.state.aiCalls[0];
  assert.match(headers.authorization || "", /^Bearer /);
  assert.equal(/Мария|Иванова|поверителна бележка/.test(JSON.stringify(body)), false, "без име и поверителни бележки");
  assert.match(body.system, /Понеделник: 165 kcal, П 31/, "реалните дневни суми са в контекста");
  assert.match(body.system, /Вторник: няма въведени продукти/);
  assert.match(body.system, /АЛЕРГИИ\/НЕПОНОСИМОСТИ: ядки/);
  await page.waitForFunction(() => true);
  assert.equal(be.db.ai_conversations.length, 1);
  // грешка от услугата → показва се, но не влиза в записания разговор
  be.state.aiStatus = 500;
  await page.getByPlaceholder(/Въпрос за режима/).fill("втори въпрос");
  await page.getByRole("button", { name: "Изпрати" }).click();
  await page.getByText(/⚠️ upstream error/).waitFor();
  assert.equal(be.db.ai_conversations[0].messages.some((m) => /upstream error/.test(m.content)), false);
  await context.close();
});

test("калкулатор: проверени стойности, празно поле → „—“ и предупреждение, Katch резерв", async () => {
  const { page, context, errors } = await setup(); await login(page);
  await page.getByText("Здравей").waitFor(); await nav(page, "Хранителен калкулатор");
  const stat = async (label) => (await page.locator("div", { hasText: new RegExp("^" + label) }).last().locator("xpath=..").innerText()).replace(/\s+/g, " ");
  assert.match(await stat("BMR"), /1780 kcal/);          // 10·80 + 6.25·180 − 5·30 + 5
  assert.match(await stat("TDEE"), /×1\.55\) 2759 kcal/); // 1780 · 1.55
  assert.match(await stat("Въглехидрати"), /350 г · 51%/); // (2759 − 640 − 720)/4 = 349.75
  await page.locator("select", { hasText: "Mifflin–St Jeor" }).selectOption({ label: "Katch–McArdle" });
  await page.getByText(/Katch–McArdle изисква валиден % телесни мазнини/).waitFor();
  await page.getByLabel(/% телесни мазнини/).fill("20");
  assert.match(await stat("BMR"), /Katch–McArdle\) 1752 kcal/); // 370 + 21.6·64 = 1752.4
  await page.getByLabel("Тегло (кг)").fill("");
  await page.getByText("Липсва тегло.").waitFor();
  assert.match(await stat("Дневна цел"), /— kcal/, "без подвеждаща 0");
  assert.deepEqual(errors, []); await context.close();
});

test("XSS: HTML в име на клиент се показва като текст — в списъка и в PDF експорта", async () => {
  const evil = '<img src=x onerror="window.__xss=1">';
  const { page, context } = await setup({ seed: (be, ids) => addClient(be, ids, { first_name: evil, last_name: "X" }) }); await login(page);
  await page.getByText("Здравей").waitFor(); await nav(page, "Моите клиенти");
  await page.getByText(evil).waitFor();
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await openPlanner(page, `${evil} X`);
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "PDF", exact: true }).click()]);
  await popup.waitForLoadState();
  assert.equal(await popup.evaluate(() => document.querySelectorAll("img, script").length), 0);
  assert.equal(await popup.evaluate(() => window.__xss), undefined);
  assert.equal(await popup.getByText(evil).count() > 0, true);
  await context.close();
});

test("мобилен изглед (375 px): без хоризонтално преливане на основните екрани", async () => {
  const { page, context, errors } = await setup({ viewport: { width: 375, height: 720 }, seed: (be, ids) => addClient(be, ids) });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.goto(BASE); assert.ok((await overflow()) <= 1, "вход");
  await login(page); await page.getByText("Здравей").waitFor(); assert.ok((await overflow()) <= 1, "табло");
  const go = async (name) => { await page.getByRole("button", { name: "Меню" }).click(); await nav(page, name); };
  for (const name of ["Моите клиенти", "Хранителен калкулатор", "База и рецепти", "AI асистент", "Настройки"]) {
    await go(name); await page.waitForTimeout(150);
    assert.ok((await overflow()) <= 1, `${name}: преливане ${await overflow()} px`);
  }
  await go("Седмичен дневник");
  await page.locator("select").first().selectOption({ label: "Мария Иванова" });
  await page.getByText("Общо за деня:").waitFor();
  await addFood(page, 0, "Пилешко филе");
  assert.ok((await overflow()) <= 1, `планер: преливане ${await overflow()} px`);
  assert.deepEqual(errors, []); await context.close();
});
