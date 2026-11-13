import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Select } from "../ui/primitives.jsx";
import { round } from "../lib/nutrition.mjs";
import { dayTotals, weekSummary, clientTarget as targetFor } from "../lib/planMath.mjs";
import { aiRequest, trimHistory } from "../lib/ai.js";

const DAYS = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];

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
    // режим: финалната версия, иначе най-новата неархивирана → дневни суми (смята ги приложението, не моделът)
    let planAvg = null, microCoverage = null, perDay = null, planInfo = null;
    const { data: plan } = await supabase.from("plans").select("id").eq("client_id", id).order("created_at").limit(1).maybeSingle();
    if (plan) {
      const { data: vers } = await supabase.from("plan_versions").select("id, version, status").eq("plan_id", plan.id).order("version", { ascending: false });
      const ver = (vers || []).find((v) => v.status === "final") || (vers || []).find((v) => v.status !== "archived") || (vers || [])[0];
      if (ver) {
        const { data: days } = await supabase.from("plan_days").select("weekday, plan_meals(name, position, plan_meal_items(qty, unit, snapshot, foods(micros)))").eq("version_id", ver.id).order("weekday");
        const seen = new Set(); const tree = (days || []).filter((d) => !seen.has(d.weekday) && seen.add(d.weekday));
        const w = weekSummary(tree);
        let foodItems = 0, withMic = 0;
        tree.forEach((d) => (d.plan_meals || []).forEach((m) => (m.plan_meal_items || []).forEach((it) => {
          if (it.unit !== "serving") { foodItems++; if (it.foods?.micros && Object.keys(it.foods.micros).length) withMic++; }
        })));
        if (w.items > 0) {
          planAvg = w.avg;
          perDay = tree.map((d) => ({ weekday: d.weekday, ...dayTotals(d), meals: (d.plan_meals || []).filter((m) => (m.plan_meal_items || []).length).map((m) => `${m.name}: ${(m.plan_meal_items || []).map((it) => `${it.snapshot?.name || "?"} ${round(it.qty, 1)}${it.unit === "serving" ? " порц." : it.unit === "piece" ? " бр" : " г"}`).join(", ")}`) }));
          planInfo = { version: ver.version, status: ver.status, filledDays: w.filledDays, incompleteItems: w.incompleteItems };
          microCoverage = foodItems ? Math.round((withMic / foodItems) * 100) : 0;
        }
      }
    }
    const { data: recs } = await supabase.from("recipes").select("name").limit(60);
    setCtx({ client: c, target, planAvg, perDay, planInfo, microCoverage, recipes: (recs || []).map((r) => r.name) });
    // заредена последна конверсация
    const { data: conv } = await supabase.from("ai_conversations").select("id, messages").eq("client_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (conv) { setConvId(conv.id); setMessages(conv.messages || []); }
  }

  const buildSystem = () => {
    const c = ctx?.client, tg = ctx?.target;
    const lines = [
      "Ти си професионален асистент за НУТРИЦИОНИСТ (не за клиента) в софтуер за хранителни режими. Отговаряй на български, кратко и практично.",
      "Изчисленията в приложението се правят от детерминистичен модул и хранителната база — ти ПРЕДЛАГАШ, а промените се прилагат само след като нутриционистът ги въведе ръчно.",
      "Числата в секциите ДАННИ по-долу са изчислени от приложението — цитирай ги точно и не ги преизчислявай. Когато даваш хранителни стойности за храни ИЗВЪН тези данни, изрично ги отбелязвай като „ориентировъчни (по памет)“ и напомняй, че точните стойности се получават след въвеждане в режима. Ако не знаеш стойност — кажи го, не я измисляй.",
      "Ако те питат за нещо, за което нямаш данни в контекста (напр. конкретен ден без въведени продукти), кажи какво липсва, вместо да предполагаш.",
      "Не поставяй медицински диагнози и не представяй съветите като предписание.",
    ];
    if (c) lines.push("\nВ момента нутриционистът е избрал ЕДИН клиент и всички секции по-долу са НЕГОВИТЕ данни, подадени от приложението. Името е скрито нарочно (минимизиране на данните) и в съобщенията се заменя с „[клиентът]“. Когато нутриционистът пише „клиента“, „режима му“, „[клиентът]“ или лично име, той има предвид точно този клиент — работи директно с данните по-долу и не казвай, че нямаш достъп до профила.");
    if (c) lines.push(`КЛИЕНТ (анонимизиран): пол ${c.sex || "?"}, възраст ${c.birth_date ? tg?.age : "неизвестна"}, тегло ${c.weight_kg || "?"} кг, ръст ${c.height_cm || "?"} см, активност ${c.activity_level || "?"}, цел ${c.main_goal || "?"}.`);
    if (tg) lines.push(`ДАННИ — ДНЕВНИ ЦЕЛИ (ориентир от приложението): ${round(tg.kcal)} kcal, протеин ${round(tg.protein_g)} g, въглехидрати ${round(tg.carbs_g)} g, мазнини ${round(tg.fat_g)} g.${tg.assumed?.length ? ` ВНИМАНИЕ: в профила липсва ${tg.assumed.join(", ")} — целите са по стойности по подразбиране и не са индивидуални; кажи го на нутрициониста.` : ""}`);
    if (ctx?.planAvg) {
      const pi = ctx.planInfo;
      lines.push(`ДАННИ — ТЕКУЩ РЕЖИМ (версия ${pi.version}, ${pi.status === "final" ? "финална" : "чернова"}; попълнени дни: ${pi.filledDays}/7) — средно/ден (÷7): ${round(ctx.planAvg.kcal)} kcal, П ${round(ctx.planAvg.protein_g)} / В ${round(ctx.planAvg.carbs_g)} / М ${round(ctx.planAvg.fat_g)}, фибри ${round(ctx.planAvg.fiber_g)} g.`);
      lines.push("ПО ДНИ (изчислено от приложението):");
      for (const d of ctx.perDay) lines.push(`- ${DAYS[d.weekday]}: ${d.meals.length ? `${round(d.kcal)} kcal, П ${round(d.protein_g)} / В ${round(d.carbs_g)} / М ${round(d.fat_g)}, фибри ${round(d.fiber_g)} g. ${d.meals.join(" | ")}` : "няма въведени продукти"}`);
      if (pi.incompleteItems) lines.push(`ВНИМАНИЕ: ${pi.incompleteItems} продукта са с непълни макроданни — сумите са долна граница.`);
    } else if (c) lines.push("ТЕКУЩ РЕЖИМ: няма въведени продукти.");
    if (ctx?.microCoverage != null) lines.push(`МИКРОНУТРИЕНТИ: само ${ctx.microCoverage}% от продуктите имат зададени микроданни — отчитай, че данните са НЕПЪЛНИ и не приемай липсата за нула.`);
    if (c?.allergies) lines.push(`АЛЕРГИИ/НЕПОНОСИМОСТИ: ${c.allergies}. НИКОГА не предлагай храни в конфликт с тях.`);
    if (c?.diet) lines.push(`ДИЕТА/РЕЖИМ: ${c.diet}.`);
    if (c?.excluded_foods) lines.push(`ИЗКЛЮЧЕНИ ХРАНИ: ${c.excluded_foods}.`);
    if (ctx?.recipes?.length) lines.push(`НАЛИЧНИ РЕЦЕПТИ (може да ги ползваш в предложения): ${ctx.recipes.join(", ")}.`);
    return lines.join("\n");
  };

  // Името на клиента не напуска приложението: заменя се в съобщенията към модела.
  const redactName = (txt) => {
    const c = ctx?.client; if (!c || typeof txt !== "string") return txt;
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const f = (c.first_name || "").trim(), l = (c.last_name || "").trim();
    let out = txt;
    if (f && l) out = out.replace(new RegExp(`${esc(f)}\\s+${esc(l)}|${esc(l)}\\s+${esc(f)}`, "gi"), "[клиентът]");
    for (const n of [l, f]) if (n.length >= 3) out = out.replace(new RegExp(`(?<![\\p{L}])${esc(n)}(?![\\p{L}])`, "giu"), "[клиентът]");
    return out;
  };

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content }];
    setMessages(next); setBusy(true);
    try {
      const { text, truncated } = await aiRequest({ system: buildSystem(), messages: trimHistory(next.filter((m) => !m.error)).map((m) => ({ ...m, content: redactName(m.content) })), maxTokens: 1500 });
      const reply = (text || "(празен отговор)") + (truncated ? "\n\n[Отговорът е съкратен поради ограничение на дължината — помоли за продължение.]" : "");
      const updated = [...next, { role: "assistant", content: reply }];
      setMessages(updated);
      // запис на разговора
      const toSave = updated.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
      if (convId) await supabase.from("ai_conversations").update({ messages: toSave, updated_at: new Date().toISOString() }).eq("id", convId);
      else { const { data: ins } = await supabase.from("ai_conversations").insert({ nutritionist_id: session.user.id, client_id: clientId || null, messages: toSave }).select("id").single(); if (ins) setConvId(ins.id); }
    } catch (e) {
      // грешките се показват, но НЕ се записват и не се пращат обратно към модела
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ " + e.message, error: true }]);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 14, height: "calc(100vh - 48px)", gridTemplateRows: "auto auto 1fr auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, color: t.ink }}>AI асистент</h2>
        <Select value={clientId} onChange={pickClient} style={{ width: "auto", minWidth: 220 }}
          options={[{ value: "", label: "Без клиент (общи въпроси)" }, ...clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name || ""}` }))]} />
        {messages.length > 0 && <button title="Започва нов разговор (старият остава записан)" onClick={() => { setMessages([]); setConvId(null); }} style={{ border: "none", background: "none", color: t.muted, cursor: "pointer", fontSize: 13 }}>Нов разговор</button>}
      </div>

      <div style={{ fontSize: 12.5, color: t.muted, background: t.tealPale, borderRadius: 10, padding: "8px 12px" }}>
        {ctx?.client ? `Контекст: клиент (${ctx.client.sex === "female" ? "жена" : ctx.client.sex === "male" ? "мъж" : "пол ?"}${ctx.client.birth_date ? `, ${ctx.target?.age} г.` : ""}), цели ${round(ctx.target?.kcal)} kcal · П ${round(ctx.target?.protein_g)} г${ctx.planAvg ? ` · режим ~${round(ctx.planAvg.kcal)} kcal/ден` : ""}. Данните са минимизирани (без име/бележки).` : "Съветник за нутриционисти. Избери клиент за контекст (профил, цели, режим). Промените се прилагат само след твое потвърждение."}
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
