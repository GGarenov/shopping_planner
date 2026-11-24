// Choices shown during onboarding. Keys match data/ingredients.json (tags, allergens, ingredient ids)
// and the planner (scripts/plan.mjs). `label` is only the Bulgarian fallback: render labels via next-intl namespace
// "options" — options.sex.<v>, options.activity.<v>.label/.example, options.goal.<v>.label/.hint,
// options.diet.<v | "none"> (+ options.diet.soon), options.exclude.<v>, options.allergen.<v>, options.pantry.<v>.
import type { Activity, Goal, Sex } from "@/lib/planner/targets";

export type Diet = "vegetarian" | "vegan" | "pescatarian";

export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "Мъж" },
  { value: "female", label: "Жена" },
];

export const ACTIVITY_OPTIONS: { value: Activity; label: string; example: string }[] = [
  { value: "sedentary", label: "Заседнал", example: "Офис работа, почти без движение и спорт" },
  { value: "light", label: "Лека активност", example: "1–3 тренировки седмично или много ходене" },
  { value: "moderate", label: "Умерена активност", example: "3–5 тренировки седмично" },
  { value: "high", label: "Висока активност", example: "6–7 тренировки седмично или физически труд" },
];

export const GOAL_OPTIONS: { value: Goal; label: string; hint: string }[] = [
  { value: "lose", label: "Отслабване", hint: "Дефицит до 20 %, повече протеин" },
  { value: "maintain", label: "Поддържане", hint: "Колкото изразходваш" },
  { value: "gain", label: "Качване на мускулна маса", hint: "+300 kcal на ден" },
];

/** `null` = no restriction. */
/** `soon`: shown but not selectable yet — too few recipes for a full week (vegan: no breakfasts yet). */
export const DIET_OPTIONS: { value: Diet | null; label: string; soon?: boolean }[] = [
  { value: null, label: "Без ограничения" },
  { value: "vegetarian", label: "Вегетарианско" },
  { value: "vegan", label: "Веганско", soon: true },
  { value: "pescatarian", label: "Пескетарианско (риба, без месо)" },
];

/** Ingredient `tags` the user can exclude ("I don't eat …"). */
export const EXCLUDE_OPTIONS: { value: string; label: string }[] = [
  { value: "pork", label: "Свинско" },
  { value: "red_meat", label: "Червено месо" },
  { value: "poultry", label: "Птиче месо" },
  { value: "fish", label: "Риба" },
  { value: "seafood", label: "Морски дарове" },
  { value: "eggs", label: "Яйца" },
  { value: "dairy", label: "Млечни продукти" },
  { value: "gluten", label: "Глутен" },
  { value: "nuts", label: "Ядки" },
];

/** Ingredient `allergens` (EU list subset present in the data). */
export const ALLERGEN_OPTIONS: { value: string; label: string }[] = [
  { value: "gluten", label: "Глутен" },
  { value: "milk", label: "Мляко" },
  { value: "eggs", label: "Яйца" },
  { value: "fish", label: "Риба" },
  { value: "crustaceans", label: "Ракообразни" },
  { value: "nuts", label: "Ядки" },
  { value: "peanuts", label: "Фъстъци" },
  { value: "soy", label: "Соя" },
  { value: "sesame", label: "Сусам" },
  { value: "mustard", label: "Горчица" },
  { value: "sulphites", label: "Сулфити" },
];

/** Ingredient ids that can be marked as "already at home" (not bought). */
export const PANTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "salt", label: "Сол" },
  { value: "black_pepper", label: "Черен пипер" },
  { value: "paprika", label: "Червен пипер" },
  { value: "sunflower_oil", label: "Слънчогледово олио" },
  { value: "olive_oil", label: "Зехтин" },
  { value: "vinegar", label: "Оцет" },
  { value: "sugar", label: "Захар" },
  { value: "flour_wheat", label: "Брашно" },
  { value: "honey", label: "Мед" },
  { value: "baking_powder", label: "Бакпулвер" },
  { value: "cinnamon", label: "Канела" },
  { value: "cumin", label: "Кимион" },
  { value: "oregano", label: "Риган" },
  { value: "soy_sauce", label: "Соев сос" },
  { value: "mustard", label: "Горчица" },
  { value: "garlic", label: "Чесън" },
  { value: "lemon", label: "Лимон" },
];

/** Key under "options.diet" for a diet value (`null` → "none"). */
export const dietKey = (value: Diet | null): string => value ?? "none";

/** Same defaults as data/profiles/test.json. */
export const DEFAULT_PANTRY = ["salt", "black_pepper", "paprika", "sunflower_oil", "vinegar", "sugar"];
