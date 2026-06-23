import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../store/AppContext";
import { theme } from "../theme";
import { Product, Unit } from "../types";
import { unitLabel } from "../utils/formulas";
import { Btn, Field, Modal, NumberInput, SectionBar, Segmented, TextField } from "../components/ui";

export default function ProductsScreen() {
  const { state, actions } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | {} | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return state.products.filter((p) => p.name.toLowerCase().includes(term));
  }, [q, state.products]);

  return (
    <View style={st.container}>
      <SectionBar color={theme.teal}>Лист с продукти</SectionBar>

      <View style={st.searchRow}>
        <View style={st.searchBox}>
          <Ionicons name="search" size={17} color={theme.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Търси продукт..." placeholderTextColor={theme.muted} style={st.searchInput} />
          {q ? <Pressable onPress={() => setQ("")}><Ionicons name="close" size={16} color={theme.muted} /></Pressable> : null}
        </View>
        <Btn icon="add" onPress={() => setEditing({})}>Добави</Btn>
      </View>

      <View style={st.tableHeader}>
        <Text style={[st.th, { flex: 1, textAlign: "left" }]}>Храна</Text>
        <Text style={[st.th, { width: 52 }]}>Порция</Text>
        <Text style={[st.th, { width: 46 }]}>Кал.</Text>
        <Text style={[st.th, { width: 36, color: theme.protein }]}>П</Text>
        <Text style={[st.th, { width: 36, color: theme.coralLight }]}>В</Text>
        <Text style={[st.th, { width: 36, color: theme.tealLight }]}>М</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={<Text style={st.empty}>Няма намерени продукти.</Text>}
        renderItem={({ item: p, index: i }) => (
          <Pressable onPress={() => setEditing(p)} style={[st.row, { backgroundColor: i % 2 ? theme.bgSoft : "#fff" }]}>
            <Text style={[st.cellName, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
            <Text style={[st.cell, { width: 52, color: theme.muted, fontSize: 11.5 }]}>{unitLabel(p.unit)}</Text>
            <Text style={[st.cell, { width: 46, fontWeight: "700" }]}>{p.cal}</Text>
            <Text style={[st.cell, { width: 36, color: theme.muted }]}>{p.protein}</Text>
            <Text style={[st.cell, { width: 36, color: theme.muted }]}>{p.carbs}</Text>
            <Text style={[st.cell, { width: 36, color: theme.muted }]}>{p.fat}</Text>
          </Pressable>
        )}
      />

      {editing && (
        <ProductModal
          product={editing as Product}
          onClose={() => setEditing(null)}
          onSave={(prod) => {
            if ("id" in (editing as Product) && (editing as Product).id) actions.updateProduct({ ...(editing as Product), ...prod });
            else actions.addProduct(prod);
            setEditing(null);
          }}
          onDelete={"id" in (editing as Product) && (editing as Product).id ? () => { actions.deleteProduct((editing as Product).id); setEditing(null); } : undefined}
        />
      )}
    </View>
  );
}

function ProductModal({
  product, onClose, onSave, onDelete,
}: {
  product: Partial<Product>; onClose: () => void; onSave: (p: Omit<Product, "id">) => void; onDelete?: () => void;
}) {
  const [name, setName] = useState(product.name ?? "");
  const [unit, setUnit] = useState<Unit>(product.unit ?? "100g");
  const [cal, setCal] = useState(product.cal != null ? String(product.cal) : "");
  const [protein, setProtein] = useState(product.protein != null ? String(product.protein) : "");
  const [carbs, setCarbs] = useState(product.carbs != null ? String(product.carbs) : "");
  const [fat, setFat] = useState(product.fat != null ? String(product.fat) : "");
  const valid = name.trim() && cal !== "";

  return (
    <Modal title={product.id ? "Редактирай продукт" : "Нов продукт"} onClose={onClose}>
      <Field label="Име"><TextField value={name} onChangeText={setName} placeholder="Напр. Овесени ядки" /></Field>
      <Field label="Мерна единица">
        <Segmented value={unit} onChange={setUnit} options={[{ value: "100g", label: "100 г" }, { value: "piece", label: "1 бр" }]} />
      </Field>
      <Field label="Калории"><NumberInput width={90} value={cal} onChangeText={setCal} suffix="kcal" /></Field>
      <Field label="Протеин"><NumberInput width={90} value={protein} onChangeText={setProtein} suffix="г" /></Field>
      <Field label="Въглехидрати"><NumberInput width={90} value={carbs} onChangeText={setCarbs} suffix="г" /></Field>
      <Field label="Мазнини"><NumberInput width={90} value={fat} onChangeText={setFat} suffix="г" /></Field>
      <View style={st.modalActions}>
        {onDelete && <Btn variant="danger" icon="trash-outline" onPress={onDelete}>Изтрий</Btn>}
        <Btn variant="primary" icon="checkmark" style={{ flex: 1, opacity: valid ? 1 : 0.5 }}
          onPress={() => valid && onSave({ name: name.trim(), unit, cal: Number(cal) || 0, protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0 })}>
          Запази
        </Btn>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, padding: 14, gap: 14 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 11, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 11, color: theme.ink },
  tableHeader: { flexDirection: "row", alignItems: "center", backgroundColor: theme.tealDark, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  th: { color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.line },
  cellName: { color: theme.ink, fontWeight: "600", fontSize: 13 },
  cell: { textAlign: "center", color: theme.ink, fontSize: 13 },
  empty: { padding: 24, textAlign: "center", color: theme.muted, fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
});
