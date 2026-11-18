/**
 * Минимален и безопасен парсер на Markdown за отговорите на AI асистента.
 * Връща дърво от обикновени обекти (без HTML низове) — интерфейсът ги превръща в React елементи,
 * така че текст като <script> винаги се показва като текст (без dangerouslySetInnerHTML).
 *
 * Блокове: заглавия (#..######), хоризонтална линия (---), списъци (-, *, +, 1.), таблици (| a | b |),
 *          цитати (>), код (```), параграфи. Вградено: **удебелено**, *курсив* / _курсив_, `код`.
 */

/** Вграден текст → [{t:"text"|"b"|"i"|"code", v | c:[...]}] */
export function parseInline(s) {
  const out = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) { flush(); out.push({ t: "code", v: s.slice(i + 1, j) }); i = j + 1; continue; }
    }
    if ((ch === "*" || ch === "_") && s[i + 1] === ch) {
      const j = s.indexOf(ch + ch, i + 2);
      if (j > i + 2) { flush(); out.push({ t: "b", c: parseInline(s.slice(i + 2, j)) }); i = j + 2; continue; }
    }
    if (ch === "*" || ch === "_") {
      // курсив само ако след отварящия знак има не-интервал и има затварящ (не е „5 * 3“ или snake_case)
      const prevWord = i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1]);
      const j = s.indexOf(ch, i + 1);
      if (!prevWord && j > i + 1 && s[i + 1] !== " " && s[j - 1] !== " " && !(j + 1 < s.length && /[\p{L}\p{N}]/u.test(s[j + 1]))) {
        flush(); out.push({ t: "i", c: parseInline(s.slice(i + 1, j)) }); i = j + 1; continue;
      }
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => parseInline(c.trim()));
const listItem = (l) => {
  const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
  return m ? { indent: m[1].length, ordered: /\d/.test(m[2]), start: /\d/.test(m[2]) ? parseInt(m[2], 10) : 1, text: m[3] } : null;
};

/** Текст → блокове [{t:"h",level,c}|{t:"p",lines:[[inline]]}|{t:"ul"|"ol",start,items:[[inline]]}|{t:"hr"}|{t:"table",head,rows}|{t:"quote",lines}|{t:"pre",v}] */
export function parseMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*```/.test(l)) {
      const body = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++; blocks.push({ t: "pre", v: body.join("\n") }); continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) { blocks.push({ t: "h", level: h[1].length, c: parseInline(h[2]) }); i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { blocks.push({ t: "hr" }); i++; continue; }
    if (isTableRow(l) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l); const rows = []; i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ t: "table", head, rows }); continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(parseInline(lines[i++].replace(/^\s*>\s?/, "")));
      blocks.push({ t: "quote", lines: q }); continue;
    }
    const li = listItem(l);
    if (li) {
      const ordered = li.ordered, items = [];
      while (i < lines.length) {
        const cur = listItem(lines[i]);
        if (cur && cur.ordered === ordered) { items.push({ c: parseInline(cur.text), sub: cur.indent >= 2 }); i++; continue; }
        if (cur && cur.ordered !== ordered && cur.indent >= 2) { items.push({ c: parseInline(cur.text), sub: true }); i++; continue; }
        // продължение на елемента на следващ ред (с отстъп)
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].c.push({ t: "text", v: " " }, ...parseInline(lines[i].trim())); i++; continue; }
        break;
      }
      blocks.push({ t: ordered ? "ol" : "ul", start: li.start, items }); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s{0,3}#{1,6}\s/.test(lines[i]) && !listItem(lines[i]) && !/^\s*```/.test(lines[i]) && !/^\s*>/.test(lines[i])
      && !/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(lines[i]) && !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(parseInline(lines[i].trim())); i++;
    }
    blocks.push({ t: "p", lines: para });
  }
  return blocks;
}
