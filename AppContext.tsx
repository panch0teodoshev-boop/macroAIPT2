import React, { createContext, useContext, useEffect, useReducer, useState, useMemo } from "react";
import * as db from "../db/database";
import { AppState, DiaryEntry, Macros, ManualItem, MealId, Product, Profile } from "../types";
import { iso, mondayOf, uid } from "../utils/formulas";

type Action =
  | { type: "SET_ALL"; state: AppState }
  | { type: "SET_PROFILE"; patch: Partial<Profile> }
  | { type: "SET_MACROS"; patch: Partial<Macros> }
  | { type: "ADD_PRODUCT"; product: Product }
  | { type: "UPDATE_PRODUCT"; product: Product }
  | { type: "DELETE_PRODUCT"; id: string }
  | { type: "SET_SELECTED_DATE"; date: string }
  | { type: "SET_WEEK_START"; date: string }
  | { type: "ADD_ENTRY"; entry: DiaryEntry }
  | { type: "UPDATE_ENTRY_QTY"; id: string; qty: number }
  | { type: "DELETE_ENTRY"; id: string }
  | { type: "ADD_MANUAL"; item: ManualItem }
  | { type: "TOGGLE_MANUAL"; id: string }
  | { type: "DELETE_MANUAL"; id: string }
  | { type: "TOGGLE_AUTO"; name: string }
  | { type: "IMPORT_PRODUCTS"; list: Product[] };

const empty: AppState = {
  profile: { sex: "male", weight: 101, height: 190, age: 35, activity: "high", goal: "maintain", manualCalories: null },
  macros: { protein: 30, carbs: 40, fat: 30 },
  products: [],
  entries: [],
  manual: [],
  autoChecked: {},
  selectedDate: iso(new Date()),
  weekStart: iso(mondayOf(new Date())),
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "SET_ALL":
      return a.state;
    case "SET_PROFILE":
      return { ...s, profile: { ...s.profile, ...a.patch } };
    case "SET_MACROS":
      return { ...s, macros: { ...s.macros, ...a.patch } };
    case "ADD_PRODUCT":
      return { ...s, products: [a.product, ...s.products] };
    case "UPDATE_PRODUCT":
      return { ...s, products: s.products.map((p) => (p.id === a.product.id ? a.product : p)) };
    case "DELETE_PRODUCT":
      return { ...s, products: s.products.filter((p) => p.id !== a.id) };
    case "SET_SELECTED_DATE":
      return { ...s, selectedDate: a.date };
    case "SET_WEEK_START":
      return { ...s, weekStart: a.date };
    case "ADD_ENTRY":
      return { ...s, entries: [...s.entries, a.entry] };
    case "UPDATE_ENTRY_QTY":
      return { ...s, entries: s.entries.map((e) => (e.id === a.id ? { ...e, qty: a.qty } : e)) };
    case "DELETE_ENTRY":
      return { ...s, entries: s.entries.filter((e) => e.id !== a.id) };
    case "ADD_MANUAL":
      return { ...s, manual: [...s.manual, a.item] };
    case "TOGGLE_MANUAL":
      return { ...s, manual: s.manual.map((m) => (m.id === a.id ? { ...m, checked: !m.checked } : m)) };
    case "DELETE_MANUAL":
      return { ...s, manual: s.manual.filter((m) => m.id !== a.id) };
    case "TOGGLE_AUTO":
      return { ...s, autoChecked: { ...s.autoChecked, [a.name]: !s.autoChecked[a.name] } };
    case "IMPORT_PRODUCTS":
      return { ...s, products: [...a.list, ...s.products] };
    default:
      return s;
  }
}

interface Actions {
  setProfile: (p: Partial<Profile>) => void;
  setMacros: (m: Partial<Macros>) => void;
  addProduct: (p: Omit<Product, "id">) => void;
  updateProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  setSelectedDate: (d: string) => void;
  setWeekStart: (d: string) => void;
  addEntry: (date: string, meal: MealId, productId: string, qty: number) => void;
  updateEntryQty: (id: string, qty: number) => void;
  deleteEntry: (id: string) => void;
  addManual: (text: string) => void;
  toggleManual: (id: string) => void;
  deleteManual: (id: string) => void;
  toggleAuto: (name: string) => void;
  importState: (s: AppState) => void;
  importProducts: (list: Product[]) => void;
  reset: () => void;
}

const Ctx = createContext<{ state: AppState; actions: Actions; loaded: boolean } | null>(null);
export const useStore = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore трябва да е в <StoreProvider>");
  return v;
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, empty);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    db.initDb();
    dispatch({ type: "SET_ALL", state: db.loadState() });
    setLoaded(true);
  }, []);

  const actions: Actions = useMemo(
    () => ({
      setProfile: (p) => {
        const next = { ...state.profile, ...p };
        db.setMeta("profile", JSON.stringify(next));
        dispatch({ type: "SET_PROFILE", patch: p });
      },
      setMacros: (m) => {
        const next = { ...state.macros, ...m };
        db.setMeta("macros", JSON.stringify(next));
        dispatch({ type: "SET_MACROS", patch: m });
      },
      addProduct: (p) => {
        const product: Product = { ...p, id: uid() };
        db.dbInsertProduct(product);
        dispatch({ type: "ADD_PRODUCT", product });
      },
      updateProduct: (p) => {
        db.dbUpdateProduct(p);
        dispatch({ type: "UPDATE_PRODUCT", product: p });
      },
      deleteProduct: (id) => {
        db.dbDeleteProduct(id);
        dispatch({ type: "DELETE_PRODUCT", id });
      },
      setSelectedDate: (d) => {
        db.setMeta("selectedDate", d);
        dispatch({ type: "SET_SELECTED_DATE", date: d });
      },
      setWeekStart: (d) => {
        db.setMeta("weekStart", d);
        dispatch({ type: "SET_WEEK_START", date: d });
      },
      addEntry: (date, meal, productId, qty) => {
        const entry: DiaryEntry = { id: uid(), date, meal, productId, qty };
        db.dbInsertEntry(entry);
        dispatch({ type: "ADD_ENTRY", entry });
      },
      updateEntryQty: (id, qty) => {
        db.dbUpdateEntryQty(id, qty);
        dispatch({ type: "UPDATE_ENTRY_QTY", id, qty });
      },
      deleteEntry: (id) => {
        db.dbDeleteEntry(id);
        dispatch({ type: "DELETE_ENTRY", id });
      },
      addManual: (text) => {
        const item: ManualItem = { id: uid(), text, checked: false };
        db.dbInsertManual(item);
        dispatch({ type: "ADD_MANUAL", item });
      },
      toggleManual: (id) => {
        const cur = state.manual.find((m) => m.id === id);
        db.dbToggleManual(id, !(cur?.checked ?? false));
        dispatch({ type: "TOGGLE_MANUAL", id });
      },
      deleteManual: (id) => {
        db.dbDeleteManual(id);
        dispatch({ type: "DELETE_MANUAL", id });
      },
      toggleAuto: (name) => {
        db.dbToggleAuto(name, !(state.autoChecked[name] ?? false));
        dispatch({ type: "TOGGLE_AUTO", name });
      },
      importState: (s) => {
        db.dbReplaceAll(s);
        dispatch({ type: "SET_ALL", state: s });
      },
      importProducts: (list) => {
        db.dbImportProducts(list);
        dispatch({ type: "IMPORT_PRODUCTS", list });
      },
      reset: () => {
        db.dbReset();
        dispatch({ type: "SET_ALL", state: db.loadState() });
      },
    }),
    [state]
  );

  return <Ctx.Provider value={{ state, actions, loaded }}>{children}</Ctx.Provider>;
}
