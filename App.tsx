import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "./src/store/AppContext";
import { theme } from "./src/theme";
import BottomNav, { TabId } from "./src/navigation/BottomNav";
import CalculatorScreen from "./src/screens/CalculatorScreen";
import ProductsScreen from "./src/screens/ProductsScreen";
import WeekScreen from "./src/screens/WeekScreen";
import DiaryScreen from "./src/screens/DiaryScreen";
import ShoppingScreen from "./src/screens/ShoppingScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const TITLES: Record<TabId, string> = {
  calc: "Калкулатор на калории",
  products: "Продукти",
  week: "Седмица",
  diary: "Хранителен дневник",
  shopping: "Списък за пазар",
  settings: "Настройки",
};

function Shell() {
  const [tab, setTab] = useState<TabId>("diary");
  const { loaded } = useStore();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Text style={styles.kicker}>Тракер за калории и макроси</Text>
        <Text style={styles.title}>{TITLES[tab]}</Text>
      </SafeAreaView>

      <View style={styles.body}>
        {!loaded ? (
          <View style={styles.loading}><ActivityIndicator color={theme.teal} size="large" /></View>
        ) : (
          <>
            {tab === "calc" && <CalculatorScreen />}
            {tab === "products" && <ProductsScreen />}
            {tab === "week" && <WeekScreen />}
            {tab === "diary" && <DiaryScreen />}
            {tab === "shopping" && <ShoppingScreen />}
            {tab === "settings" && <SettingsScreen />}
          </>
        )}
      </View>

      <BottomNav tab={tab} onChange={setTab} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bgSoft },
  header: { backgroundColor: theme.tealDark, paddingHorizontal: 18, paddingBottom: 16 },
  kicker: { fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: "500" },
  title: { fontSize: 21, fontWeight: "800", color: "#fff", marginTop: 2 },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
