/**
 * Храни, предложени от AI извън базата. Стойностите им идват от модела, затова:
 * - приемат се само ако са физически възможни и вътрешно съгласувани (калории ≈ 4/4/9 от макросите);
 * - в режима се маркират със source: "ai", за да се вижда, че не са проверени.
 */
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

/** Връща { ok: true, per100g } или { ok: false, reason }. */
export function validateAiFood(name, per100g) {
  const n = String(name ?? "").trim();
  if (!n || n.length > 60) return { ok: false, reason: "невалидно име" };
  const p = per100g || {};
  const v = { kcal: num(p.kcal), protein_g: num(p.protein_g), carbs_g: num(p.carbs_g), fat_g: num(p.fat_g), fiber_g: num(p.fiber_g) };
  for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"]) if (!(isFinite(v[k]) && v[k] >= 0)) return { ok: false, reason: "липсват стойности" };
  if (!(isFinite(v.fiber_g) && v.fiber_g >= 0)) v.fiber_g = null; // фибрите са по желание
  if (v.kcal > 900) return { ok: false, reason: "над 900 kcal на 100 g" };
  if (v.protein_g + v.carbs_g + v.fat_g > 100.5) return { ok: false, reason: "макросите надхвърлят 100 g" };
  const est = 4 * v.protein_g + 4 * v.carbs_g + 9 * v.fat_g;
  if (Math.abs(est - v.kcal) > Math.max(30, 0.2 * Math.max(est, v.kcal))) return { ok: false, reason: `калориите (${Math.round(v.kcal)}) не съвпадат с макросите (~${Math.round(est)})` };
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return { ok: true, name: n, per100g: { kcal: r1(v.kcal), protein_g: r1(v.protein_g), carbs_g: r1(v.carbs_g), fat_g: r1(v.fat_g), fiber_g: r1(v.fiber_g) } };
}
