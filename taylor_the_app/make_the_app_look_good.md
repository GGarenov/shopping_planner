# Pazarko: make the repo portfolio-ready

The goal is that a reviewer who opens the GitHub repo understands in 2 minutes what the app does and how it is built.
In 10 minutes they should also find tests, CI, error handling and security, done the way a good team would do them.

---

## Where we are today

| Area                    | Today                                                                                                                                                                                                                                  | Gap                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Unit tests**          | ✅ 111 tests in 12 files (Vitest). They cover the planner (incl. one end-to-end run of the optimizer), targets, eBag parsing and linking, cart logic with a fake eBag, encryption, translations, schema validation and shopping totals | Only `lib/` and scripts. No component, API-route or browser tests, and no coverage report                                                                                |
| **CI**                  | Only the daily eBag sync workflow                                                                                                                                                                                                      | Nothing runs lint, typecheck, tests or build on push or PR                                                                                                               |
| **Error handling**      | Bulgarian/English error pages, specific planner errors (budget too low / no recipes / timeout), reconnect flows for eBag                                                                                                               | Each API route has its own error shape, logging is ad-hoc `console.*` (24 calls), there is no error tracking and no request IDs                                          |
| **Security**            | RLS on every table, encrypted eBag tokens (AES-256-GCM), PKCE + state for OAuth, service role only on the server, zod validation                                                                                                       | No security headers (CSP etc.), no rate limiting on the expensive `/api/plan`, no automated RLS test, no dependency or CodeQL scanning                                   |
| **Code quality**        | TypeScript strict, ESLint, clear `lib/` modules                                                                                                                                                                                        | `lib/planner/plan.ts` is 770 lines; the Supabase client is untyped (no generated DB types); legacy scripts sit next to the current ones; no Prettier or pre-commit hooks |
| **Presentation**        | `docs/SPEC.md` (very detailed), a short README                                                                                                                                                                                         | No screenshots or demo link, no architecture diagram, no LICENSE, no way to try the app without creating an account                                                      |
| **Legal / public repo** | —                                                                                                                                                                                                                                      | ⚠️ The recipe photos are taken from 1001recepti.com, and `data/` holds 60 MB of scraped eBag catalogue. Neither belongs in a **public** portfolio repo (see Phase 7)     |

---

## Which test tools, and why

**Answer: keep Vitest and add React Testing Library + Playwright.** This is the standard setup for a Next.js App Router
app today, and the Next.js docs show both.

| Layer             | Tool                                                                         | What it proves here                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | **Vitest** (already used)                                                    | Pure logic: planner, targets, parsing, formatting, cart decisions                                                                              |
| Component         | **Vitest + React Testing Library** (+ `happy-dom` or `jsdom`)                | Client components behave right: list checkboxes, cart +/−, settings form, language switch, install button                                      |
| API / integration | **Vitest + MSW** (Mock Service Worker)                                       | Route handlers return the right status and shape; eBag and Supabase calls are mocked at the HTTP level                                         |
| Database security | **Vitest against a local Supabase** (`supabase start`, Docker), or **pgTAP** | RLS really isolates users: user A cannot read or write user B's plans, checks or tokens                                                        |
| End-to-end        | **Playwright**                                                               | A real browser goes sign up → onboarding → plan → recipe → list → language switch on a phone-sized viewport, plus **axe** accessibility checks |

**Why Vitest rather than Jest:**

- Vitest runs TypeScript and ESM natively, so there's no Babel/ts-jest setup to maintain.
- It is much faster, and its API is Jest-compatible (`describe`, `it`, `expect`, `vi.fn`).
- It already runs 111 tests here.
- Jest remains fine and widespread, but switching would be pure cost.

**Shape of the suite:** a "testing trophy". Most value comes from integration tests (components + API routes with mocked
edges), backed by fast unit tests for the planner and a few E2E tests covering the main journey.

---

## The plan, in phases

Order: things a reviewer notices first come first. Times are rough working days.

### Phase 1: Quality gates and CI (½ day) ✅ done

- [x] `.github/workflows/ci.yml` on every push and PR: install → lint → typecheck → unit tests (with coverage) → build. Later also the E2E job.
- [x] **Prettier** + `format:check` in CI; **Husky + lint-staged** pre-commit (format and lint staged files).
- [x] **Coverage** with `@vitest/coverage-v8`; thresholds (set at 92/89/79/93 % — statements/functions/branches/lines — on `lib/` domain logic; today 93.7/91/80.9/94.7 %); the numbers show on every CI run (job summary + HTML report artifact). CI and CodeQL badges in the README.
- [x] **Dependabot** (npm + GitHub Actions) and **CodeQL** scanning; `npm audit` in CI at **critical** (a known high advisory in the PostCSS bundled with Next 15 needs the Next 16 upgrade; Dependabot tracks it).
- [ ] _(you, in GitHub settings)_ Branch protection on `main`: the CI checks must pass. Work goes through short PRs from now on, so the history shows reviews and checks.

### Phase 2: Tests that matter (2–3 days)

- [x] **Component tests (RTL)** — done (30 tests in 6 files; shared `test/render.tsx` with the real bg/en messages, `test/fixtures.ts`): ShoppingList (tick and untick, saving failure reverts), EbagCart (+/−, remove, delivery hint, error/reconnect state), PlanSettingsForm (live targets, validation messages, manual targets), LanguageToggle, InstallButton (Android prompt vs iPhone guide), WeekView (day tabs, photos and placeholders).
- [x] **API route tests** — done (31 tests): `/api/plan` (auth, incomplete profile, load/save failures, first plan, «Нов план» steering + fallback, budget-too-low message in bg/en, timeout), `/api/ebag/cart` GET/PATCH/POST (reconnect 409, eBag down 502, invalid body 400, eBag adjusting/refusing changes, sending the plan with substitutes, never checkout), OAuth callback (success; forged state, missing/expired cookie, wrong issuer, other user, denied, failed exchange — never stores tokens). Supabase, eBag and the planner are replaced by small in-memory fakes (`test/server.ts`) instead of MSW: the network clients are already behind our own modules, so faking those is simpler and keeps the tests fast. Planner tests got generous solver time limits so they are not flaky on a busy CI runner.
- [ ] **RLS tests** against a local Supabase: two users, every table, read and write attempts. This is the strongest proof of "each user sees only their own data".
- [ ] **Playwright E2E** (mobile viewport, Chromium + WebKit):
  - sign up → onboarding → plan (planner seeded with fixture data, so it's fast and deterministic) → recipe → list → tick an item → reload keeps it;
  - switch to English and back;
  - delete the account;
  - eBag is mocked; never the real shop.
- [ ] **Accessibility:** `@axe-core/playwright` on every main screen; fail on serious violations.
- [ ] Optional: a small planner benchmark (time per profile) to catch slowdowns.

### Phase 3: Error handling and observability (1 day)

- [ ] **One error contract** for all API routes: `{ error: { code, message } }` + HTTP status; a small `AppError` class and an `apiHandler()` wrapper that turns thrown errors into that shape and logs them once.
- [ ] **Structured logging** (`pino` or a tiny JSON logger) instead of `console.*`, with a request ID per request and no personal data in logs.
- [ ] **Error tracking** with Sentry (free tier) for client and server, with source maps; `error.tsx` reports to it.
- [ ] Client fetches with **timeouts and retries** where safe (AbortController); one shared `apiFetch()`.
- [ ] `/api/health` (DB reachable, last sync age) for uptime checks.

### Phase 4: Security hardening (1 day)

- [ ] **Security headers** (in `next.config.ts` or middleware): Content-Security-Policy (with nonces for the inline script), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors none. Check with securityheaders.com and Mozilla Observatory, and put the grade in the README.
- [ ] **Rate limiting:** `/api/plan` (CPU-heavy), `/api/ebag/*`, login/sign-up, feedback. Upstash Ratelimit (free) or a Postgres-backed counter.
- [ ] **Origin check** on state-changing route handlers (server actions already have one).
- [ ] `SECURITY.md`:
  - threat model in short;
  - how tokens are encrypted;
  - how to rotate `EBAG_TOKEN_KEY` (add key versioning: the `v1.` prefix is already there);
  - how to report issues.
- [ ] Generated **typed Supabase client** (`supabase gen types typescript`) so a wrong column is a compile error.
- [ ] Secret scanning: enable GitHub push protection; verify no secrets in history (already clean: `.env.local` and `.secrets/` were never committed).

### Phase 5: Code quality refactor (1–2 days)

- [ ] Split `lib/planner/plan.ts` (770 lines) into `stage1.ts`, `stage2.ts`, `diagnose.ts`, `model.ts` (LP helpers) and `solve.ts`. The end-to-end test keeps the behaviour identical.
- [ ] Move one-off and legacy scripts (`review_server.mjs`, `send_to_cart.mjs`, `ebag_login.mjs` flow, USDA builders) to `tools/` with a short README, or delete what's no longer used.
- [ ] Stricter ESLint: `typescript-eslint` strict-type-checked, `jsx-a11y`, import order.
- [ ] Small shared UI pieces (Card, Notice, Badge) instead of repeated class strings; consistent naming (English in code everywhere).
- [ ] Remove dead code and old Bulgarian constants that only tests still use.

### Phase 6: Presentation, the part reviewers see first (1 day)

- [ ] **README rewrite** (English):
  - one-line pitch, live demo link, phone screenshots/GIF (BG + EN);
  - features; tech stack;
  - architecture diagram (Mermaid: Next.js on Vercel ↔ Supabase ↔ HiGHS ↔ eBag MCP ↔ GitHub Actions sync);
  - "How the planner works" (two-stage MILP in plain words);
  - security and testing sections with badges (CI, coverage, CodeQL);
  - local setup; project structure.
- [ ] `docs/ARCHITECTURE.md` + a few short **ADRs** (`docs/adr/`), the decisions an interviewer will ask about:
  - HiGHS WASM in a serverless function;
  - the two-stage planner and why whole-pack costs inside stage 1 were dropped;
  - cookie-based i18n without locale URLs;
  - encrypted per-user OAuth tokens;
  - the daily sync in GitHub Actions instead of Vercel cron.
- [ ] **Demo mode** for reviewers: "Try the demo" logs into a read-only demo account with a ready plan, with eBag mocked and no sign-up needed.
- [ ] `LICENSE` (MIT), `.github/ISSUE_TEMPLATE`, a clean `CHANGELOG.md` (or GitHub releases v1.0).
- [ ] Lighthouse report (performance, accessibility, best practices, PWA) with scores in the README.

### Phase 7: Legal and data hygiene before the repo goes public (½ day) ⚠️ do this before sharing the link

- [ ] **Recipe photos:**
  - they are copyrighted by 1001recepti.com authors. Fine for a private test; not for a public portfolio repo;
  - options: replace them with free-licence photos (Unsplash/Pexels, with credits), AI-generated images, or own photos;
  - or keep them out of the public repo (load from private storage) and show placeholders in the demo.
- [ ] **Scraped eBag data** (`data/ebag_catalog.json`, price history, nutrition cache, 60 MB):
  - remove from the public repo (`.gitignore`) and keep a small anonymised fixture for tests;
  - add a note that the live app syncs from eBag with the owner's account, and that eBag's terms apply.
- [ ] **Git history:** removing files now doesn't remove them from history.
  - if the repo becomes public, rewrite history (`git filter-repo`) or start a fresh public repo from a clean snapshot;
  - the clean snapshot is simpler and safer.
- [ ] Check that no personal data (tester emails, real names) is in commits, fixtures or logs.

---

## Suggested order and effort

| #   | Phase               | Effort   | Why this order                                                                              |
| --- | ------------------- | -------- | ------------------------------------------------------------------------------------------- |
| 1   | Quality gates & CI  | ½ day    | Every later change is checked automatically; green badges are the first thing reviewers see |
| 2   | Tests               | 2–3 days | The biggest gap, and most of what was asked                                                 |
| 3   | Error handling      | 1 day    | Builds on the tests (each error path gets a test)                                           |
| 4   | Security            | 1 day    | Headers + rate limits + RLS tests: concrete talking points in interviews                    |
| 5   | Refactor            | 1–2 days | Safe once tests exist                                                                       |
| 6   | Presentation        | 1 day    | Last, so screenshots and docs describe the final state                                      |
| 7   | Legal / public repo | ½ day    | **Before** making the repo public, whatever else is done                                    |

**Total:** about 7–9 working days. Phases 1–2 alone already change how the repo reads.
