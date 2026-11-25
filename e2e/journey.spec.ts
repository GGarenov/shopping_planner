// The whole first week of a new user, in a real browser on a phone: sign up → onboarding → first plan (one tap) → targets →
// a recipe → the shopping list (tick, reload, still ticked) → English and back → eBag screen → delete the account.
// Every main screen is also checked for accessibility problems (axe).
import { expect, test } from "@playwright/test";
import { admin, alert, blockEbag, expectAccessible, messages, newAccount } from "./support";

const bg = {
  login: messages("bg", "login"),
  onboarding: messages("bg", "onboarding"),
  options: messages("bg", "options"),
  errors: messages("bg", "errors"),
  targets: messages("bg", "targets"),
  nav: messages("bg", "nav"),
  plan: messages("bg", "plan"),
  recipe: messages("bg", "recipe"),
  list: messages("bg", "list"),
  ebag: messages("bg", "ebag"),
  profile: messages("bg", "profile"),
};
const en = { list: messages("en", "list") };

// JavaScript errors in the browser, attached to the report so a failure can be explained without a re-run.
const browserErrors: string[] = [];
test.afterEach(async ({}, info) => {
  if (browserErrors.length) await info.attach("browser-errors", { body: browserErrors.join("\n\n"), contentType: "text/plain" });
  browserErrors.length = 0;
});

test("a new user goes from sign-up to a shopping list, then deletes the account", async ({ page }) => {
  const ebagCalls = await blockEbag(page);
  page.on("pageerror", (e) => browserErrors.push(`${page.url()}: ${e.stack ?? e.message}`));
  page.on("console", (m) => void (m.type() === "error" && browserErrors.push(`${page.url()} console: ${m.text()}`)));
  await page.addInitScript(() => localStorage.setItem("install_hint_seen", "1")); // the install screen has its own tests
  const account = newAccount();
  const next = () => page.getByRole("button", { name: bg.onboarding.next }).click();
  const nav = (key: "plan" | "list" | "ebag" | "profile") =>
    page.getByRole("navigation").getByRole("link", { name: bg.nav[key], exact: true }).click();

  await test.step("logged out: every page leads to the login screen", async () => {
    await page.goto("/plan");
    await expect(page).toHaveURL(/\/login$/);
    await expectAccessible(page, "login");
  });

  await test.step("sign up", async () => {
    await page.getByRole("tab", { name: bg.login.tabSignUp }).click();
    await page.getByLabel(bg.login.email).fill(account.email);
    await page.getByLabel(bg.login.password, { exact: true }).fill(account.password);
    await page.getByRole("button", { name: bg.login.createAccount }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  await test.step("onboarding: nine short steps, with validation", async () => {
    await expectAccessible(page, "onboarding");
    await page.getByRole("radio", { name: bg.options.sex.female }).click();
    await next();
    await next(); // nothing filled in yet
    await expect(alert(page)).toHaveText(bg.errors.ageRange);
    await page.getByLabel(bg.onboarding.age).fill("35");
    await page.getByLabel(bg.onboarding.height).fill("168");
    await page.getByLabel(bg.onboarding.weight).fill("62,5"); // a comma works as the decimal point
    await next();
    await page.getByRole("radio", { name: new RegExp(`^${bg.options.activity.light.label}`) }).click();
    await next();
    await page.getByRole("radio", { name: new RegExp(`^${bg.options.goal.maintain.label}`) }).click();
    await next();
    await page.getByRole("radio", { name: "100 €" }).click();
    await next();
    await page.getByRole("radio", { name: bg.options.diet.none }).click();
    await next();
    await page.getByRole("button", { name: bg.options.exclude.pork }).click();
    await expect(page.getByRole("button", { name: bg.options.exclude.pork })).toHaveAttribute("aria-pressed", "true");
    await next();
    await next(); // pantry: keep the defaults
    await page.getByRole("checkbox", { name: bg.onboarding.consentCheckbox }).check();
    await page.getByRole("button", { name: bg.onboarding.finish }).click();
  });

  await test.step("the first plan straight from onboarding: 7 days made by the real planner", async () => {
    const days = page.getByRole("tablist", { name: bg.plan.week.days });
    await expect(days).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/plan$/);
    await expect(days.getByRole("tab")).toHaveCount(7);
    await expectAccessible(page, "plan");
  });

  await test.step("targets: calories and protein, explained (under Profile)", async () => {
    await page.goto("/targets");
    await expect(page.getByRole("heading", { level: 1, name: bg.targets.heading })).toBeVisible();
    await expectAccessible(page, "targets");
    await nav("plan");
  });

  await test.step("a recipe from the plan", async () => {
    const meal = page.locator('main a[href^="/plan/"]').first();
    const name = (await meal.locator(".font-bold").textContent())!.trim();
    await meal.click();
    await expect(page).toHaveURL(/\/plan\/[0-9a-f-]+\/\d\/\w+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.getByRole("heading", { name: bg.recipe.ingredients })).toBeVisible();
    await expectAccessible(page, "recipe");
    await page.getByRole("link", { name: bg.recipe.backToPlan }).click();
    await expect(page.getByRole("tablist", { name: bg.plan.week.days })).toBeVisible();
  });

  await test.step("shopping list: a tick is saved and survives a reload", async () => {
    await page.getByRole("link", { name: bg.plan.shoppingList }).click();
    await expect(page.getByRole("heading", { level: 1, name: bg.list.title })).toBeVisible();
    await expectAccessible(page, "list");
    const first = page.getByRole("checkbox").first();
    await expect(first).not.toBeChecked();
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/list"));
    await first.check();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole("checkbox").first()).toBeChecked();
  });

  await test.step("switch to English and back; the choice is remembered", async () => {
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: en.list.title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: en.list.title })).toBeVisible();
    await expectAccessible(page, "list (English)");
    await page.getByRole("button", { name: "Български" }).click();
    await expect(page.getByRole("heading", { level: 1, name: bg.list.title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  });

  await test.step("eBag screen: offers to connect (the real shop is never contacted)", async () => {
    await nav("ebag");
    await expect(page.getByRole("link", { name: bg.ebag.connect })).toBeVisible();
    await expectAccessible(page, "ebag");
  });

  await test.step("delete the account: everything is gone and the login no longer works", async () => {
    await nav("profile");
    await expectAccessible(page, "profile");
    await page.getByRole("link", { name: bg.profile.deleteLink }).click();
    await expectAccessible(page, "delete account");
    await page.getByRole("checkbox", { name: bg.profile.delete.confirm }).check();
    await page.getByRole("button", { name: bg.profile.delete.submit }).click();
    await expect(page).toHaveURL(/\/login\?deleted=1$/);
    await expect(page.getByRole("status")).toHaveText(bg.login.deleted);

    await page.getByLabel(bg.login.email).fill(account.email);
    await page.getByLabel(bg.login.password, { exact: true }).fill(account.password);
    await page.getByRole("button", { name: bg.login.signIn }).click();
    await expect(alert(page)).toHaveText(bg.login.invalidCredentials);

    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((u) => u.email === account.email)).toBe(false);
  });

  expect(ebagCalls, "the browser must never call the real eBag").toEqual([]);
});
