// Daily eBag sync.
//   1. Crawls every food category (browse_products) -> data/ebag_catalog.json (all products, today's prices)
//   2. Links products to ingredients using the match rules in data/ingredients.json
//   3. Fetches product details (nutrition label, drained weight) for linked products -> data/ebag_nutrition_cache.json
//   4. Rebuilds data/ebag_products.json (linked products), keeping hand-curated entries and fields
//   5. Writes a compact price snapshot to data/price_history/YYYY-MM-DD.json
// Usage: npm run ebag:sync            (needs a prior `npm run ebag:login`)
//        npm run ebag:sync -- --no-details   (skip step 3)
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './ebag_client.mjs';
import { PATHS, CRAWL_CATEGORIES, CATEGORY_GROUPS, GLOBAL_EXCLUDE, SYNC } from './ebag_config.mjs';
import { parsePack, parsePrices, parseProductDetails, buildMatchers, parseWeightFromName } from './ebag_parse.mjs';

const TODAY = new Date().toISOString().slice(0, 10);
const args = new Set(process.argv.slice(2));
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, data, pretty = true) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0) + '\n', 'utf8');
  fs.renameSync(tmp, p);
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
// eBag can report is_available: true with available_quantity 0 — that is out of stock.
const inStock = p => !!p.is_available && (p.stock == null || p.stock > 0);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const started = Date.now();
// --relink: reuse today's saved catalogue instead of crawling (for re-running the linking after rule changes).
const relink = args.has('--relink');
const api = relink && args.has('--no-details') ? null : await connect({ interactive: false });

// ---------- 1. crawl ----------
const catalog = new Map(); // id -> product
if (relink) {
  for (const p of readJson(PATHS.catalog, { products: [] }).products) {
    catalog.set(p.id, {
      id: p.id, name: p.name, brand: p.brand, url: p.url, categories: p.categories, pack_size: p.pack_size,
      unit: p.sold_by === 'kg' ? 'kg' : 'pcs', quantity_step: 1,
      prices: { unit_delta: p.price, promo_unit_delta: p.promo }, is_available: p.available, stock: p.stock,
    });
  }
  log(`relink: loaded ${catalog.size} products from the saved catalogue`);
}
for (const [catId, catName] of relink ? [] : Object.entries(CRAWL_CATEGORIES)) {
  let page = 1, total = 0, seen = 0;
  do {
    const res = await api.call('browse_products', { category_id: Number(catId), page, page_size: SYNC.pageSize, sort: 'price_asc' });
    total = res.total;
    for (const it of res.items) {
      seen++;
      const prev = catalog.get(it.id);
      if (prev) { if (!prev.categories.includes(Number(catId))) prev.categories.push(Number(catId)); continue; }
      catalog.set(it.id, {
        id: it.id,
        name: it.name,
        brand: typeof it.brand === 'object' ? it.brand?.name ?? null : it.brand ?? null,
        url: it.url,
        categories: [Number(catId)],
        pack_size: it.pack_size,
        unit: it.unit,
        quantity_step: Number(it.quantity_step),
        prices: it.prices,
        is_available: it.is_available,
        stock: it.available_quantity != null ? Number(it.available_quantity) : null,
        is_promo: it.is_promo,
      });
    }
    if (!res.has_more) break;
    page++;
  } while (page <= 500);
  log(`${catName}: ${seen}/${total} items`);
}
log(`catalogue: ${catalog.size} unique products`);
if (catalog.size < 1000) throw new Error(`Only ${catalog.size} products crawled — aborting so existing data is not overwritten.`);

// ---------- 2. link ----------
const ingredients = readJson(PATHS.ingredients).ingredients;
const ingById = new Map(ingredients.map(i => [i.id, i]));
const overrides = readJson(PATHS.overrides, { exclude: [], link: {} });
const excluded = new Set((overrides.exclude || []).map(Number));
const forcedLinks = new Map(Object.entries(overrides.link || {}).map(([k, v]) => [Number(k), v]));
const oldDoc = readJson(PATHS.products, { products: [] });
const oldById = new Map(oldDoc.products.map(p => [p.ebag_id, p]));
const match = buildMatchers(ingredients, CATEGORY_GROUPS, GLOBAL_EXCLUDE);

const links = new Map(); // id -> {ingredient_id, edible_fraction, ambiguous, link}
for (const p of catalog.values()) {
  if (excluded.has(p.id)) continue;
  const old = oldById.get(p.id);
  if (forcedLinks.has(p.id)) { links.set(p.id, { ingredient_id: forcedLinks.get(p.id), link: 'manual' }); continue; }
  if (old && old.link !== 'auto') { links.set(p.id, { ingredient_id: old.ingredient_id, link: 'manual' }); continue; }
  const m = match(p.name, p.categories);
  if (m) links.set(p.id, { ...m, link: 'auto' });
}
log(`linked: ${links.size} products to ${new Set([...links.values()].map(l => l.ingredient_id)).size} ingredients`);

// ---------- 3. product details ----------
const cache = readJson(PATHS.nutritionCache, {});
if (!args.has('--no-details')) {
  // Priority: products never fetched first, and within those the cheapest per gram of each ingredient
  // (those are the ones the planner actually buys).
  const rank = new Map();
  const byIng = new Map();
  for (const [id, l] of links) {
    const p = catalog.get(id);
    const pack = parsePack(p.pack_size, p.unit, p.quantity_step);
    const g = pack.grams || pack.ml || parseWeightFromName(p.name) || 1e9;
    const price = Number(p.prices?.promo_unit_delta || p.prices?.unit_delta || 1e9);
    if (!byIng.has(l.ingredient_id)) byIng.set(l.ingredient_id, []);
    byIng.get(l.ingredient_id).push([id, price / g]);
  }
  for (const list of byIng.values()) list.sort((a, b) => a[1] - b[1]).forEach(([id], i) => rank.set(id, i));
  const todo = [...links.keys()]
    .filter(id => !cache[id] || daysBetween(cache[id].fetched, TODAY) > SYNC.nutritionMaxAgeDays)
    .sort((a, b) => ((cache[a] ? 1000 : 0) + rank.get(a)) - ((cache[b] ? 1000 : 0) + rank.get(b)))
    .slice(0, SYNC.nutritionPerRun);
  let n = 0;
  for (const id of todo) {
    try {
      cache[id] = parseProductDetails(await api.call('get_product', { product_id: id }));
    } catch (err) {
      log(`get_product ${id} failed: ${err.message}`);
    }
    if (++n % 50 === 0) { writeJson(PATHS.nutritionCache, cache, false); log(`details: ${n}/${todo.length}`); }
  }
  writeJson(PATHS.nutritionCache, cache, false);
  log(`details fetched: ${n}; cache size ${Object.keys(cache).length}`);
}
await api?.close();

// ---------- 4. rebuild ebag_products.json ----------
const products = [];
for (const [id, l] of links) {
  const p = catalog.get(id);
  const ing = ingById.get(l.ingredient_id);
  if (!ing) { log(`!! product ${id} links to unknown ingredient ${l.ingredient_id}`); continue; }
  const old = oldById.get(id);
  const det = cache[id] || {};
  const pack = parsePack(p.pack_size, p.unit, p.quantity_step);
  const reasons = [];

  // grams of one selling unit
  if (pack.ml && !pack.grams) pack.grams = Math.round(pack.ml * (ing.density_g_per_ml ?? 1));
  if (!pack.grams) {
    const fromName = parseWeightFromName(p.name);
    if (fromName) { pack.grams = fromName * (pack.count || 1); pack.variable_weight = true; pack.grams_source = 'name'; }
  }
  if (!pack.grams && det.approx_grams) { pack.grams = det.approx_grams * (pack.count || 1); pack.variable_weight = true; pack.grams_source = 'description'; }
  if (!pack.grams && pack.count && ing.unit_weight_g) { pack.grams = pack.count * ing.unit_weight_g; pack.grams_source = 'unit_weight'; }
  if (det.drained_grams) pack.drained_grams = det.drained_grams;
  if (!pack.grams) reasons.push('pack weight unknown');
  if (l.ambiguous) reasons.push(`matches several ingredients: ${l.ambiguous.join(', ')}`);
  // A label whose kcal doesn't match its macros is simply not used (valid: false) — no human review needed.

  let entry = {
    ebag_id: id,
    ingredient_id: l.ingredient_id,
    link: l.link,
    name: p.name,
    brand: p.brand,
    url: p.url,
    sold_by: p.unit === 'kg' ? 'kg' : 'piece',
    available: inStock(p),
    stock: p.stock,
    pack,
    ...(l.edible_fraction != null ? { edible_fraction: l.edible_fraction } : {}),
    price: parsePrices(p.prices, pack.grams),
    label: det.label ? { ...det.label, ...(pack.ml ? { basis: 'per_100ml' } : {}) } : null,
    ...(det.may_contain_celery ? { may_contain: ['celery'] } : {}),
    needs_review: reasons.length > 0,
    ...(reasons.length ? { review_reasons: reasons } : {}),
    first_seen: old?.first_seen ?? TODAY,
    last_seen: TODAY,
  };

  // Hand-curated entries keep their curated fields; only live data is refreshed.
  if (old && l.link === 'manual') {
    entry = {
      ...old,
      link: 'manual',
      name: p.name, url: p.url, available: inStock(p), stock: p.stock,
      price: parsePrices(p.prices, old.pack?.grams ?? pack.grams),
      label: old.label ?? entry.label,
      first_seen: old.first_seen ?? TODAY,
      last_seen: TODAY,
    };
  }
  products.push(entry);
}

// Keep recently-unseen linked products (temporarily out of the listing) for a while, marked unavailable.
for (const old of oldDoc.products) {
  if (catalog.has(old.ebag_id) || excluded.has(old.ebag_id)) continue;
  const lastSeen = old.last_seen ?? oldDoc._about?.fetched ?? TODAY;
  if (daysBetween(lastSeen, TODAY) <= SYNC.dropUnseenAfterDays) products.push({ ...old, available: false, last_seen: lastSeen });
}

products.sort((a, b) => a.ingredient_id.localeCompare(b.ingredient_id) || (a.price.per_kg ?? 1e9) - (b.price.per_kg ?? 1e9));
writeJson(PATHS.products, {
  _about: {
    ...oldDoc._about,
    description: 'eBag products linked to generic ingredients (ingredients.json). Rebuilt daily by scripts/sync_ebag.mjs. Entries with link "manual" are hand-curated: only price/stock/availability are refreshed. To fix a wrong auto link, add the product to data/ebag_overrides.json.',
    version: 2,
    fetched: TODAY,
  },
  products,
});

// ---------- catalogue + price history ----------
const catalogOut = [...catalog.values()].map(p => {
  const pack = parsePack(p.pack_size, p.unit, p.quantity_step);
  const price = parsePrices(p.prices, pack.grams || (pack.ml ?? null));
  return {
    id: p.id, name: p.name, brand: p.brand, url: p.url, categories: p.categories,
    pack_size: p.pack_size, sold_by: p.unit === 'kg' ? 'kg' : 'piece',
    price: price.regular, promo: price.promo, ...(price.bundle_note ? { bundle_note: price.bundle_note } : {}),
    available: inStock(p), stock: p.stock,
    ingredient_id: links.get(p.id)?.ingredient_id ?? null,
  };
}).sort((a, b) => a.id - b.id);
writeJson(PATHS.catalog, { _about: { description: 'All eBag food products from the crawled categories, with today\'s prices.', fetched: TODAY, count: catalogOut.length, categories: CRAWL_CATEGORIES }, products: catalogOut });
writeJson(path.join(PATHS.priceHistoryDir, `${TODAY}.json`), {
  date: TODAY, columns: ['id', 'price', 'promo', 'available'],
  rows: catalogOut.map(p => [p.id, p.price, p.promo, p.available ? 1 : 0]),
}, false);

const review = products.filter(p => p.needs_review).length;
const perIng = new Map(); for (const p of products) perIng.set(p.ingredient_id, (perIng.get(p.ingredient_id) || 0) + 1);
const noProducts = ingredients.filter(i => !perIng.has(i.id)).map(i => i.id);
log(`done in ${Math.round((Date.now() - started) / 1000)} s, ${api?.calls ?? 0} MCP calls`);
log(`ebag_products.json: ${products.length} products (${review} need review)`);
if (noProducts.length) log(`ingredients with no eBag product: ${noProducts.join(', ')}`);
