// Screenshots for the README (docs/screenshots/), in English: a guest's whole path on a phone, against the test project.
// Not a test: runs only on request, then deletes the guest.
//   SCREENSHOTS=1 npx playwright test screenshots --project=android
import { expect, test, type Page } from "@playwright/test";
import { blockEbag, messages } from "./support";

const en = {
  welcome: messages("en", "welcome"),
  onboarding: messages("en", "onboarding"),
  options: messages("en", "options"),
  nav: messages("en", "nav"),
  plan: messages("en", "plan"),
  list: messages("en", "list"),
  profile: messages("en", "profile"),
};

test.skip(!process.env.SCREENSHOTS, "only on request: SCREENSHOTS=1");

const shot = async (page: Page, name: string) => {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, animations: "disabled" });
};

test("README screenshots", async ({ page }) => {
  test.setTimeout(240_000);
  await blockEbag(page);
  // The app's language switch is a cookie (lib/i18n/config.ts: LOCALE_COOKIE).
  await page.context().addCookies([{ name: "lang", value: "en", url: test.info().project.use.baseURL! }]);
  const next = () => page.getByRole("button", { name: en.onboarding.next }).click();

  await page.goto("/");
  await expect(page.getByRole("link", { name: en.welcome.start })).toBeVisible();
  await shot(page, "welcome");

  await page.getByRole("link", { name: en.welcome.start }).click();
  await page.getByRole("radio", { name: en.options.sex.female }).click();
  await next();
  await page.getByLabel(en.onboarding.age).fill("58");
  await page.getByLabel(en.onboarding.height).fill("164");
  await page.getByLabel(en.onboarding.weight).fill("68");
  await next();
  await page.getByRole("radio", { name: new RegExp(`^${en.options.activity.light.label}`) }).click();
  await next();
  await page.getByRole("radio", { name: new RegExp(`^${en.options.goal.lose.label}`) }).click();
  await shot(page, "onboarding");
  await next();
  await page.getByRole("radio", { name: "100 €" }).click();
  await next();
  await page.getByRole("radio", { name: en.options.diet.none }).click();
  await next();
  await next();
  await next();
  await page.getByRole("checkbox", { name: en.onboarding.consentCheckbox }).check();
  await page.getByRole("button", { name: en.onboarding.finish }).click();

  // The loading screen, a few days already filled.
  await expect(page.getByRole("status")).toBeVisible();
  await page.waitForTimeout(5200);
  await page.screenshot({ path: "docs/screenshots/loading.png" });

  const days = page.getByRole("tablist", { name: en.plan.week.days });
  await expect(days).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(500);
  await shot(page, "plan");

  await page.goto("/list");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.waitForTimeout(800);
  await shot(page, "list");

  await page.getByRole("link", { name: en.list.sendToEbag }).click();
  await expect(page).toHaveURL(/\/ebag$/);
  await shot(page, "ebag");

  // Clean up: the guest deletes their data.
  await page.getByRole("navigation").getByRole("link", { name: en.nav.profile, exact: true }).click();
  await page.getByRole("link", { name: en.profile.deleteGuestLink }).click();
  await page.getByRole("checkbox", { name: en.profile.delete.confirm }).check();
  await page.getByRole("button", { name: en.profile.delete.submit }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
});
