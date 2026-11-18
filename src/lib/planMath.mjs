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

/**
 * Сравнение на две версии на режим (A → B). За всеки от 7-те дни: дневните суми на двете и
 * промените по продукти. Продуктите се сравняват по име + мерна единица, сумирано за деня
 * (преместване между хранения в същия ден не е промяна в храненето на клиента за деня).
 */
export function compareTrees(treeA, treeB) {
  const byWd = (tree) => { const m = new Map(); (tree || []).forEach((d) => { if (!m.has(d.weekday)) m.set(d.weekday, d); }); return m; };
  const qtyMap = (day) => {
    const m = new Map();
    (day?.plan_meals || []).forEach((meal) => (meal.plan_meal_items || []).forEach((it) => {
      const name = it.snapshot?.name || it.foods?.name_bg || it.recipes?.name || "?";
      const key = `${name}\u0000${it.unit}`;
      const q = val(it.qty);
      const cur = m.get(key) || { name, unit: it.unit, qty: 0 };
      cur.qty += isFinite(q) && q > 0 ? q : 0;
      m.set(key, cur);
    }));
    return m;
  };
  const A = byWd(treeA), B = byWd(treeB);
  const days = [];
  for (let wd = 0; wd < 7; wd++) {
    const da = A.get(wd), db = B.get(wd);
    const qa = qtyMap(da), qb = qtyMap(db);
    const changes = [];
    for (const key of new Set([...qa.keys(), ...qb.keys()])) {
      const x = qa.get(key), y = qb.get(key);
      const qtyA = x?.qty || 0, qtyB = y?.qty || 0;
      if (Math.abs(qtyA - qtyB) < 1e-9) continue;
      changes.push({ name: (x || y).name, unit: (x || y).unit, qtyA, qtyB, kind: qtyA === 0 ? "added" : qtyB === 0 ? "removed" : "changed" });
    }
    changes.sort((p, q) => p.name.localeCompare(q.name, "bg"));
    days.push({ weekday: wd, a: dayTotals(da), b: dayTotals(db), changes });
  }
  return { days, weekA: weekSummary(treeA), weekB: weekSummary(treeB), changedDays: days.filter((d) => d.changes.length).length };
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

/**
 * Записана от калкулатора цел (plan_versions.targets) → нормализиран обект, или null ако
 * липсва или е невалидна. Валидна е при kcal > 0 и неотрицателни макроси.
 */
export function savedTarget(targets) {
  if (!targets || typeof targets !== "object") return null;
  const kcal = val(targets.kcal), p = val(targets.protein_g), c = val(targets.carbs_g), f = val(targets.fat_g);
  if (!(isFinite(kcal) && kcal > 0)) return null;
  if (![p, c, f].every((x) => isFinite(x) && x >= 0)) return null;
  return { kcal, protein_g: p, carbs_g: c, fat_g: f, assumed: [], source: "saved", savedAt: targets.saved_at || null, inputs: targets.inputs || null };
}

/** Целта, по която се сравнява режимът: записаната във версията, иначе ориентировъчната от профила. */
export function effectiveTarget(targets, client, now = new Date()) {
  const s = savedTarget(targets);
  if (s) return s;
  const d = clientTarget(client, now);
  return d ? { ...d, source: "default" } : null;
}

/** Валидира въведено количество: връща число в [0, max] или null при невалиден вход. */
export function parseQty(input, max = 99999) {
  const s = String(input ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Закръгляне на мащабирано количество до практично за кухнята:
 * грамове → до 5 g (под 20 g → до 1 g, минимум 1 g); брой → до 0.5 (мин. 0.5); порция → до 0.25 (мин. 0.25).
 */
export function roundQty(unit, q) {
  const n = val(q);
  if (!isFinite(n) || n <= 0) return 0;
  if (unit === "piece") return Math.max(0.5, Math.round(n * 2) / 2);
  if (unit === "serving") return Math.max(0.25, Math.round(n * 4) / 4);
  return n < 20 ? Math.max(1, Math.round(n)) : Math.round(n / 5) * 5;
}

/**
 * Мащабиране на режим към калорийна цел (kcal/ден).
 * mode "perDay": всеки попълнен ден се мащабира поотделно до целта (дните се изравняват);
 * mode "uniform": един общ множител = цел / средно за попълнените дни (запазва разликите между дните).
 * Празните дни (0 kcal) не се пипат. Връща множителите по ден, новото дърво (закръглени количества)
 * и средното преди/след — „след" е пресметнато върху закръглените количества, т.е. реалният резултат.
 */
export function scalePlan(tree, targetKcal, mode = "perDay") {
  const target = val(targetKcal);
  if (!(isFinite(target) && target > 0)) return null;
  const days = (tree || []).map((d) => ({ weekday: d.weekday, before: dayTotals(d) }));
  const filled = days.filter((d) => d.before.kcal > 0);
  if (!filled.length) return null;
  const avgBefore = filled.reduce((a, d) => a + d.before.kcal, 0) / filled.length;
  const factorOf = (d) => (d.before.kcal > 0 ? (mode === "uniform" ? target / avgBefore : target / d.before.kcal) : 1);
  const factors = Object.fromEntries(days.map((d) => [d.weekday, factorOf(d)]));
  const newTree = (tree || []).map((d) => ({
    ...d,
    plan_meals: (d.plan_meals || []).map((m) => ({
      ...m,
      plan_meal_items: (m.plan_meal_items || []).map((it) => (factors[d.weekday] === 1 ? it : { ...it, qty: roundQty(it.unit, val(it.qty) * factors[d.weekday]) })),
    })),
  }));
  const after = newTree.map((d) => ({ weekday: d.weekday, totals: dayTotals(d) }));
  const out = days.map((d, i) => ({ weekday: d.weekday, before: d.before, after: after[i].totals, factor: factors[d.weekday] }));
  const avgOf = (key) => { const a = zero(); out.filter((d) => d.before.kcal > 0).forEach((d) => addInto(a, d[key])); for (const k of MACRO_KEYS) a[k] /= filled.length; return a; };
  const fs = filled.map((d) => factors[d.weekday]);
  return { mode, target, days: out, tree: newTree, filledDays: filled.length, avgBefore: avgOf("before"), avgAfter: avgOf("after"), minFactor: Math.min(...fs), maxFactor: Math.max(...fs) };
}

// ---------- шаблони на ден / седмица ----------
/** Съдържание за шаблон от дни на режима (без идентификатори на редове; снапшотите се пазят). */
export function templateContent(days) {
  return (days || []).map((d) => ({
    weekday: d.weekday,
    meals: [...(d.plan_meals || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((m, i) => ({
      name: m.name, position: i,
      items: (m.plan_meal_items || []).map((it) => ({ food_id: it.food_id || null, recipe_id: it.recipe_id || null, qty: Number(it.qty), unit: it.unit, snapshot: it.snapshot || {} })),
    })),
  }));
}
/** Обратно в дървовидна форма (за суми и преглед). */
export function templateAsTree(content) {
  return (content || []).map((d) => ({ weekday: d.weekday, plan_meals: (d.meals || []).map((m) => ({ name: m.name, position: m.position, plan_meal_items: m.items || [] })) }));
}
/** Обобщение за списъка: брой продукти и средно kcal за попълнените дни. */
export function templateStats(content) {
  const w = weekSummary(templateAsTree(content));
  return { item_count: w.items, kcal_avg: w.filledDays ? Math.round(w.avgFilled.kcal * 10) / 10 : 0, filledDays: w.filledDays };
}
