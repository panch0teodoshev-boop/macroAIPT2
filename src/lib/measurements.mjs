// Мерки на клиента: валидиране на въвеждането, серии за графика и тенденция.
// Чисти функции без зависимости — тествани в measurements.test.mjs.

export const METRICS = [
  { key: "weight_kg", label: "Тегло", unit: "кг", min: 25, max: 350 },
  { key: "body_fat_pct", label: "Телесни мазнини", unit: "%", min: 2, max: 70 },
  { key: "lean_mass_kg", label: "Чиста маса", unit: "кг", min: 10, max: 200 },
  { key: "skeletal_muscle_kg", label: "Скелетна мускулна маса", unit: "кг", min: 5, max: 150 },
  { key: "waist_cm", label: "Талия", unit: "см", min: 30, max: 250 },
];

const num = (v) => {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
};

/** Дата във формат ГГГГ-ММ-ДД, която съществува в календара. */
export function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/** Локална дата днес като ГГГГ-ММ-ДД (не UTC — вечер в България UTC е още вчера). */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Форма → ред за client_measurements. Празно поле = не е измерено (null, не 0).
 * Връща { row, errors }; при грешки row е null.
 */
export function validateMeasurement(form, now = new Date()) {
  const errors = [];
  const date = String(form?.measured_on || "").trim();
  if (!isIsoDate(date)) errors.push("Въведи валидна дата.");
  else if (date > todayIso(now)) errors.push("Датата не може да е в бъдещето.");
  const row = { measured_on: date };
  let any = false;
  for (const m of METRICS) {
    const raw = form?.[m.key];
    const v = num(raw);
    if (raw === undefined || raw === null || String(raw).trim() === "") { row[m.key] = null; continue; }
    if (!isFinite(v) || v < m.min || v > m.max) { errors.push(`${m.label}: между ${m.min} и ${m.max} ${m.unit}.`); continue; }
    row[m.key] = Math.round(v * 10) / 10; // колоните са numeric(·,1)
    any = true;
  }
  if (!any && errors.length === 0) errors.push("Въведи поне една стойност.");
  return errors.length ? { row: null, errors } : { row, errors };
}

/** Серия за една мярка: само измерените стойности, подредени по дата (най-старата първа). */
export function seriesOf(list, key) {
  return (list || [])
    .map((r) => ({ date: r.measured_on, value: num(r[key]), id: r.id }))
    .filter((p) => isIsoDate(p.date) && isFinite(p.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id ?? "") < String(b.id ?? "") ? -1 : 1));
}

const DAY = 86400000;
export const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/**
 * Тенденция от първото до последното измерване. perWeek се дава само при поне 7 дни
 * разстояние — по-кратък период дава подвеждащо голяма седмична скорост.
 */
export function trend(series) {
  if (!series || series.length < 2) return null;
  const first = series[0], last = series[series.length - 1];
  const days = daysBetween(first.date, last.date);
  const change = last.value - first.value;
  return { first, last, change, days, perWeek: days >= 7 ? (change / days) * 7 : null };
}

/** Дали записът е най-новият (или на същата дата като най-новия) — тогава може да обнови профила. */
export function isLatest(date, list) {
  return (list || []).every((r) => !isIsoDate(r.measured_on) || r.measured_on <= date);
}
