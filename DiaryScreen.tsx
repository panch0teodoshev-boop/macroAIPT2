import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PieChart } from "react-native-gifted-charts";
import Slider from "@react-native-community/slider";
import { MEALS } from "../constants";
import { useStore } from "../store/AppContext";
import { theme } from "../theme";
import { MealId, Product } from "../types";
import { addDays, clampGrams, computePlan, defaultAmount, entryFactor, entryTotals, fmt, iso, longDate, sumTotals, unitLabel } from "../utils/formulas";
import { Btn, Card, Modal } from "../components/ui";

export default function DiaryScreen() {
  const { state, actions } = useStore();
  const { products, selectedDate } = state;
  const plan = computePlan(state.profile, state.macros);
  const [adding, setAdding] = useState<MealId | null>(null);

  const dayEntries = useMemo(() => state.entries.filter((e) => e.date === selectedDate), [state.entries, selectedDate]);
  const byMeal = MEALS.map((m) => {
    const list = dayEntries.filter((e) => e.meal === m.id);
    return { ...m, list, totals: sumTotals(list.map((e) => entryTotals(e, products))) };
  });
  const dayTotal = sumTotals(byMeal.map((m) => m.totals));
  const pct = (v: number, p: number) => (p > 0 ? Math.round((v / p) * 100) : 0);
  const remaining = { cal: plan.calories - dayTotal.cal, protein: plan.protein - dayTotal.protein, carbs: plan.carbs - dayTotal.carbs, fat: plan.fat - dayTotal.fat };

  const donut = [
    { value: Math.max(0.0001, dayTotal.protein), color: theme.protein, text: "Протеин" },
    { value: Math.max(0.0001, dayTotal.carbs), color: theme.carbs, text: "Въгл." },
    { value: Math.max(0.0001, dayTotal.fat), color: theme.fat, text: "Мазнини" },
  ];
  const hasFood = dayTotal.cal > 0;

  const summary = [
    { l: "Калории", v: fmt(dayTotal.cal, 0), p: pct(dayTotal.cal, plan.calories), c: theme.tealDark },
    { l: "Протеин", v: fmt(dayTotal.protein), p: pct(dayTotal.protein, plan.protein), c: theme.protein },
    { l: "Въгл.", v: fmt(dayTotal.carbs), p: pct(dayTotal.carbs, plan.carbs), c: theme.carbs },
    { l: "Мазнини", v: fmt(dayTotal.fat), p: pct(dayTotal.fat, plan.fat), c: theme.fat },
  ];
  const remainItems = [
    { l: "Оставащи kcal", v: fmt(remaining.cal, 0) },
    { l: "Протеин", v: fmt(remaining.protein) },
    { l: "Въгл.", v: fmt(remaining.carbs) },
    { l: "Мазнини", v: fmt(remaining.fat) },
  ];

  return (
    <ScrollView contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
      <View style={st.dayNav}>
        <Pressable onPress={() => actions.setSelectedDate(iso(addDays(selectedDate, -1)))} style={st.navBtn}><Ionicons name="chevron-back" size={20} color="#fff" /></Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={st.dayTitle}>{longDate(selectedDate)}</Text>
          <Pressable onPress={() => actions.setSelectedDate(iso(new Date()))}><Text style={st.today}>днес</Text></Pressable>
        </View>
        <Pressable onPress={() => actions.setSelectedDate(iso(addDays(selectedDate, 1)))} style={st.navBtn}><Ionicons name="chevron-forward" size={20} color="#fff" /></Pressable>
      </View>

      <Card>
        <View style={st.summaryRow}>
          {summary.map((x) => (
            <View key={x.l} style={st.summaryCell}>
              <Text style={st.sLabel}>{x.l}</Text>
              <Text style={[st.sValue, { color: x.c }]}>{x.v}</Text>
              <Text style={st.sPct}>{x.p}%</Text>
            </View>
          ))}
        </View>
        <View style={st.hr} />
        <View style={st.summaryRow}>
          {remainItems.map((x) => (
            <View key={x.l} style={st.summaryCell}>
              <Text style={st.rLabel}>{x.l}</Text>
              <Text style={[st.rValue, { color: Number(x.v) < 0 ? theme.warn : theme.good }]}>{x.v}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={st.cardTitle}>Разпределение на макросите (г)</Text>
        {hasFood ? (
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <PieChart data={donut} donut radius={90} innerRadius={56} innerCircleColor="#fff" />
            <View style={st.legend}>
              {donut.map((d) => (
                <View key={d.text} style={st.legendItem}>
                  <View style={[st.dot, { backgroundColor: d.color }]} />
                  <Text style={st.legendText}>{d.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : <Text style={st.hint}>Добави храни, за да видиш разпределението.</Text>}
      </Card>

      {byMeal.map((m) => (
        <Card key={m.id} style={{ padding: 0, overflow: "hidden" }}>
          <View style={st.mealHeader}>
            <Text style={st.mealTitle}>{m.label}</Text>
            <Text style={st.mealKcal}>{fmt(m.totals.cal, 0)} kcal</Text>
          </View>
          {m.list.length === 0 && <Text style={st.mealEmpty}>Няма добавени продукти.</Text>}
          {m.list.map((e) => {
            const p = products.find((x) => x.id === e.productId);
            if (!p) return null;
            const tot = entryTotals(e, products);
            const isPiece = p.unit === "piece";
            return (
              <View key={e.id} style={st.entryRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.entryName} numberOfLines={1}>{p.name}</Text>
                  <Text style={st.entryMeta}>П {fmt(tot.protein)} · В {fmt(tot.carbs)} · М {fmt(tot.fat)}</Text>
                </View>
                <View style={st.qtyWrap}>
                  <TextInput
                    defaultValue={String(e.qty)}
                    keyboardType="number-pad"
                    onEndEditing={(ev) => {
                      const raw = Number(ev.nativeEvent.text) || 0;
                      actions.updateEntryQty(e.id, isPiece ? Math.max(1, raw) : clampGrams(raw));
                    }}
                    style={st.qtyInput}
                  />
                  <Text style={st.qtyUnit}>{isPiece ? "бр" : "г"}</Text>
                </View>
                <Text style={st.entryKcal}>{fmt(tot.cal, 0)}</Text>
                <Pressable onPress={() => actions.deleteEntry(e.id)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={16} color={theme.muted} /></Pressable>
              </View>
            );
          })}
          <Pressable onPress={() => setAdding(m.id)} style={st.addBtn}>
            <Ionicons name="add" size={16} color={theme.tealDark} />
            <Text style={st.addBtnText}>Добави продукт</Text>
          </Pressable>
        </Card>
      ))}

      {adding && (
        <AddEntryModal
          mealLabel={MEALS.find((m) => m.id === adding)!.label}
          products={products}
          onClose={() => setAdding(null)}
          onAdd={(pid, qty) => { actions.addEntry(selectedDate, adding, pid, qty); setAdding(null); }}
        />
      )}
    </ScrollView>
  );
}

function AddEntryModal({
  mealLabel, products, onClose, onAdd,
}: {
  mealLabel: string; products: Product[]; onClose: () => void; onAdd: (productId: string, qty: number) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [qty, setQty] = useState(100);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50);

  const pick = (p: Product) => { setPicked(p); setQty(defaultAmount(p)); };
  const isPiece = picked?.unit === "piece";
  const f = picked ? entryFactor(picked, qty) : 0;

  return (
    <Modal title={`${mealLabel} — добави продукт`} onClose={onClose}>
      {!picked ? (
        <>
          <View style={st.searchBox}>
            <Ionicons name="search" size={17} color={theme.muted} />
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Търси продукт..." placeholderTextColor={theme.muted} style={st.searchInput} />
          </View>
          <View style={{ maxHeight: 380 }}>
            {filtered.map((p) => (
              <Pressable key={p.id} onPress={() => pick(p)} style={st.pickRow}>
                <Text style={st.pickName}>{p.name}</Text>
                <Text style={st.pickMeta}>{p.cal} kcal / {unitLabel(p.unit)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View>
          <View style={st.pickedBox}>
            <Text style={st.pickedName}>{picked.name}</Text>
            <Text style={st.pickedMeta}>За {unitLabel(picked.unit)}: {picked.cal} kcal · П {picked.protein} · В {picked.carbs} · М {picked.fat}</Text>
          </View>

          {isPiece ? (
            <View style={st.stepRow}>
              <Text style={st.qtyTitle}>Брой</Text>
              <View style={st.stepper}>
                <Pressable onPress={() => setQty((x) => Math.max(1, x - 1))} style={st.stepBtn}><Ionicons name="remove" size={18} color={theme.tealDark} /></Pressable>
                <Text style={st.stepValue}>{qty}</Text>
                <Pressable onPress={() => setQty((x) => x + 1)} style={st.stepBtn}><Ionicons name="add" size={18} color={theme.tealDark} /></Pressable>
              </View>
            </View>
          ) : (
            <View>
              <View style={st.gramHead}>
                <Text style={st.qtyTitle}>Количество</Text>
                <Text><Text style={st.gramValue}>{qty}</Text><Text style={st.gramUnit}> г</Text></Text>
              </View>
              <Slider
                minimumValue={1}
                maximumValue={200}
                step={1}
                value={qty}
                onValueChange={(v) => setQty(clampGrams(v))}
                minimumTrackTintColor={theme.coral}
                maximumTrackTintColor={theme.line}
                thumbTintColor={theme.coral}
              />
              <View style={st.chips}>
                {[25, 50, 100, 150, 200].map((g) => {
                  const active = qty === g;
                  return (
                    <Pressable key={g} onPress={() => setQty(g)} style={[st.chip, active && st.chipActive]}>
                      <Text style={[st.chipText, active && st.chipTextActive]}>{g} г</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={st.calcLine}>= {fmt(picked.cal * f, 0)} kcal · П {fmt(picked.protein * f)} · В {fmt(picked.carbs * f)} · М {fmt(picked.fat * f)}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn variant="ghost" onPress={() => setPicked(null)}>Назад</Btn>
            <Btn variant="primary" icon="checkmark" style={{ flex: 1 }} onPress={() => onAdd(picked.id, qty || defaultAmount(picked))}>Добави</Btn>
          </View>
        </View>
      )}
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { padding: 14, gap: 14, paddingBottom: 110 },
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.tealDark, borderRadius: 12, padding: 8 },
  navBtn: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 9, width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  dayTitle: { color: "#fff", fontWeight: "700", fontSize: 15 },
  today: { color: theme.tealLight, fontSize: 11, marginTop: 1 },
  summaryRow: { flexDirection: "row" },
  summaryCell: { flex: 1, alignItems: "center" },
  sLabel: { fontSize: 11, color: theme.muted, fontWeight: "700" },
  sValue: { fontSize: 19, fontWeight: "800" },
  sPct: { fontSize: 10.5, color: theme.muted },
  hr: { height: 1, backgroundColor: theme.line, marginVertical: 12 },
  rLabel: { fontSize: 10, color: theme.muted },
  rValue: { fontSize: 14, fontWeight: "700" },
  cardTitle: { fontWeight: "700", color: theme.ink, fontSize: 14, marginBottom: 4 },
  legend: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: theme.ink },
  hint: { paddingVertical: 30, textAlign: "center", color: theme.muted, fontSize: 13 },
  mealHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.coral, paddingVertical: 9, paddingHorizontal: 14 },
  mealTitle: { fontWeight: "700", fontSize: 14, color: "#fff" },
  mealKcal: { fontSize: 12.5, fontWeight: "600", color: "#fff" },
  mealEmpty: { padding: 14, color: theme.muted, fontSize: 13, textAlign: "center" },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.line },
  entryName: { fontSize: 13.5, fontWeight: "600", color: theme.ink },
  entryMeta: { fontSize: 11.5, color: theme.muted },
  qtyWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  qtyInput: { width: 52, textAlign: "center", borderWidth: 1, borderColor: theme.line, borderRadius: 9, paddingVertical: 6, backgroundColor: theme.bgSoft, color: theme.ink },
  qtyUnit: { fontSize: 11, color: theme.muted, width: 16 },
  entryKcal: { width: 48, textAlign: "right", fontWeight: "700", color: theme.ink, fontSize: 13.5 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.tealPale, paddingVertical: 11 },
  addBtnText: { color: theme.tealDark, fontWeight: "600", fontSize: 13.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.bgSoft, borderWidth: 1, borderColor: theme.line, borderRadius: 11, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 11, color: theme.ink },
  pickRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.line },
  pickName: { fontSize: 14, color: theme.ink, fontWeight: "600", flex: 1 },
  pickMeta: { fontSize: 12, color: theme.muted },
  pickedBox: { backgroundColor: theme.tealPale, borderRadius: 12, padding: 14, marginBottom: 14 },
  pickedName: { fontWeight: "700", color: theme.ink, fontSize: 15 },
  pickedMeta: { fontSize: 12.5, color: theme.muted, marginTop: 2 },
  qtyTitle: { fontSize: 14, fontWeight: "600", color: theme.ink },
  gramHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 },
  gramValue: { fontSize: 22, fontWeight: "800", color: theme.coral },
  gramUnit: { fontSize: 13, color: theme.muted },
  chips: { flexDirection: "row", gap: 7, marginTop: 12 },
  chip: { flex: 1, borderWidth: 1, borderColor: theme.line, backgroundColor: "#fff", paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  chipActive: { borderColor: theme.coral, backgroundColor: theme.coralLight },
  chipText: { fontWeight: "700", fontSize: 13, color: theme.ink },
  chipTextActive: { color: theme.coralDark },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.tealPale, alignItems: "center", justifyContent: "center" },
  stepValue: { minWidth: 34, textAlign: "center", fontSize: 20, fontWeight: "800", color: theme.ink },
  calcLine: { fontSize: 12.5, color: theme.muted, marginTop: 14, marginBottom: 14 },
});
