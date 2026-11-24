# Pazarko (shopping planner)

[![CI](https://github.com/GGarenov/shopping_planner/actions/workflows/ci.yml/badge.svg)](https://github.com/GGarenov/shopping_planner/actions/workflows/ci.yml)
[![CodeQL](https://github.com/GGarenov/shopping_planner/actions/workflows/codeql.yml/badge.svg)](https://github.com/GGarenov/shopping_planner/actions/workflows/codeql.yml)

Mobile web app (PWA) for Bulgaria: goal + body data + weekly budget → 7-day meal plan and a shopping list of
real eBag.bg products in whole packs. See [docs/SPEC.md](docs/SPEC.md) for the full specification.

## Stack

Next.js 15 (App Router, TypeScript, Tailwind) on Vercel · Supabase (Auth + Postgres + RLS) ·
HiGHS (WASM) optimizer · GitHub Actions for the daily eBag sync.

## Local development

Node ≥ 22.18 (scripts run TypeScript directly via Node's type stripping).

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys etc.
npm run dev                  # http://localhost:3000
npm run check                # format check + lint + typecheck + unit tests (what CI runs, minus the build)
npm run seed                 # upload ingredients / recipes / products to Supabase (idempotent; --dry-run to check)
npm run seed -- --recipes    # only ingredients + recipes (after editing recipes; keeps the synced products)
```

On Windows, run `npm test` from a terminal whose path starts with `C:\` (capital C) — a lowercase
`c:\` makes Vitest load itself twice ("failed to find the current suite").

## Quality checks

| What                                                          | Command                                         | Where it runs                                    |
| ------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Formatting (Prettier, incl. Tailwind class order)             | `npm run format` / `npm run format:check`       | pre-commit (changed files), CI                   |
| Lint (ESLint, Next.js + TypeScript rules)                     | `npm run lint`                                  | pre-commit (changed files), CI                   |
| Types (`tsc --noEmit`, strict)                                | `npm run typecheck`                             | CI                                               |
| Unit + component tests (Vitest, React Testing Library, jsdom) | `npm test`                                      | CI                                               |
| Coverage of `lib/` with minimum thresholds                    | `npm run test:coverage` → `coverage/index.html` | CI (summary on the run page, report as artifact) |
| Dependency audit (critical)                                   | `npm audit --audit-level=critical`              | CI; Dependabot opens weekly update PRs           |
| Code scanning                                                 | CodeQL (`security-and-quality`)                 | push, PR, weekly                                 |

The pre-commit hook (Husky + lint-staged) formats and lints only the staged files. The coverage thresholds in
`vitest.config.mts` sit just below the current numbers, so coverage can only go up.

Shared logic lives in `lib/` (TypeScript). `scripts/ebag_parse.mjs` re-exports `lib/ebag/parse.ts`, so the
Node scripts and the app use the same code.

## Database

Migrations live in `supabase/migrations/`. To apply them to the hosted project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push
```

## Existing data scripts (Node.js)

| Command                  | What it does                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm run ebag:login`     | eBag OAuth login in the browser (tokens in `.secrets/ebag_oauth.json`)                                |
| `npm run ebag:bootstrap` | Move that login into Supabase (encrypted) for the daily sync; removes the local tokens                |
| `npm run ebag:sync`      | Crawl eBag → link → details → upsert `products` in Supabase (`--dry-run`, `--no-details`, `--export`) |
| `npm run ebag:relink`    | Re-link from the saved `data/ebag_catalog.json` (no eBag calls)                                       |
| `npm run recipes:build`  | Build and validate `data/recipes.json` from `data/recipes_src/`                                       |
| `npm run plan`           | Run the two-stage HiGHS planner for a profile                                                         |
| `npm run cart`           | Re-check stock and fill the eBag cart                                                                 |
| `npm run review`         | Local page to review product links                                                                    |

Raw USDA downloads (`data/usda/raw/`, 54 MB) are not committed; `data/usda/usda_macros.csv` is.

## Daily eBag sync (GitHub Actions)

`.github/workflows/sync.yml` runs `scripts/sync.ts` every day (03:17 UTC) and on demand (Actions → eBag sync →
Run workflow). It uses the owner's eBag login stored encrypted in Supabase (`system_secrets`). eBag may rotate the
refresh token, so the job writes new tokens back there, and two runs never overlap.

- Repo secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EBAG_TOKEN_KEY` (same values as in `.env.local`).
- If a run fails with "eBag login required": run `npm run ebag:login`, then `npm run ebag:bootstrap` locally.
- Every run is recorded in `sync_runs` (status, stats, log); the app shows the date of the latest successful one.
- GitHub pauses scheduled workflows after 60 days without commits — re-enable it in the Actions tab if that happens.

## Languages (Bulgarian / English)

The UI is bilingual with [next-intl](https://next-intl.dev); Bulgarian is the default, the «БГ | EN» switch in the
header sets a `lang` cookie (and `profiles.options.lang`, so it follows the user to another device). URLs don't change.

- UI text: `messages/bg/<area>.json` (source) and `messages/en/<area>.json`; areas are listed in `lib/i18n/config.ts`.
  A key missing in English shows the Bulgarian text. `lib/i18n/messages.test.ts` fails if keys or `{placeholders}` differ.
- Recipes and ingredients: Bulgarian in `data/recipes.json` / `data/ingredients.json`, English in
  `data/i18n/recipes.en.json` (name + steps per recipe id) and `data/i18n/ingredients.en.json`.
- eBag product names stay as eBag shows them.
