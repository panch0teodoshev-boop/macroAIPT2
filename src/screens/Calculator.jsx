import React, { useMemo, useState } from "react";
import { t } from "../ui/theme.js";
import { Card, Field, Input, Select, Stat } from "../ui/primitives.jsx";
import { useViewport } from "../ui/useViewport.js";
import {
  calcBMR, calcTDEE, calcEnergyTarget, calcMacros, calcBMI, predictWeeklyWeightChange, round, ACTIVITY_FACTORS,
} from "../lib/nutrition.mjs";

const n = (v) => (v === "" || v == null ? NaN : Number(v));

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
    return { bmr, tdee, factor, energy, macros, bmi, pred };
  }, [f]);

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
        <div style={{ display: "grid", gridTemplateColumns: statCols, gap: 12 }}>
          <Stat label="BMR" value={round(r.bmr.value)} unit="kcal" />
          <Stat label={`TDEE (×${r.factor})`} value={round(r.tdee)} unit="kcal" />
          <Stat label="Дневна цел" value={round(r.energy.target)} unit="kcal" accent={t.coral} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: statCols, gap: 12 }}>
          <Stat label="Протеин" value={round(r.macros.protein.grams)} unit={`г · ${round(r.macros.protein.pct)}%`} accent="#E08A66" />
          <Stat label="Въглехидрати" value={round(r.macros.carbs.grams)} unit={`г · ${round(r.macros.carbs.pct)}%`} accent={t.coralDark} />
          <Stat label="Мазнини" value={round(r.macros.fat.grams)} unit={`г · ${round(r.macros.fat.pct)}%`} accent={t.tealDark} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat label="BMI" value={round(r.bmi.bmi, 1)} unit={r.bmi.band} />
          <Stat label="Прогноза тегло" value={`${r.pred.kgPerWeek >= 0 ? "+" : ""}${round(r.pred.kgPerWeek, 2)}`} unit="кг/седм." accent={r.pred.kgPerWeek > 0 ? t.coral : t.good} />
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
