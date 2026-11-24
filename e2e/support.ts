// Shared helpers for the E2E tests: test accounts on the test Supabase project, UI text and accessibility checks.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Throwaway accounts use a reserved domain that can never receive mail; the teardown deletes all of them. */
export const E2E_DOMAIN = "pazarko.test";
export const newAccount = () => ({ email: `e2e-${randomUUID().slice(0, 12)}@${E2E_DOMAIN}`, password: `E2e-${randomUUID()}` });

/** UI text from messages/<locale>/<namespace>.json, so the tests follow copy changes instead of breaking on them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function messages(locale: "bg" | "en", ns: string): any {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "messages", locale, `${ns}.json`), "utf8"));
}

/** Service-role client for the TEST project (playwright.config.ts has already refused production). */
export function admin() {
  return createClient(process.env.RLS_SUPABASE_URL!, process.env.RLS_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function deleteTestAccounts() {
  const db = admin();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const ours = data.users.filter((u) => u.email?.endsWith(`@${E2E_DOMAIN}`));
  await Promise.all(ours.map((u) => db.auth.admin.deleteUser(u.id)));
  return ours.length;
}

/**
 * axe-core on the current screen (WCAG 2.1 A + AA). Fails on serious and critical problems and lists them;
 * minor and moderate ones are attached to the report. Soft: the journey goes on, so one run lists every screen.
 */
export async function expectAccessible(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("[data-logo]") // the «Pazarko» wordmark: logotypes are exempt from contrast rules (WCAG 1.4.3)
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const describe = (vs: typeof violations) =>
    vs.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
  const minor = violations.filter((v) => !blocking.includes(v));
  if (minor.length) await test.info().attach(`a11y-${screen}`, { body: describe(minor), contentType: "text/plain" });
  expect.soft(blocking, `Accessibility problems on «${screen}»:\n${describe(blocking)}`).toEqual([]);
}

/** Keeps the browser away from the real eBag shop: any request to ebag.bg fails, and is recorded. */
export async function blockEbag(page: Page) {
  const calls: string[] = [];
  await page.context().route(/^https?:\/\/([a-z0-9-]+\.)*ebag\.bg\//, (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  return calls;
}

/** The app's own error message (Next.js also keeps an empty role="alert" route announcer outside <main>). */
export const alert = (page: Page) => page.getByRole("main").getByRole("alert");
