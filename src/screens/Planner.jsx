import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select } from "../ui/primitives.jsx";
import { useViewport } from "../ui/useViewport.js";
import { round } from "../lib/nutrition.mjs";
import { itemTotals, itemMissing, mealTotals, dayTotals, weekSummary, recipePerServing as recipeCalc, microSummary, clientTarget, parseQty } from "../lib/planMath.mjs";
import { exportPlanPDF, exportPlanExcel } from "../lib/exporters.js";
import { aiRequest } from "../lib/ai.js";

const DAYS = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];
const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const DEFAULT_MEALS = ["Закуска", "Обяд", "Вечеря", "Междинно"];
export default function Planner() {
  const { session, profile } = useAuth();
  const profileName = profile?.full_name || profile?.email || "";
  const { isMobile } = useViewport();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [client, setClient] = useState(null);
  const [plan, setPlan] = useState(null);
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState(null);
  const [tree, setTree] = useState([]); // [{id, weekday, plan_meals:[{id,name,position,plan_meal_items:[...]}]}]
  const [dayIdx, setDayIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState(null); // {mealId}
  const [foods, setFoods] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [showShop, setShowShop] = useState(false);
  const [showMicro, setShowMicro] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(id); }, [notice]);
  // Изпълнява заявка към базата и ПОКАЗВА грешката (досега грешките се губеха тихо).
  const run = async (q, what = "Записът") => {
    const { data, error } = await q;
    if (error) { setErr(`${what} не успя: ${error.message}. Провери връзката и опитай отново.`); throw error; }
    return data;
  };
  const guard = (fn) => async (...a) => { try { setErr(""); return await fn(...a); } catch (e) { if (!e?.message) setErr("Възникна грешка."); else setErr((x) => x || ("Грешка: " + e.message)); await reload().catch(() => {}); setLoading(false); } };

  useEffect(() => {
    supabase.from("clients").select("id, first_name, last_name").eq("archived", false).order("first_name").then(({ data, error }) => {
      if (error) { setErr("Клиентите не можаха да се заредят: " + error.message); return; }
      setClients(data || []);
      // връщаме последно отворения клиент след презареждане на страницата
      let last = null; try { last = localStorage.getItem("pn.planner.client"); } catch { /* няма достъп */ }
      if (last && (data || []).some((c) => c.id === last)) openClient(last);
    });
    supabase.from("foods").select("id, name_bg, name_en, unit, kcal, protein_g, carbs_g, fat_g, fiber_g").eq("archived", false).order("name_bg").limit(2000).then(({ data }) => setFoods(data || []));
    supabase.from("recipes").select("id, name, servings, recipe_ingredients(qty, unit, snapshot)").then(({ data }) => setRecipes(data || []));
  }, []);

  const openClient = guard(async (id) => {
    setClientId(id); setDayIdx(0); setErr("");
    try { if (id) localStorage.setItem("pn.planner.client", id); else localStorage.removeItem("pn.planner.client"); } catch { /* недостъпно хранилище */ }
    if (!id) { setClient(null); setPlan(null); setVersions([]); setVersion(null); setTree([]); return; }
    setLoading(true);
    const c = await run(supabase.from("clients").select("*").eq("id", id).single(), "Зареждането на клиента");
    setClient(c);
    // plan (най-старият е основният; .order гарантира един и същ при повторно отваряне)
    let pl = await run(supabase.from("plans").select("id, title").eq("client_id", id).order("created_at").limit(1).maybeSingle(), "Зареждането на режима");
    if (!pl) pl = await run(supabase.from("plans").insert({ client_id: id, nutritionist_id: session.user.id, title: "Седмичен режим" }).select("id, title").single(), "Създаването на режим");
    setPlan(pl);
    let vers = await run(supabase.from("plan_versions").select("id, version, status, created_at").eq("plan_id", pl.id).order("version", { ascending: false }), "Зареждането на версиите");
    if (!vers || vers.length === 0) {
      const v1 = await run(supabase.from("plan_versions").insert({ plan_id: pl.id, version: 1, status: "draft", targets: {} }).select("id, version, status, created_at").single(), "Създаването на версия");
      vers = [v1];
    }
    setVersions(vers);
    const ver = vers.find((v) => v.status !== "archived") || vers[0];
    setVersion(ver);
    await ensureDays(ver.id);
    await reload(ver.id);
    setLoading(false);
  });

  async function selectVersion(versionId) {
    const ver = versions.find((v) => v.id === versionId);
    if (!ver) return;
    setDayIdx(0); setVersion(ver); setLoading(true);
    await ensureDays(ver.id);
    await reload(ver.id);
    setLoading(false);
  }

  async function refreshVersions(pickId) {
    if (!plan) return;
    const { data: vers } = await supabase.from("plan_versions").select("id, version, status, created_at").eq("plan_id", plan.id).order("version", { ascending: false });
    setVersions(vers || []);
    if (pickId) { const v = (vers || []).find((x) => x.id === pickId); if (v) setVersion(v); }
    else { const cur = (vers || []).find((x) => x.id === version?.id); if (cur) setVersion(cur); }
  }

  // Дълбоко копира съдържанието (дни→хранения→айтеми) от source версия в target.
  async function copyVersionContent(srcVersionId, dstVersionId) {
    const srcDays = await run(supabase.from("plan_days")
      .select("weekday, plan_meals(name, position, plan_meal_items(food_id, recipe_id, qty, unit, snapshot))")
      .eq("version_id", srcVersionId), "Четенето на версията");
    // Групово копиране с идентификатори, генерирани в клиента → 3 заявки вместо десетки.
    const seen = new Set(); const days = [], meals = [], items = [];
    for (const d of srcDays || []) {
      if (seen.has(d.weekday)) continue; seen.add(d.weekday); // защита от дублирани дни
      const dayId = crypto.randomUUID(); days.push({ id: dayId, version_id: dstVersionId, weekday: d.weekday });
      for (const m of d.plan_meals || []) {
        const mealId = crypto.randomUUID(); meals.push({ id: mealId, day_id: dayId, name: m.name, position: m.position });
        for (const it of m.plan_meal_items || []) items.push({ meal_id: mealId, food_id: it.food_id || null, recipe_id: it.recipe_id || null, qty: it.qty, unit: it.unit, snapshot: it.snapshot });
      }
    }
    if (days.length) await run(supabase.from("plan_days").insert(days), "Копирането на дните");
    if (meals.length) await run(supabase.from("plan_meals").insert(meals), "Копирането на храненията");
    if (items.length) await run(supabase.from("plan_meal_items").insert(items), "Копирането на продуктите");
  }

  const newVersion = guard(async (mode) => {
    if (!plan) return;
    setLoading(true);
    const nextNum = Math.max(0, ...versions.map((v) => v.version || 0)) + 1;
    const nv = await run(supabase.from("plan_versions").insert({ plan_id: plan.id, version: nextNum, status: "draft", targets: {} }).select("id, version, status, created_at").single(), "Създаването на версия");
    try {
      if (mode === "duplicate" && version) await copyVersionContent(version.id, nv.id);
      await ensureDays(nv.id); // допълва липсващи дни и при дублиране
    } catch (e) {
      // непълно копие не бива да остава като „версия": премахваме я и оставаме на текущата
      await supabase.from("plan_versions").delete().eq("id", nv.id);
      throw e;
    }
    await refreshVersions(nv.id);
    setDayIdx(0);
    await reload(nv.id);
    setLoading(false);
  });

  const setVersionStatus = guard(async (status) => {
    if (!version) return;
    // максимум една „финална" версия: архивираме евентуална друга финална
    if (status === "final") {
      const otherFinal = versions.filter((v) => v.id !== version.id && v.status === "final");
      for (const v of otherFinal) await run(supabase.from("plan_versions").update({ status: "archived" }).eq("id", v.id), "Архивирането на старата финална версия");
    }
    await run(supabase.from("plan_versions").update({ status }).eq("id", version.id), "Смяната на статуса");
    await refreshVersions(version.id);
  });

  const deleteVersion = guard(async () => {
    if (!version || versions.length <= 1) { alert("Трябва да остане поне една версия."); return; }
    if (!confirm(`Да изтрия версия ${version.version}${version.status === "final" ? " (ФИНАЛНА)" : ""}? Съдържанието ѝ ще се премахне безвъзвратно.`)) return;
    setLoading(true);
    await run(supabase.from("plan_versions").delete().eq("id", version.id), "Изтриването на версията");
    const rest = versions.filter((v) => v.id !== version.id);
    const next = rest.find((v) => v.status !== "archived") || rest[0];
    setVersions(rest); setVersion(next); setDayIdx(0);
    await ensureDays(next.id); await reload(next.id);
    setLoading(false);
  });

  async function ensureDays(versionId) {
    const days = await run(supabase.from("plan_days").select("id, weekday").eq("version_id", versionId), "Зареждането на дните");
    const have = new Set((days || []).map((d) => d.weekday));
    const missing = [0, 1, 2, 3, 4, 5, 6].filter((w) => !have.has(w));
    if (!missing.length) return;
    // 2 групови заявки вместо 14 (по една на ден + по една за храненията му)
    const newDays = missing.map((w) => ({ id: crypto.randomUUID(), version_id: versionId, weekday: w }));
    const { error } = await supabase.from("plan_days").insert(newDays);
    if (error) { if (error.code === "23505") return; setErr("Създаването на дните не успя: " + error.message); throw error; } // 23505: дните вече са създадени паралелно
    await run(supabase.from("plan_meals").insert(newDays.flatMap((d) => DEFAULT_MEALS.map((name, i) => ({ day_id: d.id, name, position: i })))), "Създаването на хранения");
  }

  const reloadSeq = React.useRef(0);
  async function reload(versionId = version?.id) {
    if (!versionId) return;
    const seq = ++reloadSeq.current;
    const { data, error } = await supabase.from("plan_days")
      .select("id, weekday, plan_meals(id, name, position, plan_meal_items(id, qty, unit, snapshot, food_id, recipe_id, foods(name_bg, micros), recipes(name)))")
      .eq("version_id", versionId).order("weekday");
    if (seq !== reloadSeq.current) return; // по-нова заявка вече е тръгнала → не презаписваме със стари данни
    if (error) { setErr("Режимът не можа да се зареди: " + error.message); return; }
    const byDay = new Map(); // при дублирани дни показваме първия (детерминистично)
    (data || []).forEach((d) => { if (!byDay.has(d.weekday)) byDay.set(d.weekday, d); });
    const days = [...byDay.values()];
    days.forEach((d) => { d.plan_meals.sort((a, b) => a.position - b.position); d.plan_meals.forEach((m) => (m.plan_meal_items || []).sort((a, b) => (a.id < b.id ? -1 : 1))); });
    setTree(days);
  }

  const day = tree.find((d) => d.weekday === dayIdx);
  const target = useMemo(() => clientTarget(client), [client]);
  const locked = version?.status === "final";

  const week = useMemo(() => weekSummary(tree), [tree]);
  const weekAvg = week.avg;

  const addMeal = guard(async () => {
    if (!day || locked) return;
    const name = (prompt("Име на храненето:", "Ново хранене") || "").trim().slice(0, 60); if (!name) return;
    const pos = (day.plan_meals || []).reduce((a, m) => Math.max(a, m.position + 1), 0);
    await run(supabase.from("plan_meals").insert({ day_id: day.id, name, position: pos }), "Добавянето на хранене");
    await reload();
  });
  const renameMeal = guard(async (m) => { if (locked) return; const name = (prompt("Преименувай:", m.name) || "").trim().slice(0, 60); if (name && name !== m.name) { await run(supabase.from("plan_meals").update({ name }).eq("id", m.id), "Преименуването"); await reload(); } });
  const delMeal = guard(async (m) => {
    if (locked) return;
    const n = m.plan_meal_items?.length || 0;
    if (n > 0 && !confirm(`Да изтрия „${m.name}" заедно с ${n} продукта в него?`)) return;
    await run(supabase.from("plan_meals").delete().eq("id", m.id), "Изтриването на хранене"); await reload();
  });
  const delItem = guard(async (id) => { if (locked) return; await run(supabase.from("plan_meal_items").delete().eq("id", id), "Изтриването на продукт"); await reload(); });
  const setQty = guard(async (id, qty) => {
    if (locked) return;
    // оптимистично обновяване → тоталите се преизчисляват веднага, без да чакат базата
    setTree((tr) => tr.map((d) => ({ ...d, plan_meals: d.plan_meals.map((m) => ({ ...m, plan_meal_items: (m.plan_meal_items || []).map((it) => (it.id === id ? { ...it, qty } : it)) })) })));
    await run(supabase.from("plan_meal_items").update({ qty }).eq("id", id), "Записът на количеството");
  });
  const copyDayTo = guard(async (targetWeekday) => {
    if (locked) return;
    const src = day; if (!src) return;
    const target = tree.find((d) => d.weekday === targetWeekday);
    const existing = (target?.plan_meals || []).reduce((a, m) => a + (m.plan_meal_items?.length || 0), 0);
    if (existing > 0 && !confirm(`${DAYS[targetWeekday]} вече съдържа ${existing} продукта. Копирането ще ги ЗАМЕНИ. Продължаваме ли?`)) return;
    const td = await run(supabase.from("plan_days").select("id").eq("version_id", version.id).eq("weekday", targetWeekday).limit(1).single(), "Намирането на целевия ден");
    // Първо записваме копието, после махаме старото съдържание → при прекъсване няма загуба на данни.
    const oldMeals = await run(supabase.from("plan_meals").select("id").eq("day_id", td.id), "Четенето на целевия ден");
    const meals = src.plan_meals.map((m) => ({ id: crypto.randomUUID(), day_id: td.id, name: m.name, position: m.position }));
    const items = src.plan_meals.flatMap((m, i) => (m.plan_meal_items || []).map((it) => ({ meal_id: meals[i].id, food_id: it.food_id || null, recipe_id: it.recipe_id || null, qty: it.qty, unit: it.unit, snapshot: it.snapshot })));
    try {
      if (meals.length) await run(supabase.from("plan_meals").insert(meals), "Копирането на храненията");
      if (items.length) await run(supabase.from("plan_meal_items").insert(items), "Копирането на продуктите");
    } catch (e) {
      if (meals.length) await supabase.from("plan_meals").delete().in("id", meals.map((m) => m.id)); // връщаме целевия ден в изходно състояние
      throw e;
    }
    if (oldMeals?.length) await run(supabase.from("plan_meals").delete().in("id", oldMeals.map((x) => x.id)), "Почистването на стария ден");
    await reload();
    setNotice(`Денят е копиран в ${DAYS[targetWeekday]}.`);
  });

  // Прилага AI-генерирана чернова към текущата версия. Връща {added, unmatched}.
  async function applyAIPlan(genDays, opts) {
    try { return await applyAIPlanInner(genDays, opts); }
    catch (e) { await reload().catch(() => {}); throw e; } // показваме реалното (частично) състояние
  }
  async function applyAIPlanInner(genDays, { replace, singleDayWeekday }) {
    if (!version) return { added: 0, unmatched: [] };
    const norm = (s) => (s || "").toString().toLowerCase().trim();
    const byName = new Map();
    foods.forEach((f) => { if (f.unit === "100g") { byName.set(norm(f.name_bg), f); if (f.name_en) byName.set(norm(f.name_en), f); } });
    let added = 0; const unmatched = new Set();
    const dayRows = await run(supabase.from("plan_days").select("id, weekday").eq("version_id", version.id), "Четенето на дните");
    const dayByWd = {}; (dayRows || []).forEach((d) => { if (dayByWd[d.weekday] == null) dayByWd[d.weekday] = d.id; });
    const doneDays = new Set();
    for (const gd of genDays || []) {
      const wd = singleDayWeekday != null ? singleDayWeekday : gd.weekday;
      const dayId = dayByWd[wd]; if (dayId == null || doneDays.has(wd)) continue;
      if (!Array.isArray(gd.meals) || gd.meals.length === 0) continue; // празен отговор за деня → не трием нищо
      doneDays.add(wd);
      if (replace) {
        const oldMeals = await run(supabase.from("plan_meals").select("id").eq("day_id", dayId), "Четенето на деня");
        if (oldMeals?.length) await run(supabase.from("plan_meals").delete().in("id", oldMeals.map((x) => x.id)), "Замяната на деня");
      }
      let pos = 0;
      if (!replace) { const ex = await run(supabase.from("plan_meals").select("position").eq("day_id", dayId), "Четенето на деня"); pos = (ex || []).reduce((a, b) => Math.max(a, b.position + 1), 0); }
      for (const meal of gd.meals || []) {
        const nm = await run(supabase.from("plan_meals").insert({ day_id: dayId, name: (meal.name || "Хранене").toString().slice(0, 60), position: pos++ }).select("id").single(), "Добавянето на хранене");
        const items = [];
        for (const it of meal.items || []) {
          const f = byName.get(norm(it.food));
          if (!f) { unmatched.add(it.food); continue; }
          const grams = Math.min(5000, Math.max(0, Math.round(+it.grams || 0)));
          if (!grams) continue;
          items.push({ meal_id: nm.id, food_id: f.id, qty: grams, unit: "100g", snapshot: { kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fiber_g: f.fiber_g, name: f.name_bg } });
          added++;
        }
        if (items.length) await run(supabase.from("plan_meal_items").insert(items), "Добавянето на продукти");
      }
    }
    await reload();
    return { added, unmatched: [...unmatched], days: doneDays.size };
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
        {!locked && <Button onClick={() => setShowAI(true)}>✨ AI чернова</Button>}
        <Button variant="ghost" onClick={() => setShowMicro(true)}>Микронутриенти</Button>
        <Button variant="ghost" onClick={() => setShowShop(true)}>Списък за пазар</Button>
        <Button variant="ghost" onClick={() => exportPlanPDF({ tree, client, target, nutritionist: profileName })}>PDF</Button>
        <Button variant="ghost" onClick={() => exportPlanExcel({ tree, client })}>Excel</Button>
      </div>

      {/* Лента за версии */}
      {version && (
        <Card style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.muted }}>Версия</span>
          <Select value={version.id} onChange={selectVersion} style={{ width: "auto", minWidth: 150 }}
            options={versions.map((v) => ({ value: v.id, label: `v${v.version}${v.status === "final" ? " · финал" : v.status === "archived" ? " · архив" : " · чернова"}` }))} />
          <StatusBadge status={version.status} />
          <div style={{ flex: 1 }} />
          {!locked ? (
            <Button variant="ghost" onClick={() => setVersionStatus("final")} title="Заключва версията за редакция">✓ Финализирай</Button>
          ) : (
            <Button variant="ghost" onClick={() => setVersionStatus("draft")} title="Отключва за редакция">↩ Върни в чернова</Button>
          )}
          <Select value="" onChange={(m) => m && newVersion(m)} style={{ width: "auto" }}
            options={[{ value: "", label: "+ Нова версия…" }, { value: "duplicate", label: "Дублирай текущата" }, { value: "blank", label: "Празна (7 дни)" }]} />
          {versions.length > 1 && <Button variant="danger" onClick={deleteVersion} style={{ padding: "8px 12px" }}>Изтрий версия</Button>}
        </Card>
      )}

      {err && (
        <Card role="alert" style={{ background: t.coralLight, border: `1px solid ${t.warn}`, color: t.coralDark, fontSize: 13.5, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1 }}>⚠️ {err}</span>
          <button onClick={() => setErr("")} aria-label="Затвори" style={{ border: "none", background: "none", cursor: "pointer", color: t.coralDark, fontWeight: 700 }}>✕</button>
        </Card>
      )}
      {notice && <Card role="status" style={{ background: t.tealPale, border: "none", color: t.tealDark, fontSize: 13.5, padding: "9px 14px" }}>✓ {notice}</Card>}

      {locked && (
        <Card style={{ background: t.tealPale, border: "none", color: t.tealDark, fontSize: 12.5, padding: "9px 14px" }}>
          🔒 Версия {version.version} е <b>финализирана</b> и е заключена за редакция. За промени: „Върни в чернова" или направи „Нова версия → Дублирай текущата".
        </Card>
      )}

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
            <div style={{ fontSize: 11, color: t.muted, padding: "6px 12px" }}>
              Целта е ориентир от профила на клиента (Mifflin–St Jeor · {client?.main_goal === "reduction" ? "−15%" : client?.main_goal === "muscle_gain" ? "+15%" : "поддържане"} · 2 g/kg протеин · 1 g/kg мазнини).
              {" "}„Средно/ден" е общото за седмицата ÷ 7{week.filledDays > 0 && week.filledDays < 7 ? ` — попълнени са само ${week.filledDays} от 7 дни (средно за попълнените: ${round(week.avgFilled.kcal)} kcal)` : ""}.
            </div>
            {target.assumed.length > 0 && <div style={{ fontSize: 12, color: t.coralDark, background: t.coralLight, padding: "7px 12px" }}>
              ⚠️ В профила на клиента липсва: <b>{target.assumed.join(", ")}</b>. Използвани са стойности по подразбиране (30 г., 70 кг, 170 см, мъж, умерена активност) — целта НЕ е индивидуална, докато не попълниш данните в „Моите клиенти".
            </div>}
          </Card>}
          {week.incompleteItems > 0 && <Card style={{ background: t.coralLight, border: "none", color: t.coralDark, fontSize: 12.5, padding: "9px 14px" }}>
            ⚠️ {week.incompleteItems} продукта в режима нямат пълни данни за калории/макроси (отбелязани с „непълни данни"). Липсващите стойности не са включени в сумите — реалният прием е по-висок от показания.
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
            {!locked && <div style={{ display: "flex", gap: 8 }}>
              <Select value="" onChange={(w) => w !== "" && copyDayTo(Number(w))} style={{ width: "auto" }} options={[{ value: "", label: "Копирай деня в…" }, ...DAYS.map((d, i) => ({ value: String(i), label: d })).filter((_, i) => i !== dayIdx)]} />
              <Button onClick={addMeal}>+ Хранене</Button>
            </div>}
          </div>

          {(day?.plan_meals || []).map((m) => {
            const mt = mealTotals(m);
            return (
              <Card key={m.id} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.tealDark, color: "#fff", padding: "9px 14px" }}>
                  <span style={{ fontWeight: 700, flex: 1 }}>{m.name}</span>
                  <span style={{ fontSize: 12.5 }}>{round(mt.kcal)} kcal · П {round(mt.protein_g)} · В {round(mt.carbs_g)} · М {round(mt.fat_g)}</span>
                  {!locked && <>
                    <button onClick={() => renameMeal(m)} title="Преименувай" aria-label={`Преименувай ${m.name}`} style={iconBtn}>✎</button>
                    <button onClick={() => delMeal(m)} title="Изтрий хранене" aria-label={`Изтрий хранене ${m.name}`} style={iconBtn}>🗑</button>
                  </>}
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
                        <div style={{ fontSize: 11.5, color: t.muted }}>П {round(tot.protein_g)} · В {round(tot.carbs_g)} · М {round(tot.fat_g)}{itemMissing(it).length > 0 && <span style={{ color: t.warn, fontWeight: 700 }}> · непълни данни</span>}</div>
                      </div>
                      <QtyInput value={it.qty} disabled={locked} onCommit={(q) => setQty(it.id, q)} label={`Количество за ${name}`} />
                      <span style={{ fontSize: 11, color: t.muted, width: 38 }}>{unitLabel}</span>
                      <div style={{ width: 54, textAlign: "right", fontWeight: 700, color: t.ink }}>{round(tot.kcal)}</div>
                      {!locked && <button onClick={() => delItem(it.id)} aria-label={`Премахни ${name}`} title="Премахни" style={{ border: "none", background: "none", cursor: "pointer", color: t.muted }}>✕</button>}
                    </div>
                  );
                })}
                {!locked && <button onClick={() => setPicker({ mealId: m.id })} style={{ width: "100%", border: "none", background: t.tealPale, color: t.tealDark, fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, padding: "10px", cursor: "pointer" }}>+ Добави продукт / рецепта</button>}
              </Card>
            );
          })}

          {/* day total */}
          <Card style={{ background: t.tealPale, border: "none" }}>
            <div style={{ fontWeight: 800, color: t.tealDark }}>Общо за деня: {round(dayTotals(day).kcal)} kcal · П {round(dayTotals(day).protein_g)} · В {round(dayTotals(day).carbs_g)} · М {round(dayTotals(day).fat_g)}</div>
          </Card>
        </>
      )}

      {picker && <ItemPicker foods={foods} recipes={recipes} onClose={() => setPicker(null)} onAdd={guard(async (payload) => {
        const mealId = picker.mealId; setPicker(null);
        await run(supabase.from("plan_meal_items").insert({ meal_id: mealId, ...payload }), "Добавянето на продукт");
        await reload();
      })} />}
      {showShop && <ShoppingList tree={tree} onClose={() => setShowShop(false)} />}
      {showMicro && <MicroAnalysis tree={tree} client={client} onClose={() => setShowMicro(false)} />}
      {showAI && <AIGenerate foods={foods} client={client} target={target} dayIdx={dayIdx} onApply={applyAIPlan} onClose={() => setShowAI(false)} />}
    </div>
  );
}

/** Поле за количество: редактира се локално и се записва при Enter/напускане (не на всеки клавиш). */
function QtyInput({ value, disabled, onCommit, label }) {
  const [txt, setTxt] = useState(String(+value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(String(+value)); setBad(false); }, [value]);
  const commit = () => {
    const q = parseQty(txt);
    if (q == null) { setBad(true); return; }      // празно/отрицателно/невалидно → не записваме
    setBad(false);
    if (q !== +value) onCommit(q); else setTxt(String(+value));
  };
  return (
    <input type="text" inputMode="decimal" aria-label={label} aria-invalid={bad} value={txt} disabled={disabled}
      onChange={(e) => { setTxt(e.target.value); setBad(false); }}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setTxt(String(+value)); setBad(false); } }}
      title={bad ? "Въведи число от 0 до 99999" : undefined}
      style={{ fontFamily: "inherit", fontSize: 14, color: t.ink, width: 70, textAlign: "center", padding: "6px", borderRadius: 10, outline: "none", border: `1px solid ${bad ? t.warn : t.line}`, background: disabled ? t.tealPale : bad ? t.coralLight : "#fff" }} />
  );
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
            style={rowBtn}><span>{f.name_bg}</span><span style={{ color: t.muted, fontSize: 12 }}>{f.kcal == null ? "няма данни" : `${round(f.kcal)} kcal/${f.unit === "piece" ? "бр" : "100г"}`}</span></button>
        )) : foundR.map((r) => {
          const per = recipeCalc(r).per;
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

// Референтни дневни стойности (възрастни; ориентир по EFSA/стандартни източници)
const MICRO_REF = [
  { key: "fiber_g", bg: "Фибри", unit: "г", rda: 25, type: "goal", fromMacro: true },
  { key: "sodium_mg", bg: "Натрий", unit: "мг", rda: 2000, type: "limit" },
  { key: "potassium_mg", bg: "Калий", unit: "мг", rda: 3500, type: "goal" },
  { key: "calcium_mg", bg: "Калций", unit: "мг", rda: 1000, type: "goal" },
  { key: "magnesium_mg", bg: "Магнезий", unit: "мг", rda: 350, type: "goal" },
  { key: "iron_mg", bg: "Желязо", unit: "мг", rda: 11, type: "goal", femaleRda: 16 },
  { key: "zinc_mg", bg: "Цинк", unit: "мг", rda: 10, type: "goal" },
  { key: "phosphorus_mg", bg: "Фосфор", unit: "мг", rda: 700, type: "goal" },
  { key: "vitA_ug", bg: "Витамин A", unit: "µg", rda: 750, type: "goal" },
  { key: "vitC_mg", bg: "Витамин C", unit: "мг", rda: 90, type: "goal" },
  { key: "vitD_ug", bg: "Витамин D", unit: "µg", rda: 15, type: "goal" },
  { key: "vitE_mg", bg: "Витамин E", unit: "мг", rda: 13, type: "goal" },
  { key: "vitK_ug", bg: "Витамин K", unit: "µg", rda: 70, type: "goal" },
  { key: "vitB6_mg", bg: "Витамин B6", unit: "мг", rda: 1.4, type: "goal" },
  { key: "vitB12_ug", bg: "Витамин B12", unit: "µg", rda: 2.5, type: "goal" },
];

function MicroAnalysis({ tree, client, onClose }) {
  const sum = microSummary(tree, MICRO_REF);
  const coverage = Math.round(sum.coveragePct);
  const sex = client?.sex;

  return (
    <Modal title="Микронутриенти — среден дневен прием" onClose={onClose}>
      <div style={{ background: coverage < 70 ? t.coralLight : t.tealPale, color: coverage < 70 ? t.coralDark : t.tealDark, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, marginBottom: 12 }}>
        {sum.foodItems === 0 ? "В режима още няма продукти." : <>
          {coverage < 100 ? "⚠️ Данните са частични: " : "Данни: "}<b>{sum.withAnyMicros} от {sum.foodItems}</b> продукта ({coverage}%) имат микронутриенти. Липсващите НЕ се броят за нула — реалните стойности вероятно са по-високи. До всеки ред е показано за колко продукта има стойност.
          {sum.recipeItems > 0 && ` Рецептите (${sum.recipeItems}) не се включват в този анализ.`}
        </>}
      </div>
      {MICRO_REF.map((r) => {
        const rda = (sex === "female" && r.femaleRda) ? r.femaleRda : r.rda;
        const n = sum.nutrients[r.key];
        const v = n.perDay; const pct = rda ? (v / rda) * 100 : 0;
        const over = r.type === "limit" && pct > 100;
        const reached = r.type === "goal" && pct >= 100;
        const col = over ? t.warn : reached ? t.good : t.teal;
        const partial = n.known < n.of;
        return (
          <div key={r.key} style={{ padding: "7px 0", borderBottom: `1px solid ${t.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3, gap: 8 }}>
              <span style={{ color: t.ink, fontWeight: 600 }}>{r.bg} <span style={{ color: partial ? t.warn : t.muted, fontWeight: 500, fontSize: 11 }}>· данни за {n.known}/{n.of}</span></span>
              <span style={{ color: t.muted, whiteSpace: "nowrap" }}>{n.known === 0 ? "няма данни" : <>{partial ? "≥ " : ""}{round(v, 1)} / {rda} {r.unit} · <b style={{ color: col }}>{partial && !reached ? "≥ " : ""}{round(pct)}%</b></>}</span>
            </div>
            <div style={{ height: 6, background: t.tealPale, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: col }} /></div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: t.muted, marginTop: 10 }}>Средно на ден = общо за седмицата ÷ 7. Референтните стойности са ориентир за възрастни (по EFSA/стандартни източници) и се различават според възраст, пол и състояние. Желязото е коригирано по пол. „≥" означава, че стойността е долна граница заради липсващи данни.</div>
    </Modal>
  );
}

function AIGenerate({ foods, client, target, dayIdx, onApply, onClose }) {
  const [scope, setScope] = useState("week");
  const [extra, setExtra] = useState("");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const foodList = foods.filter((f) => f.unit === "100g")
    .map((f) => `${f.name_bg}: ${round(f.kcal)}k ${round(f.protein_g)}P ${round(f.carbs_g)}C ${round(f.fat_g)}F`).join("\n");

  function extractJson(txt) {
    let s = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a === -1 || b === -1) throw new Error("AI не върна валиден JSON.");
    return JSON.parse(s.slice(a, b + 1));
  }

  async function generate() {
    if (busy) return;
    setBusy(true); setErr(""); setResult(null);
    const single = scope === "day";
    const sys = [
      "Ти си професионален асистент за нутриционист. Съставяш ЧЕРНОВА на хранителен режим, която нутриционистът после коригира ръчно.",
      "ПРАВИЛА (стриктно):",
      "- Използвай САМО храни от предоставения списък, изписани с ТОЧНОТО им име на български (копирай името дословно).",
      "- Всички количества са в ГРАМОВЕ (цели числа).",
      "- Съобрази дневните цели (калории и макроси) възможно най-близо за всеки ден.",
      "- Спазвай алергии, диета и изключени храни — НИКОГА не предлагай храна в конфликт с тях.",
      "- Връщай САМО валиден JSON по схемата по-долу. Без обяснения, без код-блокове, без текст преди/след.",
      'Схема: {"days":[{"weekday":0,"meals":[{"name":"Закуска","items":[{"food":"<точно име от списъка>","grams":60}]}]}]}',
      "weekday: 0=Понеделник, 1=Вторник, 2=Сряда, 3=Четвъртък, 4=Петък, 5=Събота, 6=Неделя.",
    ].join("\n");

    const c = client || {};
    const cons = [];
    if (target) cons.push(`Дневни цели: ~${round(target.kcal)} kcal, протеин ${round(target.protein_g)} g, въглехидрати ${round(target.carbs_g)} g, мазнини ${round(target.fat_g)} g.`);
    if (c.main_goal) cons.push(`Цел на клиента: ${c.main_goal}.`);
    if (c.diet) cons.push(`Диета/режим: ${c.diet}.`);
    if (c.allergies) cons.push(`Алергии/непоносимости (НЕ нарушавай): ${c.allergies}.`);
    if (c.excluded_foods) cons.push(`Изключени храни: ${c.excluded_foods}.`);
    if (extra.trim()) cons.push(`Допълнителни указания от нутриционста: ${extra.trim()}.`);

    const task = single
      ? `Състави режим само за ${DAYS[dayIdx]} (weekday ${dayIdx}) — 3-5 хранения.`
      : "Състави режим за всичките 7 дни (weekday 0..6), по 3-5 хранения на ден, с разнообразие между дните.";

    const userMsg = [
      task, "", cons.join("\n"), "",
      "НАЛИЧНИ ХРАНИ (име: калории/протеин/въглехидрати/мазнини на 100 g) — използвай само тези имена:",
      foodList,
    ].join("\n");

    try {
      const { text: reply, truncated } = await aiRequest({ system: sys, messages: [{ role: "user", content: userMsg }], maxTokens: single ? 1500 : 4000, timeoutMs: 120000 });
      if (truncated) throw new Error("Отговорът на AI беше прекъснат (твърде дълъг). Генерирай ден по ден или намали броя хранения.");
      const parsed = extractJson(reply);
      if (!Array.isArray(parsed.days) || parsed.days.length === 0) throw new Error("AI не върна дни за режима. Опитай отново.");
      const r = await onApply(parsed.days, { replace, singleDayWeekday: single ? dayIdx : null });
      setResult(r);
    } catch (e) {
      setErr("Грешка: " + (e.name === "SyntaxError" ? "AI върна невалиден формат. Опитай отново." : e.message));
    } finally { setBusy(false); }
  }

  return (
    <Modal title="✨ AI чернова на режим" onClose={busy ? () => {} : onClose}>
      {!result ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: t.muted, background: t.tealPale, borderRadius: 10, padding: "9px 12px", lineHeight: 1.5 }}>
            AI ще състави <b>чернова</b> само от храни в твоята база и ще съобрази целите и ограниченията на клиента. Ти проверяваш и коригираш след това — нищо не е финално.
          </div>
          <Field label="Обхват">
            <Select value={scope} onChange={setScope} options={[{ value: "week", label: "Цяла седмица (7 дни)" }, { value: "day", label: `Само ${DAYS[dayIdx]}` }]} />
          </Field>
          <Field label="Допълнителни указания (по избор)">
            <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="напр. без свинско, 4 хранения, повече риба…" />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: t.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ width: 17, height: 17, accentColor: t.coral }} />
            Замести съществуващото съдържание в избраните дни
          </label>
          {!client && <div style={{ fontSize: 12.5, color: t.warn }}>Няма зареден клиент — черновата ще е без цели/ограничения.</div>}
          {err && <div style={{ color: t.warn, fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Отказ</Button>
            <Button onClick={generate} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Генерирам…" : "Генерирай"}</Button>
          </div>
          {busy && <div style={{ fontSize: 12.5, color: t.muted }}>AI съставя режима и го добавя към плана… това може да отнеме 10-30 сек.</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 14, color: t.ink, background: t.tealPale, borderRadius: 10, padding: "10px 12px" }}>
            {result.added > 0 ? <>✅ Добавени <b>{result.added}</b> продукта в {result.days} {result.days === 1 ? "ден" : "дни"}. Това е чернова — стойностите се смятат от базата, но провери подбора и количествата.</> : <>AI не предложи нито един продукт от базата. Нищо не е добавено.</>}
          </div>
          {result.unmatched?.length > 0 && (
            <div style={{ fontSize: 12.5, color: t.coralDark, background: t.coralLight, borderRadius: 10, padding: "9px 12px" }}>
              ⚠️ {result.unmatched.length} предложени храни не бяха намерени в базата и са пропуснати: {result.unmatched.slice(0, 15).join(", ")}{result.unmatched.length > 15 ? "…" : ""}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={onClose}>Готово</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: { bg: "#eef4f3", fg: t.tealDark, label: "Чернова" },
    final: { bg: t.coral, fg: "#fff", label: "Финал" },
    archived: { bg: "#e9ecee", fg: t.muted, label: "Архив" },
  };
  const s = map[status] || map.draft;
  return <span style={{ background: s.bg, color: s.fg, borderRadius: 20, padding: "3px 11px", fontSize: 11.5, fontWeight: 700 }}>{s.label}</span>;
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
