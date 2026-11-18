import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../context/Auth.jsx";
import { t } from "../ui/theme.js";
import { Button, Card, Field, Input, Select, Stat } from "../ui/primitives.jsx";
import { useViewport } from "../ui/useViewport.js";
import {
  calcBMR, calcTDEE, calcEnergyTarget, calcMacros, calcBMI, predictWeeklyWeightChange, round, ACTIVITY_FACTORS,
} from "../lib/nutrition.mjs";

const n = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(",", ".")));
const FORMULA_BG = { mifflin: "Mifflin–St Jeor", harris_benedict: "Harris–Benedict", katch_mcardle: "Katch–McArdle" };
const BMI_BG = { underweight: "поднормено", normal: "нормално", overweight: "наднормено", obese: "затлъстяване", unknown: "" };
// Настройките, които се пазят със записаната цел и се зареждат обратно (телесните данни идват от профила).
const SETTING_KEYS = ["formula", "activity", "bodyFatPct", "energyMode", "energyValue", "proteinMode", "proteinValue", "fatMode", "fatValue"];
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("bg-BG"); } catch { return ""; } };

/** Работната версия на режима на клиента: както я отваря планерът (най-новата неархивирана). */
async function workingVersion(clientId) {
  const { data: pl, error: e1 } = await supabase.from("plans").select("id").eq("client_id", clientId).order("created_at").limit(1).maybeSingle();
  if (e1) throw e1;
  if (!pl) return { plan: null, version: null };
  const { data: vers, error: e2 } = await supabase.from("plan_versions").select("id, version, status, targets").eq("plan_id", pl.id).order("version", { ascending: false });
  if (e2) throw e2;
  return { plan: pl, version: (vers || []).find((v) => v.status !== "archived") || (vers || [])[0] || null };
}

export default function Calculator({ initial }) {
  const [f, setF] = useState({
    sex: "male", weightKg: 80, heightCm: 180, age: 30, bodyFatPct: "",
    formula: "mifflin", activity: "moderate",
    energyMode: "maintain", energyValue: 20,
    proteinMode: "g_per_kg", proteinValue: 2,
    fatMode: "g_per_kg", fatValue: 1,
    ...(initial || {}),
  });
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setSaveMsg(null); };
  const { session } = useAuth();
  const clientId = initial?.clientId || null;
  const [saveMsg, setSaveMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState(null);

  // При отваряне за клиент: зареждаме настройките от вече записаната цел (ако има).
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    workingVersion(clientId).then(({ version }) => {
      const inp = version?.targets?.inputs;
      if (!alive || !inp) return;
      const picked = {}; SETTING_KEYS.forEach((k) => { if (inp[k] !== undefined && inp[k] !== null) picked[k] = inp[k]; });
      setF((x) => ({ ...x, ...picked }));
      setLoadedFrom({ version: version.version, savedAt: version.targets.saved_at });
    }).catch(() => { /* без записана цел — работим с профила */ });
    return () => { alive = false; };
  }, [clientId]);
  const { width } = useViewport();
  const twoCol = width >= 900; // форма | резултати един до друг само при широк екран
  const statCols = "repeat(auto-fit,minmax(150px,1fr))";

  const r = useMemo(() => {
    const input = { sex: f.sex, weightKg: n(f.weightKg), heightCm: n(f.heightCm), age: n(f.age), bodyFatPct: n(f.bodyFatPct) };
    const bmr = calcBMR(f.formula, input);
    const { tdee, factor } = calcTDEE({ bmr: bmr.value, activityLevel: f.activity });
    const energy = calcEnergyTarget({ tdee, mode: f.energyMode, value: n(f.energyValue) || 0 });
    const macros = calcMacros({
      calories: energy.target, weightKg: n(f.weightKg),
      spec: { protein: { mode: f.proteinMode, value: n(f.proteinValue) || 0 }, fat: { mode: f.fatMode, value: n(f.fatValue) || 0 } },
    });
    const bmi = calcBMI({ weightKg: n(f.weightKg), heightCm: n(f.heightCm) });
    const pred = predictWeeklyWeightChange(energy.deltaVsMaintain);
    const warnings = [];
    const rng = (v, lo, hi, label) => { if (!isFinite(v)) warnings.push(`Липсва ${label}.`); else if (v < lo || v > hi) warnings.push(`${label[0].toUpperCase() + label.slice(1)} извън реалистичния диапазон (${lo}–${hi}).`); };
    rng(input.weightKg, 25, 350, "тегло"); rng(input.heightCm, 100, 250, "ръст"); rng(input.age, 14, 110, "възраст");
    if (bmr.fallbackFrom) warnings.push("Katch–McArdle изисква валиден % телесни мазнини (1–70). Използвана е Mifflin–St Jeor.");
    if (macros.overAllocatedKcal > 0) warnings.push(`Протеинът и мазнините заедно надхвърлят дневната цел с ${round(macros.overAllocatedKcal)} kcal — въглехидратите са 0. Намали стойностите.`);
    if (energy.target > 0 && energy.target < bmr.value) warnings.push(`Целта (${round(energy.target)} kcal) е под базалния метаболизъм (${round(bmr.value)} kcal).`);
    const valid = isFinite(bmr.value) && bmr.value > 0;
    return { bmr, tdee, factor, energy, macros, bmi, pred, warnings, valid };
  }, [f]);
  const show = (v, d = 0) => (r.valid && isFinite(v) ? round(v, d) : "—");
  const canSave = r.valid && r.energy.target > 0 && !(r.macros.overAllocatedKcal > 0);

  async function saveTarget() {
    if (!clientId || !canSave || saving) return;
    setSaving(true); setSaveMsg(null);
    try {
      let { plan, version } = await workingVersion(clientId);
      if (version?.status === "final") {
        setSaveMsg({ ok: false, text: `Версия ${version.version} на режима е финализирана и заключена. В „Седмичен режим" направи „Нова версия → Дублирай текущата" и запиши целта отново.` });
        return;
      }
      const targets = {
        kcal: round(r.energy.target, 2), protein_g: round(r.macros.protein.grams, 2), carbs_g: round(r.macros.carbs.grams, 2), fat_g: round(r.macros.fat.grams, 2),
        source: "calculator", saved_at: new Date().toISOString(), bmr: round(r.bmr.value, 1), tdee: round(r.tdee, 1),
        inputs: { sex: f.sex, weightKg: n(f.weightKg), heightCm: n(f.heightCm), age: n(f.age), ...Object.fromEntries(SETTING_KEYS.map((k) => [k, f[k]])) },
      };
      if (!plan) {
        const { data: np, error } = await supabase.from("plans").insert({ client_id: clientId, nutritionist_id: session.user.id, title: "Седмичен режим" }).select("id").single();
        if (error) throw error; plan = np;
      }
      if (!version) {
        const { data: nv, error } = await supabase.from("plan_versions").insert({ plan_id: plan.id, version: 1, status: "draft", targets }).select("id, version").single();
        if (error) throw error; version = nv;
      } else {
        const { error } = await supabase.from("plan_versions").update({ targets }).eq("id", version.id);
        if (error) throw error;
      }
      setLoadedFrom({ version: version.version, savedAt: targets.saved_at });
      setSaveMsg({ ok: true, text: `Целта е записана към режим v${version.version}: ${round(targets.kcal)} kcal · П ${round(targets.protein_g)} г · В ${round(targets.carbs_g)} г · М ${round(targets.fat_g)} г.` });
    } catch (e) {
      setSaveMsg({ ok: false, text: "Записът не успя: " + (e.message || e) });
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: twoCol ? "minmax(280px,360px) 1fr" : "1fr", alignItems: "start" }}>
      <Card>
        <h3 style={{ margin: "0 0 12px", color: t.ink }}>Параметри</h3>
        <Field label="Пол"><Select value={f.sex} onChange={(v) => set("sex", v)} options={[{ value: "male", label: "Мъж" }, { value: "female", label: "Жена" }]} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Тегло (кг)"><Input type="number" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value)} /></Field>
          <Field label="Ръст (см)"><Input type="number" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value)} /></Field>
          <Field label="Възраст"><Input type="number" value={f.age} onChange={(e) => set("age", e.target.value)} /></Field>
          <Field label="% телесни мазнини" hint="за Katch–McArdle"><Input type="number" value={f.bodyFatPct} onChange={(e) => set("bodyFatPct", e.target.value)} /></Field>
        </div>
        <Field label="Формула (BMR)"><Select value={f.formula} onChange={(v) => set("formula", v)} options={[
          { value: "mifflin", label: "Mifflin–St Jeor" }, { value: "harris_benedict", label: "Harris–Benedict" }, { value: "katch_mcardle", label: "Katch–McArdle" },
        ]} /></Field>
        <Field label="Ниво на активност"><Select value={f.activity} onChange={(v) => set("activity", v)} options={[
          { value: "sedentary", label: `Заседнал (${ACTIVITY_FACTORS.sedentary})` },
          { value: "light", label: `Ниска (${ACTIVITY_FACTORS.light})` },
          { value: "moderate", label: `Умерена (${ACTIVITY_FACTORS.moderate})` },
          { value: "high", label: `Висока (${ACTIVITY_FACTORS.high})` },
          { value: "extreme", label: `Екстремна (${ACTIVITY_FACTORS.extreme})` },
        ]} /></Field>

        <h4 style={{ margin: "14px 0 8px", color: t.ink }}>Енергийна цел</h4>
        <Field label="Режим"><Select value={f.energyMode} onChange={(v) => set("energyMode", v)} options={[
          { value: "maintain", label: "Поддържане" }, { value: "deficit_pct", label: "Дефицит %" }, { value: "deficit_abs", label: "Дефицит kcal" },
          { value: "surplus_pct", label: "Излишък %" }, { value: "surplus_abs", label: "Излишък kcal" }, { value: "manual", label: "Ръчна цел kcal" },
        ]} /></Field>
        {f.energyMode !== "maintain" && <Field label="Стойност"><Input type="number" value={f.energyValue} onChange={(e) => set("energyValue", e.target.value)} /></Field>}

        <h4 style={{ margin: "14px 0 8px", color: t.ink }}>Макроси</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Протеин — режим"><Select value={f.proteinMode} onChange={(v) => set("proteinMode", v)} options={[{ value: "g_per_kg", label: "g/kg" }, { value: "pct", label: "% kcal" }, { value: "grams", label: "грам" }]} /></Field>
          <Field label="Протеин — стойност"><Input type="number" value={f.proteinValue} onChange={(e) => set("proteinValue", e.target.value)} /></Field>
          <Field label="Мазнини — режим"><Select value={f.fatMode} onChange={(v) => set("fatMode", v)} options={[{ value: "g_per_kg", label: "g/kg" }, { value: "pct", label: "% kcal" }, { value: "grams", label: "грам" }]} /></Field>
          <Field label="Мазнини — стойност"><Input type="number" value={f.fatValue} onChange={(e) => set("fatValue", e.target.value)} /></Field>
        </div>
        <div style={{ fontSize: 11.5, color: t.muted }}>Въглехидратите се изчисляват като остатък от калориите.</div>
      </Card>

      <div style={{ display: "grid", gap: 14 }}>
        {initial?.clientName && <Card style={{ background: t.tealPale, border: "none", color: t.tealDark, fontSize: 13, padding: "10px 14px", display: "grid", gap: 8 }}>
          <div>Заредени са данните на клиент <b>{initial.clientName}</b>. Калкулаторът не променя профила му.{loadedFrom && <> Настройките са от записаната цел на режим v{loadedFrom.version}{loadedFrom.savedAt ? ` (${fmtDate(loadedFrom.savedAt)})` : ""}.</>}</div>
          {clientId && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button onClick={saveTarget} disabled={!canSave || saving} style={{ opacity: !canSave || saving ? 0.55 : 1 }}>{saving ? "Записване…" : "Запази като цел на режима"}</Button>
            <span style={{ fontSize: 12, color: t.muted }}>Планерът, AI асистентът и PDF ще сравняват режима с тази цел.</span>
          </div>}
          {saveMsg && <div role="status" style={{ fontSize: 13, fontWeight: 600, color: saveMsg.ok ? t.good : t.warn }}>{saveMsg.text}</div>}
        </Card>}
        {r.warnings.length > 0 && <Card role="alert" style={{ background: t.coralLight, border: "none", color: t.coralDark, fontSize: 13, padding: "10px 14px" }}>
          {r.warnings.map((w) => <div key={w}>⚠️ {w}</div>)}
        </Card>}
        <div style={{ display: "grid", gridTemplateColumns: statCols, gap: 12 }}>
          <Stat label={`BMR (${FORMULA_BG[r.bmr.formula]})`} value={show(r.bmr.value)} unit="kcal" />
          <Stat label={`TDEE (×${r.factor})`} value={show(r.tdee)} unit="kcal" />
          <Stat label="Дневна цел" value={show(r.energy.target)} unit="kcal" accent={t.coral} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: statCols, gap: 12 }}>
          <Stat label="Протеин" value={show(r.macros.protein.grams)} unit={`г · ${show(r.macros.protein.pct)}%`} accent="#E08A66" />
          <Stat label="Въглехидрати" value={show(r.macros.carbs.grams)} unit={`г · ${show(r.macros.carbs.pct)}%`} accent={t.coralDark} />
          <Stat label="Мазнини" value={show(r.macros.fat.grams)} unit={`г · ${show(r.macros.fat.pct)}%`} accent={t.tealDark} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat label="BMI" value={isFinite(r.bmi.bmi) ? round(r.bmi.bmi, 1) : "—"} unit={BMI_BG[r.bmi.band]} />
          <Stat label="Прогноза тегло" value={r.valid ? `${r.pred.kgPerWeek > 0 ? "+" : ""}${round(r.pred.kgPerWeek, 2)}` : "—"} unit="кг/седм." accent={r.pred.kgPerWeek > 0 ? t.coral : t.good} />
        </div>
        <Card style={{ background: t.tealPale, border: "none" }}>
          <div style={{ fontSize: 12.5, color: t.tealDark, fontWeight: 700, marginBottom: 6 }}>Проверимост (формула и параметри)</div>
          <div style={{ fontSize: 12, color: t.muted, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            {`формула: ${r.bmr.formula}\nпараметри: ${JSON.stringify(r.bmr.params)}\nTDEE = BMR × ${r.factor}\nцел = ${r.energy.mode} (${round(r.energy.deltaVsMaintain)} kcal спрямо поддържане)\nсверка макро-калории: ${round(r.macros.reconciledKcal)} kcal`}
          </div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 8 }}>{r.bmi.note} {r.pred.assumption}</div>
        </Card>
      </div>
    </div>
  );
}
