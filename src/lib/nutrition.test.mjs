import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcBMR, bmrMifflin, bmrHarrisBenedict, bmrKatchMcArdle,
  calcTDEE, calcEnergyTarget, calcMacros, scaleNutrients, sumNutrients,
  calcBMI, predictWeeklyWeightChange, round,
} from "./nutrition.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// --- стойности, верифицирани спрямо оригиналната Google Sheets таблица ---
test("Mifflin BMR съвпада с таблицата (мъж 101кг/190см/35г = 2027.5)", () => {
  near(bmrMifflin({ sex: "male", weightKg: 101, heightCm: 190, age: 35 }).value, 2027.5);
});
test("TDEE × 1.725 (висока активност) = 3497.4375", () => {
  const bmr = bmrMifflin({ sex: "male", weightKg: 101, heightCm: 190, age: 35 }).value;
  near(calcTDEE({ bmr, activityLevel: "high" }).tdee, 3497.4375);
});
test("Mifflin жена използва -161", () => {
  near(bmrMifflin({ sex: "female", weightKg: 60, heightCm: 165, age: 30 }).value, 1320.25);
});

// --- Harris–Benedict ---
test("Harris–Benedict мъж", () => {
  near(bmrHarrisBenedict({ sex: "male", weightKg: 80, heightCm: 180, age: 30 }).value, 1853.63, 0.01);
});

// --- Katch–McArdle ---
test("Katch–McArdle от % телесни мазнини", () => {
  // 80кг, 20% мазнини → LBM 64 → 370 + 21.6*64 = 1752.4
  near(bmrKatchMcArdle({ weightKg: 80, bodyFatPct: 20 }).value, 1752.4);
});
test("Katch пада към Mifflin при липсващи данни", () => {
  assert.equal(calcBMR("katch_mcardle", { sex: "male", weightKg: 80, heightCm: 180, age: 30 }).formula, "mifflin");
});

// --- енергиен баланс ---
test("дефицит 20% от 2500 = 2000", () => near(calcEnergyTarget({ tdee: 2500, mode: "deficit_pct", value: 20 }).target, 2000));
test("дефицит 500 абс. = 2000", () => near(calcEnergyTarget({ tdee: 2500, mode: "deficit_abs", value: 500 }).target, 2000));
test("излишък 300 = 2800", () => near(calcEnergyTarget({ tdee: 2500, mode: "surplus_abs", value: 300 }).target, 2800));
test("ръчна цел пренебрегва TDEE", () => near(calcEnergyTarget({ tdee: 2500, mode: "manual", value: 1800 }).target, 1800));
test("калориите не падат под 0", () => assert.ok(calcEnergyTarget({ tdee: 1000, mode: "deficit_abs", value: 5000 }).target >= 0));

// --- макроси (съвпада с таблицата: 2550 kcal, 30% П, 40% В) ---
test("макроси по % съвпадат с таблицата", () => {
  const m = calcMacros({ calories: 2550, weightKg: 101, spec: { protein: { mode: "pct", value: 30 }, fat: { mode: "pct", value: 30 } } });
  near(m.protein.grams, 191.25); // 2550*0.3/4
  near(m.carbs.grams, 255);      // остатък 40% → 2550*0.4/4
});
test("макроси по g/kg + остатък въглехидрати", () => {
  const m = calcMacros({ calories: 2000, weightKg: 80, spec: { protein: { mode: "g_per_kg", value: 2 }, fat: { mode: "g_per_kg", value: 1 } } });
  near(m.protein.grams, 160); near(m.fat.grams, 80);
  // 160*4 + 80*9 = 640 + 720 = 1360; остатък 640 kcal / 4 = 160 g въгл.
  near(m.carbs.grams, 160);
  near(m.reconciledKcal, 2000);
});

// --- скалиране и сумиране с проследяване на липси ---
test("скалиране на 100g продукт към 150g", () => {
  const s = scaleNutrients({ cal: 100, protein: 10, fiber: null }, 150, "100g");
  near(s.cal, 150); near(s.protein, 15);
  assert.equal(s.fiber, null, "липсващият нутриент остава null, не 0");
});
test("скалиране на продукт на брой", () => near(scaleNutrients({ cal: 69 }, 2, "piece").cal, 138));
test("sumNutrients отчита липсващите стойности", () => {
  const r = sumNutrients([{ cal: 100, iron: 2 }, { cal: 50, iron: null }, { cal: 30 }]);
  near(r.totals.cal, 180); near(r.totals.iron, 2);
  assert.equal(r.missing.iron, 2, "2 записа без желязо");
});

// --- BMI и прогноза ---
test("BMI класификация", () => {
  const r = calcBMI({ weightKg: 101, heightCm: 190 });
  near(r.bmi, 27.98, 0.01); assert.equal(r.band, "overweight");
});
test("прогноза: -500 kcal/ден ≈ -0.4545 кг/седмица", () => {
  near(predictWeeklyWeightChange(-500).kgPerWeek, -0.4545, 0.001);
});

test("round закръгля само за визуализация", () => { assert.equal(round(191.25, 1), 191.3); assert.equal(round(2027.5), 2028); });
