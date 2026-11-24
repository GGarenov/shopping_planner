# Shopping Planner — project log

Handoff notes from the first research conversation (2026-11-16). Read this first.

## The idea

A mobile app like **Mealbird** (https://mealbird.app), but for **Bulgaria** and tied to real
Bulgarian supermarkets. The user picks a store, and the app builds a week of meals that hits
daily protein/calorie targets, fits a grocery budget, and outputs a shopping list for that store.

Long-term store targets: Kaufland, Lidl, Billa. **Current focus: Lidl** (best free data), with
**eBag** being evaluated as a richer alternative.

## Mealbird features to copy

- Weekly plan; **every day** checked against protein minimum + calorie range (not a weekly average).
- Recipes with grams per ingredient, macros per meal, visible "how we compute this" math.
- Targets: user-entered or computed by a shown formula; editable.
- Shopping list grouped by aisle, sized to **real pack sizes**, leftover estimate.
- Weekly budget; shows "food eaten this week" vs "checkout total" (whole packs).
- Household mode (several people; your portion vs full pot).
- Swap one meal, mark a meal as eaten out, change start day, restart week.
- Diets: vegetarian, vegan, pescatarian, low-carb; exclusions (pork, red meat, gluten, dairy,
  eggs, nuts); 12 allergens.
- Delivery handoff (Mealbird: DoorDash, US only).
- Mealbird pricing: $9.99/month or $29.99/year, no free tier.

**Key design principle (from Mealbird):** the LLM only picks recipes/ingredients. Quantities are
set by a solver (linear/integer programming, e.g. OR-Tools or HiGHS) so each day meets targets
and the week fits the budget with pack rounding. All macros are computed from a nutrition table,
never taken from LLM output.

**Our extra feature:** use real weekly promo prices so the planner favours discounted items.

## Data sources investigated

| Source                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kaufland Seller API (sellerapi.kaufland.com)                              | ❌ For the Kaufland online _marketplace_ (sellers, mostly non-food). No supermarket shelf prices. Requires seller/partner account.                                                                                                                                                                                                                                            |
| kaufland.bg website                                                       | ⚠️ Only prices for **weekly offers** (`/aktualni-predlozheniya/...`). The `asortiment` pages are brand/encyclopedia pages without prices. Kaufland BG has no online grocery shop.                                                                                                                                                                                             |
| sofia-supermarkets-api (github.com/StefanBratanov/sofia-supermarkets-api) | ✅ for **promos**. Kotlin/Spring Boot, Apache-2.0, last commit May 2026. Scrapes Kaufland, Lidl, Billa, Fantastico, T-Market offers. Fields: name, quantity, price, oldPrice, category, picUrl, validFrom, validUntil. Needs JDK 21 + Postgres. Not run yet.                                                                                                                  |
| **kolkostruva.bg** (government, КЗП)                                      | ✅ **Free daily open data**, no scraping needed: `https://kolkostruva.bg/opendata_files/YYYY-MM-DD.zip` (~17 MB, one CSV per chain, ~65 chains). Real regular + promo prices **per store**. Covers the "large consumer basket" (staples), not the full range. **Kaufland is NOT in it** (checked 3, 10, 14, 15 Nov 2026). Lidl, Billa, Fantastico, Metro, T Market, eBag are. |
| Pepesto (pepesto.com)                                                     | 💰 Paid API with eBag's catalog (1–2k cooking SKUs, daily). Has cart-link feature. Kaufland/Lidl/Billa not confirmed.                                                                                                                                                                                                                                                         |
| **eBag.bg**                                                               | ✅ Full online grocery shop, ~21,057 products, live € prices. See below.                                                                                                                                                                                                                                                                                                      |

### kolkostruva CSV format

Columns: `Населено място` (city code, 68134 = Sofia), `Търговски обект` (store no. + address),
`Наименование на продукта`, `Код на продукта` (chain's internal code, **not EAN**),
`Категория` (number only, ~80 categories, no names), `Цена на дребно` (€), `Цена в промоция` (€, empty if none).
One row = one product at one store.

Findings for Lidl (15 Nov 2026): **765 distinct products × 147 stores** (~112k rows).
Lidl prices are **identical in every store**. 63 products on promo.
Billa: 1,482 products, 175 stores.

Lidl gaps for meal planning: no oats, lentils, chickpeas, fresh milk, cottage cheese (извара),
cucumbers, broccoli, frozen veg; only 2 egg products, 1 oil. Only **39/765** names contain a pack
size → pack sizes must be added manually for the ~150 products we use.

Generated file: [lidl_products_2026-11-15.csv](lidl_products_2026-11-15.csv) — one row per Lidl
product: category, name, code, min/max price, stores, stores on promo, lowest promo price.

### eBag details

- Sitemaps: `https://ebag.bg/sitemap_products_bg.xml` (21k product URLs),
  `sitemap_promo_products_bg.xml`, `sitemap_categories_bg.xml`. robots.txt does not block product pages.
- Each product page has a JSON-LD block: name, sku, category path, price (EUR), availability, brand.
- Nutrition ("Хранителни стойности" per 100 g) and pack details are loaded by JavaScript, not in the HTML.
- eBag terms of use **not yet checked** (matters before bulk scraping for a commercial app).
- **Official eBag MCP server: `https://ebag.bg/mcp`** (OAuth with an eBag customer account;
  every call, even search, needs login). 22 tools, including `search_products`, `browse_products`,
  `browse_collection` (offers), `get_categories`, `get_product` (details, **nutrition**, prices,
  selling unit, quantity limits), `get_cart`, `update_cart_item`, shopping-list tools.
  It cannot place orders or pay. Good fit for a "send my plan to my eBag cart" feature
  (each user connects their own account). Not a bulk data feed.

### eBag MCP test results (2026-11-16, authenticated)

Tested: chicken fillet, oats, yogurt, eggs, rice, promo collection.

- **Search** (`search_products`): id, name, brand, **pack_size string** ("650 г", "2 x 500 г",
  "10 бр.", "~ 670 г / бр" for variable weight), price, **price per kg/piece**, promo price,
  discount %, multi-pack bundle discount, stock, quantity step/min/max. Sort by `unit_price_asc`
  works (useful for "cheapest protein per kg"). Facets for brand and country.
- **Product** (`get_product`): adds description, ingredients, country, expiry date, and
  `energy_values` = structured per-100 g macros (kcal, fat, sat. fat, carbs, sugar, protein, salt).
  **Coverage is patchy:** chicken (Градус, 103 kcal / 18 g protein) and yogurt (Бор Чвор) had it;
  oats had it **only as free text** in `description` (as ranges, e.g. protein 11–16.9 g);
  eggs and rice had **none**. → Still need USDA as fallback; eBag macros are a bonus.
- **Promos** (`browse_collection`, `promo`): 2,460 items right now, with regular + promo price.
- Variable-weight items (e.g. Roso fillet "~ 670 г / бр") are sold per piece at an estimated weight.
- Everything goes through the user's eBag login. Fine for a per-user "fill my cart" feature or for
  building our ingredient table by hand/semi-automatically; not a licensed bulk feed.

## Nutrition data

No supermarket source has usable macros (except possibly eBag via MCP). Plan: map each store
product to a **generic ingredient** (~100–150 needed) and take macros from **USDA FoodData Central**
(free; downloadable database). **Open Food Facts** as a secondary source for branded items
(but the kolkostruva files have no barcodes, so matching is by name). Store macros in our own DB;
no runtime dependency on an external API.

## Status update (2026-11-23)

Decisions: **no AI in the app**; main data source **eBag**; macros from **USDA** (+ eBag labels when valid);
app language **Bulgarian**; recipes written by us (gotvach.bg forbids scraping in its terms §2(9) and
robots.txt — used only as inspiration for dish ideas).

Built so far (Node.js, `package.json` in the root):

- `data/ingredients.json` — 122 generic ingredients: USDA macros (`npm run usda:fill`), diets, allergens,
  Bulgarian match rules for linking eBag products.
- `data/recipes_src/*.json` → `node scripts/build_recipes.mjs` → `data/recipes.json` — 76 recipes in Bulgarian
  (breakfast, chicken, pork, beef, fish, main salads, vegetarian, sides, snacks, healthy desserts), grams per
  serving with min/max ranges for the solver; diets/allergens/macros derived automatically.
- eBag daily sync: `npm run ebag:login` (once, browser OAuth) then `npm run ebag:sync` → `data/ebag_catalog.json`
  (all food products), `data/ebag_products.json` (linked to ingredients), nutrition cache, daily price history.
  **Not run yet — waiting for the first login.** Daily scheduling (Windows Task Scheduler) not set up yet.

Next: run login + first sync and review auto-links → schedule it daily → build the solver
(targets formula → recipe/quantity selection → shopping list in whole packs).

## Status at project start (2026-11-16)

- Project folder contains only this file and the Lidl product CSV. No code yet.
- **Python is not installed** on this machine (Node.js status unknown). Python is preferred for
  the planner (solver libraries).
- eBag MCP was added to Claude Code for this project (local scope, in `C:\Users\georgiy.g\.claude.json`),
  **authenticated and working** as of 2026-11-16 (step 1 below is done).

## Next steps

1. In a new session, authenticate the eBag MCP, then call `get_product` / `search_products` for
   chicken fillet, oats, yogurt, eggs, rice to see what nutrition, pack-size and price data it returns.
2. Decide the main data source: **Lidl (kolkostruva)** vs **eBag** (richer, full range, nutrition).
3. Choose language/stack (install Python, or use something already available).
4. Build the core prototype:
   - Ingredient table (~100 items): store product link, price, pack size, USDA macros, diet/allergen tags.
   - Planner: budget + protein minimum + calorie range → per-day meal quantities via solver,
     shopping list rounded to packs, total cost.
5. Later: recipe database (~50–100 recipes), aisle labels for categories, daily price import,
   promo integration (sofia-supermarkets-api), Kaufland/Billa adapters, mobile app.
