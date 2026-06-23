import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MEALS } from "../constants";
import { useStore } from "../store/AppContext";
import { theme } from "../theme";
import { addDays, iso } from "../utils/formulas";
import { Btn, Card, SectionBar } from "../components/ui";

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[ck.box, checked && { backgroundColor: theme.coral, borderColor: theme.coral }]}>
      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
    </View>
  );
}

export default function ShoppingScreen() {
  const { state, actions } = useStore();
  const [newItem, setNewItem] = useState("");

  const start = new Date(state.weekStart);
  const usedNames = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const date = iso(addDays(start, i));
      state.entries
        .filter((e) => e.date === date)
        .forEach((e) => {
          const p = state.products.find((x) => x.id === e.productId);
          if (p) set.add(p.name);
        });
    }
    return [...set].sort((a, b) => a.localeCompare(b, "bg"));
  }, [state.entries, state.products, state.weekStart]);

  const add = () => {
    if (newItem.trim()) {
      actions.addManual(newItem.trim());
      setNewItem("");
    }
  };

  return (
    <ScrollView contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
      <SectionBar color={theme.tealDark}>Списък за пазар</SectionBar>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <SectionBar>Ръчен списък</SectionBar>
        <View style={st.addRow}>
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={add}
            placeholder="Добави продукт за пазар..."
            placeholderTextColor={theme.muted}
            style={st.addInput}
          />
          <Btn icon="add" onPress={add}>{""}</Btn>
        </View>
        {state.manual.length === 0 && <Text style={st.empty}>Все още няма ръчно добавени продукти.</Text>}
        {state.manual.map((m) => (
          <View key={m.id} style={st.itemRow}>
            <Pressable onPress={() => actions.toggleManual(m.id)} style={st.itemTouch}>
              <Checkbox checked={m.checked} />
              <Text style={[st.itemText, m.checked && st.itemChecked]}>{m.text}</Text>
            </Pressable>
            <Pressable onPress={() => actions.deleteManual(m.id)}><Ionicons name="trash-outline" size={16} color={theme.muted} /></Pressable>
          </View>
        ))}
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <SectionBar>Автоматичен (от седмицата)</SectionBar>
        {usedNames.length === 0 && <Text style={st.empty}>Няма използвани продукти през избраната седмица.</Text>}
        {usedNames.map((name, i) => {
          const checked = !!state.autoChecked[name];
          return (
            <Pressable key={name} onPress={() => actions.toggleAuto(name)} style={[st.itemRow, { backgroundColor: i % 2 ? theme.bgSoft : "#fff" }]}>
              <Checkbox checked={checked} />
              <Text style={[st.itemText, { marginLeft: 10 }, checked && st.itemChecked]}>{name}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Text style={st.note}>Автоматичният списък се генерира от продуктите, използвани в избраната седмица (виж раздел „Седмица").</Text>
    </ScrollView>
  );
}

const ck = StyleSheet.create({
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.line, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});

const st = StyleSheet.create({
  container: { padding: 14, gap: 14, paddingBottom: 110 },
  addRow: { flexDirection: "row", gap: 8, padding: 12, alignItems: "center" },
  addInput: { flex: 1, borderWidth: 1, borderColor: theme.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: theme.bgSoft, color: theme.ink, fontSize: 15 },
  empty: { padding: 14, color: theme.muted, fontSize: 13 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.line },
  itemTouch: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  itemText: { fontSize: 14, color: theme.ink, flex: 1 },
  itemChecked: { color: theme.muted, textDecorationLine: "line-through" },
  note: { fontSize: 12, color: theme.muted, textAlign: "center" },
});
