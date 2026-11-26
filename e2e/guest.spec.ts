// A guest: opens the app, answers the questions and gets a plan without ever typing an email
// (taylor_the_app/loginless.md, part 2). Needs "Allow anonymous sign-ins" on in the test Supabase project.
import { expect, test } from "@playwright/test";
import { blockEbag, expectAccessible, messages } from "./support";

const bg = {
  welcome: messages("bg", "welcome"),
  onboarding: messages("bg", "onboarding"),
  options: messages("bg", "options"),
  nav: messages("bg", "nav"),
  plan: messages("bg", "plan"),
  list: messages("bg", "list"),
  ebag: messages("bg", "ebag"),
  profile: messages("bg", "profile"),
};

test("a guest goes from the start page to a plan without an account, then deletes it", async ({ page }) => {
  const ebagCalls = await blockEbag(page);
  await page.addInitScript(() => localStorage.setItem("install_hint_seen", "1"));
  const next = () => page.getByRole("button", { name: bg.onboarding.next }).click();

  await test.step("the start page says what the app does; one tap to the questions", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("link", { name: bg.welcome.haveAccount })).toHaveAttribute("href", "/login");
    await expectAccessible(page, "welcome");
    await page.getByRole("link", { name: bg.welcome.start }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("link", { name: bg.onboarding.haveAccount })).toHaveAttribute("href", "/login");
    await expectAccessible(page, "onboarding (guest)");
  });

  await test.step("the questions", async () => {
    await page.getByRole("radio", { name: bg.options.sex.male }).click();
    await next();
    await page.getByLabel(bg.onboarding.age).fill("60");
    await page.getByLabel(bg.onboarding.height).fill("165");
    await page.getByLabel(bg.onboarding.weight).fill("70");
    await next();
    await page.getByRole("radio", { name: new RegExp(`^${bg.options.activity.light.label}`) }).click();
    await next();
    await page.getByRole("radio", { name: new RegExp(`^${bg.options.goal.maintain.label}`) }).click();
    await next();
    await page.getByRole("radio", { name: "100 €" }).click();
    await next();
    await page.getByRole("radio", { name: bg.options.diet.none }).click();
    await next();
    await next(); // exclusions: none
    await next(); // pantry: keep the defaults
    // Only the checkbox shows; the details (with the 3-day note for guests) open on a tap.
    await expect(page.getByText(bg.onboarding.consentGuest)).toBeHidden();
    await page.getByText(bg.onboarding.consentMore).click();
    await expect(page.getByText(bg.onboarding.consentGuest)).toBeVisible();
    await page.getByRole("checkbox", { name: bg.onboarding.consentCheckbox }).check();
    await page.getByRole("button", { name: bg.onboarding.finish }).click();
  });

  await test.step("the plan, made by the real planner", async () => {
    const days = page.getByRole("tablist", { name: bg.plan.week.days });
    await expect(days).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/plan$/);
    await expect(days.getByRole("tab")).toHaveCount(7);
  });

  await test.step("the list → «send to eBag»: a guest can connect eBag too (the login to eBag itself is not tested)", async () => {
    await page.getByRole("navigation").getByRole("link", { name: bg.nav.list, exact: true }).click();
    await page.getByRole("link", { name: bg.list.sendToEbag }).click();
    await expect(page).toHaveURL(/\/ebag$/);
    await expect(page.getByRole("link", { name: bg.ebag.connect, exact: true })).toHaveAttribute("href", "/api/ebag/connect");
    await expectAccessible(page, "eBag (guest)");
  });

  await test.step("clean up: the guest deletes their data", async () => {
    await page.getByRole("navigation").getByRole("link", { name: bg.nav.profile, exact: true }).click();
    await page.getByRole("link", { name: bg.profile.deleteLink }).click();
    await page.getByRole("checkbox", { name: bg.profile.delete.confirm }).check();
    await page.getByRole("button", { name: bg.profile.delete.submit }).click();
    await expect(page).toHaveURL(/\/login\?deleted=1$/);
  });

  expect(ebagCalls, "the browser must never call the real eBag").toEqual([]);
});
