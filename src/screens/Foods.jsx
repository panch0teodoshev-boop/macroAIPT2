import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";
import { useViewport } from "../ui/useViewport.js";
import { scaleNutrients, sumNutrients, round } from "../lib/nutrition.mjs";
import { servingsOf, parseQty } from "../lib/planMath.mjs";

const MACRO_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "satfat_g"];
const per100of = (f) => Object.fromEntries(MACRO_KEYS.map((k) => [k, f[k] == null || f[k] === "" ? null : Number(f[k])]));

export default function Foods() {
  const [tab, setTab] = useState("foods");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0, color: t.ink, flex: 1 }}>База и рецепти</h2>
        <div style={{ display: "inline-flex", background: t.tealPale, borderRadius: 10, padding: 3 }}>
          {[["foods", "Храни"], ["recipes", "Рецепти"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 13.5, background: tab === id ? "#fff" : "transparent", color: tab === id ? t.tealDark : t.muted }}>{lbl}</button>
          ))}
        </div>
      </div>
      {tab === "foods" ? <FoodsList /> : <Recipes />}
    </div>
  );
}

function FoodsList() {
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("foods")
      .select("id, owner_id, name_bg, name_en, category, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g")
      .eq("archived", false).order("name_bg").limit(2000);
    setErr(error ? "Храните не можаха да се заредят: " + error.message : "");
    setRows(data || []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => ["all", ...Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort()], [rows]);
  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    return (cat === "all" || r.category === cat) && (!s || (r.name_bg + " " + (r.name_en || "")).toLowerCase().includes(s));
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${t.line}`, borderRadius: 10, padding: "0 12px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси храна (BG/EN)…" style={{ border: "none", outline: "none", fontSize: 14, padding: "10px 0", flex: 1, background: "transparent", color: t.ink }} />
        </div>
        <Select value={cat} onChange={setCat} style={{ width: "auto", minWidth: 160 }} options={cats.map((c) => ({ value: c, label: c === "all" ? "Всички категории" : c }))} />
        <Button onClick={() => setAdding(true)}>+ Нов продукт</Button>
      </div>
      {err && <Card style={{ color: t.warn }}>{err}</Card>}
      <div style={{ fontSize: 12.5, color: t.muted }}>{loading ? "Зареждане…" : `${filtered.length} от ${rows.length} храни · стойности на 100 г (или на брой)${filtered.length > 500 ? " · показани са първите 500 — стесни търсенето" : ""}`}</div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: t.tealDark, color: "#fff", textAlign: "left" }}>
                <th style={th}>Храна</th><th style={th}>Категория</th><th style={thC}>kcal</th><th style={thC}>Прот.</th><th style={thC}>Въгл.</th><th style={thC}>Мазн.</th><th style={thC}>Фибри</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 ? t.tealPale : "#fff" }}>
                  <td style={td}>{r.name_bg} {r.owner_id && <span style={{ color: t.coral, fontSize: 11 }}>(мой)</span>}<div style={{ fontSize: 11, color: t.muted }}>{r.name_en}</div></td>
                  <td style={tdm}>{r.category}</td>
                  <td style={tdC}><b>{dash(r.kcal, 0)}</b></td><td style={tdC}>{dash(r.protein_g)}</td><td style={tdC}>{dash(r.carbs_g)}</td><td style={tdC}>{dash(r.fat_g)}</td><td style={tdC}>{dash(r.fiber_g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {adding && <FoodForm ownerId={session.user.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function FoodForm({ ownerId, onClose, onSaved }) {
  const [f, setF] = useState({ name_bg: "", name_en: "", category: "", unit: "100g", kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", sugar_g: "", satfat_g: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const num = (v) => (v === "" ? null : Number(String(v).replace(",", ".")));
  const save = async () => {
    if (busy) return;
    if (!f.name_bg.trim() || f.kcal === "") { setErr("Име и калории са задължителни."); return; }
    const vals = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "satfat_g"].map((k) => num(f[k]));
    if (vals.some((v) => v != null && (!isFinite(v) || v < 0))) { setErr("Стойностите трябва да са неотрицателни числа."); return; }
    if (f.unit === "100g" && [1, 2, 3].some((i) => vals[i] != null && vals[i] > 100)) { setErr("Протеин, въглехидрати и мазнини не могат да надвишават 100 г на 100 г продукт."); return; }
    // сверка: калориите от макросите (4/4/9) спрямо въведените — хваща грешки при въвеждане
    if (vals[1] != null && vals[2] != null && vals[3] != null) {
      const est = 4 * vals[1] + 4 * vals[2] + 9 * vals[3];
      if (Math.abs(est - vals[0]) > Math.max(25, 0.25 * est) && !confirm(`Въведени са ${vals[0]} kcal, а от макросите излизат около ${Math.round(est)} kcal. Да запиша ли въпреки разликата?`)) return;
    }
    setBusy(true); setErr("");
    const { error } = await supabase.from("foods").insert({
      owner_id: ownerId, name_bg: f.name_bg.trim(), name_en: f.name_en.trim() || null, category: f.category.trim() || null, unit: f.unit,
      kcal: num(f.kcal), protein_g: num(f.protein_g), carbs_g: num(f.carbs_g), fat_g: num(f.fat_g), fiber_g: num(f.fiber_g), sugar_g: num(f.sugar_g), satfat_g: num(f.satfat_g), source: "Собствен",
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };
  return (
    <Modal title="Нов продукт" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Име (BG) *"><Input value={f.name_bg} onChange={(e) => set("name_bg", e.target.value)} /></Field>
        <Field label="Име (EN)"><Input value={f.name_en} onChange={(e) => set("name_en", e.target.value)} /></Field>
        <Field label="Категория"><Input value={f.category} onChange={(e) => set("category", e.target.value)} /></Field>
        <Field label="Мерна единица"><Select value={f.unit} onChange={(v) => set("unit", v)} options={[{ value: "100g", label: "на 100 г" }, { value: "piece", label: "на брой" }]} /></Field>
        <Field label="Калории *"><Input type="number" value={f.kcal} onChange={(e) => set("kcal", e.target.value)} /></Field>
        <Field label="Протеин (г)"><Input type="number" value={f.protein_g} onChange={(e) => set("protein_g", e.target.value)} /></Field>
        <Field label="Въглехидрати (г)"><Input type="number" value={f.carbs_g} onChange={(e) => set("carbs_g", e.target.value)} /></Field>
        <Field label="Мазнини (г)"><Input type="number" value={f.fat_g} onChange={(e) => set("fat_g", e.target.value)} /></Field>
        <Field label="Фибри (г)"><Input type="number" value={f.fiber_g} onChange={(e) => set("fiber_g", e.target.value)} /></Field>
        <Field label="Захари (г)"><Input type="number" value={f.sugar_g} onChange={(e) => set("sugar_g", e.target.value)} /></Field>
        <Field label="Наситени мазн. (г)"><Input type="number" value={f.satfat_g} onChange={(e) => set("satfat_g", e.target.value)} /></Field>
      </div>
      {err && <div style={{ color: t.warn, fontSize: 13, margin: "8px 0" }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Button variant="ghost" onClick={onClose}>Отказ</Button>
        <Button onClick={save} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Запази"}</Button>
      </div>
    </Modal>
  );
}

/* ---------------- Рецепти ---------------- */
function Recipes() {
  const { session } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: rs, error: e1 }, { data: fs }] = await Promise.all([
      supabase.from("recipes").select("id, owner_id, name, category, servings, notes, recipe_ingredients(id, qty, unit, snapshot, foods(name_bg))").order("created_at", { ascending: false }),
      supabase.from("foods").select("id, name_bg, name_en, unit, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g").eq("archived", false).order("name_bg").limit(2000),
    ]);
    if (e1) setErr("Рецептите не можаха да се заредят: " + e1.message);
    setRecipes(rs || []); setFoods(fs || []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const calc = (r) => {
    const items = (r.recipe_ingredients || []).map((ing) => scaleNutrients(macrosOnly(ing.snapshot), Number(ing.qty), ing.unit));
    const { totals, missing } = sumNutrients(items);
    const s = servingsOf(r.servings); // дробни порции са валидни (напр. 0.5)
    const incomplete = ["kcal", "protein_g", "carbs_g", "fat_g"].some((k) => missing[k] > 0);
    return { totals, incomplete, per: Object.fromEntries(MACRO_KEYS.map((k) => [k, (totals[k] || 0) / s])) };
  };
  const remove = async (r) => {
    if (!confirm(`Да изтрия рецептата „${r.name}"? Вече добавените в режими порции запазват стойностите си.`)) return;
    const { error } = await supabase.from("recipes").delete().eq("id", r.id);
    if (error) { setErr(error.message.includes("plan_meal_items_check") ? "Рецептата се използва в режим и не може да се изтрие, докато не се приложи миграция 0004." : "Изтриването не успя: " + error.message); return; }
    setErr(""); load();
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={() => setCreating(true)}>+ Нова рецепта</Button>
      </div>
      {err && <Card role="alert" style={{ color: t.warn }}>{err}</Card>}
      {loading ? <Card>Зареждане…</Card> : recipes.length === 0 ? <Card style={{ color: t.muted }}>Още няма рецепти. Създай първата.</Card> : (
        <div style={{ display: "grid", gap: 10 }}>
          {recipes.map((r) => {
            const c = calc(r);
            const mine = r.owner_id === session.user.id;
            const ingLine = (r.recipe_ingredients || [])
              .map((ing) => `${ing.foods?.name_bg || ing.snapshot?.name || "?"} ${round(ing.qty)}${ing.unit === "piece" ? " бр" : " г"}`)
              .join(" · ");
            return (
              <Card key={r.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: t.ink, fontSize: 15 }}>
                      {r.name} {!mine && <span style={{ background: t.tealPale, color: t.tealDark, borderRadius: 20, padding: "2px 9px", fontSize: 10.5, fontWeight: 700, verticalAlign: "middle" }}>Библиотека</span>}
                    </div>
                    <div style={{ fontSize: 12, color: t.muted }}>{r.category || "—"} · {r.servings} порции · {(r.recipe_ingredients || []).length} съставки</div>
                  </div>
                  {mine && <button onClick={() => remove(r)} style={{ border: "none", background: "none", color: t.muted, cursor: "pointer" }}>Изтрий</button>}
                </div>
                {ingLine && <div style={{ fontSize: 13, color: t.ink, marginTop: 10, background: t.bg, border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 12px" }}>
                  <span style={{ fontWeight: 700, color: t.muted }}>Съставки: </span>{ingLine}
                </div>}
                <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 13 }}>
                  <Nut label="За порция" v={c.per} accent />
                  <Nut label="Общо" v={c.totals} />
                </div>
                {c.incomplete && <div style={{ fontSize: 12, color: t.warn, marginTop: 6 }}>⚠️ Някои съставки нямат пълни данни — стойностите са долна граница.</div>}
                {r.notes && <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", color: t.tealDark, fontWeight: 700, fontSize: 13 }}>Приготвяне</summary>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: t.ink, marginTop: 6, lineHeight: 1.5 }}>{r.notes}</div>
                </details>}
              </Card>
            );
          })}
        </div>
      )}
      {creating && <RecipeForm ownerId={session.user.id} foods={foods} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function Nut({ label, v, accent }) {
  return (
    <div style={{ background: accent ? t.tealPale : "#fff", border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.muted }}>{label}</div>
      <div style={{ color: t.ink }}><b style={{ color: accent ? t.coral : t.tealDark }}>{round(v.kcal || 0)}</b> kcal · П {round(v.protein_g || 0, 1)} · В {round(v.carbs_g || 0, 1)} · М {round(v.fat_g || 0, 1)} · Фибри {round(v.fiber_g || 0, 1)}</div>
    </div>
  );
}

function RecipeForm({ ownerId, foods, onClose, onSaved }) {
  const { isMobile } = useViewport();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [servings, setServings] = useState(1);
  const [notes, setNotes] = useState("");
  const [ings, setIngs] = useState([]); // {food, qty}
  const [q, setQ] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const found = q.trim() ? foods.filter((f) => (f.name_bg + " " + (f.name_en || "")).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const totals = sumNutrients(ings.map((it) => scaleNutrients(per100of(it.food), parseQty(it.qty) ?? 0, it.food.unit))).totals;
  const sv = parseQty(servings, 999);
  const per = Object.fromEntries(MACRO_KEYS.map((k) => [k, (totals[k] || 0) / servingsOf(sv)]));

  const save = async () => {
    if (busy) return;
    if (!name.trim() || ings.length === 0) { setErr("Име и поне една съставка са нужни."); return; }
    if (sv == null || sv <= 0) { setErr("Порциите трябва да са число над 0 (може и дробно, напр. 0.5)."); return; }
    const bad = ings.find((it) => { const q = parseQty(it.qty); return q == null || q <= 0; });
    if (bad) { setErr(`Невалидно количество за „${bad.food.name_bg}" — въведи число над 0.`); return; }
    setBusy(true); setErr("");
    const { data: rec, error: e1 } = await supabase.from("recipes").insert({ owner_id: ownerId, name: name.trim(), category: category.trim() || null, servings: sv, notes: notes.trim() || null }).select("id").single();
    if (e1) { setErr(e1.message); setBusy(false); return; }
    const payload = ings.map((it) => ({ recipe_id: rec.id, food_id: it.food.id, qty: parseQty(it.qty), unit: it.food.unit, snapshot: { ...per100of(it.food), name: it.food.name_bg } }));
    const { error: e2 } = await supabase.from("recipe_ingredients").insert(payload);
    if (e2) {
      await supabase.from("recipes").delete().eq("id", rec.id); // без „празна" рецепта при неуспех на съставките
      setBusy(false); setErr("Записът на съставките не успя: " + e2.message); return;
    }
    setBusy(false);
    onSaved();
  };

  return (
    <Modal title="Нова рецепта" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 120px", gap: 10 }}>
        <Field label="Име *"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Категория"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="напр. Обяд" /></Field>
        <Field label="Порции"><Input type="number" min={0.1} step="any" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
      </div>
      <Field label="Приготвяне (стъпки)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder={"1) ...\n2) ..."} style={{ width: "100%", fontFamily: "inherit", fontSize: 14, color: t.ink, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 12px", outline: "none", resize: "vertical" }} /></Field>

      <div style={{ fontWeight: 700, color: t.ink, margin: "6px 0" }}>Съставки</div>
      {ings.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
          <span style={{ flex: 1, fontSize: 13.5, color: t.ink }}>{it.food.name_bg}</span>
          <Input type="number" value={it.qty} onChange={(e) => setIngs((a) => a.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} style={{ width: 80, textAlign: "center" }} />
          <span style={{ fontSize: 11, color: t.muted, width: 26 }}>{it.food.unit === "piece" ? "бр" : "г"}</span>
          <button onClick={() => setIngs((a) => a.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: t.muted, cursor: "pointer" }}>✕</button>
        </div>
      ))}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Добави съставка — търси храна…" style={{ marginTop: 8 }} />
      {found.map((f) => (
        <button key={f.id} onClick={() => { setIngs((a) => [...a, { food: f, qty: f.unit === "piece" ? 1 : 100 }]); setQ(""); }}
          style={{ width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${t.line}`, background: t.tealPale, padding: "9px 10px", cursor: "pointer", fontSize: 13.5, color: t.ink, display: "flex", justifyContent: "space-between" }}>
          <span>{f.name_bg}</span><span style={{ color: t.muted, fontSize: 12 }}>{round(f.kcal)} kcal/100г</span>
        </button>
      ))}

      <Card style={{ background: t.tealPale, border: "none", marginTop: 12 }}>
        <div style={{ fontSize: 12.5, color: t.tealDark, fontWeight: 700 }}>Изчислено</div>
        <div style={{ fontSize: 13.5, color: t.ink, marginTop: 4 }}>За порция: <b style={{ color: t.coral }}>{round(per.kcal)}</b> kcal · П {round(per.protein_g, 1)} · В {round(per.carbs_g, 1)} · М {round(per.fat_g, 1)} · Фибри {round(per.fiber_g, 1)}</div>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>Общо: {round(totals.kcal)} kcal · П {round(totals.protein_g, 1)} · В {round(totals.carbs_g, 1)} · М {round(totals.fat_g, 1)}</div>
      </Card>
      {err && <div style={{ color: t.warn, fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
        <Button variant="ghost" onClick={onClose}>Отказ</Button>
        <Button onClick={save} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Запис…" : "Запази рецепта"}</Button>
      </div>
    </Modal>
  );
}

const dash = (v, d = 1) => (v == null ? "—" : round(Number(v), d)); // липсваща стойност се показва като „—", не като 0
// от снапшота взимаме само числовите хранителни полета (името и др. не са нутриенти)
const macrosOnly = (snap) => Object.fromEntries(MACRO_KEYS.map((k) => [k, snap?.[k] == null ? null : Number(snap[k])]));

/* ---------------- shared modal + table styles ---------------- */
function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,48,47,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }} onClick={onClose}>
      <Card style={{ width: "100%", maxWidth: wide ? 560 : 480, maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px", color: t.ink }}>{title}</h3>
        {children}
      </Card>
    </div>
  );
}
const th = { padding: "9px 12px", fontSize: 12, fontWeight: 700 };
const thC = { ...th, textAlign: "center" };
const td = { padding: "9px 12px", borderBottom: `1px solid ${t.line}`, color: t.ink };
const tdm = { ...td, color: t.muted, fontSize: 12 };
const tdC = { ...td, textAlign: "center" };
