# Shopping Planner

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
npm run typecheck && npm run lint && npm test && npm run build
npm run seed                 # upload ingredients / recipes / products to Supabase (idempotent; --dry-run to check)
```
On Windows, run `npm test` from a terminal whose path starts with `C:\` (capital C) — a lowercase
`c:\` makes Vitest load itself twice ("failed to find the current suite").

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
| Command | What it does |
|---|---|
| `npm run ebag:login` | One-off eBag OAuth login (tokens in `.secrets/`) |
| `npm run ebag:sync` | Crawl eBag, link products, refresh `data/ebag_products.json` |
| `npm run recipes:build` | Build and validate `data/recipes.json` from `data/recipes_src/` |
| `npm run plan` | Run the two-stage HiGHS planner for a profile |
| `npm run cart` | Re-check stock and fill the eBag cart |
| `npm run review` | Local page to review product links |

Raw USDA downloads (`data/usda/raw/`, 54 MB) are not committed; `data/usda/usda_macros.csv` is.
