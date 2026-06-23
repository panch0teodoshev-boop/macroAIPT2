import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { useStore } from "../store/AppContext";
import { theme } from "../theme";
import { AppState, Product, Unit } from "../types";
import { uid } from "../utils/formulas";
import { Btn, Card, SectionBar } from "../components/ui";

export default function SettingsScreen() {
  const { state, actions } = useStore();
  const [msg, setMsg] = useState("");
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  async function writeAndShare(filename: string, content: string, mime: string) {
    const uri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename });
    else flash("Файлът е записан: " + filename);
  }

  const exportJson = async () => {
    await writeAndShare("kalorii-tracker.json", JSON.stringify(state, null, 2), "application/json");
    flash("Експортирано в JSON");
  };

  const exportCsv = async () => {
    const header = "Име,Мерна единица,Калории,Протеин,Въглехидрати,Мазнини";
    const rows = state.products.map((p) => `"${p.name}",${p.unit === "piece" ? "1 бр" : "100 g"},${p.cal},${p.protein},${p.carbs},${p.fat}`);
    await writeAndShare("produkti.csv", "\uFEFF" + [header, ...rows].join("\n"), "text/csv");
    flash("Продуктите са експортирани в CSV");
  };

  const pickFile = async (): Promise<string | null> => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/csv", "text/comma-separated-values", "*/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return null;
    return FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
  };

  const importJson = async () => {
    try {
      const text = await pickFile();
      if (!text) return;
      const obj = JSON.parse(text) as AppState;
      actions.importState(obj);
      flash("Данните са импортирани");
    } catch { flash("Грешен JSON файл"); }
  };

  const importCsv = async () => {
    try {
      const text = await pickFile();
      if (!text) return;
      const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).slice(1);
      const list: Product[] = lines
        .map((line) => {
          const m = line.match(/^"?(.*?)"?,(.*?),(.*?),(.*?),(.*?),(.*?)$/);
          if (!m) return null;
          const [, name, unit, cal, protein, carbs, fat] = m;
          return {
            id: uid(),
            name: name.trim(),
            unit: (/бр/.test(unit) ? "piece" : "100g") as Unit,
            cal: Number(cal) || 0, protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0,
          };
        })
        .filter((x): x is Product => x !== null);
      actions.importProducts(list);
      flash(`Импортирани ${list.length} продукта`);
    } catch { flash("Грешен CSV файл"); }
  };

  const confirmReset = () => {
    Alert.alert("Нулиране", "Сигурен ли си? Това ще изтрие всички данни и ще върне примерните.", [
      { text: "Отказ", style: "cancel" },
      { text: "Нулирай", style: "destructive", onPress: () => { actions.reset(); flash("Данните са нулирани"); } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={st.container}>
      <SectionBar color={theme.tealDark}>Настройки</SectionBar>

      <Card>
        <Text style={st.h}>Експорт на данни</Text>
        <View style={{ gap: 10 }}>
          <Btn variant="teal" icon="download-outline" onPress={exportJson}>Експорт всичко (JSON)</Btn>
          <Btn variant="ghost" icon="download-outline" onPress={exportCsv}>Експорт продукти (CSV)</Btn>
        </View>
      </Card>

      <Card>
        <Text style={st.h}>Импорт на данни</Text>
        <View style={{ gap: 10 }}>
          <Btn variant="ghost" icon="cloud-upload-outline" onPress={importJson}>Импорт всичко (JSON)</Btn>
          <Btn variant="ghost" icon="cloud-upload-outline" onPress={importCsv}>Импорт продукти (CSV)</Btn>
        </View>
        <Text style={st.note}>CSV формат: Име, Мерна единица, Калории, Протеин, Въглехидрати, Мазнини.</Text>
      </Card>

      <Card>
        <Text style={st.h}>Нулиране</Text>
        <Btn variant="danger" icon="refresh-outline" onPress={confirmReset}>Нулирай всички данни</Btn>
      </Card>

      <Text style={st.footer}>Данните се пазят локално в SQLite на това устройство.{"\n"}Тракер за калории и макронутриенти · v1.0</Text>

      {msg ? <View style={st.toast}><Text style={st.toastText}>{msg}</Text></View> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { padding: 14, gap: 14, paddingBottom: 110 },
  h: { fontWeight: "700", color: theme.ink, fontSize: 15, marginBottom: 12 },
  note: { fontSize: 12, color: theme.muted, marginTop: 10 },
  footer: { fontSize: 12, color: theme.muted, textAlign: "center", lineHeight: 18 },
  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: theme.tealDark, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 30 },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
