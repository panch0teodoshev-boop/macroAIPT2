import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseInline } from "./markdown.mjs";

test("вградено: удебелено, курсив, код; аритметика и snake_case не стават курсив", () => {
  assert.deepEqual(parseInline("**2 яйца** + *чушка* и `код`"), [
    { t: "b", c: [{ t: "text", v: "2 яйца" }] }, { t: "text", v: " + " }, { t: "i", c: [{ t: "text", v: "чушка" }] },
    { t: "text", v: " и " }, { t: "code", v: "код" },
  ]);
  assert.deepEqual(parseInline("5 * 3 * 2"), [{ t: "text", v: "5 * 3 * 2" }]);
  assert.deepEqual(parseInline("protein_g и fat_g"), [{ t: "text", v: "protein_g и fat_g" }]);
  assert.deepEqual(parseInline("~300 ккал | ~18г"), [{ t: "text", v: "~300 ккал | ~18г" }]);
});
test("отговор като на снимката: заглавия, линия, удебелен ред, обикновен ред", () => {
  const b = parseMarkdown("# 6 идеи за закуски\n\nЕто варианти.\n\n---\n\n## 1. Бъркани яйца\n**2 яйца + чушка**\n~300 ккал | ~18г протеин");
  assert.deepEqual(b.map((x) => x.t), ["h", "p", "hr", "h", "p"]);
  assert.equal(b[0].level, 1); assert.equal(b[3].level, 2);
  assert.equal(b[4].lines.length, 2, "двата реда остават отделни редове в параграфа");
  assert.equal(b[4].lines[0][0].t, "b");
});
test("списъци: неномериран, номериран с начало, подточки, продължение на ред", () => {
  const b = parseMarkdown("- едно\n- две\n  - подточка\n\n3. трето\n4. четвърто\n   продължение");
  assert.equal(b[0].t, "ul"); assert.equal(b[0].items.length, 3); assert.equal(b[0].items[2].sub, true);
  assert.equal(b[1].t, "ol"); assert.equal(b[1].start, 3);
  assert.deepEqual(b[1].items[1].c.map((x) => x.v).join(""), "четвърто продължение");
});
test("таблица и цитат; код блок се пази буквално", () => {
  const b = parseMarkdown("| Храна | kcal |\n|---|---:|\n| Ориз | 130 |\n| **Пиле** | 165 |\n\n> бележка\n\n```\n**не се форматира**\n```");
  assert.equal(b[0].t, "table"); assert.equal(b[0].head.length, 2); assert.equal(b[0].rows.length, 2);
  assert.equal(b[0].rows[1][0][0].t, "b");
  assert.equal(b[1].t, "quote");
  assert.deepEqual(b[2], { t: "pre", v: "**не се форматира**" });
});
test("HTML остава текст (без изпълнение); празен вход", () => {
  const b = parseMarkdown("<script>alert(1)</script> **x**");
  assert.equal(b[0].lines[0][0].v, "<script>alert(1)</script> ");
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseMarkdown(null), []);
});
