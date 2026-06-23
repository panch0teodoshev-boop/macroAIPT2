import * as SQLite from "expo-sqlite";
import { SAMPLE_BREAKFAST, SAMPLE_PRODUCTS } from "../data/sampleProducts";
import { AppState, DiaryEntry, ManualItem, Product, Profile, Macros } from "../types";
import { iso, mondayOf, uid } from "../utils/formulas";

const db = SQLite.openDatabaseSync("kalorii.db");

const DEFAULT_PROFILE: Profile = {
  sex: "male", weight: 101, height: 190, age: 35, activity: "high", goal: "maintain", manualCalories: null,
};
const DEFAULT_MACROS: Macros = { protein: 30, carbs: 40, fat: 30 };

/** Създава таблиците и зарежда примерни данни при първо стартиране. */
export function initDb(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL,
      cal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL, date TEXT NOT NULL, meal TEXT NOT NULL,
      productId TEXT NOT NULL, qty REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS manual (
      id TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, checked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auto_checked (name TEXT PRIMARY KEY NOT NULL, checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
  `);

  const seeded = getMeta("seeded_v2");
  if (!seeded) {
    seedDefaults();
    setMeta("seeded_v2", "1");
  }
}

function seedDefaults(): void {
  // продукти
  const insert = db.prepareSync(
    "INSERT OR REPLACE INTO products (id, name, unit, cal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  try {
    for (const p of SAMPLE_PRODUCTS) insert.executeSync([p.id, p.name, p.unit, p.cal, p.protein, p.carbs, p.fat]);
  } finally {
    insert.finalizeSync();
  }
  // примерна закуска за днес
  const today = iso(new Date());
  for (const e of SAMPLE_BREAKFAST) {
    db.runSync("INSERT INTO entries (id, date, meal, productId, qty) VALUES (?, ?, ?, ?, ?)", [
      uid(), today, "breakfast", e.productId, e.qty,
    ]);
  }
  // профил/макроси/настройки
  setMeta("profile", JSON.stringify(DEFAULT_PROFILE));
  setMeta("macros", JSON.stringify(DEFAULT_MACROS));
  setMeta("selectedDate", today);
  setMeta("weekStart", iso(mondayOf(new Date())));
}

// ---------- meta (key/value) ----------
export function getMeta(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]);
  return row ? row.value : null;
}
export function setMeta(key: string, value: string): void {
  db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
}

// ---------- зареждане на цялото състояние ----------
export function loadState(): AppState {
  const products = db.getAllSync<Product>("SELECT * FROM products ORDER BY rowid DESC");
  const entriesRaw = db.getAllSync<any>("SELECT * FROM entries");
  const entries: DiaryEntry[] = entriesRaw.map((e) => ({ id: e.id, date: e.date, meal: e.meal, productId: e.productId, qty: e.qty }));
  const manualRaw = db.getAllSync<any>("SELECT * FROM manual");
  const manual: ManualItem[] = manualRaw.map((m) => ({ id: m.id, text: m.text, checked: !!m.checked }));
  const autoRaw = db.getAllSync<any>("SELECT * FROM auto_checked");
  const autoChecked: Record<string, boolean> = {};
  autoRaw.forEach((a) => (autoChecked[a.name] = !!a.checked));

  const profile: Profile = JSON.parse(getMeta("profile") ?? JSON.stringify(DEFAULT_PROFILE));
  const macros: Macros = JSON.parse(getMeta("macros") ?? JSON.stringify(DEFAULT_MACROS));

  return {
    profile,
    macros,
    products,
    entries,
    manual,
    autoChecked,
    selectedDate: getMeta("selectedDate") ?? iso(new Date()),
    weekStart: getMeta("weekStart") ?? iso(mondayOf(new Date())),
  };
}

// ---------- продукти ----------
export function dbInsertProduct(p: Product): void {
  db.runSync("INSERT INTO products (id, name, unit, cal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    p.id, p.name, p.unit, p.cal, p.protein, p.carbs, p.fat,
  ]);
}
export function dbUpdateProduct(p: Product): void {
  db.runSync("UPDATE products SET name=?, unit=?, cal=?, protein=?, carbs=?, fat=? WHERE id=?", [
    p.name, p.unit, p.cal, p.protein, p.carbs, p.fat, p.id,
  ]);
}
export function dbDeleteProduct(id: string): void {
  db.runSync("DELETE FROM products WHERE id=?", [id]);
}

// ---------- дневник ----------
export function dbInsertEntry(e: DiaryEntry): void {
  db.runSync("INSERT INTO entries (id, date, meal, productId, qty) VALUES (?, ?, ?, ?, ?)", [
    e.id, e.date, e.meal, e.productId, e.qty,
  ]);
}
export function dbUpdateEntryQty(id: string, qty: number): void {
  db.runSync("UPDATE entries SET qty=? WHERE id=?", [qty, id]);
}
export function dbDeleteEntry(id: string): void {
  db.runSync("DELETE FROM entries WHERE id=?", [id]);
}

// ---------- пазар ----------
export function dbInsertManual(m: ManualItem): void {
  db.runSync("INSERT INTO manual (id, text, checked) VALUES (?, ?, ?)", [m.id, m.text, m.checked ? 1 : 0]);
}
export function dbToggleManual(id: string, checked: boolean): void {
  db.runSync("UPDATE manual SET checked=? WHERE id=?", [checked ? 1 : 0, id]);
}
export function dbDeleteManual(id: string): void {
  db.runSync("DELETE FROM manual WHERE id=?", [id]);
}
export function dbToggleAuto(name: string, checked: boolean): void {
  db.runSync("INSERT OR REPLACE INTO auto_checked (name, checked) VALUES (?, ?)", [name, checked ? 1 : 0]);
}

// ---------- импорт / нулиране ----------
export function dbReplaceAll(state: AppState): void {
  db.execSync("DELETE FROM products; DELETE FROM entries; DELETE FROM manual; DELETE FROM auto_checked;");
  for (const p of state.products) dbInsertProduct(p);
  for (const e of state.entries) dbInsertEntry(e);
  for (const m of state.manual) dbInsertManual(m);
  Object.entries(state.autoChecked).forEach(([name, c]) => dbToggleAuto(name, c));
  setMeta("profile", JSON.stringify(state.profile));
  setMeta("macros", JSON.stringify(state.macros));
  setMeta("selectedDate", state.selectedDate);
  setMeta("weekStart", state.weekStart);
}
export function dbImportProducts(list: Product[]): void {
  for (const p of list) dbInsertProduct(p);
}
export function dbReset(): void {
  db.execSync("DELETE FROM products; DELETE FROM entries; DELETE FROM manual; DELETE FROM auto_checked; DELETE FROM meta;");
  seedDefaults();
  setMeta("seeded_v2", "1");
}
