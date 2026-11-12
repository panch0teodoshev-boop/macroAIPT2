/**
 * ProNutrition — ЕДИНЕН ЦЕНТРАЛЕН КАЛКУЛАЦИОНЕН МОДУЛ
 * ====================================================
 * Изискване 14: всички хранителни изчисления минават оттук, без дублиране.
 * Чист JS без зависимости → ползва се във frontend, тестове и edge функции.
 *
 * Принципи:
 *  - пресмятаме на база действителен грамаж;
 *  - пазим точност вътрешно, закръгляме само при визуализация (вж. round());
 *  - енергийни фактори: протеин 4, въглехидрати 4, мазнини 9, алкохол 7 kcal/g;
 *  - всяка формула връща и използваните параметри, за да е проверима.
 */

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, alcohol: 7 };
export const KCAL_PER_KG_BODY = 7700; // приблизителна енергия в 1 кг телесна маса

const num = (v) => (typeof v === "number" && isFinite(v) ? v : NaN);
/**
 * Закръгляне САМО за визуализация: „половинка далеч от нулата" (2.5 → 3, −2.5 → −3),
 * с корекция за двоичното представяне (1.005 → 1.01) и без „−0" в интерфейса.
 */
export const round = (v, d = 0) => {
  if (!isFinite(v)) return 0;
  const f = 10 ** d;
  const r = (Math.sign(v) * Math.round(Math.abs(v) * f * (1 + Number.EPSILON))) / f;
  return r === 0 ? 0 : r;
};

/* ------------------------------------------------------------------ */
/* 1. БАЗАЛЕН МЕТАБОЛИЗЪМ (BMR/RMR)                                     */
/* ------------------------------------------------------------------ */

/** Mifflin–St Jeor (1990) — препоръчван за общата популация. */
export function bmrMifflin({ sex, weightKg, heightCm, age }) {
  const w = num(weightKg), h = num(heightCm), a = num(age);
  const base = 10 * w + 6.25 * h - 5 * a;
  const value = sex === "female" ? base - 161 : base + 5;
  return { formula: "mifflin", value, params: { sex, weightKg: w, heightCm: h, age: a } };
}

/** Harris–Benedict, ревизия Roza & Shizgal (1984). */
export function bmrHarrisBenedict({ sex, weightKg, heightCm, age }) {
  const w = num(weightKg), h = num(heightCm), a = num(age);
  const value = sex === "female"
    ? 447.593 + 9.247 * w + 3.098 * h - 4.33 * a
    : 88.362 + 13.397 * w + 4.799 * h - 5.677 * a;
  return { formula: "harris_benedict", value, params: { sex, weightKg: w, heightCm: h, age: a } };
}

/**
 * Katch–McArdle — изисква чиста телесна маса (LBM).
 * LBM може да се подаде директно или да се изведе от тегло + % телесни мазнини.
 */
export function bmrKatchMcArdle({ weightKg, bodyFatPct, leanMassKg }) {
  let lbm = num(leanMassKg);
  if (!isFinite(lbm)) {
    const w = num(weightKg), bf = num(bodyFatPct);
    lbm = w * (1 - bf / 100);
  }
  return { formula: "katch_mcardle", value: 370 + 21.6 * lbm, params: { leanMassKg: lbm } };
}

/** Диспечер по избрана формула; пада към Mifflin при липсващи данни за Katch. */
export function calcBMR(method, input) {
  switch (method) {
    case "harris_benedict": return bmrHarrisBenedict(input);
    case "katch_mcardle": {
      const r = bmrKatchMcArdle(input);
      const lbm = r.params.leanMassKg;
      if (isFinite(r.value) && isFinite(lbm) && lbm > 0 && lbm <= num(input.weightKg ?? lbm)) return r;
      // липсва/невалидна чиста маса → Mifflin, като изрично отбелязваме подмяната
      return { ...bmrMifflin(input), fallbackFrom: "katch_mcardle" };
    }
    case "mifflin":
    default: return bmrMifflin(input);
  }
}

/* ------------------------------------------------------------------ */
/* 2. ОБЩ ДНЕВЕН ЕНЕРГОРАЗХОД (TDEE)                                    */
/* ------------------------------------------------------------------ */

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  extreme: 1.9,
};

/**
 * TDEE = BMR × фактор на активност.
 * manualFactor разрешава ръчна корекция.
 * Не добавяме отделно тренировъчен разход — факторът вече го включва
 * (изискване: без двойно отчитане).
 */
export function calcTDEE({ bmr, activityLevel, manualFactor }) {
  const factor = isFinite(num(manualFactor))
    ? num(manualFactor)
    : (ACTIVITY_FACTORS[activityLevel] ?? ACTIVITY_FACTORS.sedentary);
  return { tdee: num(bmr) * factor, factor, source: isFinite(num(manualFactor)) ? "manual" : "preset" };
}

/* ------------------------------------------------------------------ */
/* 3. ЕНЕРГИЕН БАЛАНС (цел калории)                                     */
/* ------------------------------------------------------------------ */

/**
 * mode:
 *  - "maintain"        → tdee
 *  - "deficit_pct"     → tdee × (1 - value/100)
 *  - "deficit_abs"     → tdee - value
 *  - "surplus_pct"     → tdee × (1 + value/100)
 *  - "surplus_abs"     → tdee + value
 *  - "manual"          → value (абсолютна цел)
 */
export function calcEnergyTarget({ tdee, mode = "maintain", value = 0 }) {
  const t = num(tdee), v = num(value) || 0;
  let target;
  switch (mode) {
    case "deficit_pct": target = t * (1 - v / 100); break;
    case "deficit_abs": target = t - v; break;
    case "surplus_pct": target = t * (1 + v / 100); break;
    case "surplus_abs": target = t + v; break;
    case "manual": target = v; break;
    case "maintain":
    default: target = t;
  }
  return { target: Math.max(0, target), mode, value: v, deltaVsMaintain: target - t };
}

/* ------------------------------------------------------------------ */
/* 4. МАКРОНУТРИЕНТИ                                                    */
/* ------------------------------------------------------------------ */

/**
 * Протеин и мазнини се задават по g/kg ИЛИ % от калориите.
 * Въглехидратите са остатъкът. Връща грамове, kcal и % за всеки макрос.
 * spec: { protein: {mode:"g_per_kg"|"pct", value}, fat: {...} }
 */
export function calcMacros({ calories, weightKg, spec }) {
  const cal = num(calories), w = num(weightKg);
  const g = (macro, def) => {
    const s = spec?.[macro] ?? def;
    if (s.mode === "g_per_kg") return s.value * w;
    if (s.mode === "pct") return (cal * s.value / 100) / KCAL_PER_G[macro];
    if (s.mode === "grams") return s.value;
    return 0;
  };
  let proteinG = Math.max(0, g("protein", { mode: "g_per_kg", value: 2 }));
  let fatG = Math.max(0, g("fat", { mode: "g_per_kg", value: 1 }));
  const proteinKcal = proteinG * KCAL_PER_G.protein;
  const fatKcal = fatG * KCAL_PER_G.fat;
  const carbsKcal = Math.max(0, cal - proteinKcal - fatKcal);
  const carbsG = carbsKcal / KCAL_PER_G.carbs;
  const pct = (kcal) => (cal > 0 ? (kcal / cal) * 100 : 0);
  return {
    protein: { grams: proteinG, kcal: proteinKcal, pct: pct(proteinKcal) },
    fat: { grams: fatG, kcal: fatKcal, pct: pct(fatKcal) },
    carbs: { grams: carbsG, kcal: carbsKcal, pct: pct(carbsKcal) },
    totalKcal: cal,
    // валидация: сборът от макро-калории срещу зададените калории
    reconciledKcal: proteinKcal + fatKcal + carbsKcal,
    // > 0, когато протеин + мазнини сами надхвърлят калориите (въглехидратите стават 0)
    overAllocatedKcal: Math.max(0, proteinKcal + fatKcal - cal),
  };
}

/* ------------------------------------------------------------------ */
/* 5. ХРАНИТЕЛНИ СТОЙНОСТИ НА ПОРЦИЯ / ХРАНЕНЕ / ДЕН / СЕДМИЦА           */
/* ------------------------------------------------------------------ */

/** Нутриентите в базата са на 100 g (или на 1 бр, ако unit==="piece"). */
export function scaleNutrients(per100, qty, unit = "100g") {
  const factor = unit === "piece" ? num(qty) : num(qty) / 100;
  const out = {};
  for (const k of Object.keys(per100 || {})) {
    const v = num(per100[k]);
    out[k] = isFinite(v) ? v * factor : null; // null = липсва, НЕ 0 (изискване 7)
  }
  return out;
}

/** Събира списък от нутриентни обекти; липсващите стойности се проследяват. */
export function sumNutrients(items) {
  const keys = new Set();
  for (const it of items) for (const k of Object.keys(it || {})) keys.add(k);
  const totals = {};
  const missing = {}; // брой записи без валидна стойност за даден нутриент
  let count = 0;
  for (const it of items) {
    count++;
    for (const k of keys) {
      const v = it ? it[k] : undefined;
      if (v == null || !isFinite(v)) { missing[k] = (missing[k] || 0) + 1; continue; }
      totals[k] = (totals[k] || 0) + v;
    }
  }
  return { totals, missing, count };
}

/** BMI с ясни граници за интерпретация (без да е диагноза). */
export function calcBMI({ weightKg, heightCm }) {
  const w = num(weightKg), h = num(heightCm) / 100;
  const bmi = h > 0 ? w / (h * h) : NaN;
  let band = "unknown";
  if (isFinite(bmi)) {
    if (bmi < 18.5) band = "underweight";
    else if (bmi < 25) band = "normal";
    else if (bmi < 30) band = "overweight";
    else band = "obese";
  }
  return { bmi, band, note: "BMI не отчита телесен състав; ориентир, не диагноза." };
}

/** Ориентировъчна седмична промяна на теглото при даден дневен баланс. */
export function predictWeeklyWeightChange(dailyKcalDelta) {
  const d = num(dailyKcalDelta);
  return {
    kgPerWeek: (d * 7) / KCAL_PER_KG_BODY,
    assumption: `~${KCAL_PER_KG_BODY} kcal ≈ 1 кг; ориентировъчно, индивидуални разлики.`,
  };
}
