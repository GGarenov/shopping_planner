# Development guide

How to run, test, deploy and operate Pazarko. For what the app does and why, see the [README](../README.md) and the [specification](SPEC.md).

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

| What                                                                       | Command                                         | Where it runs                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Formatting (Prettier, incl. Tailwind class order)                          | `npm run format` / `npm run format:check`       | pre-commit (changed files), CI                   |
| Lint (ESLint, Next.js + TypeScript rules)                                  | `npm run lint`                                  | pre-commit (changed files), CI                   |
| Types (`tsc --noEmit`, strict)                                             | `npm run typecheck`                             | CI                                               |
| Unit, component and API-route tests (Vitest, React Testing Library, jsdom) | `npm test`                                      | CI                                               |
| End-to-end + accessibility (Playwright, axe; phone viewports)              | `npm run test:e2e`                              | CI (with the test-project secrets)               |
| Coverage of `lib/` with minimum thresholds                                 | `npm run test:coverage` → `coverage/index.html` | CI (summary on the run page, report as artifact) |
| Dependency audit (critical)                                                | `npm audit --audit-level=critical`              | CI; Dependabot opens weekly update PRs           |
| Code scanning                                                              | CodeQL (`security-and-quality`)                 | push, PR, weekly                                 |

**Row Level Security tests** (`test/rls/`) run against a separate test Supabase project, never production: two
throwaway users try to read and change each other's profile, plans, shopping ticks and feedback, and to reach the
token tables. Locally: put `RLS_SUPABASE_URL`, `RLS_SUPABASE_ANON_KEY`, `RLS_SUPABASE_SERVICE_ROLE_KEY` (and `RLS_DB_URL`
for migrations) in `.env.test.local`, then `npm run test:rls`. In CI the `rls` job applies the migrations to that
project first and skips itself when the secrets are missing. Without the variables, `npm test` skips the suite.

**End-to-end tests** (`e2e/`, Playwright) drive a production build in a phone-sized Chromium (Pixel 7) and WebKit
(iPhone 15). A new user signs up, goes through onboarding, gets a plan from the real planner and opens a recipe.
Then they tick an item on the shopping list, reload (the tick stays), switch to English and back, open the eBag
screen and delete their account. The login error messages have their own tests. Every main screen is also checked
with **axe** (WCAG 2.1 A/AA): serious or critical problems fail the run. The tests use the same test Supabase
project, and the browser is blocked from ebag.bg, so the real shop is never contacted. Throwaway accounts
(`@pazarko.test`) are deleted at the end.

Locally (with `.env.test.local` as above):

1. Once, seed the test project: `SUPABASE_URL=<RLS_SUPABASE_URL> SUPABASE_SERVICE_ROLE_KEY=<RLS_SUPABASE_SERVICE_ROLE_KEY> node scripts/seed.ts`.
2. Run `npm run test:e2e`. It builds into `.next-e2e/` with the test keys, and `.env.local` is never used. `npm run test:e2e:ui` opens the interactive runner.

In CI the `e2e` job runs after `rls`, seeds the test project, and uploads the HTML report when a test fails.

The pre-commit hook (Husky + lint-staged) formats and lints only the staged files. The coverage thresholds in
`vitest.config.mts` sit just below the current numbers, so coverage can only go up.

Shared logic lives in `lib/` (TypeScript). `scripts/ebag_parse.mjs` re-exports `lib/ebag/parse.ts`, so the
Node scripts and the app use the same code.

## Errors, logs and monitoring

**One error shape for every API route** (`lib/api/errors.ts`). A failed call returns an HTTP 4xx or 5xx status
and this body:

```json
{ "error": { "code": "budget_too_low", "message": "С бюджет 50 € …", "requestId": "…", "details": { "min_budget_eur": 79 } } }
```

- `message` is already in the user's language and safe to show.
- `code` is for the client's logic: `unauthorized`, `reconnect`, `budget_too_low`, `ebag_down`, … .
- Routes are wrapped in `apiHandler()` (`lib/api/handler.ts`). An expected failure is thrown as an `AppError`.
  Anything else becomes a 500 «something went wrong», logged once and reported to Sentry; internal details never
  reach the browser.

**The browser calls the API only through `apiFetch()`** (`lib/api/client.ts`):

- Every attempt has a timeout.
- Reads (GET) are retried twice on network errors, timeouts and 429/502/503/504, with backoff.
- Writes are never retried automatically. A second «add to cart» would add the products twice.

**Logs are JSON lines** (`lib/log.ts`), e.g. `{"level":"info","msg":"plan.created","requestId":"…","route":"POST /api/plan","total_s":3.1}`,
so the Vercel log viewer can filter them by field.

- Middleware gives every request an ID (`x-request-id`; Vercel's own ID when there is one). Route handlers and
  server actions log with it, and it is sent back in the response, so a user's report can be matched to the logs.
- No personal data: emails, passwords, tokens and cookies are redacted, and user IDs appear only as a one-way
  reference (`u_1a2b3c4d`).
- `LOG_LEVEL` sets the level; tests are silent.

**Error tracking with Sentry** (`instrumentation*.ts`, `lib/sentry.ts`) is off until a DSN is set. To turn it on:

1. Create a free Sentry project (platform: Next.js).
2. In Vercel, set `NEXT_PUBLIC_SENTRY_DSN`.
3. For readable stack traces (source maps uploaded at build time, then deleted from the deployment), also set
   `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`.

It reports server errors (pages, routes, server actions), browser errors and the error pages. Events are scrubbed
before sending: no IP, cookies, request bodies or query strings, and the user only as the same reference as in the
logs. Session replay is off because it would record what people type.

**Health check:** `GET /api/health` needs no login and is meant for an uptime monitor (e.g. UptimeRobot or Better
Stack, every 5 min). It returns only operational facts, never user data:

| Answer                      | Meaning                                             |
| --------------------------- | --------------------------------------------------- |
| `200 {"status":"ok"}`       | Database reachable; prices synced within 36 h       |
| `200 {"status":"degraded"}` | Database reachable, but the daily eBag sync is late |
| `503 {"status":"down"}`     | The database does not answer                        |

The response also includes the database latency, the age of the last sync and the deployed commit.

## Database

Migrations live in `supabase/migrations/`. To apply them to the hosted project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push
```

## Data scripts (Node.js)

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

## README screenshots

The phone screenshots in `docs/screenshots/` come from the real app, in English: a guest goes through the questions, gets a
plan and opens the list and the eBag screen, against the test Supabase project (same setup as the E2E tests).
The guest is deleted at the end.

```bash
SCREENSHOTS=1 npx playwright test screenshots --project=android
```
