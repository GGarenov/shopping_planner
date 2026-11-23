// Shopping list helpers: aisle grouping in store-walk order, totals, Bulgarian labels. Pure — used by the list
// screen and its tests.
import type { ShoppingItem } from "@/lib/planner/plan";

/** Aisle keys from ingredients.json, in the order you walk a shop. Unknown aisles go last. */
export const AISLES: { key: string; label: string }[] = [
  { key: "vegetables", label: "Зеленчуци" },
  { key: "fruit", label: "Плодове" },
  { key: "bakery", label: "Хляб" },
  { key: "meat", label: "Месо" },
  { key: "fish", label: "Риба" },
  { key: "dairy", label: "Млечни и яйца" },
  { key: "grains_legumes", label: "Зърнени и бобови" },
  { key: "canned", label: "Консерви" },
  { key: "frozen", label: "Замразени" },
  { key: "nuts_seeds", label: "Ядки и семена" },
  { key: "baking", label: "За печене" },
  { key: "oils_condiments", label: "Олио, оцет и сосове" },
  { key: "spices", label: "Подправки" },
];

export interface AisleGroup {
  key: string;
  label: string;
  items: ShoppingItem[];
  cost: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Groups items by aisle (store-walk order), items by ingredient name within an aisle. */
export function groupByAisle(items: ShoppingItem[]): AisleGroup[] {
  const order = new Map(AISLES.map((a, i) => [a.key, i]));
  const groups = new Map<string, ShoppingItem[]>();
  for (const it of items) (groups.get(it.aisle) ?? groups.set(it.aisle, []).get(it.aisle)!).push(it);
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b))
    .map(([key, list]) => ({
      key,
      label: AISLES.find((a) => a.key === key)?.label ?? key,
      items: [...list].sort((a, b) => a.ingredient.localeCompare(b.ingredient, "bg") || a.product.localeCompare(b.product, "bg")),
      cost: cents(list.reduce((s, it) => s + it.cost, 0)),
    }));
}

export function shoppingTotals(items: ShoppingItem[]) {
  return {
    checkout: cents(items.reduce((s, it) => s + it.cost, 0)),
    eaten: cents(items.reduce((s, it) => s + it.eaten_cost, 0)),
  };
}

/** "1 кг", "500 г", "2 × ~ 700 г / бр". */
export function packLabel(it: Pick<ShoppingItem, "pack" | "packs">): string {
  return it.packs > 1 ? `${it.packs} × ${it.pack}` : it.pack;
}

export const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
