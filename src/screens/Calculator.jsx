import React, { useMemo, useState } from "react";
import { t } from "../ui/theme.js";
import { Card, Field, Input, Select, Stat } from "../ui/primitives.jsx";
import { useViewport } from "../ui/useViewport.js";
import {
  calcBMR, calcTDEE, calcEnergyTarget, calcMacros, calcBMI, predictWeeklyWeightChange, round, ACTIVITY_FACTORS,
} from "../lib/nutrition.mjs";

const n = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(",", ".")));
const FORMULA_BG = { mifflin: "Mifflin–St Jeor", harris_benedict: "Harris–Benedict", katch_mcardle: "Katch–McArdle" };
const BMI_BG = { underweight: "поднормено", normal: "нормално", overweight: "наднормено", obese: "затлъстяване", unknown: "" };

export default function Calculator({ initial }) {
  const [f, setF] = useState({
    sex: "male", weightKg: 80, heightCm: 180, age: 30, bodyFatPct: "",
    formula: "mifflin", activity: "moderate",
    energyMode: "maintain", energyValue: 20,
    proteinMode: "g_per_kg", proteinValue: 2,
    fatMode: "g_per_kg", fatValue: 1,
    ...(initial || {}),
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
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
        {initial?.clientName && <Card style={{ background: t.tealPale, border: "none", color: t.tealDark, fontSize: 13, padding: "9px 14px" }}>Заредени са данните на клиент <b>{initial.clientName}</b>. Калкулаторът не променя профила му.</Card>}
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
