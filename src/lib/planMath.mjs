/**
 * ProNutrition — изчисления върху хранителен режим (хранене / ден / седмица / рецепта / микро).
 * Единствено място за тези сметки: ползва се от планера, AI контекста и експортите.
 * Стъпва върху централния модул nutrition.mjs. Чист JS, без зависимости → тестваем офлайн.
 *
 * Правило за липсващи данни: липсваща стойност НЕ е нула. Сумите изключват липсите,
 * а броят им се връща отделно, за да може интерфейсът да предупреди.
 */
import { calcBMR, calcTDEE, calcEnergyTarget, calcMacros } from "./nutrition.mjs";

export const MACRO_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"];
export const CORE_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g"]; // задължителни за коректен тотал
export const zero = () => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

const val = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

/** Множител спрямо снапшота: на 100 g → qty/100; на брой / порция → qty. */
export function itemFactor(unit, qty) {
  const q = val(qty);
  if (!isFinite(q) || q < 0) return 0;
  return unit === "serving" || unit === "piece" ? q : q / 100;
}

/** Нутриенти на един ред от режима (липсващ макрос се брои 0 в сумата, но виж itemMissing). */
export function itemTotals(it) {
  const f = itemFactor(it?.unit, it?.qty), s = it?.snapshot || {};
  const o = zero();
  for (const k of MACRO_KEYS) { const v = val(s[k]); o[k] = isFinite(v) ? v * f : 0; }
  return o;
}

/** Кои основни макроси липсват в снапшота на реда (празен масив = пълни данни). */
export function itemMissing(it) {
  const s = it?.snapshot || {};
  return CORE_KEYS.filter((k) => !isFinite(val(s[k])));
}

export const addInto = (a, b) => { for (const k of MACRO_KEYS) a[k] += b[k] || 0; return a; };

export function mealTotals(meal) {
  const tot = zero();
  (meal?.plan_meal_items || []).forEach((it) => addInto(tot, itemTotals(it)));
  return tot;
}
export function dayTotals(day) {
  const tot = zero();
  (day?.plan_meals || []).forEach((m) => addInto(tot, mealTotals(m)));
  return tot;
}

/**
 * Седмица: total, средно на ден за ВСИЧКИ 7 дни (avg) и средно само за дните с въведени
 * продукти (avgFilled). filledDays показва колко дни реално имат съдържание — при частично
 * попълнен режим avg подценява приема и интерфейсът трябва да го каже.
 */
export function weekSummary(tree) {
  const total = zero(); let filledDays = 0, incompleteItems = 0, items = 0;
  (tree || []).forEach((d) => {
    let n = 0;
    (d.plan_meals || []).forEach((m) => (m.plan_meal_items || []).forEach((it) => {
      n++; items++;
      if (itemMissing(it).length) incompleteItems++;
      addInto(total, itemTotals(it));
    }));
    if (n > 0) filledDays++;
  });
  const div = (n) => Object.fromEntries(MACRO_KEYS.map((k) => [k, n > 0 ? total[k] / n : 0]));
  return { total, avg: div(7), avgFilled: div(filledDays), filledDays, items, incompleteItems };
}

/** Рецепта → стойности за 1 порция. Порциите могат да са дробни (напр. 0.5); ≤0 или липсва → 1. */
export function recipePerServing(recipe) {
  const tot = zero();
  (recipe?.recipe_ingredients || []).forEach((ing) => {
    const f = itemFactor(ing.unit === "piece" ? "piece" : "100g", ing.qty), s = ing.snapshot || {};
    for (const k of MACRO_KEYS) { const v = val(s[k]); if (isFinite(v)) tot[k] += v * f; }
  });
  const sv = servingsOf(recipe?.servings);
  const per = zero(); for (const k of MACRO_KEYS) per[k] = tot[k] / sv;
  return { per, total: tot, servings: sv };
}
export function servingsOf(v) { const n = val(v); return isFinite(n) && n > 0 ? n : 1; }

/**
 * Микронутриенти за седмицата. За всеки нутриент се връща total, perDay (÷7) и покритие:
 * колко от продуктовите редове имат стойност за ТОЗИ нутриент (known) спрямо всички (of).
 * Рецептите (unit "serving") не носят микроданни и се броят отделно.
 */
export function microSummary(tree, refs) {
  const out = {}; refs.forEach((r) => (out[r.key] = { total: 0, known: 0 }));
  let foodItems = 0, recipeItems = 0, withAnyMicros = 0;
  (tree || []).forEach((d) => (d.plan_meals || []).forEach((m) => (m.plan_meal_items || []).forEach((it) => {
    if (it.unit === "serving") { recipeItems++; return; }
    foodItems++;
    const f = itemFactor(it.unit, it.qty);
    const mic = it.foods?.micros || {};
    if (Object.keys(mic).length > 0) withAnyMicros++;
    for (const r of refs) {
      const v = val(r.fromMacro ? it.snapshot?.[r.key] : mic[r.key]);
      if (isFinite(v)) { out[r.key].total += v * f; out[r.key].known++; }
    }
  })));
  const nutrients = {};
  for (const r of refs) {
    const o = out[r.key];
    nutrients[r.key] = { total: o.total, perDay: o.total / 7, known: o.known, of: foodItems, coveragePct: foodItems ? (o.known / foodItems) * 100 : 0 };
  }
  return { nutrients, foodItems, recipeItems, withAnyMicros, coveragePct: foodItems ? (withAnyMicros / foodItems) * 100 : 0 };
}

/** Навършени години към дадена дата (календарно точно, не чрез среден брой милисекунди). */
export function ageFromBirthDate(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b)) return null;
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Ориентировъчна дневна цел от профила на клиента (Mifflin; ±15% според целта; 2 g/kg протеин,
 * 1 g/kg мазнини). Връща и assumed: кои входни данни ЛИПСВАТ и са заместени със стойност по
 * подразбиране — интерфейсът е длъжен да ги покаже, защото целта тогава не е индивидуална.
 */
export function clientTarget(c, now = new Date()) {
  if (!c) return null;
  const assumed = [];
  const pick = (v, def, label) => { const n = val(v); if (isFinite(n) && n > 0) return n; assumed.push(label); return def; };
  let age = ageFromBirthDate(c.birth_date, now);
  if (age == null) { age = 30; assumed.push("възраст"); }
  const weightKg = pick(c.weight_kg, 70, "тегло");
  const heightCm = pick(c.height_cm, 170, "ръст");
  let sex = c.sex; if (sex !== "male" && sex !== "female") { sex = "male"; assumed.push("пол"); }
  const bmr = calcBMR("mifflin", { sex, weightKg, heightCm, age }).value;
  const { tdee } = calcTDEE({ bmr, activityLevel: c.activity_level || "moderate" });
  if (!c.activity_level) assumed.push("активност");
  const mode = { reduction: "deficit_pct", muscle_gain: "surplus_pct" }[c.main_goal] || "maintain";
  const energy = calcEnergyTarget({ tdee, mode, value: 15 });
  const m = calcMacros({ calories: energy.target, weightKg, spec: { protein: { mode: "g_per_kg", value: 2 }, fat: { mode: "g_per_kg", value: 1 } } });
  return { age, bmr, tdee, kcal: energy.target, protein_g: m.protein.grams, carbs_g: m.carbs.grams, fat_g: m.fat.grams, assumed };
}

/** Валидира въведено количество: връща число в [0, max] или null при невалиден вход. */
export function parseQty(input, max = 99999) {
  const s = String(input ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}
