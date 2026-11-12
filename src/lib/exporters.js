// Експорт на седмичен режим: PDF (чрез печат) и Excel (.xlsx), без външни зависимости.
import { round } from "./nutrition.mjs";

const DAYS = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];
const MK = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"];
const zero = () => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
function itemTot(it) { const q = +it.qty || 0, s = it.snapshot || {}, f = it.unit === "serving" || it.unit === "piece" ? q : q / 100; const o = zero(); for (const k of MK) o[k] = (+s[k] || 0) * f; return o; }
const addInto = (a, b) => { for (const k of MK) a[k] += b[k] || 0; return a; };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const uName = (it) => it.foods?.name_bg || it.recipes?.name || it.snapshot?.name || "—";
const uLabel = (u) => (u === "serving" ? "порции" : u === "piece" ? "бр" : "г");

function clientName(c) { return [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Клиент"; }

/* ---------------- PDF (print) ---------------- */
export function exportPlanPDF({ tree, client, target, nutritionist }) {
  const week = zero();
  const dayBlocks = [...tree].sort((a, b) => a.weekday - b.weekday).map((d) => {
    const dayTot = zero();
    const meals = (d.plan_meals || []).map((m) => {
      const mt = zero();
      const rows = (m.plan_meal_items || []).map((it) => {
        const tt = itemTot(it); addInto(mt, tt);
        return `<tr><td>${esc(uName(it))}</td><td class="r">${round(it.qty)} ${uLabel(it.unit)}</td><td class="r">${round(tt.kcal)}</td><td class="r">${round(tt.protein_g)}</td><td class="r">${round(tt.carbs_g)}</td><td class="r">${round(tt.fat_g)}</td></tr>`;
      }).join("");
      addInto(dayTot, mt);
      return `<tr class="meal"><td colspan="2">${esc(m.name)}</td><td class="r">${round(mt.kcal)}</td><td class="r">${round(mt.protein_g)}</td><td class="r">${round(mt.carbs_g)}</td><td class="r">${round(mt.fat_g)}</td></tr>${rows}`;
    }).join("");
    addInto(week, dayTot);
    return `<h3>${DAYS[d.weekday]}</h3>
      <table class="t"><thead><tr><th>Храна</th><th class="r">Кол.</th><th class="r">kcal</th><th class="r">Прот.</th><th class="r">Въгл.</th><th class="r">Мазн.</th></tr></thead>
      <tbody>${meals}<tr class="total"><td colspan="2">Общо за деня</td><td class="r">${round(dayTot.kcal)}</td><td class="r">${round(dayTot.protein_g)}</td><td class="r">${round(dayTot.carbs_g)}</td><td class="r">${round(dayTot.fat_g)}</td></tr></tbody></table>`;
  }).join("");

  const avg = Object.fromEntries(MK.map((k) => [k, week[k] / 7]));
  const tgRow = target ? `<p class="goal">Дневна цел: <b>${round(target.kcal)} kcal</b> · Протеин ${round(target.protein_g)} г · Въглехидрати ${round(target.carbs_g)} г · Мазнини ${round(target.fat_g)} г</p>` : "";

  const html = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>Режим — ${esc(clientName(client))}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17302F;margin:28px;font-size:12px}
    h1{color:#0E5559;margin:0 0 2px} h3{color:#0E5559;margin:16px 0 6px;border-bottom:2px solid #4E9D9A;padding-bottom:3px}
    .sub{color:#6B8785;margin:0 0 10px} .goal{background:#EAF3F1;padding:8px 12px;border-radius:8px}
    table.t{width:100%;border-collapse:collapse;margin-bottom:6px} .t th{background:#0E5559;color:#fff;text-align:left;padding:5px 8px;font-size:11px}
    .t td{padding:4px 8px;border-bottom:1px solid #DBE7E4} .r{text-align:right} .meal td{background:#F0F6F4;font-weight:700;color:#0E5559}
    .total td{background:#EAF3F1;font-weight:700} .foot{margin-top:18px;color:#6B8785;font-size:11px;border-top:1px solid #DBE7E4;padding-top:8px}
    @media print{body{margin:12mm} h3{page-break-after:avoid} table{page-break-inside:avoid}}
  </style></head><body>
    <h1>Хранителен режим</h1>
    <p class="sub">${esc(clientName(client))}${client?.main_goal ? " · цел: " + esc(client.main_goal) : ""} · изготвен от ${esc(nutritionist || "")} · ${new Date().toLocaleDateString("bg-BG")}</p>
    ${tgRow}
    ${dayBlocks}
    <h3>Седмично обобщение</h3>
    <table class="t"><thead><tr><th>Показател</th><th class="r">Средно/ден</th><th class="r">Общо седмица</th></tr></thead><tbody>
      <tr><td>Калории</td><td class="r">${round(avg.kcal)}</td><td class="r">${round(week.kcal)}</td></tr>
      <tr><td>Протеин (г)</td><td class="r">${round(avg.protein_g)}</td><td class="r">${round(week.protein_g)}</td></tr>
      <tr><td>Въглехидрати (г)</td><td class="r">${round(avg.carbs_g)}</td><td class="r">${round(week.carbs_g)}</td></tr>
      <tr><td>Мазнини (г)</td><td class="r">${round(avg.fat_g)}</td><td class="r">${round(week.fat_g)}</td></tr>
      <tr><td>Фибри (г)</td><td class="r">${round(avg.fiber_g)}</td><td class="r">${round(week.fiber_g)}</td></tr>
    </tbody></table>
    <p class="foot">Стойностите са ориентировъчни, изчислени от хранителната база на приложението. Не представляват медицинско предписание. ProNutrition.</p>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Разреши изскачащите прозорци, за да отпечаташ PDF."); return; }
  w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/* ---------------- Excel (.xlsx, минимален OOXML) ---------------- */
export function exportPlanExcel({ tree, client }) {
  const rows = [["Ден", "Хранене", "Храна", "Количество", "Мерна", "kcal", "Протеин", "Въглехидрати", "Мазнини", "Фибри"]];
  [...tree].sort((a, b) => a.weekday - b.weekday).forEach((d) => {
    (d.plan_meals || []).forEach((m) => {
      (m.plan_meal_items || []).forEach((it) => {
        const tt = itemTot(it);
        rows.push([DAYS[d.weekday], m.name, uName(it), round(it.qty), uLabel(it.unit), round(tt.kcal), round(tt.protein_g, 1), round(tt.carbs_g, 1), round(tt.fat_g, 1), round(tt.fiber_g, 1)]);
      });
    });
  });
  downloadXlsx(`rezhim_${clientName(client).replace(/\s+/g, "_")}.xlsx`, "Режим", rows);
}

// Минимален .xlsx генератор (ZIP + OOXML), без библиотеки.
function downloadXlsx(filename, sheetName, rows) {
  const colLetter = (n) => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const cell = (r, c, v) => {
    const ref = colLetter(c) + (r + 1);
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    const s = String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${s}</t></is></c>`;
  };
  const sheetData = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(r, c, v)).join("")}</row>`).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`;
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const files = [
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", rootRels],
    ["xl/workbook.xml", wbXml],
    ["xl/_rels/workbook.xml.rels", wbRels],
    ["xl/worksheets/sheet1.xml", sheetXml],
  ];
  const blob = zipStore(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ZIP без компресия (store), с коректен CRC32 — достатъчно за .xlsx.
function zipStore(files) {
  const enc = new TextEncoder();
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunks = []; const central = []; let offset = 0;
  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  for (const [name, content] of files) {
    const nameBuf = enc.encode(name); const data = enc.encode(content); const crc = crc32(data);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBuf.length), ...u16(0)];
    chunks.push(new Uint8Array(local), nameBuf, data);
    const cen = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBuf.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)];
    central.push(new Uint8Array(cen), nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralStart = offset; let centralSize = 0;
  central.forEach((c) => (centralSize += c.length));
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(centralStart), ...u16(0)];
  return new Blob([...chunks, ...central, new Uint8Array(end)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
