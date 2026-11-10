import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Select } from "../ui/primitives.jsx";
import { calcBMR, calcTDEE, calcEnergyTarget, calcMacros, round } from "../lib/nutrition.mjs";

const AI_ENDPOINT = import.meta.env.VITE_AI_PROXY_URL || "";
const MK = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"];
const zero = () => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
function itemTot(it) { const q = +it.qty || 0, s = it.snapshot || {}, f = it.unit === "serving" || it.unit === "piece" ? q : q / 100; const o = zero(); for (const k of MK) o[k] = (+s[k] || 0) * f; return o; }

function targetFor(c) {
  if (!c) return null;
  const age = c.birth_date ? Math.max(14, Math.floor((Date.now() - new Date(c.birth_date)) / 3.15576e10)) : 30;
  const bmr = calcBMR("mifflin", { sex: c.sex || "male", weightKg: +c.weight_kg || 70, heightCm: +c.height_cm || 170, age }).value;
  const { tdee } = calcTDEE({ bmr, activityLevel: c.activity_level || "moderate" });
  const mode = { reduction: "deficit_pct", muscle_gain: "surplus_pct" }[c.main_goal] || "maintain";
  const energy = calcEnergyTarget({ tdee, mode, value: 15 });
  const m = calcMacros({ calories: energy.target, weightKg: +c.weight_kg || 70, spec: { protein: { mode: "g_per_kg", value: 2 }, fat: { mode: "g_per_kg", value: 1 } } });
  return { age, tdee, kcal: energy.target, protein_g: m.protein.grams, carbs_g: m.carbs.grams, fat_g: m.fat.grams };
}

const QUICK = [
  "Анализирай седмичния режим и в кои дни протеинът е под целта.",
  "Предложи алтернативна закуска със сходни калории и повече фибри.",
  "Оптимизирай режима до средно 2000 kcal и 150 g протеин.",
  "Кои микронутриенти вероятно не достигат (отчети непълните данни)?",
];

export default function AIAssistant() {
  const { session } = useAuth();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [ctx, setCtx] = useState(null); // {client, target, planAvg, microCoverage, recipes}
  const [messages, setMessages] = useState([]);
  const [convId, setConvId] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, busy]);

  useEffect(() => { supabase.from("clients").select("id, first_name, last_name").eq("archived", false).order("first_name").then(({ data }) => setClients(data || [])); }, []);

  async function pickClient(id) {
    setClientId(id); setMessages([]); setConvId(null); setCtx(null);
    if (!id) return;
    const { data: c } = await supabase.from("clients").select("*").eq("id", id).single();
    const target = targetFor(c);
    // план (последна версия) → среден дневен прием + микро покритие
    let planAvg = null, microCoverage = null;
    const { data: plan } = await supabase.from("plans").select("id").eq("client_id", id).limit(1).maybeSingle();
    if (plan) {
      const { data: ver } = await supabase.from("plan_versions").select("id").eq("plan_id", plan.id).order("version", { ascending: false }).limit(1).maybeSingle();
      if (ver) {
        const { data: days } = await supabase.from("plan_days").select("weekday, plan_meals(plan_meal_items(qty, unit, snapshot, foods(micros)))").eq("version_id", ver.id);
        const tot = zero(); let foodItems = 0, withMic = 0;
        (days || []).forEach((d) => (d.plan_meals || []).forEach((m) => (m.plan_meal_items || []).forEach((it) => {
          const x = itemTot(it); for (const k of MK) tot[k] += x[k];
          if (it.unit !== "serving") { foodItems++; if (it.foods?.micros && Object.keys(it.foods.micros).length) withMic++; }
        })));
        planAvg = Object.fromEntries(MK.map((k) => [k, tot[k] / 7]));
        microCoverage = foodItems ? Math.round((withMic / foodItems) * 100) : 0;
      }
    }
    const { data: recs } = await supabase.from("recipes").select("name").limit(60);
    setCtx({ client: c, target, planAvg, microCoverage, recipes: (recs || []).map((r) => r.name) });
    // заредена последна конверсация
    const { data: conv } = await supabase.from("ai_conversations").select("id, messages").eq("client_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (conv) { setConvId(conv.id); setMessages(conv.messages || []); }
  }

  const buildSystem = () => {
    const c = ctx?.client, tg = ctx?.target;
    const lines = [
      "Ти си професионален асистент за НУТРИЦИОНИСТ (не за клиента) в софтуер за хранителни режими. Отговаряй на български, кратко и практично.",
      "Изчисленията в приложението се правят от детерминистичен модул и базата — ти ПРЕДЛАГАШ, но промените се прилагат само след като нутриционистът ги въведе ръчно. Давай приблизителни калории/макроси за предложенията си.",
      "Не поставяй медицински диагнози и не представяй съветите като предписание.",
    ];
    if (c) lines.push(`\nКЛИЕНТ (анонимизиран): пол ${c.sex || "?"}, възраст ~${tg?.age}, тегло ${c.weight_kg || "?"} кг, ръст ${c.height_cm || "?"} см, активност ${c.activity_level || "?"}, цел ${c.main_goal || "?"}.`);
    if (tg) lines.push(`ДНЕВНИ ЦЕЛИ (изчислени): ${round(tg.kcal)} kcal, протеин ${round(tg.protein_g)} g, въглехидрати ${round(tg.carbs_g)} g, мазнини ${round(tg.fat_g)} g.`);
    if (ctx?.planAvg) lines.push(`ТЕКУЩ РЕЖИМ — средно/ден: ${round(ctx.planAvg.kcal)} kcal, П ${round(ctx.planAvg.protein_g)} / В ${round(ctx.planAvg.carbs_g)} / М ${round(ctx.planAvg.fat_g)}, фибри ${round(ctx.planAvg.fiber_g)} g.`);
    if (ctx?.microCoverage != null) lines.push(`МИКРОНУТРИЕНТИ: само ${ctx.microCoverage}% от продуктите имат зададени микроданни — отчитай, че данните са НЕПЪЛНИ и не приемай липсата за нула.`);
    if (c?.allergies) lines.push(`АЛЕРГИИ/НЕПОНОСИМОСТИ: ${c.allergies}. НИКОГА не предлагай храни в конфликт с тях.`);
    if (c?.diet) lines.push(`ДИЕТА/РЕЖИМ: ${c.diet}.`);
    if (c?.excluded_foods) lines.push(`ИЗКЛЮЧЕНИ ХРАНИ: ${c.excluded_foods}.`);
    if (ctx?.recipes?.length) lines.push(`НАЛИЧНИ РЕЦЕПТИ (може да ги ползваш в предложения): ${ctx.recipes.join(", ")}.`);
    return lines.join("\n");
  };

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    if (!AI_ENDPOINT) { setMessages((m) => [...m, { role: "assistant", content: "AI не е конфигуриран (липсва прокси адрес)." }]); return; }
    setInput("");
    const next = [...messages, { role: "user", content }];
    setMessages(next); setBusy(true);
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, system: buildSystem(), messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data?.error?.message || ("HTTP " + res.status));
      const reply = (data.content || []).map((b) => b.text || "").join("").trim() || "(празен отговор)";
      const updated = [...next, { role: "assistant", content: reply }];
      setMessages(updated);
      // запис на разговора
      if (convId) await supabase.from("ai_conversations").update({ messages: updated, updated_at: new Date().toISOString() }).eq("id", convId);
      else { const { data: ins } = await supabase.from("ai_conversations").insert({ nutritionist_id: session.user.id, client_id: clientId || null, messages: updated }).select("id").single(); if (ins) setConvId(ins.id); }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ Грешка: " + e.message }]);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 14, height: "calc(100vh - 48px)", gridTemplateRows: "auto auto 1fr auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, color: t.ink }}>AI асистент</h2>
        <Select value={clientId} onChange={pickClient} style={{ width: "auto", minWidth: 220 }}
          options={[{ value: "", label: "Без клиент (общи въпроси)" }, ...clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name || ""}` }))]} />
        {messages.length > 0 && <button onClick={() => { setMessages([]); }} style={{ border: "none", background: "none", color: t.muted, cursor: "pointer", fontSize: 13 }}>Изчисти</button>}
      </div>

      <div style={{ fontSize: 12.5, color: t.muted, background: t.tealPale, borderRadius: 10, padding: "8px 12px" }}>
        {ctx?.client ? `Контекст: клиент (${ctx.client.sex}, ~${ctx.target?.age} г.), цели ${round(ctx.target?.kcal)} kcal · П ${round(ctx.target?.protein_g)} г${ctx.planAvg ? ` · режим ~${round(ctx.planAvg.kcal)} kcal/ден` : ""}. Данните са минимизирани (без име/бележки).` : "Съветник за нутриционисти. Избери клиент за контекст (профил, цели, режим). Промените се прилагат само след твое потвърждение."}
      </div>

      <div style={{ overflowY: "auto", display: "grid", gap: 10, alignContent: "start", padding: "2px" }}>
        {messages.length === 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {QUICK.map((qp) => <button key={qp} onClick={() => send(qp)} style={{ textAlign: "left", border: `1px solid ${t.line}`, background: "#fff", borderRadius: 12, padding: "11px 14px", cursor: "pointer", fontSize: 14, color: t.ink }}>{qp}</button>)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5, padding: "10px 13px", borderRadius: 14, background: m.role === "user" ? t.teal : "#fff", color: m.role === "user" ? "#fff" : t.ink, border: m.role === "user" ? "none" : `1px solid ${t.line}` }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ color: t.muted, fontSize: 13 }}>Мисля…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Въпрос за режима, замени, оптимизация…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, fontFamily: "inherit", fontSize: 14, color: t.ink, border: `1px solid ${t.line}`, borderRadius: 12, padding: "11px 12px", outline: "none", resize: "none", maxHeight: 120 }} />
        <Button onClick={() => send()} style={{ opacity: input.trim() && !busy ? 1 : 0.6 }}>Изпрати</Button>
      </div>
    </div>
  );
}
