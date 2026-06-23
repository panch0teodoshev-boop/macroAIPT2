import { ACTIVITY, DAYS_BG, GOALS, MONTHS_BG } from "../constants";
import { DiaryEntry, Macros, Plan, Product, Profile, Totals } from "../types";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

// Mifflin–St Jeor
export function mifflinBMR(p: Profile): number {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return p.sex === "female" ? base - 161 : base + 5;
}

export function computePlan(profile: Profile, macros: Macros): Plan {
  const bmr = mifflinBMR(profile);
  const mult = ACTIVITY.find((a) => a.id === profile.activity)?.mult ?? 1.2;
  const tdee = bmr * mult;
  let calories: number;
  if (profile.manualCalories != null) {
    calories = profile.manualCalories;
  } else {
    const delta = GOALS.find((g) => g.id === profile.goal)?.delta ?? 0;
    calories = tdee + delta;
  }
  calories = Math.max(0, Math.round(calories));
  return {
    bmr,
    tdee,
    calories,
    protein: (calories * macros.protein) / 100 / 4,
    carbs: (calories * macros.carbs) / 100 / 4,
    fat: (calories * macros.fat) / 100 / 9,
  };
}

// "1/2", "3/4", "1.5", "2 бр" -> число
export function parseQty(s: string | number): number {
  if (typeof s === "number") return s;
  if (s == null) return 0;
  const clean = String(s).replace(",", ".").replace(/[^0-9./]/g, "");
  if (clean.includes("/")) {
    const [a, b] = clean.split("/");
    const n = parseFloat(a) / parseFloat(b);
    return isFinite(n) ? n : 0;
  }
  const n = parseFloat(clean);
  return isFinite(n) ? n : 0;
}

// За продукти на 100 г количеството (qty) е в ГРАМОВЕ → коефициент = грамове / 100.
// За продукти "на брой" qty е броят парчета.
export function entryFactor(product: Product, qty: number): number {
  return product.unit === "piece" ? qty : qty / 100;
}
export function entryTotals(entry: DiaryEntry, products: Product[]): Totals {
  const p = products.find((x) => x.id === entry.productId);
  if (!p) return { cal: 0, protein: 0, carbs: 0, fat: 0 };
  const f = entryFactor(p, entry.qty);
  return { cal: p.cal * f, protein: p.protein * f, carbs: p.carbs * f, fat: p.fat * f };
}
export const defaultAmount = (p: Product): number => (p.unit === "piece" ? 1 : 100);
export const amountLabel = (p: Product, qty: number): string => (p.unit === "piece" ? `${fmt(qty)} бр` : `${fmt(qty, 0)} г`);
export const clampGrams = (n: number): number => Math.min(200, Math.max(1, Math.round(n)));

export function sumTotals(list: Totals[]): Totals {
  return list.reduce(
    (a, b) => ({ cal: a.cal + b.cal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }),
    { cal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// --- форматиране ---
export function round(n: number, d = 1): number {
  const m = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * m) / m;
}
export function fmt(n: number, d = 1): string {
  if (n == null || isNaN(n)) return "0";
  const r = round(n, d);
  return Number.isInteger(r) ? String(r) : String(r);
}
export const unitLabel = (u: string) => (u === "piece" ? "1 бр" : "100 g");

// --- дати ---
export function iso(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function addDays(d: Date | string, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function mondayOf(d: Date | string): Date {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7; // 0 = понеделник
  return addDays(x, -wd);
}
export function longDate(d: Date | string): string {
  const x = new Date(d);
  return `${DAYS_BG[(x.getDay() + 6) % 7]}, ${x.getDate()} ${MONTHS_BG[x.getMonth()]}`;
}
