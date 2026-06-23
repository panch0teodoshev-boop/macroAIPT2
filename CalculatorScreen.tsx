import React from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ACTIVITY, GOALS, SEX_OPTIONS } from "../constants";
import { useStore } from "../store/AppContext";
import { theme } from "../theme";
import { computePlan, fmt } from "../utils/formulas";
import { Card, Dropdown, Field, NumberInput, SectionBar, Segmented, StatTile } from "../components/ui";

export default function CalculatorScreen() {
  const { state, actions } = useStore();
  const { profile, macros } = state;
  const plan = computePlan(profile, macros);
  const macroSum = macros.protein + macros.carbs + macros.fat;
  const macroOk = macroSum === 100;
  const useManual = profile.manualCalories != null;

  return (
    <ScrollView contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
      <SectionBar color={theme.tealDark}>Калкулатор на калории (Mifflin–St Jeor)</SectionBar>

      <Card>
        <Field label="Пол">
          <Segmented value={profile.sex} onChange={(v) => actions.setProfile({ sex: v })} options={SEX_OPTIONS} />
        </Field>
        <Field label="Тегло"><NumberInput value={String(profile.weight)} onChangeText={(v) => actions.setProfile({ weight: Number(v) || 0 })} suffix="кг" /></Field>
        <Field label="Ръст"><NumberInput value={String(profile.height)} onChangeText={(v) => actions.setProfile({ height: Number(v) || 0 })} suffix="см" /></Field>
        <Field label="Възраст"><NumberInput value={String(profile.age)} onChangeText={(v) => actions.setProfile({ age: Number(v) || 0 })} suffix="г" /></Field>
        <Field label="Ниво на активност">
          <Dropdown value={profile.activity} onChange={(v) => actions.setProfile({ activity: v })} options={ACTIVITY.map((a) => ({ value: a.id, label: a.label }))} />
        </Field>
        <View style={st.row}>
          <StatTile label="BMR" value={fmt(plan.bmr)} unit="kcal" />
          <StatTile label="Коефициент" value={ACTIVITY.find((a) => a.id === profile.activity)?.mult ?? ""} />
          <StatTile label="TDEE" value={fmt(plan.tdee)} unit="kcal" highlight />
        </View>
      </Card>

      <Card>
        <Text style={st.h}>Цел</Text>
        <Segmented value={profile.goal} onChange={(v) => actions.setProfile({ goal: v })} options={GOALS.map((g) => ({ value: g.id, label: g.label }))} />
        <Field label="Ръчно задаване на калории">
          <View style={st.manualRow}>
            <Switch
              value={useManual}
              onValueChange={(on) => actions.setProfile({ manualCalories: on ? Math.round(plan.tdee) : null })}
              trackColor={{ true: theme.coral, false: theme.line }}
              thumbColor="#fff"
            />
            {useManual ? (
              <NumberInput width={90} value={String(profile.manualCalories ?? "")} onChangeText={(v) => actions.setProfile({ manualCalories: Number(v) || 0 })} suffix="kcal" />
            ) : null}
          </View>
        </Field>
        <View style={st.bigGoal}>
          <Text style={st.bigGoalLabel}>Дневна цел калории</Text>
          <Text style={st.bigGoalValue}>{fmt(plan.calories, 0)}</Text>
          <Text style={st.bigGoalUnit}>kcal / ден</Text>
        </View>
      </Card>

      <Card>
        <View style={st.macroHead}>
          <Text style={st.h}>Разпределение на макроси</Text>
          <Text style={[st.sum, { color: macroOk ? theme.good : theme.warn }]}>Сума: {macroSum}% {macroOk ? "✓" : "≠ 100%"}</Text>
        </View>
        <Field label={<Text style={[st.fieldLabel, { color: theme.protein }]}>● Протеин</Text>}>
          <NumberInput width={80} value={String(macros.protein)} onChangeText={(v) => actions.setMacros({ protein: Number(v) || 0 })} suffix="%" />
        </Field>
        <Field label={<Text style={[st.fieldLabel, { color: theme.carbs }]}>● Въглехидрати</Text>}>
          <NumberInput width={80} value={String(macros.carbs)} onChangeText={(v) => actions.setMacros({ carbs: Number(v) || 0 })} suffix="%" />
        </Field>
        <Field label={<Text style={[st.fieldLabel, { color: theme.fat }]}>● Мазнини</Text>}>
          <NumberInput width={80} value={String(macros.fat)} onChangeText={(v) => actions.setMacros({ fat: Number(v) || 0 })} suffix="%" />
        </Field>
        {!macroOk && (
          <View style={st.warnRow}>
            <Ionicons name="warning-outline" size={14} color={theme.warn} />
            <Text style={st.warnText}>Процентите трябва да са общо 100%.</Text>
          </View>
        )}
        <View style={st.row}>
          <StatTile label="Протеин" value={fmt(plan.protein)} unit="г" color={theme.protein} />
          <StatTile label="Въгл." value={fmt(plan.carbs)} unit="г" color={theme.carbs} />
          <StatTile label="Мазнини" value={fmt(plan.fat)} unit="г" color={theme.fat} />
        </View>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <SectionBar>Нива на активност</SectionBar>
        {ACTIVITY.map((a, i) => (
          <View key={a.id} style={[st.actRow, { backgroundColor: i % 2 ? theme.bgSoft : "#fff" }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.actLabel}>{a.label}</Text>
              <Text style={st.actDef}>{a.def}</Text>
            </View>
            <Text style={st.actMult}>{a.mult}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { padding: 14, gap: 14, paddingBottom: 110 },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  h: { fontWeight: "700", color: theme.ink, fontSize: 15, marginBottom: 10 },
  fieldLabel: { fontSize: 14, fontWeight: "500" },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bigGoal: { marginTop: 14, backgroundColor: theme.tealDark, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  bigGoalLabel: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  bigGoalValue: { fontSize: 34, fontWeight: "800", color: "#fff" },
  bigGoalUnit: { fontSize: 12, color: "rgba(255,255,255,0.8)" },
  macroHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sum: { fontSize: 12.5, fontWeight: "700" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  warnText: { fontSize: 12.5, color: theme.warn },
  actRow: { flexDirection: "row", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.line },
  actLabel: { fontSize: 13.5, fontWeight: "600", color: theme.ink },
  actDef: { fontSize: 12, color: theme.muted, marginTop: 2 },
  actMult: { fontWeight: "800", color: theme.teal, fontSize: 15, alignSelf: "center" },
});
