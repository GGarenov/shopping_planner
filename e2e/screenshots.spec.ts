// Screenshots for the README (docs/screenshots/): a guest's whole path on a phone, against the test project.
// Not a test: runs only on request, then deletes the guest.
//   SCREENSHOTS=1 npx playwright test screenshots --project=android
import { expect, test, type Page } from "@playwright/test";
import { blockEbag, messages } from "./support";

const bg = {
  welcome: messages("bg", "welcome"),
  onboarding: messages("bg", "onboarding"),
  options: messages("bg", "options"),
  nav: messages("bg", "nav"),
  plan: messages("bg", "plan"),
  list: messages("bg", "list"),
  profile: messages("bg", "profile"),
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
  const next = () => page.getByRole("button", { name: bg.onboarding.next }).click();

  await page.goto("/");
  await expect(page.getByRole("link", { name: bg.welcome.start })).toBeVisible();
  await shot(page, "welcome");

  await page.getByRole("link", { name: bg.welcome.start }).click();
  await page.getByRole("radio", { name: bg.options.sex.female }).click();
  await next();
  await page.getByLabel(bg.onboarding.age).fill("58");
  await page.getByLabel(bg.onboarding.height).fill("164");
  await page.getByLabel(bg.onboarding.weight).fill("68");
  await next();
  await page.getByRole("radio", { name: new RegExp(`^${bg.options.activity.light.label}`) }).click();
  await next();
  await page.getByRole("radio", { name: new RegExp(`^${bg.options.goal.lose.label}`) }).click();
  await shot(page, "onboarding");
  await next();
  await page.getByRole("radio", { name: "100 €" }).click();
  await next();
  await page.getByRole("radio", { name: bg.options.diet.none }).click();
  await next();
  await next();
  await next();
  await page.getByRole("checkbox", { name: bg.onboarding.consentCheckbox }).check();
  await page.getByRole("button", { name: bg.onboarding.finish }).click();

  // The loading screen, a few days already filled.
  await expect(page.getByRole("status")).toBeVisible();
  await page.waitForTimeout(5200);
  await page.screenshot({ path: "docs/screenshots/loading.png" });

  const days = page.getByRole("tablist", { name: bg.plan.week.days });
  await expect(days).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(500);
  await shot(page, "plan");

  await page.goto("/list");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.waitForTimeout(800);
  await shot(page, "list");

  await page.getByRole("link", { name: bg.list.sendToEbag }).click();
  await expect(page).toHaveURL(/\/ebag$/);
  await shot(page, "ebag");

  // Clean up: the guest deletes their data.
  await page.getByRole("navigation").getByRole("link", { name: bg.nav.profile, exact: true }).click();
  await page.getByRole("link", { name: bg.profile.deleteGuestLink }).click();
  await page.getByRole("checkbox", { name: bg.profile.delete.confirm }).check();
  await page.getByRole("button", { name: bg.profile.delete.submit }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
});
