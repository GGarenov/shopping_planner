// Login screen error paths: the user is told what went wrong, in plain words.
import { expect, test } from "@playwright/test";
import { admin, alert, messages, newAccount } from "./support";

const login = messages("bg", "login");

test.describe("login screen", () => {
  const existing = newAccount();
  let userId = "";

  test.beforeAll(async () => {
    const { data, error } = await admin().auth.admin.createUser({ ...existing, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  });
  test.afterAll(async () => {
    if (userId) await admin().auth.admin.deleteUser(userId);
  });

  test("a wrong password says so and keeps the email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(login.email).fill(existing.email);
    await page.getByLabel(login.password, { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: login.signIn }).click();
    await expect(alert(page)).toHaveText(login.invalidCredentials);
    await expect(page.getByLabel(login.email)).toHaveValue(existing.email);
  });

  test("signing up with an email that already has an account points to «Вход»", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: login.tabSignUp }).click();
    await page.getByLabel(login.email).fill(existing.email);
    await page.getByLabel(login.password, { exact: true }).fill("Another-password-123");
    await page.getByRole("button", { name: login.createAccount }).click();
    await expect(alert(page)).toHaveText(login.userExists);
  });
});
