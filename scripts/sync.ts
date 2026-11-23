// Daily eBag sync → Supabase (runs in GitHub Actions; SPEC §7.3). Replaces scripts/sync_ebag.mjs.
//   1. Crawls every food category (browse_products) with the owner's eBag account (tokens in system_secrets)
//   2. Links products to ingredients (match rules from the ingredients table + data/ebag_overrides.json)
//   3. Fetches product details (label, drained weight) for up to 400 linked products → ebag_details
//   4. Rebuilds the linked products → upserts `products`; products no longer listed → available = false
//   5. Records a sync_runs row (the app shows "Цени от <prices_date>")
// Usage:
//   npm run ebag:sync                       full run
//   npm run ebag:sync -- --dry-run          crawl + build, write nothing except refreshed tokens
//   npm run ebag:sync -- --no-details       skip step 3
//   npm run ebag:sync -- --export           also write data/ebag_products.json, ebag_catalog.json, price_history
//   npm run ebag:sync -- --relink --no-details   reuse data/ebag_catalog.json instead of crawling (no eBag calls)
// Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, EBAG_TOKEN_KEY.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connectEbag, type EbagApi } from "../lib/ebag/api.ts";
import {
  addBrowseItem,
  buildProducts,
  inStock,
  linkProducts,
  pickDetailsTodo,
  type CatalogItem,
  type LinkedProduct,
  type Overrides,
  type SyncIngredient,
} from "../lib/ebag/catalog.ts";
import { CRAWL_CATEGORIES, SYNC } from "../lib/ebag/config.ts";
import { SupabaseOwnerTokens } from "../lib/ebag/ownerTokens.ts";
import { parsePack, parsePrices, parseProductDetails, type ProductDetails } from "../lib/ebag/parse.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const RELINK = args.has("--relink");
const DETAILS = !args.has("--no-details");
const EXPORT = args.has("--export");
const TODAY = new Date().toISOString().slice(0, 10);
const BATCH = 500;

const lines: string[] = [];
const log = (msg: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  lines.push(line);
  console.log(line);
};
const readJson = <T>(rel: string, fallback?: T): T => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) as T;
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
};
const writeJson = (rel: string, data: unknown, pretty = true) => {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(data, null, pretty ? 2 : 0) + "\n", "utf8");
  fs.renameSync(`${p}.tmp`, p);
};

async function selectAll<T>(db: SupabaseClient, table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(order).range(from, from + 999);
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < 1000) return rows;
  }
}
async function upsertAll(db: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + BATCH), { onConflict });
    if (error) throw new Error(`${table} upsert failed at row ${i}: ${error.message}`);
  }
}

// ---------- setup ----------
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const started = Date.now();
let runId: number | null = null;
if (!DRY) {
  const { data, error } = await db.from("sync_runs").insert({ status: "running", stats: { source: "sync" } }).select("id").single();
  if (error) throw new Error(`sync_runs insert failed: ${error.message}`);
  runId = data.id as number;
}

let api = null as EbagApi | null; // set inside run()
try {
  const stats = await run();
  if (runId != null) {
    const { error } = await db
      .from("sync_runs")
      .update({ status: "success", finished_at: new Date().toISOString(), stats, log: lines.join("\n") })
      .eq("id", runId);
    if (error) throw new Error(`sync_runs update failed: ${error.message}`);
  }
} catch (err) {
  log(`FAILED: ${(err as Error).stack ?? String(err)}`);
  if (runId != null)
    await db
      .from("sync_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), stats: { source: "sync" }, log: lines.join("\n") })
      .eq("id", runId);
  process.exitCode = 1;
} finally {
  await api?.close().catch(() => {});
}

async function run() {
  log(`sync ${TODAY}${DRY ? " (dry run)" : ""}${RELINK ? " (relink)" : ""}${DETAILS ? "" : " (no details)"}`);
  if (!(RELINK && !DETAILS)) api = await connectEbag(await SupabaseOwnerTokens.load(db), { delayMs: SYNC.delayMs, retries: SYNC.retries });

  // ---------- 1. crawl ----------
  const catalog = new Map<number, CatalogItem>();
  let pricesDate = TODAY;
  if (RELINK) {
    type Saved = { id: number; name: string; brand: string | null; url: string; categories: number[]; pack_size: string; sold_by: string; price: number | null; promo: number | null; available: boolean; stock: number | null };
    const saved = readJson<{ _about?: { fetched?: string }; products: Saved[] }>("data/ebag_catalog.json");
    pricesDate = saved._about?.fetched ?? TODAY;
    for (const p of saved.products)
      catalog.set(p.id, {
        ...p,
        unit: p.sold_by === "kg" ? "kg" : "pcs",
        quantity_step: 1,
        prices: { unit_delta: p.price, promo_unit_delta: p.promo },
        is_available: p.available,
      });
    log(`relink: ${catalog.size} products from data/ebag_catalog.json`);
  } else {
    for (const [catId, catName] of Object.entries(CRAWL_CATEGORIES)) {
      let seen = 0;
      let total = 0;
      for (let page = 1; page <= 500; page++) {
        const res = await api!.call<{ total: number; items: Parameters<typeof addBrowseItem>[1][]; has_more: boolean }>("browse_products", {
          category_id: Number(catId),
          page,
          page_size: SYNC.pageSize,
          sort: "price_asc",
        });
        total = res.total;
        for (const it of res.items) addBrowseItem(catalog, it, Number(catId));
        seen += res.items.length;
        if (!res.has_more) break;
      }
      log(`${catName}: ${seen}/${total}`);
    }
  }
  log(`catalogue: ${catalog.size} unique products`);
  if (catalog.size < SYNC.minCatalog) throw new Error(`only ${catalog.size} products crawled — aborting so existing data is not overwritten`);

  // ---------- 2. link ----------
  const ingredients = (await selectAll<{ data: SyncIngredient }>(db, "ingredients", "data", "id")).map((r) => r.data);
  const oldProducts = (await selectAll<{ data: LinkedProduct }>(db, "products", "data", "ebag_id")).map((r) => r.data);
  const overrides = readJson<Overrides>("data/ebag_overrides.json", { exclude: [], link: {} });
  const links = linkProducts(catalog, ingredients, overrides, new Map(oldProducts.map((p) => [p.ebag_id, p])));
  log(`linked: ${links.size} products to ${new Set([...links.values()].map((l) => l.ingredient_id)).size} ingredients`);

  // ---------- 3. product details ----------
  const cache: Record<string, ProductDetails> = {};
  for (const r of await selectAll<{ ebag_id: number; data: ProductDetails }>(db, "ebag_details", "ebag_id, data", "ebag_id")) cache[r.ebag_id] = r.data;
  const seedCache = Object.keys(cache).length === 0; // first run: start from the repo's cache file
  if (seedCache) Object.assign(cache, readJson<Record<string, ProductDetails>>("data/ebag_nutrition_cache.json", {}));
  const fetched = new Set<string>(seedCache ? Object.keys(cache) : []);
  let detailErrors = 0;
  let fetchedNow = 0;
  if (DETAILS) {
    const todo = pickDetailsTodo(catalog, links, cache, TODAY);
    for (const [i, id] of todo.entries()) {
      try {
        cache[id] = parseProductDetails(await api!.call("get_product", { product_id: id }));
        fetched.add(String(id));
        fetchedNow++;
      } catch (err) {
        detailErrors++;
        log(`get_product ${id} failed: ${(err as Error).message}`);
      }
      if ((i + 1) % 100 === 0) log(`details: ${i + 1}/${todo.length}`);
    }
    log(`details fetched: ${todo.length - detailErrors}/${todo.length}; cache ${Object.keys(cache).length}`);
  }

  // ---------- 4. rebuild ----------
  const excluded = new Set((overrides.exclude ?? []).map(Number));
  const { products, unknownIngredient } = buildProducts({ catalog, links, ingredients, cache, oldProducts, excluded, today: TODAY });
  if (unknownIngredient.length) log(`!! linked to unknown ingredients: ${unknownIngredient.join(", ")}`);
  const available = products.filter((p) => p.available).length;
  const perIng = new Set(products.filter((p) => p.available).map((p) => p.ingredient_id));
  const noProducts = ingredients.filter((i) => !perIng.has(i.id)).map((i) => i.id);
  if (noProducts.length) log(`ingredients with no available product: ${noProducts.join(", ")}`);

  let markedUnavailable = 0;
  if (!DRY) {
    await upsertAll(
      db,
      "products",
      products.map((p) => ({
        ebag_id: p.ebag_id,
        ingredient_id: p.ingredient_id,
        data: p,
        available: p.available,
        price: p.price?.regular ?? null,
        promo: p.price?.promo ?? null,
        updated_at: new Date().toISOString(),
      })),
      "ebag_id",
    );
    const listed = new Set(products.map((p) => p.ebag_id));
    const stale = oldProducts.filter((p) => !listed.has(p.ebag_id)).map((p) => p.ebag_id);
    for (let i = 0; i < stale.length; i += BATCH) {
      const { error } = await db.from("products").update({ available: false }).in("ebag_id", stale.slice(i, i + BATCH));
      if (error) throw new Error(`marking stale products failed: ${error.message}`);
    }
    markedUnavailable = stale.length;
    await upsertAll(
      db,
      "ebag_details",
      [...fetched].filter((id) => cache[id]).map((id) => ({ ebag_id: Number(id), data: cache[id], fetched: cache[id]!.fetched ?? TODAY })),
      "ebag_id",
    );
    log(`written: ${products.length} products (${available} available), ${markedUnavailable} no longer listed, ${fetched.size} details`);
  }

  // ---------- optional JSON export (local use) ----------
  if (EXPORT) {
    const doc = readJson<{ _about?: Record<string, unknown> }>("data/ebag_products.json", {});
    writeJson("data/ebag_products.json", { _about: { ...doc._about, version: 2, fetched: TODAY }, products });
    writeJson("data/ebag_nutrition_cache.json", cache, false);
    const catalogOut = [...catalog.values()]
      .map((p) => {
        const pack = parsePack(p.pack_size, p.unit, p.quantity_step);
        const price = parsePrices(p.prices, pack.grams || (pack.ml ?? null));
        return {
          id: p.id, name: p.name, brand: p.brand, url: p.url, categories: p.categories, pack_size: p.pack_size,
          sold_by: p.unit === "kg" ? "kg" : "piece", price: price.regular, promo: price.promo,
          ...(price.bundle_note ? { bundle_note: price.bundle_note } : {}),
          available: inStock(p), stock: p.stock, ingredient_id: links.get(p.id)?.ingredient_id ?? null,
        };
      })
      .sort((a, b) => a.id - b.id);
    writeJson("data/ebag_catalog.json", { _about: { description: "All eBag food products from the crawled categories, with today's prices.", fetched: TODAY, count: catalogOut.length, categories: CRAWL_CATEGORIES }, products: catalogOut });
    writeJson(`data/price_history/${TODAY}.json`, { date: TODAY, columns: ["id", "price", "promo", "available"], rows: catalogOut.map((p) => [p.id, p.price, p.promo, p.available ? 1 : 0]) }, false);
    log("exported data/ebag_products.json, ebag_catalog.json, ebag_nutrition_cache.json, price_history");
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  log(`done in ${seconds} s, ${api?.calls ?? 0} eBag calls`);
  return {
    source: "sync",
    prices_date: pricesDate,
    catalog: catalog.size,
    linked: links.size,
    products: products.length,
    available,
    marked_unavailable: markedUnavailable,
    details_fetched: fetchedNow,
    detail_errors: detailErrors,
    ingredients_without_product: noProducts,
    ebag_calls: api?.calls ?? 0,
    seconds,
  };
}
