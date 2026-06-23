export type Sex = "male" | "female";
export type Unit = "100g" | "piece";
export type Goal = "maintain" | "lose" | "gain";
export type MealId = "breakfast" | "lunch" | "dinner" | "snack";
export type ActivityId = "sedentary" | "low" | "moderate" | "high" | "extreme";

export interface Product {
  id: string;
  name: string;
  unit: Unit;
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Profile {
  sex: Sex;
  weight: number;
  height: number;
  age: number;
  activity: ActivityId;
  goal: Goal;
  manualCalories: number | null;
}

export interface Macros {
  protein: number; // %
  carbs: number; // %
  fat: number; // %
}

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  meal: MealId;
  productId: string;
  qty: number; // множител спрямо порцията
}

export interface ManualItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Totals {
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Plan extends Totals {
  bmr: number;
  tdee: number;
  calories: number;
}

export interface AppState {
  profile: Profile;
  macros: Macros;
  products: Product[];
  entries: DiaryEntry[];
  manual: ManualItem[];
  autoChecked: Record<string, boolean>;
  selectedDate: string;
  weekStart: string;
}
