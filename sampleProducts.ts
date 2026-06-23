import { Product } from "../types";

// Стойности на 100 г или 1 брой — извлечени от снимките на Google Sheets tracker-а
export const SAMPLE_PRODUCTS: Product[] = [
  { id: "p1", name: "Бадемово масло", unit: "100g", cal: 624, protein: 12, carbs: 18, fat: 56 },
  { id: "p2", name: "Бадеми", unit: "100g", cal: 533, protein: 20, carbs: 20, fat: 47 },
  { id: "p3", name: "Ябълка", unit: "100g", cal: 56, protein: 0, carbs: 14, fat: 0 },
  { id: "p4", name: "Кайсия", unit: "100g", cal: 48, protein: 1, carbs: 11, fat: 0 },
  { id: "p5", name: "Рукола", unit: "100g", cal: 28, protein: 3, carbs: 4, fat: 0 },
  { id: "p6", name: "Аспержи", unit: "100g", cal: 28, protein: 3, carbs: 4, fat: 0 },
  { id: "p7", name: "Авокадо", unit: "100g", cal: 166, protein: 3, carbs: 7, fat: 14 },
  { id: "p8", name: "Бекон", unit: "100g", cal: 410, protein: 35, carbs: 1, fat: 30 },
  { id: "p9", name: "Банан", unit: "100g", cal: 92, protein: 1, carbs: 23, fat: 0 },
  { id: "p10", name: "Черен боб (варен)", unit: "100g", cal: 109, protein: 7, carbs: 20, fat: 0 },
  { id: "p11", name: "Леща (сурова)", unit: "100g", cal: 361, protein: 24, carbs: 60, fat: 1 },
  { id: "p12", name: "Бял боб (суров)", unit: "100g", cal: 225, protein: 24, carbs: 38, fat: 1 },
  { id: "p13", name: "Елда (сурова)", unit: "100g", cal: 351, protein: 13, carbs: 72, fat: 3 },
  { id: "p14", name: "Телешка кайма", unit: "100g", cal: 216, protein: 27, carbs: 0, fat: 12 },
  { id: "p15", name: "Пилешко филе (сурово)", unit: "100g", cal: 114, protein: 24, carbs: 0, fat: 2 },
  { id: "p16", name: "Пилешко филе (печено)", unit: "100g", cal: 138, protein: 30, carbs: 0, fat: 2 },
  { id: "p17", name: "Сьомга филе (сурово)", unit: "100g", cal: 143, protein: 20, carbs: 0, fat: 7 },
  { id: "p18", name: "Сьомга филе (печена)", unit: "100g", cal: 167, protein: 26, carbs: 0, fat: 7 },
  { id: "p19", name: "Яйце L", unit: "piece", cal: 69, protein: 6, carbs: 0, fat: 5 },
  { id: "p20", name: "Котидж сирене", unit: "100g", cal: 92, protein: 11, carbs: 4, fat: 4 },
  { id: "p21", name: "Ориз бял (суров)", unit: "100g", cal: 344, protein: 7, carbs: 78, fat: 1 },
  { id: "p22", name: "Ориз бял (варен)", unit: "100g", cal: 120, protein: 2, carbs: 28, fat: 0 },
  { id: "p23", name: "Боровинки", unit: "100g", cal: 56, protein: 0, carbs: 14, fat: 0 },
  { id: "p24", name: "Малини", unit: "100g", cal: 48, protein: 0, carbs: 12, fat: 0 },
];

// Примерна закуска за текущия ден — количествата са в грамове (яйцето е на брой)
export const SAMPLE_BREAKFAST: { productId: string; qty: number }[] = [
  { productId: "p6", qty: 100 },
  { productId: "p7", qty: 75 },
  { productId: "p1", qty: 50 },
  { productId: "p15", qty: 200 },
  { productId: "p3", qty: 100 },
  { productId: "p19", qty: 2 },
  { productId: "p5", qty: 25 },
];
