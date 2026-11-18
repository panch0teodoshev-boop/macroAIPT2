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
import { TERMS_VERSION } from "../../src/legal/terms.js";

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

async function setup({ viewport = { width: 1280, height: 900 }, seed, terms = true } = {}) {
  const be = createBackend();
  const nutId = be.addUser("nut@test.local", "parola123", { full_name: "Тест Нутриционист" });
  const otherId = be.addUser("other@test.local", "parola123", { full_name: "Друг Нутриционист" });
  const adminId = be.addUser("admin@test.local", "parola123", { full_name: "Админ", role: "super_admin" });
  be.addUser("off@test.local", "parola123", { full_name: "Изключен", status: "disabled" });
  for (const f of [CHICKEN, RICE, PARTIAL]) be.db.foods.push({ id: be.uuid(), owner_id: null, archived: false, ...f });
  be.db.clients.push({ id: be.uuid(), nutritionist_id: otherId, first_name: "ЧуждКлиент", last_name: "Тайнов", archived: false, created_at: "2026-01-01" });
  const ids = { nutId, otherId, adminId };
  // по подразбиране всички са приели текущите Общи условия (отделен тест проверява екрана за приемане)
  if (terms) for (const p of be.db.profiles) be.db.terms_acceptances.push({ id: be.db.terms_acceptances.length + 1, user_id: p.id, version: TERMS_VERSION, accepted_at: "2026-11-18T10:00:00Z" });
  if (seed) seed(be, ids);
  const context = await browser.newContext({ viewport, locale: "bg-BG" });
  await be.install(context);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { errors.push("системен диалог: " + d.message()); d.dismiss(); }); // приложението вече не ползва alert/confirm/prompt
  return { be, context, page, errors, ids };
}
async function login(page, email = "nut@test.local", password = "parola123") {
  await page.goto(BASE);
  await page.getByLabel("Имейл").fill(email);
  await page.getByLabel("Парола").fill(password);
  await page.getByRole("button", { name: "Вход" }).click();
}
// собствен диалог на приложението: записва текста, по желание попълва поле и потвърждава/отказва
async function answer(page, { accept = true, text } = {}) {
  const dlg = page.locator('[role="alertdialog"], [role="dialog"][aria-modal="true"]').last();
  await dlg.waitFor();
  page._dialogs = [...(page._dialogs || []), await dlg.innerText()];
  if (text != null) await dlg.getByRole("textbox").fill(text);
  await dlg.getByRole("button").nth(accept ? -1 : 0).click();
  await dlg.waitFor({ state: "detached" });
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

test("админ: покана по имейл създава активен профил и запис в журнала; повторен имейл → ясна грешка; линкът води към „Задай парола“", async () => {
  const { page, be, context, errors } = await setup(); await login(page, "admin@test.local");
  await nav(page, "Админ панел");
  await page.getByRole("button", { name: "+ Нов нутриционист" }).click();
  await page.getByLabel("Име", { exact: true }).fill("Нова Нутриционистка");
  await page.getByLabel("Имейл *").fill("nova@test.bg");
  await page.getByLabel("Лимит клиенти (празно = без лимит)").fill("20");
  assert.equal(await page.getByLabel("User UID (от Supabase Auth) *").count(), 0, "при покана няма поле за UID");
  await page.getByRole("button", { name: "Изпрати покана" }).click();
  await page.getByText(/Поканата е изпратена на nova@test.bg/).waitFor();
  const inv = be.state.invites[0];
  const prof = be.db.profiles.find((p) => p.email === "nova@test.bg");
  assert.equal(prof.id, inv.id); assert.equal(prof.status, "active"); assert.equal(prof.role, "nutritionist"); assert.equal(prof.client_limit, 20);
  assert.ok(be.db.admin_audit.some((a) => a.action === "invite_nutritionist" && a.target === "nova@test.bg"));
  // повторно → грешка, без втори профил
  await page.getByRole("button", { name: "+ Нов нутриционист" }).click();
  await page.getByLabel("Имейл *").fill("nova@test.bg");
  await page.getByRole("button", { name: "Изпрати покана" }).click();
  await page.getByText(/Този имейл вече има акаунт/).waitFor();
  assert.equal(be.db.profiles.filter((p) => p.email === "nova@test.bg").length, 1);
  await page.getByRole("button", { name: "Отказ" }).click();
  // линкът от имейла (#...type=invite) → екран за задаване на парола
  const s = be.session("nut@test.local");
  const p2 = await context.newPage();
  await p2.goto(`${BASE}#access_token=${s.access_token}&expires_in=3600&expires_at=${s.expires_at}&refresh_token=${s.refresh_token}&token_type=bearer&type=invite`);
  await p2.getByText("Добре дошъл! Задай парола за акаунта си").waitFor();
  await p2.getByRole("button", { name: "Задай паролата" }).waitFor();
  assert.deepEqual(errors, []); await context.close();
});

test("Общи условия: публична страница; задължително приемане при първо влизане; нова версия се иска отново; отказ → изход", async () => {
  // публична страница без вход
  let s = await setup({ terms: false });
  await s.page.goto(BASE + "terms");
  await s.page.getByRole("heading", { name: "Общи условия за ползване на ProNutrition" }).waitFor();
  await s.page.getByText("Панайот Георгиев Теодошев, физическо лице").waitFor();
  await s.page.getByRole("heading", { name: "5. Правила за ползване на AI асистента" }).waitFor();
  // линк от екрана за вход
  await s.page.goto(BASE);
  assert.equal(await s.page.getByRole("link", { name: "Общи условия за ползване" }).getAttribute("href"), "/terms");
  // първо влизане → екран за приемане; без отметка не може
  await login(s.page);
  await s.page.getByText("Преди да продължиш").waitFor();
  if (process.env.SHOT_DIR) { await s.page.setViewportSize({ width: 390, height: 800 }); await s.page.screenshot({ path: process.env.SHOT_DIR + "/terms-accept-mobile.png" }); await s.page.setViewportSize({ width: 1280, height: 900 }); }
  const go = s.page.getByRole("button", { name: "Приемам и продължавам" });
  assert.equal(await go.isDisabled(), true);
  assert.equal(await s.page.getByRole("navigation").count(), 0, "без приемане няма достъп до приложението");
  await s.page.getByLabel(/Прочетох и приемам Общите условия/).check();
  await go.click();
  await s.page.getByText("Здравей, Тест Нутриционист").waitFor();
  const acc = s.be.db.terms_acceptances.filter((a) => a.user_id === s.ids.nutId);
  assert.equal(acc.length, 1); assert.equal(acc[0].version, TERMS_VERSION);
  // повторно влизане → не пита отново
  await s.page.reload(); await s.page.getByText("Здравей, Тест Нутриционист").waitFor();
  // админ панел показва кой е приел
  await s.context.close();
  s = await setup({ terms: false, seed: (be, ids) => {
    be.db.terms_acceptances.push({ id: 1, user_id: ids.adminId, version: TERMS_VERSION, accepted_at: "2026-11-18T10:00:00Z" });
    be.db.terms_acceptances.push({ id: 2, user_id: ids.otherId, version: "стара-версия", accepted_at: "2026-01-01T10:00:00Z" });
  } });
  await login(s.page, "admin@test.local"); await nav(s.page, "Админ панел");
  const row = (email) => s.page.locator("tr", { hasText: email });
  await row("admin@test.local").getByText(/✓ 18\.11\.2026/).waitFor();
  assert.match(await row("nut@test.local").innerText(), /—/);
  await s.context.close();
  // приета стара версия → „Общите условия са променени“; „Изход“ връща към входа
  s = await setup({ terms: false, seed: (be, ids) => be.db.terms_acceptances.push({ id: 1, user_id: ids.otherId, version: "стара-версия", accepted_at: "2026-01-01T10:00:00Z" }) });
  await login(s.page, "other@test.local");
  await s.page.getByText("Общите условия са променени").waitFor();
  await s.page.getByRole("button", { name: "Изход" }).click();
  await s.page.getByRole("button", { name: "Вход" }).waitFor();
  assert.deepEqual(s.errors, []); await s.context.close();
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
  await answer(page);
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

test("собствени диалози: ново хранене (Enter), отказ с Escape, празно име не се приема, преименуване, телефон", async () => {
  const { page, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  // Escape → отказ, нищо не се добавя
  await page.getByRole("button", { name: "+ Хранене" }).click();
  const dlg = page.getByRole("dialog", { name: "Ново хранене" });
  await dlg.waitFor();
  const box = dlg.getByRole("textbox", { name: "Име на храненето" });
  assert.equal(await box.inputValue(), "Ново хранене");
  assert.equal(await box.evaluate((el) => el === document.activeElement), true, "полето е на фокус");
  await page.keyboard.press("Escape"); await dlg.waitFor({ state: "detached" });
  assert.equal(await page.getByRole("button", { name: "Преименувай Ново хранене" }).count(), 0);
  // празно име → бутонът е неактивен
  await page.getByRole("button", { name: "+ Хранене" }).click();
  await box.fill("   ");
  assert.equal(await dlg.getByRole("button", { name: "Добави" }).isDisabled(), true);
  // Enter записва
  await box.fill("Следобедна закуска"); await box.press("Enter");
  await dlg.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Преименувай Следобедна закуска" }).click();
  await answer(page, { text: "Подкрепителна" });
  await page.getByRole("button", { name: "Преименувай Подкрепителна" }).waitFor();
  // телефон: диалогът се побира в екрана
  await page.setViewportSize({ width: 375, height: 740 });
  await page.getByRole("button", { name: "+ Хранене" }).click();
  const r = await page.getByRole("dialog", { name: "Ново хранене" }).locator("div").first().boundingBox();
  const bb = await page.getByRole("dialog", { name: "Ново хранене" }).boundingBox();
  assert.ok(bb.x >= 0 && bb.x + bb.width <= 375, `диалогът е в екрана: ${JSON.stringify(bb)} ${JSON.stringify(r)}`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/dialog-mobile.png" });
  await page.getByRole("button", { name: "Отказ" }).click();
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
  await page.locator("select", { hasText: "Копирай деня в…" }).selectOption({ label: "Вторник" });
  await answer(page, { accept: false });
  assert.match(page._dialogs.at(-1), /Вторник вече съдържа 2 продукта/);
  await page.getByRole("button", { name: /Вторник\s*555 kcal/ }).waitFor();
  // изтриване на хранене с продукти → пита; потвърждаваме
  await page.getByRole("button", { name: "Изтрий хранене Закуска" }).click();
  await answer(page);
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

test("AI чернова с храни извън базата: валидирани стойности, маркировка, отхвърляне на невъзможни, добавяне в базата", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  be.state.aiReply = () => JSON.stringify({ days: [{ weekday: 0, meals: [
    { name: "Обяд", items: [
      { food: "Ориз", grams: 150, new: true, per100g: { kcal: 999, protein_g: 0, carbs_g: 0, fat_g: 0 } },  // има я в базата → стойности от базата
      { food: "Киноа, сварена", grams: 150, new: true, per100g: { kcal: 120, protein_g: 4.4, carbs_g: 21.3, fat_g: 1.9, fiber_g: 2.8 } },
      { food: "Вълшебна храна", grams: 100, new: true, per100g: { kcal: 20, protein_g: 30, carbs_g: 30, fat_g: 10 } }, // несъгласувани
      { food: "Без стойности", grams: 100, new: true } ] },
    { name: "Вечеря", items: [{ food: "киноа, сварена", grams: 100, new: true }] }] }] });
  await page.getByRole("button", { name: "✨ AI чернова" }).click();
  await page.locator("select", { hasText: "Цяла седмица" }).selectOption({ label: "Само Понеделник" });
  await page.getByLabel(/Позволи храни извън базата/).check();
  await page.getByRole("button", { name: "Генерирай" }).click();
  await page.getByText(/Добавени 3 продукта в 1 ден/).waitFor();
  await page.getByText(/2 от продуктите са с храни извън базата \(1 вида\)/).waitFor();
  await page.getByText("Киноа, сварена — 120 kcal · П 4.4 · В 21.3 · М 1.9 на 100 г").waitFor();
  await page.getByText(/1 храни извън базата са отхвърлени.*Вълшебна храна \(калориите \(20\) не съвпадат/).waitFor();
  await page.getByText(/1 предложени храни не бяха намерени.*Без стойности/).waitFor();
  const sent = JSON.stringify(be.state.aiCalls[0].body);
  assert.match(sent, /Можеш да ползваш и храна, която я НЯМА в списъка/);
  await page.getByRole("button", { name: "Добави ги в моята база" }).click();
  await page.getByText(/Добавени са в „База и рецепти"/).waitFor();
  const added = be.db.foods.find((f) => f.name_bg === "Киноа, сварена");
  assert.equal(added.kcal, 120); assert.equal(added.source, "AI (непроверено)"); assert.ok(added.owner_id);
  await page.getByRole("button", { name: "Готово" }).click();
  // ориз 150 g = 195 (от базата, не 999); киноа 150 g = 180 + 100 g = 120 → 495
  await page.getByText(/Общо за деня: 495 kcal/).waitFor();
  assert.equal(await page.getByText("AI стойности").count(), 2);
  // добавената храна се вижда веднага в търсенето (без презареждане на страницата)
  await page.getByRole("button", { name: "+ Добави продукт / рецепта" }).first().click();
  await page.getByPlaceholder("Търси…").fill("Кино");
  await page.getByRole("button", { name: /^Киноа, сварена/ }).waitFor();
  await page.getByRole("button", { name: "Затвори" }).click();
  // без отметката: само база — киноата вече е в базата → добавя се със стойностите от базата, без маркировка
  be.state.aiReply = () => JSON.stringify({ days: [{ weekday: 1, meals: [{ name: "Обяд", items: [{ food: "Киноа, сварена", grams: 100 }, { food: "Авокадо", grams: 100, new: true, per100g: { kcal: 160, protein_g: 2, carbs_g: 8.5, fat_g: 14.7 } }] }] }] });
  await page.getByRole("button", { name: "✨ AI чернова" }).click();
  await page.locator("select", { hasText: "Цяла седмица" }).selectOption({ label: "Само Понеделник" });
  await page.getByLabel("Замести съществуващото съдържание в избраните дни").uncheck();
  await page.getByRole("button", { name: "Генерирай" }).click();
  await page.getByText(/Добавени 1 продукта в 1 ден/).waitFor();
  await page.getByText(/1 предложени храни не бяха намерени.*Авокадо/).waitFor();
  assert.match(JSON.stringify(be.state.aiCalls[1].body), /Използвай САМО храни от предоставения списък/);
  assert.match(JSON.stringify(be.state.aiCalls[1].body), /Киноа, сварена: 120k/, "новата храна е в списъка към AI");
  await page.getByRole("button", { name: "Готово" }).click();
  await page.getByText(/Общо за деня: 615 kcal/).waitFor();                        // 495 + 120 (от базата)
  assert.equal(await page.getByText("AI стойности").count(), 2, "новият ред е от базата, без маркировка");
  assert.deepEqual(errors, []); await context.close();
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
  assert.match(body.system, /ХРАНИТЕЛНА БАЗА НА ПРИЛОЖЕНИЕТО[\s\S]*Пилешко филе: 165 kcal, П 31, В 0, М 3\.6/, "AI смята по базата на приложението");
  assert.equal(body.system.includes("Непълна храна"), false, "храни с липсващи макроси не се подават");
  assert.match(body.system, /СЪСТАВИ го/);
  await page.waitForFunction(() => true);
  assert.equal(be.db.ai_conversations.length, 1);
  // грешка от услугата → показва се, но не влиза в записания разговор
  be.state.aiStatus = 500;
  await page.getByPlaceholder(/Въпрос за режима/).fill("втори въпрос");
  await page.getByRole("button", { name: "Изпрати" }).click();
  await page.getByText(/⚠️ upstream error/).waitFor();
  assert.equal(be.db.ai_conversations[0].messages.some((m) => /upstream error/.test(m.content)), false);
  // празен отговор от AI → ясна грешка, не се записва като отговор
  be.state.aiStatus = 200; be.state.aiReply = "";
  await page.getByPlaceholder(/Въпрос за режима/).fill("трети въпрос");
  await page.getByRole("button", { name: "Изпрати" }).click();
  await page.getByText("⚠️ AI не върна отговор. Опитай отново.").waitFor();
  assert.equal(be.db.ai_conversations[0].messages.some((m) => m.role === "assistant" && !m.content), false);
  // форматиране: заглавия, удебелен текст, линия, списък и таблица — без сурови „#“ и „**“; HTML остава текст
  be.state.aiStatus = 200;
  be.state.aiReply = "# 6 идеи за закуски\n\nЕто варианти.\n\n---\n\n## 1. Бъркани яйца\n**2 яйца + чушка**\n~300 ккал | ~18г протеин\n\n- първо\n- второ\n\n| Храна | kcal |\n|---|---|\n| Ориз | 130 |\n\n<b>не е удебелено</b>";
  await page.getByPlaceholder(/Въпрос за режима/).fill("закуски");
  await page.getByRole("button", { name: "Изпрати" }).click();
  await page.getByRole("heading", { name: "6 идеи за закуски" }).waitFor();
  await page.getByRole("heading", { name: "1. Бъркани яйца" }).waitFor();
  await page.locator("strong", { hasText: "2 яйца + чушка" }).waitFor();
  await page.getByRole("listitem").filter({ hasText: "второ" }).waitFor();
  await page.getByRole("cell", { name: "130" }).waitFor();
  await page.getByText("<b>не е удебелено</b>").waitFor();
  const raw = await page.getByRole("main").innerText();
  assert.equal(/\*\*|^#/m.test(raw.split("закуски").slice(1).join("")), false, "без сурови знаци за форматиране");
  assert.equal(be.db.ai_conversations[0].messages.at(-1).content.startsWith("# 6 идеи"), true, "записва се оригиналният текст");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/ai-markdown.png" });
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

test("цел от калкулатора: запис към режима, планерът я ползва, дублиране я пренася, финал не се пипа", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await nav(page, "Моите клиенти");
  await page.getByRole("main").getByRole("button", { name: "Калкулатор", exact: true }).click();
  await page.getByText(/Заредени са данните на клиент/).waitFor();
  // Мария: жена, 40 г., 168 см, 65 кг, умерена. Mifflin: 10·65 + 6.25·168 − 5·40 − 161 = 1339; TDEE 1339·1.55 = 2075.45
  await page.getByLabel("Протеин — стойност").fill("2.2");      // 2.2·65 = 143 g; мазнини 1·65 = 65 g
  await page.getByRole("button", { name: "Запази като цел на режима" }).click();
  await page.getByText("Целта е записана към режим v1: 2075 kcal · П 143 г · В 230 г · М 65 г.").waitFor(); // (2075.45 − 572 − 585)/4 = 229.6
  assert.equal(be.db.plans.length, 1); assert.equal(be.db.plan_versions.length, 1);
  const tg = be.db.plan_versions[0].targets;
  assert.equal(tg.kcal, 2075.45); assert.equal(tg.protein_g, 143); assert.equal(tg.fat_g, 65); assert.equal(tg.source, "calculator");
  assert.equal(String(tg.inputs.proteinValue), "2.2");
  // планерът сравнява с записаната цел, не с формулата (2 g/kg, −15%)
  await openPlanner(page);
  const goalRow = async () => (await page.locator("tr", { hasText: "Цел/ден" }).innerText()).replace(/\s+/g, " ");
  assert.match(await goalRow(), /Цел\/ден 2075 143 230 65/);
  await page.getByText(/Целта е зададена в калкулатора/).waitFor();
  // дублиране пренася целта
  await page.locator("select", { hasText: "+ Нова версия…" }).selectOption({ label: "Дублирай текущата" });
  await page.getByText("v2 · чернова").waitFor({ state: "attached" });
  assert.match(await goalRow(), /Цел\/ден 2075 143 230 65/);
  assert.equal(be.db.plan_versions.find((v) => v.version === 2).targets.kcal, 2075.45);
  // финализирана работна версия: калкулаторът не я променя
  await page.getByRole("button", { name: "✓ Финализирай" }).click();
  await page.getByText(/е финализирана и е заключена/).waitFor();
  await nav(page, "Моите клиенти"); await page.getByRole("main").getByRole("button", { name: "Калкулатор", exact: true }).click();
  await page.getByText(/Настройките са от записаната цел на режим v2/).waitFor();
  assert.equal(await page.getByLabel("Протеин — стойност").inputValue(), "2.2", "настройките се зареждат обратно");
  await page.getByLabel("Протеин — стойност").fill("1.8");
  await page.getByRole("button", { name: "Запази като цел на режима" }).click();
  await page.getByText(/Версия 2 на режима е финализирана и заключена/).waitFor();
  assert.equal(be.db.plan_versions.find((v) => v.version === 2).targets.protein_g, 143, "финалната цел е непроменена");
  assert.deepEqual(errors, []); await context.close();
});

test("мащабиране към цел: преглед, нова чернова с закръглени количества, оригиналът непроменен", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  assert.equal(await page.getByRole("button", { name: "Мащабирай към цел" }).count(), 0, "празен режим → няма бутон");
  await addFood(page, 0, "Пилешко филе");                                     // пн: 165 kcal
  await page.getByRole("button", { name: /^Вторник/ }).click();
  await addFood(page, 0, "Пилешко филе"); await addFood(page, 1, "Ориз");     // вт: 165 + 130 = 295
  await page.getByText(/Общо за деня: 295 kcal/).waitFor();
  await page.getByRole("button", { name: "Мащабирай към цел" }).click();
  const dlg = page.locator("h3", { hasText: "Мащабиране към калорийна цел" }).locator("xpath=..");
  await dlg.getByLabel("Цел (kcal/ден)").fill("990");
  const row = async (txt) => (await dlg.locator("tr", { hasText: txt }).first().innerText()).replace(/\s+/g, " ");
  // пн ×6 → 600 г = 990; вт ×3.356 → 335.6 → 335 г всяко = 552.75 + 435.5 = 988.25
  assert.match(await row("Понеделник"), /Понеделник 165 990 \+500%/);
  assert.match(await row("Вторник"), /Вторник 295 988 \+236%/);
  assert.match(await row("Сряда"), /празен — не се променя/);
  assert.match(await row("След мащабиране"), /След мащабиране 989/);                // (990 + 988.25) / 2 = 989.1
  await dlg.getByText(/над 40%/).waitFor();
  // общ множител: 990 / 230 = 4.304 → 430 г; пн 430 × 1.65 = 709.5
  await dlg.getByLabel("Начин на мащабиране").selectOption("uniform");
  assert.match(await row("Понеделник"), /Понеделник 165 7(09|10) \+330%/);
  await dlg.getByLabel("Начин на мащабиране").selectOption("perDay");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/scale-desktop.png" });
  await dlg.getByRole("button", { name: "Създай чернова v2" }).click();
  await page.getByText(/Създадена е чернова v2, мащабирана към 990 kcal/).waitFor();
  await page.getByText(/Общо за деня: 990 kcal/).waitFor();                     // пн на v2
  assert.equal(await page.getByLabel("Количество за Пилешко филе").inputValue(), "600");
  await page.getByRole("button", { name: /^Вторник/ }).click();
  await page.getByText(/Общо за деня: 988(\.3)? kcal/).waitFor();
  // v1 в базата е непроменена
  const v1 = be.db.plan_versions.find((v) => v.version === 1), v2 = be.db.plan_versions.find((v) => v.version === 2);
  const qtys = (v) => { const days = be.db.plan_days.filter((d) => d.version_id === v.id).map((d) => d.id); const meals = be.db.plan_meals.filter((m) => days.includes(m.day_id)).map((m) => m.id); return be.db.plan_meal_items.filter((i) => meals.includes(i.meal_id)).map((i) => Number(i.qty)).sort((a, b) => a - b); };
  assert.deepEqual(qtys(v1), [100, 100, 100]);
  assert.deepEqual(qtys(v2), [335, 335, 600]);
  assert.equal(v2.status, "draft");
  assert.deepEqual(errors, []); await context.close();
});

test("смяна на изгледа (завъртане) не затваря прозорци и не губи въведеното; грешка при зареждане на храните", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor();
  // табло на 390 px: стойностите в картите не излизат от тях („Нутриционист")
  await page.setViewportSize({ width: 390, height: 800 });
  const over = await page.evaluate(() => [...document.querySelectorAll("main div")].filter((d) => d.textContent === "Нутриционист" && d.scrollWidth > d.clientWidth + 1).length);
  assert.equal(over, 0, "„Нутриционист“ се събира в картата");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/dash-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await nav(page, "Моите клиенти");
  await page.getByRole("main").getByRole("button", { name: "Мерки", exact: true }).click();
  await page.getByLabel("Тегло (кг)", { exact: true }).fill("71.5");
  for (const width of [375, 900, 1280]) {               // телефон → таблет → десктоп
    await page.setViewportSize({ width, height: 800 });
    assert.equal(await page.getByLabel("Тегло (кг)", { exact: true }).inputValue(), "71.5", `стойността се пази при ${width}px`);
    // полетата във формата: еднаква височина, датата не застъпва съседното поле
    const geo = await page.evaluate(() => {
      const date = document.querySelector('input[type="date"]').getBoundingClientRect();
      const w = [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith("Тегло (кг)")).querySelector("input").getBoundingClientRect();
      return { overlap: date.right > w.left + 0.5 && Math.abs(date.top - w.top) < 5, dh: Math.round(date.height), wh: Math.round(w.height), dy: Math.round(date.bottom), wy: Math.round(w.bottom) };
    });
    assert.equal(geo.overlap, false, `датата не застъпва теглото при ${width}px`);
    assert.equal(geo.dh, geo.wh, `еднаква височина при ${width}px`);
    if (width === 375 && process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/meas-form-375.png" });
  }
  await page.getByRole("button", { name: "Затвори" }).click();
  // търсене на продукт: заявката за храни пропада → видима грешка и „Опитай пак"
  await openPlanner(page);
  be.state.failNext = (method, url) => method === "GET" && url.pathname.endsWith("/foods") && "keep";
  await page.getByRole("button", { name: "+ Добави продукт / рецепта" }).first().click();
  await page.getByText(/Храните не можаха да се заредят/).waitFor();
  be.state.failNext = null;                              // връзката се възстановява
  await page.getByRole("button", { name: "Опитай пак" }).click();
  await page.getByText(/Храните не можаха да се заредят/).waitFor({ state: "detached" });
  await page.getByPlaceholder("Търси…").fill("несъществуващо");
  await page.getByText(/Няма продукт с „несъществуващо/).waitFor();
  await page.getByPlaceholder("Търси…").fill("Пиле");
  await page.getByRole("button", { name: /^Пилешко филе/ }).click();
  await page.getByText(/Общо за деня: 165 kcal/).waitFor();
  assert.deepEqual(errors, []); await context.close();
});

test("GDPR заличаване: потвърждение с име, всичко изчезва, запис в журнала без лични данни", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => {
    const c = addClient(be, ids);
    be.db.client_measurements.push({ id: be.uuid(), client_id: c.id, measured_on: "2026-11-01", weight_kg: 65 });
    be.db.ai_conversations.push({ id: be.uuid(), nutritionist_id: ids.nutId, client_id: c.id, messages: [] });
  } }); await login(page);
  await page.getByText("Здравей").waitFor();
  await nav(page, "Настройки");
  await page.getByText("Още няма изтрити клиенти.").waitFor();
  await page.locator("select").filter({ hasText: "— избери —" }).selectOption({ label: "Мария Иванова" });
  await page.getByRole("button", { name: "🗑 Изтрий всички данни" }).click();
  const go = page.getByRole("button", { name: "Изтрий завинаги" });
  assert.equal(await go.isDisabled(), true, "без въведено име бутонът е неактивен");
  await page.getByPlaceholder("Мария").fill("Мария");
  await go.click();
  await page.getByText(/Всички данни за „Мария Иванова" са изтрити необратимо \(мерки: 1, режими: 0, AI разговори: 1\)/).waitFor();
  assert.equal(be.db.clients.filter((c) => c.first_name === "Мария").length, 0);
  assert.equal(be.db.client_measurements.length, 0); assert.equal(be.db.ai_conversations.length, 0);
  const row = page.locator("tr", { hasText: "Заявка за изтриване" });
  await row.waitFor();
  assert.match(await row.innerText(), /мерки 1 · режими 0 · AI 1/);
  assert.equal(JSON.stringify(be.db.erasure_log).includes("Мария"), false);
  assert.deepEqual(errors, []); await context.close();
});

test("шаблони: запазване на ден и седмица, прилагане (добавяне/замяна/нова чернова), изтрит продукт, изтриване", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  const modal = () => page.locator("h3", { hasText: /^Шаблони$/ }).locator("xpath=..");
  await page.getByRole("button", { name: "Шаблони", exact: true }).click();
  await modal().getByText("Още нямаш шаблони").waitFor();
  assert.equal(await modal().getByRole("button", { name: "Запази Понеделник като шаблон" }).isDisabled(), true, "празен ден не се запазва");
  await page.keyboard.press("Escape").catch(() => {}); await modal().locator("xpath=..").click({ position: { x: 5, y: 5 } });
  await addFood(page, 0, "Пилешко филе"); await addFood(page, 1, "Ориз");            // пн: 165 + 130 = 295
  await page.getByText(/Общо за деня: 295 kcal/).waitFor();
  // запазване на деня
  await page.getByRole("button", { name: "Шаблони", exact: true }).click();
  await modal().getByRole("button", { name: "Запази Понеделник като шаблон" }).click();
  const box = page.getByRole("dialog", { name: "Шаблон от Понеделник" }).getByRole("textbox");
  assert.equal(await box.inputValue(), "Ден ~300 kcal");
  await answer(page, { text: "Лек ден" });
  await modal().getByText("295 kcal · 2 продукта").waitFor();
  const tplDay = be.db.plan_templates.find((x) => x.name === "Лек ден");
  assert.equal(tplDay.kind, "day"); assert.equal(tplDay.owner_id, be.db.profiles.find((p) => p.email === "nut@test.local").id);
  assert.equal(JSON.stringify(tplDay.content).includes("Мария"), false, "шаблонът не съдържа данни за клиента");
  await modal().locator("xpath=..").click({ position: { x: 5, y: 5 } });
  // прилагане към вторник: добавяне, после замяна (пита)
  await page.getByRole("button", { name: /^Вторник/ }).click();
  await page.getByRole("button", { name: "Шаблони", exact: true }).click();
  await modal().getByRole("button", { name: "Приложи Лек ден" }).click();
  await page.getByText(/Шаблонът „Лек ден" е добавен към Вторник/).waitFor();
  await page.getByText(/Общо за деня: 295 kcal/).waitFor();
  const tue = () => { const v = be.db.plan_versions[0]; const d = be.db.plan_days.find((x) => x.version_id === v.id && x.weekday === 1); return be.db.plan_meals.filter((m) => m.day_id === d.id); };
  assert.equal(tue().length, 8, "4 празни стандартни + 4 от шаблона");
  await page.getByRole("button", { name: "Шаблони", exact: true }).click();
  await modal().getByLabel("Как се прилага шаблон на ден").selectOption("replace");
  await modal().getByRole("button", { name: "Приложи Лек ден" }).click();
  await answer(page);
  assert.match(page._dialogs.at(-1), /Вторник съдържа 2 продукта/);
  await page.getByText(/Шаблонът „Лек ден" е приложен към Вторник/).waitFor();
  await page.getByText(/Общо за деня: 295 kcal/).waitFor();
  assert.equal(tue().length, 4, "замяна, не добавяне");
  // седмица → нова чернова; междувременно оризът е изтрит от базата
  await page.getByRole("button", { name: "Шаблони", exact: true }).click();
  await modal().getByRole("button", { name: "Запази седмицата като шаблон" }).click();
  await answer(page, { text: "Седмица А" });
  await modal().getByText(/295 kcal\/ден средно · 4 продукта/).waitFor();
  be.db.foods.splice(be.db.foods.findIndex((f) => f.name_bg.startsWith("Ориз")), 1);
  await modal().getByRole("button", { name: "Приложи Седмица А" }).click();
  await page.getByText(/Създадена е чернова v2 от шаблона „Седмица А"\. Предишните версии са непроменени\. 2 продукта вече не са в базата/).waitFor();
  await page.getByText(/Общо за деня: 295 kcal/).waitFor();
  const v2 = be.db.plan_versions.find((v) => v.version === 2);
  assert.equal(v2.status, "draft");
  const v2items = be.db.plan_meal_items.filter((i) => be.db.plan_meals.some((m) => m.id === i.meal_id && be.db.plan_days.some((d) => d.id === m.day_id && d.version_id === v2.id)));
  assert.equal(v2items.length, 4); assert.equal(v2items.filter((i) => i.food_id === null).length, 2, "изтритият продукт е без връзка, но със снапшот");
  // изтриване на шаблон
  await page.getByRole("button", { name: "Шаблони", exact: true }).click();
  await modal().getByRole("button", { name: "Изтрий шаблона Лек ден" }).click();
  await answer(page);
  await modal().getByRole("button", { name: "Приложи Лек ден" }).waitFor({ state: "detached" });
  assert.equal(be.db.plan_templates.length, 1);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/templates-desktop.png" });
  await page.setViewportSize({ width: 375, height: 740 });
  await modal().getByText("Седмица А").waitFor(); // прозорецът остава отворен при смяна на изгледа
  const bb = await modal().boundingBox();
  assert.ok(bb.x >= 0 && bb.x + bb.width <= 375, "шаблоните се побират на телефон");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/templates-mobile.png" });
  assert.deepEqual(errors, []); await context.close();
});

test("сравнение на версии: суми, разлика и списък с промени по дни", async () => {
  const { page, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  assert.equal(await page.getByRole("button", { name: "Сравни версии" }).count(), 0, "при една версия бутонът липсва");
  await addFood(page, 0, "Пилешко филе");                       // v1: пиле 100 g (165 kcal) в понеделник
  await page.locator("select", { hasText: "+ Нова версия…" }).selectOption({ label: "Дублирай текущата" });
  await page.getByText("v2 · чернова").waitFor({ state: "attached" });
  const qty = page.getByLabel("Количество за Пилешко филе"); await qty.fill("200"); await qty.blur();
  await page.getByText(/Общо за деня: 330 kcal/).waitFor();
  await addFood(page, 1, "Ориз");                                 // v2: пиле 200 g + ориз 100 g = 460 kcal
  await page.getByText(/Общо за деня: 460 kcal/).waitFor();
  await page.getByRole("button", { name: "Сравни версии" }).click();
  await page.getByText("Какво се променя от v1 към v2").waitFor();
  const dlg = page.locator("h3", { hasText: "Сравнение на версии" }).locator("xpath=..");
  const row = async (txt) => (await dlg.locator("tr", { hasText: txt }).first().innerText()).replace(/\s+/g, " ");
  assert.match(await row("Понеделник"), /Понеделник 165 460 \+295 2/);
  assert.match(await row("Вторник"), /Вторник 0 0 0 —/);
  // средно/ден ÷7: 165/7 = 23.6 → 24; 460/7 = 65.7 → 66; разлика 42
  assert.match(await row("Разлика"), /Разлика \+42/);
  await dlg.getByText("+ Ориз 100 г").waitFor();
  await dlg.getByText("Пилешко филе: 100 г → 200 г").waitFor();
  // обръщане на посоката
  await dlg.getByLabel("Версия A").selectOption({ label: "v2 · чернова" });
  await dlg.getByLabel("Версия B").selectOption({ label: "v1 · чернова" });
  await dlg.getByText("Какво се променя от v2 към v1").waitFor();
  await dlg.getByText("− Ориз 100 г").waitFor();
  assert.deepEqual(errors, []); await context.close();
});

test("мерки: въвеждане, валидиране, профилът се обновява само от най-новото, тенденция и графика", async () => {
  const { page, be, context, errors } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await nav(page, "Моите клиенти");
  await page.getByRole("main").getByRole("button", { name: "Мерки", exact: true }).click();
  await page.getByText("Още няма измервания").waitFor();
  const dlg = page.locator("h3", { hasText: "Мерки — Мария Иванова" }).locator("xpath=../..");
  const add = async (date, kg, waist = "") => {
    await dlg.getByLabel("Дата", { exact: true }).fill(date); await dlg.getByLabel("Тегло (кг)", { exact: true }).fill(kg); await dlg.getByLabel("Талия (см)", { exact: true }).fill(waist);
    await dlg.getByRole("button", { name: "Добави измерване" }).click();
  };
  await add("2026-10-01", "820");
  await dlg.getByText("Тегло: между 25 и 350 кг.").waitFor();
  assert.equal(be.db.client_measurements.length, 0);
  await add("2026-10-01", "68", "80");
  await dlg.getByText(/Теглото в профила е обновено на 68 кг/).waitFor();
  await add("2026-11-15", "65,5");
  await dlg.getByText(/Теглото в профила е обновено на 65.5 кг/).waitFor();
  await add("2026-09-01", "70");                                   // по-старо → профилът остава 65.5
  await dlg.getByText(/има по-ново измерване/).waitFor();
  assert.equal(be.db.clients.find((c) => c.first_name === "Мария").weight_kg, 65.5);
  assert.equal(be.db.client_measurements.find((m) => m.measured_on === "2026-11-15").waist_cm, null, "празно поле = null, не 0");
  // 70 → 65.5 за 75 дни: −4.5 кг; −4.5/75·7 = −0.42 кг/седмица
  await dlg.getByText(/70 → 65.5 кг/).waitFor();
  await dlg.getByText(/−4.5 кг за 75 дни, средно −0.42 кг\/седмица/).waitFor();
  await dlg.getByRole("img", { name: "Тегло (кг): 3 измервания" }).waitFor();
  const box = await dlg.locator("svg").boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + 100);
  await dlg.getByText("15.11.2026").first().waitFor();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/meas-desktop.png" });
  // талията има само едно измерване
  await dlg.getByRole("tab", { name: "Талия · 1" }).click();
  await dlg.getByText(/Едно измерване \(80 см на 01.10.2026\)/).waitFor();
  // изтриване
  await dlg.getByRole("button", { name: "Изтрий измерването от 01.09.2026" }).click();
  await answer(page);
  await dlg.getByRole("tab", { name: "Тегло · 2" }).waitFor();
  assert.equal(be.db.client_measurements.length, 2);
  await dlg.getByRole("button", { name: "Затвори" }).click();
  await page.getByRole("cell", { name: "65.5 кг" }).waitFor();
  // телефон (375 px): прозорецът с мерките се събира без хоризонтално преливане
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("main").getByRole("button", { name: "Мерки", exact: true }).click();
  await page.getByRole("img", { name: "Тегло (кг): 2 измервания" }).waitFor();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/meas-mobile.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 376), "без хоризонтално преливане на 375 px");
  // графиката и текстът над нея се побират в картата (таблицата може да се превърта сама)
  const fitsFn = () => {
    const card = document.querySelector("h3").closest("div[style*='max-width']") || document.querySelector("h3").parentElement.parentElement;
    const cr = card.getBoundingClientRect(); const svg = document.querySelector("svg[role=img]").getBoundingClientRect();
    return svg.right <= cr.right + 0.5 && svg.width > 200;
  };
  // графиката преизчислява ширината си след ResizeObserver → изчакваме кратко, вместо да мерим веднага
  const fits = await page.waitForFunction(fitsFn, null, { timeout: 3000 }).then(() => true, () => false);
  assert.ok(fits, "графиката е в рамките на картата на 375 px");
  assert.deepEqual(errors, []); await context.close();
});

test("цел: без записана цел планерът казва, че е по формула", async () => {
  const { page, context } = await setup({ seed: (be, ids) => addClient(be, ids) }); await login(page);
  await page.getByText("Здравей").waitFor(); await openPlanner(page);
  await page.getByText(/Целта е ориентир по формула от профила/).waitFor();
  await context.close();
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
