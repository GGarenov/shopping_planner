// The sync's pure steps, checked against the repo's own data: rebuilding the products from the saved catalogue,
// nutrition cache and overrides must reproduce data/ebag_products.json exactly (the old --relink behaviour).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addBrowseItem, buildProducts, inStock, linkProducts, pickDetailsTodo, type CatalogItem, type LinkedProduct, type SyncIngredient } from "./catalog";
import type { ProductDetails } from "./parse";

const read = (f: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../../data", f), "utf8"));

type Saved = { id: number; name: string; brand: string | null; url: string; categories: number[]; pack_size: string; sold_by: string; price: number | null; promo: number | null; available: boolean; stock: number | null };
const saved = read("ebag_catalog.json") as { products: Saved[] };
const productsDoc = read("ebag_products.json") as { _about: { fetched: string }; products: LinkedProduct[] };
const cache = read("ebag_nutrition_cache.json") as Record<string, ProductDetails>;
const overrides = read("ebag_overrides.json");
const ingredients = read("ingredients.json").ingredients as SyncIngredient[];

const catalog = new Map<number, CatalogItem>();
for (const p of saved.products)
  catalog.set(p.id, { ...p, unit: p.sold_by === "kg" ? "kg" : "pcs", quantity_step: 1, prices: { unit_delta: p.price, promo_unit_delta: p.promo }, is_available: p.available });

describe("eBag sync steps", () => {
  it("relinking the saved catalogue reproduces data/ebag_products.json", () => {
    const old = productsDoc.products;
    const links = linkProducts(catalog, ingredients, overrides, new Map(old.map((p) => [p.ebag_id, p])));
    const today = productsDoc._about.fetched;
    const { products, unknownIngredient } = buildProducts({
      catalog,
      links,
      ingredients,
      cache,
      oldProducts: old,
      excluded: new Set((overrides.exclude ?? []).map(Number)),
      today,
      oldFetched: today,
    });
    expect(unknownIngredient).toEqual([]);
    expect(products.length).toBe(old.length);
    const byId = new Map(products.map((p) => [p.ebag_id, p]));
    for (const o of old) expect(byId.get(o.ebag_id)).toEqual(o);
  });

  it("stock rule: available with quantity 0 is out of stock", () => {
    expect(inStock({ is_available: true, stock: 0 })).toBe(false);
    expect(inStock({ is_available: true, stock: null })).toBe(true);
    expect(inStock({ is_available: false, stock: 5 })).toBe(false);
  });

  it("a product seen in two categories is kept once with both", () => {
    const c = new Map<number, CatalogItem>();
    const item = { id: 1, name: "Мляко", brand: { name: "X" }, url: "u", pack_size: "1 л", unit: "pcs", quantity_step: "1", prices: {}, is_available: true, available_quantity: "3" };
    addBrowseItem(c, item, 2);
    addBrowseItem(c, item, 1897);
    expect(c.size).toBe(1);
    expect(c.get(1)).toMatchObject({ brand: "X", categories: [2, 1897], stock: 3, quantity_step: 1 });
  });

  it("details: never-fetched products first, at most the limit", () => {
    const links = linkProducts(catalog, ingredients, overrides, new Map());
    const todo = pickDetailsTodo(catalog, links, {}, "2026-11-24", 50);
    expect(todo).toHaveLength(50);
    const fresh = pickDetailsTodo(catalog, links, cache, productsDoc._about.fetched, 10_000);
    expect(fresh.every((id) => !cache[id])).toBe(true);
  });
});
