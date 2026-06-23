import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BarChart } from "react-native-gifted-charts";
import { DAYS_BG, DAYS_SHORT, MEALS, MONTHS_BG } from "../constants";
import { useStore } from "../store/AppContext";
import { theme } from "../theme";
import { addDays, computePlan, entryTotals, fmt, iso, round, sumTotals } from "../utils/formulas";
import { Card, SectionBar } from "../components/ui";

export default function WeekScreen() {
  const { state, actions } = useStore();
  const plan = computePlan(state.profile, state.macros);
  const start = new Date(state.weekStart);

  const week = useMemo(
    () =>
      DAYS_BG.map((label, i) => {
        const date = iso(addDays(start, i));
        const list = state.entries.filter((e) => e.date === date);
        const totals = sumTotals(list.map((e) => entryTotals(e, state.products)));
        return { label, short: DAYS_SHORT[i], date, ...totals };
      }),
    [state.entries, state.products, state.weekStart]
  );

  const avg = {
    cal: week.reduce((a, d) => a + d.cal, 0) / 7,
    protein: week.reduce((a, d) => a + d.protein, 0) / 7,
    carbs: week.reduce((a, d) => a + d.carbs, 0) / 7,
    fat: week.reduce((a, d) => a + d.fat, 0) / 7,
  };

  const calData = week.map((d) => ({ value: round(d.cal, 0), label: d.short, frontColor: theme.teal }));
  const stackData = week.map((d) => ({
    label: d.short,
    stacks: [
      { value: round(d.protein), color: theme.protein },
      { value: round(d.carbs), color: theme.carbs },
      { value: round(d.fat), color: theme.fat },
    ],
  }));

  const planRows = [
    { l: "Дневен план", cal: plan.calories, p: plan.protein, c: plan.carbs, f: plan.fat },
    { l: "Средно/ден", cal: avg.cal, p: avg.protein, c: avg.carbs, f: avg.fat },
  ];

  return (
    <ScrollView contentContainerStyle={st.container}>
      <SectionBar color={theme.tealDark}>Седмичен тракер</SectionBar>

      <View style={st.weekNav}>
        <Pressable onPress={() => actions.setWeekStart(iso(addDays(start, -7)))} style={st.navBtn}><Ionicons name="chevron-back" size={20} color={theme.tealDark} /></Pressable>
        <Text style={st.weekTitle}>{start.getDate()} {MONTHS_BG[start.getMonth()]} – {addDays(start, 6).getDate()} {MONTHS_BG[addDays(start, 6).getMonth()]}</Text>
        <Pressable onPress={() => actions.setWeekStart(iso(addDays(start, 7)))} style={st.navBtn}><Ionicons name="chevron-forward" size={20} color={theme.tealDark} /></Pressable>
      </View>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={[st.trow, { backgroundColor: theme.coral }]}>
          <Text style={[st.thc, { flex: 1, textAlign: "left", paddingLeft: 12 }]}></Text>
          <Text style={st.thc}>Кал.</Text><Text style={st.thc}>Прот.</Text><Text style={st.thc}>Въгл.</Text><Text style={st.thc}>Мазн.</Text>
        </View>
        {planRows.map((r, i) => (
          <View key={r.l} style={[st.trow, { backgroundColor: i % 2 ? "#fff" : theme.bgSoft }]}>
            <Text style={[st.tdc, { flex: 1, textAlign: "left", paddingLeft: 12, fontWeight: "700" }]}>{r.l}</Text>
            <Text style={st.tdc}>{fmt(r.cal, 0)}</Text><Text style={st.tdc}>{fmt(r.p)}</Text><Text style={st.tdc}>{fmt(r.c)}</Text><Text style={st.tdc}>{fmt(r.f)}</Text>
          </View>
        ))}
        <View style={[st.trow, { backgroundColor: theme.tealPale }]}>
          <Text style={[st.tdc, { flex: 1, textAlign: "left", paddingLeft: 12, fontWeight: "700", color: theme.tealDark }]}>Спрямо план</Text>
          {([["cal", "calories"], ["protein", "protein"], ["carbs", "carbs"], ["fat", "fat"]] as const).map(([a, p]) => {
            const diff = (avg as any)[a] - (plan as any)[p];
            return <Text key={a} style={[st.tdc, { fontWeight: "700", color: diff > 0 ? theme.warn : theme.good }]}>{diff >= 0 ? "+" : ""}{fmt(diff, 0)}</Text>;
          })}
        </View>
      </Card>

      <Card>
        <Text style={st.cardTitle}>Калории по дни</Text>
        <BarChart
          data={calData}
          barWidth={20}
          spacing={14}
          frontColor={theme.teal}
          yAxisThickness={0}
          xAxisThickness={0}
          xAxisLabelTextStyle={st.axis}
          yAxisTextStyle={st.axis}
          noOfSections={4}
          height={180}
          isAnimated
        />
      </Card>

      <Card>
        <Text style={st.cardTitle}>Макроси по дни (г)</Text>
        <BarChart
          stackData={stackData}
          barWidth={20}
          spacing={14}
          yAxisThickness={0}
          xAxisThickness={0}
          xAxisLabelTextStyle={st.axis}
          yAxisTextStyle={st.axis}
          noOfSections={4}
          height={200}
          isAnimated
        />
        <View style={st.legend}>
          {[{ c: theme.protein, t: "Протеин" }, { c: theme.carbs, t: "Въгл." }, { c: theme.fat, t: "Мазнини" }].map((x) => (
            <View key={x.t} style={st.legendItem}><View style={[st.dot, { backgroundColor: x.c }]} /><Text style={st.legendText}>{x.t}</Text></View>
          ))}
        </View>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <SectionBar>Седмично обобщение</SectionBar>
        <View style={[st.trow, { backgroundColor: theme.coral }]}>
          <Text style={[st.thc, { flex: 1, textAlign: "left", paddingLeft: 12 }]}>Ден</Text>
          <Text style={st.thc}>Кал.</Text><Text style={st.thc}>Прот.</Text><Text style={st.thc}>Въгл.</Text><Text style={st.thc}>Мазн.</Text>
        </View>
        {week.map((d, i) => (
          <Pressable key={d.date} onPress={() => actions.setSelectedDate(d.date)} style={[st.trow, { backgroundColor: i % 2 ? theme.bgSoft : "#fff" }]}>
            <Text style={[st.tdc, { flex: 1, textAlign: "left", paddingLeft: 12, fontWeight: "600" }]}>{d.label}</Text>
            <Text style={st.tdc}>{fmt(d.cal, 0)}</Text><Text style={st.tdc}>{fmt(d.protein)}</Text><Text style={st.tdc}>{fmt(d.carbs)}</Text><Text style={st.tdc}>{fmt(d.fat)}</Text>
          </Pressable>
        ))}
        <View style={[st.trow, { backgroundColor: theme.tealLight }]}>
          <Text style={[st.tdc, { flex: 1, textAlign: "left", paddingLeft: 12, fontWeight: "800", color: theme.tealDark }]}>Средно</Text>
          <Text style={[st.tdc, { fontWeight: "800" }]}>{fmt(avg.cal, 0)}</Text>
          <Text style={[st.tdc, { fontWeight: "800" }]}>{fmt(avg.protein)}</Text>
          <Text style={[st.tdc, { fontWeight: "800" }]}>{fmt(avg.carbs)}</Text>
          <Text style={[st.tdc, { fontWeight: "800" }]}>{fmt(avg.fat)}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { padding: 14, gap: 14, paddingBottom: 110 },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 8 },
  navBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  weekTitle: { fontSize: 13.5, fontWeight: "700", color: theme.ink },
  cardTitle: { fontWeight: "700", color: theme.ink, fontSize: 14, marginBottom: 10 },
  trow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line },
  thc: { color: "#fff", fontSize: 11.5, fontWeight: "700", textAlign: "center", width: 56, paddingVertical: 9 },
  tdc: { fontSize: 13, textAlign: "center", color: theme.ink, width: 56, paddingVertical: 9 },
  axis: { fontSize: 10, color: theme.muted },
  legend: { flexDirection: "row", gap: 16, marginTop: 10, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: theme.ink },
});
