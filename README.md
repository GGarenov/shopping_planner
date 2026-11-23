# Shopping Planner

Mobile web app (PWA) for Bulgaria: goal + body data + weekly budget → 7-day meal plan and a shopping list of
real eBag.bg products in whole packs. See [docs/SPEC.md](docs/SPEC.md) for the full specification.

## Stack
Next.js 15 (App Router, TypeScript, Tailwind) on Vercel · Supabase (Auth + Postgres + RLS) ·
HiGHS (WASM) optimizer · GitHub Actions for the daily eBag sync.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in Supabase keys etc.
npm run dev                  # http://localhost:3000
npm run typecheck && npm run lint && npm run build
```

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
