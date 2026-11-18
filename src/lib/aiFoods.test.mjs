import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAiFood } from "./aiFoods.mjs";

test("приема реалистични стойности (киноа, сварена: 120 kcal, 4.4P 21.3C 1.9F)", () => {
  const r = validateAiFood("Киноа, сварена", { kcal: 120, protein_g: 4.4, carbs_g: 21.3, fat_g: 1.9, fiber_g: 2.8 });
  assert.equal(r.ok, true); assert.deepEqual(r.per100g, { kcal: 120, protein_g: 4.4, carbs_g: 21.3, fat_g: 1.9, fiber_g: 2.8 });
});
test("фибрите са по желание; числа като текст се приемат", () => {
  const r = validateAiFood("Авокадо", { kcal: "160", protein_g: "2", carbs_g: "8.5", fat_g: "14.7" });
  assert.equal(r.ok, true); assert.equal(r.per100g.fiber_g, null);
});
test("отхвърля: липсващи стойности, отрицателни, над 900 kcal, макроси > 100 g, несъгласувани калории, празно име", () => {
  assert.match(validateAiFood("X", { kcal: 100, protein_g: 5 }).reason, /липсват/);
  assert.match(validateAiFood("X", { kcal: 100, protein_g: -1, carbs_g: 20, fat_g: 2 }).reason, /липсват/);
  assert.match(validateAiFood("X", { kcal: 950, protein_g: 0, carbs_g: 0, fat_g: 100 }).reason, /900/);
  assert.match(validateAiFood("X", { kcal: 400, protein_g: 60, carbs_g: 50, fat_g: 0 }).reason, /100 g/);
  assert.match(validateAiFood("X", { kcal: 50, protein_g: 20, carbs_g: 20, fat_g: 10 }).reason, /не съвпадат/); // ~250
  assert.equal(validateAiFood("  ", { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }).ok, false);
});
test("зеленчук с малко калории: допустима абсолютна разлика до 30 kcal", () => {
  assert.equal(validateAiFood("Краставица", { kcal: 15, protein_g: 0.7, carbs_g: 3.6, fat_g: 0.1 }).ok, true);
});
