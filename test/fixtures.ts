// Small, hand-made data for component tests (real ids so translations and photos resolve).
import type { PlanDay, ShoppingItem } from "@/lib/planner/plan";

const item = (
  o: Partial<ShoppingItem> & Pick<ShoppingItem, "ebag_id" | "ingredient_id" | "ingredient" | "product" | "aisle">,
): ShoppingItem => ({
  url: `https://ebag.bg/p/${o.ebag_id}`,
  unit: "pcs",
  pack: "500 г",
  packs: 1,
  price_each: 1,
  promo: false,
  cost: 1,
  used_edible_g: 300,
  usable_g: 500,
  eaten_cost: 0.6,
  macros_source: "label",
  alternatives: [],
  ...o,
});

export const shopping: ShoppingItem[] = [
  item({
    ebag_id: 101,
    aisle: "vegetables",
    ingredient_id: "tomato",
    ingredient: "Домати",
    product: "Домати Рома",
    cost: 2.49,
    promo: true,
  }),
  item({ ebag_id: 102, aisle: "vegetables", ingredient_id: "onion", ingredient: "Лук", product: "Лук Кромид", pack: "1 кг", cost: 0.79 }),
  item({ ebag_id: 201, aisle: "dairy", ingredient_id: "egg", ingredient: "Яйца", product: "Яйца M", pack: "10 бр.", cost: 3.47 }),
];

const meal = (slot: PlanDay["meals"][number]["slot"], recipe_id: string, recipe: string, kcal: number, protein_g: number) => ({
  slot,
  recipe_id,
  recipe,
  items: [],
  kcal,
  protein_g,
  fat_g: 10,
  carbs_g: 40,
});

/** Two days: Monday on target, Tuesday short on protein. */
export const days: PlanDay[] = [
  {
    day: "Понеделник",
    kcal: 1500,
    protein_g: 120,
    fat_g: 40,
    carbs_g: 160,
    meals: [
      meal("breakfast", "ovesena_kasha_banan", "Овесена каша с банан и кисело мляко", 470, 19),
      meal("lunch", "krem_supa_chervena_leshta", "Крем супа от червена леща", 460, 22),
      meal("dinner", "musaka", "Мусака", 400, 30),
      meal("snack", "izvara_yabalka_kanela", "Извара с ябълка и канела", 170, 18),
    ],
  },
  {
    day: "Вторник",
    kcal: 1450,
    protein_g: 80,
    fat_g: 40,
    carbs_g: 160,
    meals: [
      meal("breakfast", "mishmash", "Мишмаш", 420, 25),
      meal("lunch", "shopska_salata", "Шопска салата", 300, 12),
      meal("dinner", "tarator", "Таратор", 250, 9),
      meal("snack", "proteinovi_brauni", "Протеинови брауни", 200, 15),
    ],
  },
];
