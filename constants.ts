import { ActivityId, Goal, MealId, Sex } from "./types";

export const ACTIVITY: { id: ActivityId; label: string; mult: number; def: string }[] = [
  { id: "sedentary", label: "Заседнал начин на живот", mult: 1.2, def: "Малко или никакво движение / офис работа" },
  { id: "low", label: "Ниска активност", mult: 1.375, def: "Лека физическа активност 1–3 дни седмично" },
  { id: "moderate", label: "Умерена активност", mult: 1.55, def: "Умерена физическа активност 3–5 дни седмично" },
  { id: "high", label: "Висока активност", mult: 1.725, def: "Интензивна физическа активност 6–7 дни седмично" },
  { id: "extreme", label: "Екстремна активност", mult: 1.9, def: "Интензивни ежедневни тренировки или 2 пъти дневно" },
];

export const GOALS: { id: Goal; label: string; delta: number }[] = [
  { id: "maintain", label: "Поддържане", delta: 0 },
  { id: "lose", label: "Отслабване", delta: -500 },
  { id: "gain", label: "Покачване", delta: 400 },
];

export const MEALS: { id: MealId; label: string }[] = [
  { id: "breakfast", label: "Закуска" },
  { id: "lunch", label: "Обяд" },
  { id: "dinner", label: "Вечеря" },
  { id: "snack", label: "Междинно" },
];

export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "Мъж" },
  { value: "female", label: "Жена" },
];

export const DAYS_BG = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];
export const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
export const MONTHS_BG = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];
