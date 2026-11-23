// Pure steps of the daily eBag sync (ported 1:1 from the former scripts/sync_ebag.mjs): normalise crawled items,
// link them to ingredients, pick which product details to fetch, and rebuild the linked product list.
// I/O (eBag calls, Supabase, files) lives in scripts/sync.ts.
import { CATEGORY_GROUPS, GLOBAL_EXCLUDE, SYNC } from "./config.ts";
import {
  buildMatchers,
  parsePack,
  parsePrices,
  parseWeightFromName,
  type MatchableIngredient,
  type Pack,
  type ProductDetails,
  type RawPrices,
} from "./parse.ts";

/** One crawled eBag product (deduplicated across categories). */
export interface CatalogItem {
  id: number;
  name: string;
  brand: string | null;
  url: string;
  categories: number[];
  pack_size: string;
  unit: string; // "kg" | "pcs"
  quantity_step: number;
  prices: RawPrices;
  is_available: boolean;
  stock: number | null;
  is_promo?: boolean;
}

export interface SyncIngredient extends MatchableIngredient {
  density_g_per_ml?: number;
  unit_weight_g?: number;
}

export interface Overrides {
  exclude?: (number | string)[];
  link?: Record<string, string>;
}

/** A row of data/ebag_products.json / products.data. */
export interface LinkedProduct {
  ebag_id: number;
  ingredient_id: string;
  link: "auto" | "manual";
  name: string;
  brand: string | null;
  url: string;
  sold_by: "kg" | "piece";
  available: boolean;
  stock: number | null;
  pack: Pack & { drained_grams?: number; grams_source?: string };
  edible_fraction?: number;
  price: ReturnType<typeof parsePrices>;
  label: Record<string, unknown> | null;
  may_contain?: string[];
  needs_review: boolean;
  review_reasons?: string[];
  first_seen: string;
  last_seen: string;
  [k: string]: unknown;
}

type BrowseItem = {
  id: number;
  name: string;
  brand?: string | { name?: string } | null;
  url: string;
  pack_size: string;
  unit: string;
  quantity_step: number | string;
  prices: RawPrices;
  is_available: boolean;
  available_quantity?: number | string | null;
  is_promo?: boolean;
};

/** Adds one browse_products item to the catalogue (an item seen in several categories keeps all of them). */
export function addBrowseItem(catalog: Map<number, CatalogItem>, it: BrowseItem, categoryId: number): void {
  const prev = catalog.get(it.id);
  if (prev) {
    if (!prev.categories.includes(categoryId)) prev.categories.push(categoryId);
    return;
  }
  catalog.set(it.id, {
    id: it.id,
    name: it.name,
    brand: typeof it.brand === "object" ? (it.brand?.name ?? null) : (it.brand ?? null),
    url: it.url,
    categories: [categoryId],
    pack_size: it.pack_size,
    unit: it.unit,
    quantity_step: Number(it.quantity_step),
    prices: it.prices,
    is_available: it.is_available,
    stock: it.available_quantity != null ? Number(it.available_quantity) : null,
    is_promo: it.is_promo,
  });
}

/** eBag can report is_available: true with available_quantity 0 — that is out of stock (SPEC §7.3). */
export const inStock = (p: Pick<CatalogItem, "is_available" | "stock">) => !!p.is_available && (p.stock == null || p.stock > 0);

export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

export interface Link {
  ingredient_id: string;
  edible_fraction?: number;
  ambiguous?: string[] | null;
  link: "auto" | "manual";
}

/** Links catalogue products to ingredients: overrides first, then hand-curated links, then the match rules. */
export function linkProducts(
  catalog: Map<number, CatalogItem>,
  ingredients: SyncIngredient[],
  overrides: Overrides,
  oldById: Map<number, LinkedProduct>,
): Map<number, Link> {
  const excluded = new Set((overrides.exclude ?? []).map(Number));
  const forced = new Map(Object.entries(overrides.link ?? {}).map(([k, v]) => [Number(k), v]));
  const match = buildMatchers(ingredients, CATEGORY_GROUPS, GLOBAL_EXCLUDE);
  const links = new Map<number, Link>();
  for (const p of catalog.values()) {
    if (excluded.has(p.id)) continue;
    const old = oldById.get(p.id);
    if (forced.has(p.id)) {
      links.set(p.id, { ingredient_id: forced.get(p.id)!, link: "manual" });
      continue;
    }
    if (old && old.link !== "auto") {
      links.set(p.id, { ingredient_id: old.ingredient_id, link: "manual" });
      continue;
    }
    const m = match(p.name, p.categories);
    if (m) links.set(p.id, { ...m, edible_fraction: m.edible_fraction, link: "auto" });
  }
  return links;
}

/** Which products to fetch details for: never-fetched first, cheapest per gram of each ingredient first. */
export function pickDetailsTodo(
  catalog: Map<number, CatalogItem>,
  links: Map<number, Link>,
  cache: Record<string, ProductDetails>,
  today: string,
  limit: number = SYNC.nutritionPerRun,
): number[] {
  const rank = new Map<number, number>();
  const byIng = new Map<string, [number, number][]>();
  for (const [id, l] of links) {
    const p = catalog.get(id)!;
    const pack = parsePack(p.pack_size, p.unit, p.quantity_step);
    const g = pack.grams || pack.ml || parseWeightFromName(p.name) || 1e9;
    const price = Number(p.prices?.promo_unit_delta || p.prices?.unit_delta || 1e9);
    (byIng.get(l.ingredient_id) ?? byIng.set(l.ingredient_id, []).get(l.ingredient_id)!).push([id, price / g]);
  }
  for (const list of byIng.values()) list.sort((a, b) => a[1] - b[1]).forEach(([id], i) => rank.set(id, i));
  return [...links.keys()]
    .filter((id) => !cache[id] || daysBetween(cache[id].fetched, today) > SYNC.nutritionMaxAgeDays)
    .sort((a, b) => (cache[a] ? 1000 : 0) + rank.get(a)! - ((cache[b] ? 1000 : 0) + rank.get(b)!))
    .slice(0, limit);
}

/** Rebuilds the linked product list. Hand-curated (manual) entries only get live data refreshed. */
export function buildProducts(args: {
  catalog: Map<number, CatalogItem>;
  links: Map<number, Link>;
  ingredients: SyncIngredient[];
  cache: Record<string, ProductDetails>;
  oldProducts: LinkedProduct[];
  excluded: Set<number>;
  today: string;
  /** Fallback last_seen for old entries without one. */
  oldFetched?: string;
}): { products: LinkedProduct[]; unknownIngredient: number[] } {
  const { catalog, links, cache, today } = args;
  const ingById = new Map(args.ingredients.map((i) => [i.id, i]));
  const oldById = new Map(args.oldProducts.map((p) => [p.ebag_id, p]));
  const products: LinkedProduct[] = [];
  const unknownIngredient: number[] = [];
  for (const [id, l] of links) {
    const p = catalog.get(id)!;
    const ing = ingById.get(l.ingredient_id);
    if (!ing) {
      unknownIngredient.push(id);
      continue;
    }
    const old = oldById.get(id);
    const det: Partial<ProductDetails> = cache[id] ?? {};
    const pack: LinkedProduct["pack"] = parsePack(p.pack_size, p.unit, p.quantity_step);
    const reasons: string[] = [];

    // grams of one selling unit
    if (pack.ml && !pack.grams) pack.grams = Math.round(pack.ml * (ing.density_g_per_ml ?? 1));
    if (!pack.grams) {
      const fromName = parseWeightFromName(p.name);
      if (fromName) {
        pack.grams = fromName * (pack.count || 1);
        pack.variable_weight = true;
        pack.grams_source = "name";
      }
    }
    if (!pack.grams && det.approx_grams) {
      pack.grams = det.approx_grams * (pack.count || 1);
      pack.variable_weight = true;
      pack.grams_source = "description";
    }
    if (!pack.grams && pack.count && ing.unit_weight_g) {
      pack.grams = pack.count * ing.unit_weight_g;
      pack.grams_source = "unit_weight";
    }
    if (det.drained_grams) pack.drained_grams = det.drained_grams;
    if (!pack.grams) reasons.push("pack weight unknown");
    if (l.ambiguous) reasons.push(`matches several ingredients: ${l.ambiguous.join(", ")}`);

    let entry: LinkedProduct = {
      ebag_id: id,
      ingredient_id: l.ingredient_id,
      link: l.link,
      name: p.name,
      brand: p.brand,
      url: p.url,
      sold_by: p.unit === "kg" ? "kg" : "piece",
      available: inStock(p),
      stock: p.stock,
      pack,
      ...(l.edible_fraction != null ? { edible_fraction: l.edible_fraction } : {}),
      price: parsePrices(p.prices, pack.grams),
      label: det.label ? { ...det.label, ...(pack.ml ? { basis: "per_100ml" } : {}) } : null,
      ...(det.may_contain_celery ? { may_contain: ["celery"] } : {}),
      needs_review: reasons.length > 0,
      ...(reasons.length ? { review_reasons: reasons } : {}),
      first_seen: old?.first_seen ?? today,
      last_seen: today,
    };
    if (old && l.link === "manual") {
      entry = {
        ...old,
        link: "manual",
        name: p.name,
        url: p.url,
        available: inStock(p),
        stock: p.stock,
        price: parsePrices(p.prices, old.pack?.grams ?? pack.grams),
        label: old.label ?? entry.label,
        first_seen: old.first_seen ?? today,
        last_seen: today,
      };
    }
    products.push(entry);
  }

  // Keep recently-unseen linked products (temporarily out of the listing) for a while, marked unavailable.
  for (const old of args.oldProducts) {
    if (catalog.has(old.ebag_id) || args.excluded.has(old.ebag_id)) continue;
    const lastSeen = old.last_seen ?? args.oldFetched ?? today;
    if (daysBetween(lastSeen, today) <= SYNC.dropUnseenAfterDays) products.push({ ...old, available: false, last_seen: lastSeen });
  }
  products.sort((a, b) => a.ingredient_id.localeCompare(b.ingredient_id) || (a.price.per_kg ?? 1e9) - (b.price.per_kg ?? 1e9));
  return { products, unknownIngredient };
}
