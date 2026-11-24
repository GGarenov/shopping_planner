// Shopping list helpers: aisle grouping in store-walk order, totals, labels. Pure — used by the list
// screen and its tests. Aisle names are translations: messages/<locale>/list.json → aisle.<key>.
import { eur as formatEur } from "@/lib/i18n/format";
import type { ShoppingItem } from "@/lib/planner/plan";

/** Aisle keys from ingredients.json, in the order you walk a shop. Unknown aisles go last. */
export const AISLES: { key: string }[] = [
  { key: "vegetables" },
  { key: "fruit" },
  { key: "bakery" },
  { key: "meat" },
  { key: "fish" },
  { key: "dairy" },
  { key: "grains_legumes" },
  { key: "canned" },
  { key: "frozen" },
  { key: "nuts_seeds" },
  { key: "baking" },
  { key: "oils_condiments" },
  { key: "spices" },
];

export interface AisleGroup {
  key: string;
  /** false for an aisle not in AISLES — show the key itself instead of a translated name. */
  known: boolean;
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
      known: order.has(key),
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

/** Money in the given locale (default Bulgarian, "9,40 €"). */
export const eur = (n: number, locale?: string) => formatEur(n, locale);
