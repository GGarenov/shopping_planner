// End-to-end tests: a real browser on a phone-sized screen against a production build of the app, wired to the
// separate TEST Supabase project (the same one as the RLS tests) — never production, never the real eBag shop.
//   npm run test:e2e         (reads .env.test.local: RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY, RLS_SUPABASE_SERVICE_ROLE_KEY)
// The test project needs the schema (supabase/migrations) and the reference data (scripts/seed.ts); see README.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey)
  throw new Error("E2E tests need the test project: set RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY, RLS_SUPABASE_SERVICE_ROLE_KEY");

// Refuse the production project, whether it comes from the environment or from .env.local.
const production = [
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")).NEXT_PUBLIC_SUPABASE_URL : undefined,
];
if (production.includes(url)) throw new Error("E2E tests refuse to run against the production Supabase project.");

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "bg-BG",
    timezoneId: "Europe/Sofia",
    serviceWorkers: "block", // the PWA service worker would cache pages between steps
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    {
      name: "iphone",
      use: { ...devices["iPhone 15"] },
      // Playwright's WebKit for Windows sometimes drops a POST ("rewinding of the data stream failed"), a bug of that
      // build's network layer — not of Safari or the app. CI runs WebKit on Linux, without retries.
      retries: process.platform === "win32" && !process.env.CI ? 2 : undefined,
    },
  ],
  webServer: {
    // A long keep-alive: WebKit on Windows cannot resend a POST body on a connection the server has just closed
    // (makes that bug, see the «iphone» project, much rarer).
    command: `npx next build && npx next start -p ${PORT} --keepAliveTimeout 120000`,
    url: `${BASE_URL}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    // Every variable the app reads is set here, so nothing is taken from .env.local (production keys).
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      EBAG_TOKEN_KEY: randomBytes(32).toString("base64"),
      APP_BASE_URL: BASE_URL,
    },
  },
});
