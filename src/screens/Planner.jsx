import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";
import { useViewport } from "../ui/useViewport.js";
import { calcBMR, calcTDEE, calcEnergyTarget, calcMacros, round } from "../lib/nutrition.mjs";

const DAYS = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];
const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const DEFAULT_MEALS = ["Закуска", "Обяд", "Вечеря", "Междинно"];
const MK = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"];
const zero = () => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

function itemTotals(it) {
  const q = +it.qty || 0, s = it.snapshot || {};
  const f = it.unit === "serving" || it.unit === "piece" ? q : q / 100;
  const o = zero();
  for (const k of MK) o[k] = (+s[k] || 0) * f;
  return o;
}
const addInto = (a, b) => { for (const k of MK) a[k] += b[k] || 0; return a; };

function clientTarget(c) {
  if (!c) return null;
  const age = c.birth_date ? Math.max(14, Math.floor((Date.now() - new Date(c.birth_date)) / 3.15576e10)) : 30;
  const bmr = calcBMR("mifflin", { sex: c.sex || "male", weightKg: +c.weight_kg || 70, heightCm: +c.height_cm || 170, age }).value;
  const { tdee } = calcTDEE({ bmr, activityLevel: c.activity_level || "moderate" });
  const goalMode = { reduction: "deficit_pct", muscle_gain: "surplus_pct" }[c.main_goal];
  const energy = calcEnergyTarget({ tdee, mode: goalMode || "maintain", value: 15 });
  const m = calcMacros({ calories: energy.target, weightKg: +c.weight_kg || 70, spec: { protein: { mode: "g_per_kg", value: 2 }, fat: { mode: "g_per_kg", value: 1 } } });
  return { kcal: energy.target, protein_g: m.protein.grams, carbs_g: m.carbs.grams, fat_g: m.fat.grams };
}

export default function Planner() {
  const { session } = useAuth();
  const { isMobile } = useViewport();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [client, setClient] = useState(null);
  const [version, setVersion] = useState(null);
  const [tree, setTree] = useState([]); // [{id, weekday, plan_meals:[{id,name,position,plan_meal_items:[...]}]}]
  const [dayIdx, setDayIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState(null); // {mealId}
  const [foods, setFoods] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [showShop, setShowShop] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("id, first_name, last_name").eq("archived", false).order("first_name").then(({ data }) => setClients(data || []));
    supabase.from("foods").select("id, name_bg, name_en, unit, kcal, protein_g, carbs_g, fat_g, fiber_g").eq("archived", false).order("name_bg").limit(2000).then(({ data }) => setFoods(data || []));
    supabase.from("recipes").select("id, name, servings, recipe_ingredients(qty, unit, snapshot)").then(({ data }) => setRecipes(data || []));
  }, []);

  async function openClient(id) {
    setClientId(id); setDayIdx(0);
    if (!id) { setClient(null); setVersion(null); setTree([]); return; }
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("id", id).single();
    setClient(c);
    // plan
    let { data: plan } = await supabase.from("plans").select("id").eq("client_id", id).limit(1).maybeSingle();
    if (!plan) ({ data: plan } = await supabase.from("plans").insert({ client_id: id, nutritionist_id: session.user.id, title: "Седмичен режим" }).select("id").single());
    let { data: ver } = await supabase.from("plan_versions").select("id, version, status").eq("plan_id", plan.id).order("version", { ascending: false }).limit(1).maybeSingle();
    if (!ver) ({ data: ver } = await supabase.from("plan_versions").insert({ plan_id: plan.id, version: 1, status: "draft", targets: {} }).select("id, version, status").single());
    setVersion(ver);
    await ensureDays(ver.id);
    await reload(ver.id);
    setLoading(false);
  }

  async function ensureDays(versionId) {
    const { data: days } = await supabase.from("plan_days").select("id, weekday").eq("version_id", versionId);
    const have = new Set((days || []).map((d) => d.weekday));
    for (let w = 0; w < 7; w++) {
      if (!have.has(w)) {
        const { data: nd } = await supabase.from("plan_days").insert({ version_id: versionId, weekday: w }).select("id").single();
        await supabase.from("plan_meals").insert(DEFAULT_MEALS.map((name, i) => ({ day_id: nd.id, name, position: i })));
      }
    }
  }

  async function reload(versionId = version?.id) {
    if (!versionId) return;
    const { data } = await supabase.from("plan_days")
      .select("id, weekday, plan_meals(id, name, position, plan_meal_items(id, qty, unit, snapshot, foods(name_bg), recipes(name)))")
      .eq("version_id", versionId).order("weekday");
    (data || []).forEach((d) => d.plan_meals.sort((a, b) => a.position - b.position));
    setTree(data || []);
  }

  const day = tree.find((d) => d.weekday === dayIdx);
  const target = useMemo(() => clientTarget(client), [client]);

  const dayTotals = (d) => { const tot = zero(); (d?.plan_meals || []).forEach((m) => (m.plan_meal_items || []).forEach((it) => addInto(tot, itemTotals(it)))); return tot; };
  const mealTotals = (m) => { const tot = zero(); (m.plan_meal_items || []).forEach((it) => addInto(tot, itemTotals(it))); return tot; };
  const weekTotals = useMemo(() => { const tot = zero(); tree.forEach((d) => addInto(tot, dayTotals(d))); return tot; }, [tree]);
  const weekAvg = Object.fromEntries(MK.map((k) => [k, weekTotals[k] / 7]));

  async function addMeal() {
    if (!day) return;
    const name = prompt("Име на храненето:", "Ново хранене"); if (!name) return;
    await supabase.from("plan_meals").insert({ day_id: day.id, name, position: (day.plan_meals?.length || 0) });
    reload();
  }
  async function renameMeal(m) { const name = prompt("Преименувай:", m.name); if (name) { await supabase.from("plan_meals").update({ name }).eq("id", m.id); reload(); } }
  async function delMeal(m) { await supabase.from("plan_meals").delete().eq("id", m.id); reload(); }
  async function delItem(id) { await supabase.from("plan_meal_items").delete().eq("id", id); reload(); }
  async function setQty(id, qty) { await supabase.from("plan_meal_items").update({ qty }).eq("id", id); reload(); }
  async function copyDayTo(targetWeekday) {
    const src = day; if (!src) return;
    const { data: td } = await supabase.from("plan_days").select("id").eq("version_id", version.id).eq("weekday", targetWeekday).single();
    // изчистваме целевия ден
    const { data: tmeals } = await supabase.from("plan_meals").select("id").eq("day_id", td.id);
    if (tmeals?.length) await supabase.from("plan_meals").delete().in("id", tmeals.map((x) => x.id));
    for (const m of src.plan_meals) {
      const { data: nm } = await supabase.from("plan_meals").insert({ day_id: td.id, name: m.name, position: m.position }).select("id").single();
      if (m.plan_meal_items?.length) await supabase.from("plan_meal_items").insert(m.plan_meal_items.map((it) => ({ meal_id: nm.id, food_id: it.foods ? undefined : undefined, qty: it.qty, unit: it.unit, snapshot: it.snapshot })));
    }
    reload(); alert("Копирано в " + DAYS[targetWeekday]);
  }

  if (!clientId) return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0, color: t.ink }}>Седмичен дневник</h2>
      <Card style={{ maxWidth: 420 }}>
        <Field label="Избери клиент">
          <Select value={clientId} onChange={openClient} options={[{ value: "", label: "— избери —" }, ...clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name || ""}` }))]} />
        </Field>
        {clients.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>Нямаш клиенти още — добави в „Моите клиенти".</div>}
      </Card>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, color: t.ink }}>Седмичен режим</h2>
        <Select value={clientId} onChange={openClient} style={{ width: "auto", minWidth: 200 }} options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name || ""}` }))} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => setShowShop(true)}>Списък за пазар</Button>
      </div>

      {loading ? <Card>Зареждане…</Card> : (
        <>
          {/* target vs week avg */}
          {target && <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: t.coral, color: "#fff" }}><th style={th}></th><th style={th}>kcal</th><th style={th}>Прот.</th><th style={th}>Въгл.</th><th style={th}>Мазн.</th></tr></thead>
                <tbody>
                  <tr style={{ background: t.tealPale }}><td style={{ ...td, fontWeight: 700 }}>Цел/ден</td><td style={td}>{round(target.kcal)}</td><td style={td}>{round(target.protein_g)}</td><td style={td}>{round(target.carbs_g)}</td><td style={td}>{round(target.fat_g)}</td></tr>
                  <tr><td style={{ ...td, fontWeight: 700 }}>Средно/ден</td><td style={td}>{round(weekAvg.kcal)}</td><td style={td}>{round(weekAvg.protein_g)}</td><td style={td}>{round(weekAvg.carbs_g)}</td><td style={td}>{round(weekAvg.fat_g)}</td></tr>
                  <tr><td style={{ ...td, fontWeight: 700, color: t.tealDark }}>Разлика</td>
                    {["kcal", "protein_g", "carbs_g", "fat_g"].map((k) => { const d = weekAvg[k] - target[k]; return <td key={k} style={{ ...td, color: d > 0 ? t.warn : t.good, fontWeight: 700 }}>{d >= 0 ? "+" : ""}{round(d)}</td>; })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: t.muted, padding: "6px 12px" }}>Целта е ориентир, изчислен от данните на клиента (Mifflin · 2 g/kg протеин · 1 g/kg мазнини). Коригирай в калкулатора.</div>
          </Card>}

          {/* day tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {DAYS.map((d, i) => {
              const tt = dayTotals(tree.find((x) => x.weekday === i));
              const active = i === dayIdx;
              return <button key={i} onClick={() => setDayIdx(i)} style={{ flexShrink: 0, border: `1px solid ${active ? t.coral : t.line}`, background: active ? t.coral : "#fff", color: active ? "#fff" : t.ink, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13 }}>
                {isMobile ? DAYS_SHORT[i] : d}<div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.85 }}>{round(tt.kcal)} kcal</div></button>;
            })}
          </div>

          {/* meals of the day */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, color: t.ink, fontSize: 16 }}>{DAYS[dayIdx]}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Select value="" onChange={(w) => w !== "" && copyDayTo(Number(w))} style={{ width: "auto" }} options={[{ value: "", label: "Копирай деня в…" }, ...DAYS.map((d, i) => ({ value: String(i), label: d })).filter((_, i) => i !== dayIdx)]} />
              <Button onClick={addMeal}>+ Хранене</Button>
            </div>
          </div>

          {(day?.plan_meals || []).map((m) => {
            const mt = mealTotals(m);
            return (
              <Card key={m.id} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.tealDark, color: "#fff", padding: "9px 14px" }}>
                  <span style={{ fontWeight: 700, flex: 1 }}>{m.name}</span>
                  <span style={{ fontSize: 12.5 }}>{round(mt.kcal)} kcal · П {round(mt.protein_g)} · В {round(mt.carbs_g)} · М {round(mt.fat_g)}</span>
                  <button onClick={() => renameMeal(m)} title="Преименувай" style={iconBtn}>✎</button>
                  <button onClick={() => delMeal(m)} title="Изтрий хранене" style={iconBtn}>🗑</button>
                </div>
                {(m.plan_meal_items || []).length === 0 && <div style={{ padding: "10px 14px", color: t.muted, fontSize: 13 }}>Няма продукти.</div>}
                {(m.plan_meal_items || []).map((it) => {
                  const tot = itemTotals(it);
                  const name = it.foods?.name_bg || it.recipes?.name || it.snapshot?.name || "—";
                  const unitLabel = it.unit === "serving" ? "порции" : it.unit === "piece" ? "бр" : "г";
                  return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${t.line}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: t.ink, fontWeight: 600 }}>{name} {it.recipes && <span style={{ color: t.coral, fontSize: 11 }}>рецепта</span>}</div>
                        <div style={{ fontSize: 11.5, color: t.muted }}>П {round(tot.protein_g)} · В {round(tot.carbs_g)} · М {round(tot.fat_g)}</div>
                      </div>
                      <Input type="number" value={it.qty} onChange={(e) => setQty(it.id, Number(e.target.value) || 0)} style={{ width: 70, textAlign: "center", padding: "6px" }} />
                      <span style={{ fontSize: 11, color: t.muted, width: 38 }}>{unitLabel}</span>
                      <div style={{ width: 54, textAlign: "right", fontWeight: 700, color: t.ink }}>{round(tot.kcal)}</div>
                      <button onClick={() => delItem(it.id)} style={{ border: "none", background: "none", cursor: "pointer", color: t.muted }}>✕</button>
                    </div>
                  );
                })}
                <button onClick={() => setPicker({ mealId: m.id })} style={{ width: "100%", border: "none", background: t.tealPale, color: t.tealDark, fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "10px", cursor: "pointer" }}>+ Добави продукт / рецепта</button>
              </Card>
            );
          })}

          {/* day total */}
          <Card style={{ background: t.tealPale, border: "none" }}>
            <div style={{ fontWeight: 800, color: t.tealDark }}>Общо за деня: {round(dayTotals(day).kcal)} kcal · П {round(dayTotals(day).protein_g)} · В {round(dayTotals(day).carbs_g)} · М {round(dayTotals(day).fat_g)}</div>
          </Card>
        </>
      )}

      {picker && <ItemPicker foods={foods} recipes={recipes} onClose={() => setPicker(null)} onAdd={async (payload) => {
        await supabase.from("plan_meal_items").insert({ meal_id: picker.mealId, ...payload });
        setPicker(null); reload();
      }} />}
      {showShop && <ShoppingList tree={tree} onClose={() => setShowShop(false)} />}
    </div>
  );
}

function recipePerServing(r) {
  const tot = zero();
  (r.recipe_ingredients || []).forEach((ing) => {
    const s = ing.snapshot || {}, f = ing.unit === "piece" ? +ing.qty : +ing.qty / 100;
    for (const k of MK) tot[k] += (+s[k] || 0) * f;
  });
  const sv = Math.max(1, r.servings || 1);
  const per = zero(); for (const k of MK) per[k] = tot[k] / sv;
  return per;
}

function ItemPicker({ foods, recipes, onClose, onAdd }) {
  const [mode, setMode] = useState("food");
  const [q, setQ] = useState("");
  const foundF = q.trim() ? foods.filter((f) => (f.name_bg + " " + (f.name_en || "")).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : foods.slice(0, 12);
  const foundR = q.trim() ? recipes.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : recipes.slice(0, 12);
  return (
    <Modal title="Добави към храненето" onClose={onClose}>
      <div style={{ display: "inline-flex", background: t.tealPale, borderRadius: 10, padding: 3, marginBottom: 10 }}>
        {[["food", "Продукт"], ["recipe", "Рецепта"]].map(([id, l]) => <button key={id} onClick={() => setMode(id)} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13, background: mode === id ? "#fff" : "transparent", color: mode === id ? t.tealDark : t.muted }}>{l}</button>)}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси…" autoFocus />
      <div style={{ maxHeight: "50vh", overflowY: "auto", marginTop: 8 }}>
        {mode === "food" ? foundF.map((f) => (
          <button key={f.id} onClick={() => onAdd({ food_id: f.id, qty: f.unit === "piece" ? 1 : 100, unit: f.unit, snapshot: { kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fiber_g: f.fiber_g, name: f.name_bg } })}
            style={rowBtn}><span>{f.name_bg}</span><span style={{ color: t.muted, fontSize: 12 }}>{round(f.kcal)} kcal/100г</span></button>
        )) : foundR.map((r) => {
          const per = recipePerServing(r);
          return <button key={r.id} onClick={() => onAdd({ recipe_id: r.id, qty: 1, unit: "serving", snapshot: { ...per, name: r.name } })}
            style={rowBtn}><span>{r.name}</span><span style={{ color: t.muted, fontSize: 12 }}>{round(per.kcal)} kcal/порция</span></button>;
        })}
      </div>
    </Modal>
  );
}

function ShoppingList({ tree, onClose }) {
  const map = new Map();
  tree.forEach((d) => (d.plan_meals || []).forEach((m) => (m.plan_meal_items || []).forEach((it) => {
    if (it.unit === "serving") return; // рецепти не разбиваме тук
    const name = it.foods?.name_bg || it.snapshot?.name || "?";
    const key = name + "|" + it.unit;
    map.set(key, (map.get(key) || 0) + (+it.qty || 0));
  })));
  const rows = [...map.entries()].map(([k, v]) => ({ name: k.split("|")[0], unit: k.split("|")[1], qty: v })).sort((a, b) => a.name.localeCompare(b.name, "bg"));
  return (
    <Modal title="Списък за пазар (за седмицата)" onClose={onClose}>
      {rows.length === 0 ? <div style={{ color: t.muted }}>Още няма продукти в режима.</div> : (
        <div>{rows.map((r, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.line}` }}>
            <input type="checkbox" style={{ width: 18, height: 18, accentColor: t.coral }} />
            <span style={{ flex: 1, color: t.ink }}>{r.name}</span>
            <span style={{ color: t.muted, fontWeight: 700 }}>{round(r.qty)} {r.unit === "piece" ? "бр" : "г"}</span>
          </label>
        ))}</div>
      )}
      <div style={{ fontSize: 11.5, color: t.muted, marginTop: 10 }}>Събрано от всички дни. Рецептите не са разбити на съставки тук.</div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,48,47,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }} onClick={onClose}>
      <Card style={{ width: "100%", maxWidth: 480, maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px", color: t.ink }}>{title}</h3>{children}
      </Card>
    </div>
  );
}
const th = { padding: "8px 12px", fontSize: 12, fontWeight: 700, textAlign: "center" };
const td = { padding: "8px 12px", borderBottom: `1px solid ${t.line}`, color: t.ink, textAlign: "center" };
const iconBtn = { border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", borderRadius: 6, width: 26, height: 26 };
const rowBtn = { width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${t.line}`, background: "#fff", padding: "10px", cursor: "pointer", fontSize: 13.5, color: t.ink, display: "flex", justifyContent: "space-between", fontFamily: "inherit" };
