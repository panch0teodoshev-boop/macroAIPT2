// Тестове с ръчно пресметнати очаквани стойности (сметките са в коментарите).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itemFactor, itemTotals, itemMissing, mealTotals, dayTotals, weekSummary, recipePerServing,
  servingsOf, microSummary, ageFromBirthDate, clientTarget, parseQty,
} from "./planMath.mjs";
import { round, calcMacros, calcBMR, bmrHarrisBenedict, bmrMifflin, calcTDEE, calcEnergyTarget, ACTIVITY_FACTORS, KCAL_PER_G } from "./nutrition.mjs";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const chicken = { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 };   // на 100 g
const rice = { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4 };   // на 100 g
const egg = { kcal: 78, protein_g: 6.3, carbs_g: 0.6, fat_g: 5.3, fiber_g: 0 };      // на 1 бр
const item = (snapshot, qty, unit = "100g", extra = {}) => ({ snapshot, qty, unit, ...extra });

// ---------- преизчисляване според грамажа ----------
test("100 g продукт × 150 g = ×1.5", () => {
  const t = itemTotals(item(chicken, 150));
  near(t.kcal, 247.5); near(t.protein_g, 46.5); near(t.fat_g, 5.4);
});
test("продукт на брой: 3 яйца = ×3", () => { near(itemTotals(item(egg, 3, "piece")).kcal, 234); });
test("рецепта: 1.5 порции = ×1.5 от снапшота за порция", () => { near(itemTotals(item({ kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 10 }, 1.5, "serving")).kcal, 600); });
test("количество от базата като низ ('150.00') се чете като число", () => { near(itemTotals(item(chicken, "150.00")).kcal, 247.5); });
test("невалидно/отрицателно/празно количество → 0, никога отрицателни калории", () => {
  for (const q of [-50, "", null, undefined, "abc", NaN]) assert.equal(itemTotals(item(chicken, q)).kcal, 0);
  assert.equal(itemFactor("100g", -1), 0);
});

// ---------- липсващи стойности ≠ нула ----------
test("липсващ макрос се отчита като липсващ, не като коректна нула", () => {
  const it = item({ kcal: 100, protein_g: null, carbs_g: 10 }, 100); // fat_g изобщо го няма
  assert.deepEqual(itemMissing(it), ["protein_g", "fat_g"]);
  assert.deepEqual(itemMissing(item(chicken, 100)), [], "истинската 0 (въглехидрати в пилешко) НЕ е липса");
});
test("седмичното обобщение брои редовете с непълни данни", () => {
  const tree = [{ weekday: 0, plan_meals: [{ plan_meal_items: [item(chicken, 100), item({ kcal: 50 }, 100)] }] }];
  const w = weekSummary(tree);
  assert.equal(w.items, 2); assert.equal(w.incompleteItems, 1);
});

// ---------- хранене / ден / седмица ----------
const meal = (...items) => ({ plan_meal_items: items });
const day = (weekday, ...meals) => ({ weekday, plan_meals: meals });
test("хранене = сбор от редовете; ден = сбор от храненията", () => {
  const m1 = meal(item(chicken, 200), item(rice, 250)); // 330 + 325 = 655 kcal; П 62 + 6.75 = 68.75
  const m2 = meal(item(egg, 2, "piece"));               // 156 kcal; П 12.6
  near(mealTotals(m1).kcal, 655); near(mealTotals(m1).protein_g, 68.75);
  const d = dayTotals(day(0, m1, m2));
  near(d.kcal, 811); near(d.protein_g, 81.35); near(d.carbs_g, 70 + 1.2); near(d.fat_g, 7.2 + 0.75 + 10.6);
});
test("седмица: общо, средно на 7 дни и средно на попълнените дни", () => {
  const tree = [day(0, meal(item(chicken, 100))), day(1, meal(item(chicken, 300))), day(2, meal())]; // 165 + 495 = 660
  const w = weekSummary(tree);
  near(w.total.kcal, 660); near(w.avg.kcal, 660 / 7); near(w.avgFilled.kcal, 330);
  assert.equal(w.filledDays, 2);
});
test("празен режим не дели на нула", () => {
  const w = weekSummary([]);
  assert.equal(w.avg.kcal, 0); assert.equal(w.avgFilled.kcal, 0); assert.equal(w.filledDays, 0);
});
test("без натрупване на грешка: 7 дни × 30 реда по 33.3 g съвпада със затворената форма", () => {
  const tree = Array.from({ length: 7 }, (_, i) => day(i, meal(...Array.from({ length: 30 }, () => item(rice, 33.3)))));
  near(weekSummary(tree).total.kcal, 130 * 0.333 * 210, 1e-6); // 9090.9
  assert.equal(round(weekSummary(tree).total.kcal, 1), 9090.9);
});

// ---------- рецепти и порции ----------
const recipe = (servings) => ({ servings, recipe_ingredients: [{ qty: 400, unit: "100g", snapshot: chicken }, { qty: 300, unit: "100g", snapshot: rice }, { qty: 2, unit: "piece", snapshot: egg }] });
// общо: 660 + 390 + 156 = 1206 kcal; протеин 124 + 8.1 + 12.6 = 144.7
test("рецепта за 4 порции: общо 1206 kcal → 301.5 на порция", () => {
  const r = recipePerServing(recipe(4));
  near(r.total.kcal, 1206); near(r.per.kcal, 301.5); near(r.per.protein_g, 144.7 / 4);
});
test("РЕГРЕСИЯ: дробни порции (0.5) → двойно на порция, не се закръглят до 1", () => {
  near(recipePerServing(recipe(0.5)).per.kcal, 2412);
});
test("порции 0 / липсват / невалидни → третират се като 1 (без деление на нула)", () => {
  for (const s of [0, null, undefined, "", -2, "x"]) { assert.equal(servingsOf(s), 1); near(recipePerServing(recipe(s)).per.kcal, 1206); }
  assert.equal(servingsOf("4.0"), 4);
});
test("порция от рецепта в режим × брой порции връща общото за рецептата", () => {
  const per = recipePerServing(recipe(4)).per;
  near(itemTotals(item(per, 4, "serving")).kcal, 1206);
});

// ---------- микронутриенти ----------
const REFS = [{ key: "fiber_g", fromMacro: true }, { key: "iron_mg" }, { key: "vitC_mg" }];
test("микро: сумира само наличните стойности и дава покритие ПО нутриент", () => {
  const tree = [day(0, meal(
    item(rice, 200, "100g", { foods: { micros: { iron_mg: 0.2 } } }),          // желязо 0.4; вит. C липсва
    item(chicken, 100, "100g", { foods: { micros: { iron_mg: 1.0, vitC_mg: 0 } } }), // желязо 1.0; вит. C = истинска 0
    item(egg, 2, "piece", { foods: { micros: {} } }),                          // без микроданни
    item({ kcal: 400 }, 1, "serving"),                                         // рецепта — не се брои
  ))];
  const s = microSummary(tree, REFS);
  assert.equal(s.foodItems, 3); assert.equal(s.recipeItems, 1); assert.equal(s.withAnyMicros, 2);
  near(s.nutrients.iron_mg.total, 1.4); assert.equal(s.nutrients.iron_mg.known, 2);
  near(s.nutrients.iron_mg.perDay, 0.2);
  assert.equal(s.nutrients.vitC_mg.known, 1, "само 1 от 3 продукта има стойност за вит. C");
  near(s.nutrients.vitC_mg.coveragePct, 100 / 3, 1e-9);
  near(s.nutrients.fiber_g.total, 0.8); assert.equal(s.nutrients.fiber_g.known, 3);
});

// ---------- възраст и цел на клиента ----------
test("възраст: календарно точна, вкл. ден преди/на рождения ден", () => {
  assert.equal(ageFromBirthDate("1990-11-13", new Date("2026-11-12T12:00:00")), 35);
  assert.equal(ageFromBirthDate("1990-11-12", new Date("2026-11-12T12:00:00")), 36);
  assert.equal(ageFromBirthDate(null), null); assert.equal(ageFromBirthDate("невалидна"), null);
});
test("цел на клиента: жена 65 кг/168 см/40 г., умерена активност, редукция −15%", () => {
  // BMR = 10·65 + 6.25·168 − 5·40 − 161 = 1339; TDEE = 1339·1.55 = 2075.45; цел = ·0.85 = 1764.1325
  // протеин 130 g (520 kcal), мазнини 65 g (585 kcal), въглехидрати (1764.1325 − 1105)/4 = 164.783125 g
  const t = clientTarget({ sex: "female", weight_kg: 65, height_cm: 168, birth_date: "1986-01-01", activity_level: "moderate", main_goal: "reduction" }, new Date("2026-11-12"));
  near(t.bmr, 1339); near(t.tdee, 2075.45, 1e-9); near(t.kcal, 1764.1325, 1e-9);
  near(t.protein_g, 130); near(t.fat_g, 65); near(t.carbs_g, 164.783125, 1e-9);
  assert.deepEqual(t.assumed, []);
});
test("цел на клиента: липсващите данни се обявяват, не се скриват зад стойности по подразбиране", () => {
  const t = clientTarget({ sex: "male" });
  assert.deepEqual(t.assumed, ["възраст", "тегло", "ръст", "активност"]);
});

// ---------- вход ----------
test("parseQty: приема десетична запетая, отказва отрицателни/празни/огромни", () => {
  assert.equal(parseQty("150"), 150); assert.equal(parseQty("12,5"), 12.5); assert.equal(parseQty(" 0 "), 0);
  for (const bad of ["", "-5", "abc", "1e9", null, "100000"]) assert.equal(parseQty(bad), null);
});

// ---------- допълнителни проверки на централния модул ----------
test("Harris–Benedict (Roza & Shizgal) жена 60 кг/165 см/30 г. = 1383.683", () => {
  // 447.593 + 9.247·60 + 3.098·165 − 4.330·30 = 447.593 + 554.82 + 511.17 − 129.9
  near(bmrHarrisBenedict({ sex: "female", weightKg: 60, heightCm: 165, age: 30 }).value, 1383.683, 1e-9);
});
test("Mifflin мъж 80 кг/180 см/30 г. = 1780 (съвпада с екрана на калкулатора)", () => {
  near(bmrMifflin({ sex: "male", weightKg: 80, heightCm: 180, age: 30 }).value, 1780);
  near(calcTDEE({ bmr: 1780, activityLevel: "moderate" }).tdee, 2759);
});
test("всички фактори на активност", () => {
  assert.deepEqual(ACTIVITY_FACTORS, { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, extreme: 1.9 });
});
test("излишък 10% от 2759 = 3034.9; дефицит 20% = 2207.2", () => {
  near(calcEnergyTarget({ tdee: 2759, mode: "surplus_pct", value: 10 }).target, 3034.9, 1e-9);
  near(calcEnergyTarget({ tdee: 2759, mode: "deficit_pct", value: 20 }).target, 2207.2, 1e-9);
});
test("грамове ↔ калории: 4/4/9 и сверка на макросите", () => {
  assert.deepEqual(KCAL_PER_G, { protein: 4, carbs: 4, fat: 9, alcohol: 7 });
  const m = calcMacros({ calories: 2759, weightKg: 80, spec: { protein: { mode: "g_per_kg", value: 2 }, fat: { mode: "g_per_kg", value: 1 } } });
  near(m.carbs.grams, (2759 - 640 - 720) / 4); // 349.75
  near(m.protein.pct + m.fat.pct + m.carbs.pct, 100, 1e-9);
  assert.equal(m.overAllocatedKcal, 0);
});
test("макроси: протеин + мазнини над калориите се сигнализира (въглехидрати 0)", () => {
  const m = calcMacros({ calories: 1200, weightKg: 100, spec: { protein: { mode: "g_per_kg", value: 2.5 }, fat: { mode: "g_per_kg", value: 1 } } });
  assert.equal(m.carbs.grams, 0); near(m.overAllocatedKcal, 1000 + 900 - 1200);
});
test("Katch–McArdle: невалидни % мазнини → Mifflin с изрична отметка", () => {
  for (const bf of [NaN, 100, 150, -10]) {
    const r = calcBMR("katch_mcardle", { sex: "male", weightKg: 80, heightCm: 180, age: 30, bodyFatPct: bf });
    assert.equal(r.formula, "mifflin"); assert.equal(r.fallbackFrom, "katch_mcardle");
  }
  assert.equal(calcBMR("katch_mcardle", { weightKg: 80, bodyFatPct: 20 }).formula, "katch_mcardle");
});
test("round: половинка далеч от нулата, без −0, устойчиво на двоично представяне", () => {
  assert.equal(round(2.5), 3); assert.equal(round(-2.5), -3); assert.equal(round(1.005, 2), 1.01);
  assert.equal(Object.is(round(-0.2), -0), false); assert.equal(round(-0.2), 0);
  assert.equal(round(349.75, 1), 349.8); assert.equal(round(NaN), 0);
});
