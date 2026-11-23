// Uploads the reference data to Supabase (idempotent upserts, service role).
//   npm run seed                 → ingredients, recipes, products
//   npm run seed -- --dry-run    → validate and count only, write nothing
//
// Products that are in Supabase but no longer in data/ebag_products.json are marked available = false
// (never deleted: old plans may still reference them).
// Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY — npm run seed loads .env.local.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const BATCH = 500;

interface Ingredient {
  id: string;
}
interface Recipe {
  id: string;
}
interface Product {
  ebag_id: number;
  ingredient_id: string;
  available: boolean;
  price?: { regular: number | null; promo: number | null };
  last_seen?: string;
}

const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) as T;

const ingredients = readJson<{ ingredients: Ingredient[] }>("data/ingredients.json").ingredients;
const recipes = readJson<{ recipes: Recipe[] }>("data/recipes.json").recipes;
const products = readJson<{ products: Product[] }>("data/ebag_products.json").products;

// ---------- validate before touching the database ----------
function assertUnique<T>(rows: T[], key: (r: T) => unknown, what: string) {
  const seen = new Set<unknown>();
  for (const r of rows) {
    const k = key(r);
    if (k == null || k === "") throw new Error(`${what}: row without id`);
    if (seen.has(k)) throw new Error(`${what}: duplicate id ${String(k)}`);
    seen.add(k);
  }
}
assertUnique(ingredients, (i) => i.id, "ingredients");
assertUnique(recipes, (r) => r.id, "recipes");
assertUnique(products, (p) => p.ebag_id, "products");
const ingredientIds = new Set(ingredients.map((i) => i.id));
const orphans = products.filter((p) => !ingredientIds.has(p.ingredient_id));
if (orphans.length) throw new Error(`products linked to unknown ingredients: ${orphans.slice(0, 5).map((p) => `${p.ebag_id}→${p.ingredient_id}`).join(", ")}`);
if (products.length < 1000) throw new Error(`only ${products.length} products — refusing to seed a partial file (SPEC §7.3)`);

const pricesDate = products.reduce((d, p) => (p.last_seen && p.last_seen > d ? p.last_seen : d), "");
console.log(`ingredients ${ingredients.length} · recipes ${recipes.length} · products ${products.length} (${products.filter((p) => p.available).length} available, prices from ${pricesDate || "?"})`);
if (DRY) {
  console.log("dry run — nothing written");
  process.exit(0);
}

// ---------- write ----------
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + BATCH), { onConflict });
    if (error) throw new Error(`${table} upsert failed at row ${i}: ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length} upserted`);
}

const t0 = Date.now();
const startedAt = new Date().toISOString();

await upsert("ingredients", ingredients.map((i) => ({ id: i.id, data: i })), "id");
await upsert("recipes", recipes.map((r) => ({ id: r.id, data: r })), "id");
await upsert(
  "products",
  products.map((p) => ({
    ebag_id: p.ebag_id,
    ingredient_id: p.ingredient_id,
    data: p,
    available: p.available,
    price: p.price?.regular ?? null,
    promo: p.price?.promo ?? null,
  })),
  "ebag_id",
);

// Products no longer in the file → unavailable.
const inFile = new Set(products.map((p) => p.ebag_id));
const existing: number[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("products").select("ebag_id").eq("available", true).range(from, from + 999);
  if (error) throw new Error(`products select failed: ${error.message}`);
  existing.push(...data.map((r) => Number(r.ebag_id)));
  if (data.length < 1000) break;
}
const stale = existing.filter((id) => !inFile.has(id));
for (let i = 0; i < stale.length; i += BATCH) {
  const { error } = await db.from("products").update({ available: false }).in("ebag_id", stale.slice(i, i + BATCH));
  if (error) throw new Error(`marking stale products failed: ${error.message}`);
}
console.log(`  products no longer listed → unavailable: ${stale.length}`);

// Record the run so the app can show "цени от <дата>".
const { error: runError } = await db.from("sync_runs").insert({
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  status: "success",
  stats: {
    source: "seed",
    prices_date: pricesDate || null,
    ingredients: ingredients.length,
    recipes: recipes.length,
    products: products.length,
    available: products.filter((p) => p.available).length,
    marked_unavailable: stale.length,
  },
});
if (runError) throw new Error(`sync_runs insert failed: ${runError.message}`);

console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
