import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMeasurement, seriesOf, trend, isIsoDate, todayIso, isLatest, daysBetween } from "./measurements.mjs";

const NOW = new Date(2026, 10, 18, 12, 0, 0); // 18 ноември 2026, местно време

test("дата: валидна, несъществуваща, грешен формат", () => {
  assert.equal(isIsoDate("2026-11-18"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("18.11.2026"), false);
  assert.equal(todayIso(NOW), "2026-11-18");
});

test("валидиране: празните полета са null, не 0; запетая като десетичен знак; закръгляне до 0.1", () => {
  const { row, errors } = validateMeasurement({ measured_on: "2026-11-18", weight_kg: "82,46", waist_cm: "", body_fat_pct: " " }, NOW);
  assert.deepEqual(errors, []);
  assert.equal(row.weight_kg, 82.5);
  assert.equal(row.waist_cm, null); assert.equal(row.body_fat_pct, null); assert.equal(row.lean_mass_kg, null);
});

test("валидиране: извън диапазона, бъдеща дата, нищо въведено", () => {
  assert.match(validateMeasurement({ measured_on: "2026-11-18", weight_kg: "820" }, NOW).errors.join(), /Тегло: между 25 и 350 кг/);
  assert.match(validateMeasurement({ measured_on: "2026-11-19", weight_kg: "80" }, NOW).errors.join(), /бъдещето/);
  assert.match(validateMeasurement({ measured_on: "2026-11-18" }, NOW).errors.join(), /поне една стойност/);
  assert.match(validateMeasurement({ measured_on: "", weight_kg: "80" }, NOW).errors.join(), /валидна дата/);
  assert.match(validateMeasurement({ measured_on: "2026-11-18", body_fat_pct: "abc" }, NOW).errors.join(), /Телесни мазнини/);
  assert.equal(validateMeasurement({ measured_on: "2026-11-18", weight_kg: "820" }, NOW).row, null);
});

test("серия: само измерените стойности, подредени по дата; числа от базата като низове", () => {
  const list = [
    { id: "3", measured_on: "2026-11-15", weight_kg: "81.0", waist_cm: null },
    { id: "1", measured_on: "2026-10-01", weight_kg: 85, waist_cm: 92 },
    { id: "2", measured_on: "2026-10-20", weight_kg: null, waist_cm: 90 },
  ];
  assert.deepEqual(seriesOf(list, "weight_kg").map((p) => [p.date, p.value]), [["2026-10-01", 85], ["2026-11-15", 81]]);
  assert.deepEqual(seriesOf(list, "waist_cm").map((p) => p.value), [92, 90]);
});

test("тенденция: промяна и средно на седмица; под 7 дни без седмична скорост; една точка → null", () => {
  // 85 → 81 кг за 45 дни: −4 / 45 · 7 = −0.6222 кг/седмица
  const t = trend([{ date: "2026-10-01", value: 85 }, { date: "2026-11-15", value: 81 }]);
  assert.equal(t.change, -4); assert.equal(t.days, 45);
  assert.ok(Math.abs(t.perWeek - (-4 / 45) * 7) < 1e-12);
  assert.equal(trend([{ date: "2026-11-10", value: 80 }, { date: "2026-11-13", value: 79 }]).perWeek, null);
  assert.equal(trend([{ date: "2026-11-10", value: 80 }]), null);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2, "смяната на часовото време не променя броя дни");
});

test("най-ново измерване: само то обновява профила", () => {
  const list = [{ measured_on: "2026-11-01" }, { measured_on: "2026-11-10" }];
  assert.equal(isLatest("2026-11-12", list), true);
  assert.equal(isLatest("2026-11-10", list), true);
  assert.equal(isLatest("2026-11-05", list), false);
  assert.equal(isLatest("2026-11-05", []), true);
});
