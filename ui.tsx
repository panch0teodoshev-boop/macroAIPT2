import React, { useState } from "react";
import {
  Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

export function SectionBar({ children, color = theme.teal }: { children: React.ReactNode; color?: string }) {
  return (
    <View style={[s.sectionBar, { backgroundColor: color }]}>
      <Text style={s.sectionBarText}>{children}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      {typeof label === "string" ? <Text style={s.fieldLabel}>{label}</Text> : label}
      <View>{children}</View>
    </View>
  );
}

export function NumberInput({
  value, onChangeText, suffix, width = 110, placeholder, textAlign = "right",
}: {
  value: string; onChangeText: (v: string) => void; suffix?: string; width?: number; placeholder?: string;
  textAlign?: "left" | "right" | "center";
}) {
  return (
    <View style={s.numWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        keyboardType="decimal-pad"
        style={[s.input, { width, textAlign }]}
      />
      {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
    </View>
  );
}

export function TextField({
  value, onChangeText, placeholder, width = 180, autoFocus, onSubmitEditing,
}: {
  value: string; onChangeText: (v: string) => void; placeholder?: string; width?: number;
  autoFocus?: boolean; onSubmitEditing?: () => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmitEditing}
      style={[s.input, { width, textAlign: "left" }]}
    />
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, active && s.segItemActive]}>
            <Text style={[s.segText, active && s.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Dropdown<T extends string>({
  value, options, onChange,
}: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable style={s.dropdown} onPress={() => setOpen(true)}>
        <Text style={s.dropdownText}>{current?.label}</Text>
        <Ionicons name="chevron-down" size={16} color={theme.muted} />
      </Pressable>
      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <View style={s.dropdownSheet}>
            {options.map((o) => (
              <Pressable key={o.value} style={s.dropdownOpt} onPress={() => { onChange(o.value); setOpen(false); }}>
                <Text style={[s.dropdownOptText, o.value === value && { color: theme.coral, fontWeight: "700" }]}>{o.label}</Text>
                {o.value === value && <Ionicons name="checkmark" size={18} color={theme.coral} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </RNModal>
    </>
  );
}

type BtnVariant = "primary" | "teal" | "ghost" | "danger";
export function Btn({
  children, onPress, variant = "primary", style, icon,
}: {
  children: React.ReactNode; onPress: () => void; variant?: BtnVariant; style?: ViewStyle; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const v = btnStyles[variant];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, v.box, pressed && { opacity: 0.85 }, style]}>
      {icon ? <Ionicons name={icon} size={17} color={v.text.color as string} /> : null}
      <Text style={[s.btnText, v.text]}>{children}</Text>
    </Pressable>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <RNModal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlayBottom} onPress={onClose}>
        <Pressable style={s.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={20} color={theme.tealDark} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

export function StatTile({
  label, value, unit, highlight, color,
}: {
  label: string; value: string | number; unit?: string; highlight?: boolean; color?: string;
}) {
  return (
    <View style={[s.statTile, { backgroundColor: highlight ? theme.coralLight : theme.tealPale }]}>
      <Text style={[s.statLabel, { color: color ?? theme.muted }]}>{label}</Text>
      <Text style={[s.statValue, { color: highlight ? theme.coralDark : color ?? theme.ink }]}>{value}</Text>
      {unit ? <Text style={s.statUnit}>{unit}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

const btnStyles: Record<BtnVariant, { box: ViewStyle; text: TextStyle }> = {
  primary: { box: { backgroundColor: theme.coral }, text: { color: "#fff" } },
  teal: { box: { backgroundColor: theme.teal }, text: { color: "#fff" } },
  ghost: { box: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.line }, text: { color: theme.tealDark } },
  danger: { box: { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.coralLight }, text: { color: theme.warn } },
};

const s = StyleSheet.create({
  sectionBar: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  sectionBarText: { color: "#fff", textAlign: "center", fontWeight: "600", fontSize: 14 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.line, borderRadius: 16, padding: 16 },
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.line },
  fieldLabel: { color: theme.ink, fontSize: 14, fontWeight: "500", flexShrink: 1 },
  numWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: { fontSize: 15, color: theme.ink, borderWidth: 1, borderColor: theme.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.bgSoft },
  suffix: { color: theme.muted, fontSize: 13 },
  segmented: { flexDirection: "row", backgroundColor: theme.tealPale, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 },
  segItemActive: { backgroundColor: theme.teal },
  segText: { fontSize: 13, fontWeight: "600", color: theme.tealDark },
  segTextActive: { color: "#fff" },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.bgSoft, borderWidth: 1, borderColor: theme.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 },
  dropdownText: { fontSize: 14, color: theme.ink },
  overlay: { flex: 1, backgroundColor: "rgba(20,50,55,0.45)", justifyContent: "center", alignItems: "center", padding: 24 },
  dropdownSheet: { backgroundColor: "#fff", borderRadius: 14, width: "100%", maxWidth: 360, paddingVertical: 6 },
  dropdownOpt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 16 },
  dropdownOptText: { fontSize: 15, color: theme.ink },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 16 },
  btnText: { fontWeight: "600", fontSize: 14 },
  overlayBottom: { flex: 1, backgroundColor: "rgba(20,50,55,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, maxHeight: "88%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 17, color: theme.ink, fontWeight: "700" },
  modalClose: { backgroundColor: theme.tealPale, borderRadius: 9, width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  statTile: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center" },
  statLabel: { fontSize: 11.5, fontWeight: "700", marginBottom: 3 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statUnit: { fontSize: 10.5, color: theme.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.line, marginVertical: 12 },
});
