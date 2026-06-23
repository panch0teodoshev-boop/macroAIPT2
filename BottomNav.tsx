import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme";

export type TabId = "calc" | "products" | "week" | "diary" | "shopping" | "settings";

export const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "calc", label: "Калкулатор", icon: "calculator-outline" },
  { id: "products", label: "Продукти", icon: "nutrition-outline" },
  { id: "week", label: "Седмица", icon: "calendar-outline" },
  { id: "diary", label: "Дневник", icon: "book-outline" },
  { id: "shopping", label: "Пазар", icon: "cart-outline" },
  { id: "settings", label: "Настройки", icon: "settings-outline" },
];

export default function BottomNav({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} style={styles.item}>
            <Ionicons name={t.icon} size={22} color={active ? theme.coral : theme.muted} />
            <Text style={[styles.label, { color: active ? theme.coral : theme.muted, fontWeight: active ? "700" : "500" }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 8 },
  item: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 2 },
  label: { fontSize: 9.5 },
});
