# Shopping Planner — Product & Technical Specification

**Version:** 1.0 · **Date:** 2026-11-23 · **Status:** ready for implementation
**Audience:** the developer (human or AI) who builds the app from this repository.
Read this whole document first, then `key_notes.md` and `idea.md` for history.

---

## 1. The idea in one paragraph

A mobile web app for Bulgaria that turns a person's goal (e.g. lose weight), body data and **weekly budget**
into a **7-day meal plan** and a **shopping list of real eBag.bg products in whole packs**. Every day of the
plan hits the person's calorie range and protein minimum; the week fits the budget; promotions are used
automatically. With one tap the list goes into the user's own eBag cart (checkout stays on eBag).
Inspired by Mealbird (US), built for Bulgarian food, Bulgarian language and Bulgarian prices.

### Core principles (do not break these)
1. **No AI in the app.** Meals and quantities are chosen by a mathematical optimizer (HiGHS), never by an LLM.
2. **Numbers come from data, never guessed.** Macros come from the eBag product label (when valid) or USDA;
   prices, promos, pack sizes and stock come from eBag.
3. **Every day is checked**, not the weekly average: kcal within the range, protein at least the minimum.
4. **Whole packs.** The shopping list is what you actually buy; the app also shows what you actually eat.
5. **Bulgarian UI.** All user-facing text in Bulgarian. Code, comments and data keys in English.

---

## 2. Scope of this release (test phase)

| | |
|---|---|
| Users | 5–10 invited testers |
| Platform | Mobile-first web app, installable to the home screen (PWA). **No app stores.** |
| Store | eBag.bg only |
| Language | Bulgarian |
| Cost | Free tiers only (Vercel, Supabase, GitHub Actions) |

**In scope:** login, onboarding, targets, weekly plan, recipe pages, shopping list, connect own eBag account,
send list to eBag cart, regenerate plan.
**Out of scope (later):** app-store apps, payments/subscriptions, other stores (Kaufland, Lidl, Billa),
household mode, push notifications, AI features, admin UI for recipes.

---

## 3. Final result — definition of done

A tester can, on their phone, without help:

1. Open the link, install the app to the home screen, create an account / log in with email + password.
2. Enter sex, age, height, weight, activity, goal, weekly budget, diet/exclusions/allergies, pantry items.
3. See their daily targets (kcal range, protein) with the formula explained, and adjust them.
4. Tap **"Създай план"** and within **≤ 15 s** see a 7-day plan (breakfast, lunch, dinner, snack) where every
   day is within the kcal range and above the protein minimum, and the checkout is within the budget.
5. Open any meal and see the recipe: ingredients in grams, steps, kcal/protein/fat/carbs.
6. Open the shopping list: real eBag products grouped by aisle, packs × price, promo badges,
   "checkout total" vs "food eaten this week", tick-off checkboxes.
7. Connect their **own** eBag account once, tap **"Изпрати в количката"**, and find the products in their eBag
   cart. Sold-out products are replaced by the next cheapest alternative and the app says so.
8. Generate a new plan for next week; previous plans stay visible.

Plus: prices/stock refresh daily automatically; each user sees only their own data; eBag tokens are encrypted.

---

## 4. What already exists in this repository

Everything below works today as Node.js scripts (`npm run …`). The app must **reuse this logic**, not rewrite it
from scratch. Port to TypeScript where it moves into the app.

| Path | What it is |
|---|---|
| `data/ingredients.json` | 122 generic ingredients: USDA macros per 100 g, diets, allergens, exclusion tags, edible fraction, unit weights, **Bulgarian match rules** for linking eBag products |
| `data/recipes_src/*.json` → `data/recipes.json` | 76 recipes in Bulgarian (breakfast, chicken, pork, beef, fish, salads, vegetarian, sides, snacks, healthy desserts). Grams per serving with min/max ranges, steps, batch size. Built and validated by `scripts/build_recipes.mjs` (derives diets, allergens, macro ranges) |
| `data/ebag_products.json` | ~1,340 eBag products linked to ingredients: pack grams, price, promo, stock, label macros |
| `data/ebag_catalog.json` | All ~6,300 eBag food products (today's prices), linked or not |
| `data/ebag_nutrition_cache.json` | Parsed product details (label macros, drained weight) |
| `data/ebag_overrides.json` | Manual fixes: excluded products, forced links, approved links |
| `data/usda/` | USDA FoodData Central downloads + `usda_macros.csv` |
| `data/profiles/test.json` | Example user profile (all planner options) |
| `scripts/sync_ebag.mjs` | Daily sync: crawl categories → link → fetch details → rebuild products |
| `scripts/ebag_client.mjs` | eBag MCP client with OAuth (PKCE, dynamic client registration, refresh) + rate-limit handling |
| `scripts/ebag_parse.mjs` | Pack size, weight-from-name, prices, nutrition label parsing, match rules |
| `scripts/plan.mjs` | **The planner** (two-stage HiGHS optimizer), ~5 s |
| `scripts/send_to_cart.mjs` | Re-check stock → substitute → fill eBag cart |
| `scripts/review_server.mjs` | Local page to review product links |

---

## 5. Architecture & stack

```
Phone — PWA (Next.js pages, Bulgarian UI)
   │  HTTPS
Next.js 15 (App Router, TypeScript) on Vercel
   ├─ Server Components / Server Actions — UI data
   ├─ POST /api/plan            → planner (HiGHS WASM), ~5 s
   ├─ GET  /api/ebag/connect    → start per-user eBag OAuth
   ├─ GET  /api/ebag/callback   → finish OAuth, store encrypted tokens
   └─ POST /api/ebag/cart       → stock check + substitutions + update cart
   │
Supabase — Auth (email + password) + Postgres (+ Row Level Security)
   ▲
GitHub Actions — daily cron: eBag sync with the OWNER's account → upserts into Supabase
```

| Concern | Choice | Why |
|---|---|---|
| Frontend + API | Next.js 15, TypeScript, Tailwind CSS | One codebase, server routes run the existing JS logic |
| PWA | Web App Manifest + service worker (Serwist or equivalent) | Installable, no app store |
| Auth + DB | Supabase (Postgres, Auth, RLS) | Free, login included, JSONB for plans/recipes |
| Solver | `highs` npm package (WASM) | Already used; runs inside a Vercel function |
| eBag | `@modelcontextprotocol/sdk` (Streamable HTTP + OAuth) | Already used |
| Daily sync | GitHub Actions scheduled workflow | Sync takes ~7–10 min (rate limits) — too long for Vercel free functions |
| Hosting | Vercel (Hobby) | Free, zero-config for Next.js |

---

## 6. Data model (Supabase / Postgres)

Static data is stored mostly as JSONB to keep the existing JSON shapes. Field names below are the minimum.

```sql
-- reference data (written by seed/sync with the service role; readable by all logged-in users)
ingredients (id text pk, data jsonb not null, updated_at timestamptz)
recipes     (id text pk, data jsonb not null, updated_at timestamptz)
products    (ebag_id bigint pk, ingredient_id text references ingredients, data jsonb not null,
             available boolean, price numeric, promo numeric, updated_at timestamptz)
sync_runs   (id bigserial pk, started_at, finished_at, status text, stats jsonb, log text)

-- per user (RLS: user_id = auth.uid())
profiles    (user_id uuid pk references auth.users, sex text, age int, height_cm int, weight_kg numeric,
             activity text, goal text, budget_eur numeric, diet text, exclude_tags text[], allergens text[],
             pantry text[], options jsonb, targets_override jsonb, created_at, updated_at)
plans       (id uuid pk, user_id uuid, week_start date, targets jsonb, plan jsonb, shopping jsonb,
             checkout_eur numeric, eaten_eur numeric, solver jsonb, created_at)
shopping_checks (plan_id uuid, ebag_id bigint, checked boolean, primary key (plan_id, ebag_id))

-- secrets (NO client access at all; server/service role only)
ebag_connections (user_id uuid pk, tokens_encrypted text, connected_at, last_used_at, status text)
system_secrets   (key text pk, value_encrypted text, updated_at)  -- owner's sync tokens, eBag client registration
```

- `plan` and `shopping` keep the exact JSON shape produced by `scripts/plan.mjs` (see `data/plans/*.json`).
- RLS on every table. Reference tables: `select` for authenticated users. Secrets tables: no policies (service role only).

---

## 7. Key logic

### 7.1 Targets (keep as in `scripts/plan.mjs → computeTargets`)
- BMR (Mifflin-St Jeor): `10·kg + 6.25·cm − 5·age + 5` (male) / `− 161` (female)
- TDEE = BMR × activity: sedentary 1.2, light 1.375, moderate 1.55, high 1.725
- Lose: TDEE − min(20 %, 750 kcal); gain: +300; floor 1500 (male) / 1200 (female)
- Range: kcal ± 100 (user-editable)
- Protein minimum: 2.0 g (lose) / 1.6 g (other) × min(weight, weight at BMI 25)
- Show the formula in the UI; allow manual override (`targets_override`).

### 7.2 Planner (port `scripts/plan.mjs`)
Input: profile + ingredients + recipes + products (available only). Output: plan JSON (as today).
1. Filter recipes by diet/exclusions/allergens and product availability (optional ingredients may be dropped).
2. Prefilter: best 8 recipes per slot by price per gram of protein + guaranteed fish/variety/dessert options.
3. **Stage 1 (MIP):** choose a recipe per slot per day + grams within min/max; daily kcal/protein; variety
   (≤ 2× per recipe, no main protein twice a day, ≥ 1 fish/week, ≤ 2 desserts/week); estimated cost ≤ budget.
4. **Stage 2 (MIP):** recipes fixed; choose products and whole packs; re-tune grams using each product's own
   label macros; minimise checkout; budget enforced.
5. Return plan + shopping list (with up to 2 alternatives per product for cart substitution).

Requirements: ≤ 15 s end-to-end on Vercel; set the route's `maxDuration` accordingly. Make sure the HiGHS
`.wasm` file is bundled with the function (Next.js output file tracing). If no feasible plan: return a clear
Bulgarian message suggesting a bigger budget / fewer exclusions.

### 7.3 Daily eBag sync (port `scripts/sync_ebag.mjs`)
- Runs in GitHub Actions on a schedule (e.g. 05:00 Europe/Sofia) using the **owner's** eBag account.
- Owner's OAuth tokens live encrypted in `system_secrets`; the job reads them and **writes back refreshed tokens**
  (refresh tokens may rotate — GitHub secrets cannot be updated from a job).
- Crawl configured categories (`browse_products`, page size 50, ~600 ms between calls, honour HTTP 429
  "Expected available in N seconds"), link products with the ingredient match rules, fetch details for up to
  400 products/run (cheapest first), upsert into `products`, record a `sync_runs` row.
- **Stock rule:** a product is available only if `is_available` AND `available_quantity > 0`
  (eBag can report available with quantity 0).
- Never overwrite data with a partial crawl (abort if < 1,000 products).

### 7.4 Per-user eBag connection and cart (port `ebag_client.mjs` + `send_to_cart.mjs`)
- eBag OAuth (discovered from `https://ebag.bg/.well-known/oauth-authorization-server`):
  authorize `https://ebag.bg/mcp/oauth/authorize/`, token `…/mcp/oauth/token/`,
  dynamic registration `…/mcp/oauth/register/`, scope `shopping`, PKCE S256, `token_endpoint_auth_method: none`.
- Register **one** OAuth client per deployment with redirect URI `https://<app-domain>/api/ebag/callback`
  (store its client info in `system_secrets`).
- Connect: `/api/ebag/connect` → redirect to eBag → `/api/ebag/callback` exchanges the code → tokens encrypted
  with AES-256-GCM (`EBAG_TOKEN_KEY`) into `ebag_connections`. PKCE verifier and `state` kept in a short-lived
  httpOnly cookie.
- Send to cart: for every shopping item → `get_product` (stock rule above) → else alternatives (packs recomputed
  to cover the same edible grams) → `update_cart_item` with `action: "set"`; if eBag still refuses, try the next
  alternative. Return a per-item report. **Never check out** (the MCP cannot, and we must not try).
- Disconnect button deletes the tokens and calls the revocation endpoint.

---

## 8. Screens (Bulgarian UI)

| # | Screen | Content |
|---|---|---|
| 1 | Вход | Tabs Вход / Регистрация: email + password (no emails sent). Short explanation of the app. |
| 2 | Инсталирай | One-time hint how to add to home screen (iOS Safari / Android Chrome). |
| 3 | Онбординг (стъпки) | Пол · Възраст · Ръст · Тегло · Активност (4 options with examples) · Цел · Бюджет/седмица · Хранене (без ограничения/вегетарианско/веганско/пескетарианско) · Изключения и алергии · Какво има вкъщи (сол, олио, оцет…) |
| 4 | Твоите цели | kcal range, protein, formula explained, edit |
| 5 | Седмичен план | Day tabs Пн–Нд; meal cards (name, kcal, protein); day totals; "Нов план" |
| 6 | Рецепта | Ingredients in grams, steps, macros, prep/cook time |
| 7 | Списък за пазаруване | By aisle; packs × price; promo badge; checkboxes; "Плащаш" vs "Изяждаш"; link to each eBag product |
| 8 | eBag | Свържи/Прекъсни; "Изпрати в количката"; result report (✓ added, ↻ replaced, ✗ missing); link to eBag cart |
| 9 | Профил | Edit data, past plans, log out, delete account (deletes all user data) |

Design: mobile-first, large touch targets, works at 360 px width, light/dark, no horizontal scroll.

---

## 9. Non-functional requirements

- **Security:** RLS on all tables; service-role key only on the server/GitHub; eBag tokens encrypted at rest;
  no secrets in the client bundle or the repo.
- **Privacy (GDPR):** weight/height/goal are personal data. Short consent text at onboarding; "delete my account"
  removes profile, plans and eBag tokens.
- **Performance:** plan ≤ 15 s; other screens < 1 s on 4G.
- **Reliability:** if the sync fails, the app keeps working with the last data and shows "цени от <дата>".
- **Observability:** `sync_runs` table; server logs for plan/cart errors; a simple "Обратна връзка" mailto link.
- **Quality:** TypeScript strict; unit tests for targets, pack parsing, match rules, label validation;
  one end-to-end test that generates a plan from fixture data.

### Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EBAG_TOKEN_KEY`
(32-byte base64), `APP_BASE_URL`. GitHub Actions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EBAG_TOKEN_KEY`.

---

## 10. To-do plan

### Phase 0 — Setup (½ day) ✅ done 2026-11-23
- [x] `git init`, GitHub repo (private), `.gitignore` (no `.secrets/`, `.env*`, `node_modules/`, `logs/`)
- [x] Next.js 15 + TypeScript + Tailwind in the repo root; keep `scripts/` and `data/` working
- [x] Supabase project; migrations in `supabase/migrations/` for the tables in §6 with RLS
- [x] Vercel project linked to GitHub; env vars set
- **Done when:** empty app deployed on Vercel, tables exist, RLS enabled.

### Phase 1 — Data in Supabase (1 day) ✅ done 2026-11-23
- [x] `scripts/seed.ts`: upload `ingredients.json`, `recipes.json`, `ebag_products.json` (idempotent upserts)
- [x] Move shared logic to `lib/` (TypeScript): `lib/ebag/parse.ts`, `lib/planner/targets.ts`
- **Done when:** the three reference tables are filled and readable by a logged-in user.

### Phase 2 — Auth, onboarding, targets (1–2 days) ✅ done 2026-11-23 (checked on a real phone)
- [x] Supabase email + password login (changed from magic link 2026-11-23: no SMTP needed, works inside the iOS home-screen app; "Confirm email" off); protected routes
- [x] Onboarding steps → `profiles`; targets screen with formula and override
- [x] PWA: manifest, icons, service worker, install hint screen
- **Done when:** a tester can install, log in, finish onboarding and see correct targets (unit-tested formula).

### Phase 3 — Planner in the app (2 days) ✅ done 2026-11-23
- [x] Port `scripts/plan.mjs` to `lib/planner/` (pure function: inputs → plan JSON); reads data from Supabase
- [x] `POST /api/plan` (auth required) → saves to `plans`; WASM bundling verified on Vercel
- [x] Week plan screen, recipe screen
- **Done when:** plan for `data/profiles/test.json` data is generated on Vercel in ≤ 15 s and all days meet targets.
  Result: 11.9 s cold / 8.2 s warm on Vercel (lhr1), every day within range.
- **Known limitation (found 2026-11-23, inherited from plan.mjs):** many realistic profiles get no plan —
  male < ~95 €/week, female lose 80 €, vegetarian (protein target too high for 7 lunch / 9 dinner recipes),
  vegan (no breakfast recipes). Stage 1 prices ingredients per gram and ignores whole-pack cost, so stage 2
  often cannot fit the packs into the budget. Fix before inviting testers (see Phase 3b).

### Phase 3b — Planner robustness (before testers)
- [ ] Stage 1: fixed cost per distinct ingredient (smallest pack price) so meals reuse what is bought
- [ ] Specific Bulgarian messages: budget too low (with the minimum that works) vs. not enough recipes
- [ ] Recipe coverage: vegan breakfasts, more high-protein vegetarian lunches/dinners (or hide vegan until then)
- [ ] "Нов план" gives a different week (avoid the previous plan's recipes)

### Phase 4 — Shopping list (1 day)
- [ ] List screen grouped by aisle; promo badges; checkout vs eaten; checkboxes persisted in `shopping_checks`
- **Done when:** totals match the plan JSON; checks survive reload.

### Phase 5 — Daily sync in GitHub Actions (1–2 days)
- [ ] Port `scripts/sync_ebag.mjs` to write into Supabase (keep JSON export optional)
- [ ] Owner token bootstrap: one-off local command stores encrypted tokens in `system_secrets`
- [ ] Workflow `.github/workflows/sync.yml` (daily + manual trigger); token refresh written back
- [ ] App shows the date of the latest successful sync
- **Done when:** two consecutive scheduled runs succeed and prices in the app change accordingly.

### Phase 6 — Per-user eBag connection + cart (2 days)
- [ ] OAuth client registration for the deployment; `/api/ebag/connect`, `/api/ebag/callback`, disconnect
- [ ] `POST /api/ebag/cart` with stock check, substitutions, per-item report
- [ ] eBag screen in the UI
- **Done when:** 2 different test accounts each fill their own cart from their own plan; nothing is ordered.

### Phase 7 — Test-ready polish (1–2 days)
- [ ] Regenerate plan; past plans list; delete account
- [ ] Error states in Bulgarian (no plan possible, eBag disconnected, sync stale)
- [ ] Feedback link; invite the 5–10 testers
- **Done when:** the full "definition of done" (§3) passes on an iPhone and an Android phone.

### Nice-to-have after the test (not in this release)
Swap a single meal · mark meals as eaten · limit each protein per week (pork appears up to 6×) ·
batch cooking/leftovers · household mode · admin page for product-link review (replaces `npm run review`) ·
React Native (Expo) app reusing the same API.

---

## 11. Risks & open questions

| Risk | Mitigation |
|---|---|
| **eBag terms of use** — catalogue sync runs through the owner's personal account | Acceptable for 5–10 testers; read eBag's terms / ask eBag before any wider launch |
| eBag rate limits (HTTP 429) | Already handled: ~600 ms delay, wait as instructed by the error |
| Stock changes within hours | Re-check right before adding to cart; substitutions |
| Wrong product links | Match rules + `ebag_overrides.json`; review page; only the 3 cheapest per ingredient matter |
| HiGHS WASM in a serverless function (bundle size, cold start) | Verify in Phase 3; fallback: small always-on Node service (Railway/Render) |
| Refresh-token rotation for the sync | Store tokens in Supabase, write back after every refresh |
| PWA limits on iOS (no install prompt, limited push) | Install hint screen; push not needed now |
| Variety: cheap pork dominates some weeks | Nice-to-have rule "max N per protein per week" |

---

## 12. Glossary
- **Ingredient** — generic food the planner reasons about (e.g. `chicken_breast`), with USDA macros.
- **Product** — a concrete eBag item linked to an ingredient (e.g. "Пилешко Бонфиле Градус 500 г").
- **Label macros** — nutrition from the product's own eBag label; used when its kcal matches its macros (±15 %).
- **Edible fraction** — share of the bought weight you eat (banana 0.64, eggs 0.88).
- **Pantry** — items assumed at home (salt, oil, vinegar…); used in recipes, not bought.
- **Stage 1 / Stage 2** — the two optimizer steps: choose meals, then choose products and packs.
