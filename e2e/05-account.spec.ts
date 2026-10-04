import { expect, test } from "@playwright/test";
import { PASSWORD, USERS, login, loginAs, logout } from "./helpers";

test("you can edit your name and department, but not your email or role", async ({ page }) => {
  // The account registered in 01-auth: every demo user's password or name is changed by some other file.
  await loginAs(page, "e2e.newhire@contoso.test", "a-long-password-1");
  await page.goto("/account");
  await expect(page.getByText("Email (your sign-in, not editable)")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByLabel("Role")).toHaveCount(0);

  await page.getByLabel("Full name").fill("New Hire Jr");
  await page.getByLabel("Department").fill("Field Sales");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
  await expect(page.getByRole("link", { name: /New Hire Jr/ })).toBeVisible(); // the nav shows the new name
});

test("changing your own password needs the current one, and kills the old password", async ({ page }) => {
  await loginAs(page, USERS.maria);
  await page.goto("/account");
  await expect(page.getByText("maria@contoso.test")).toBeVisible();

  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByLabel("New password").fill("maria-new-pass-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "current password is not correct" })).toBeVisible();

  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password").fill("maria-new-pass-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();

  await logout(page);
  await login(page, USERS.maria, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await loginAs(page, USERS.maria, "maria-new-pass-1");
});

test("a session on another device is signed out when the password changes", async ({ page, browser }) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await loginAs(otherPage, USERS.maria, "maria-new-pass-1");

  await loginAs(page, USERS.maria, "maria-new-pass-1");
  await page.goto("/account");
  await page.getByLabel("Current password").fill("maria-new-pass-1");
  await page.getByLabel("New password").fill("maria-third-pass-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();

  await page.goto("/tickets"); // this device stays signed in
  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
  await otherPage.goto("http://localhost:3210/tickets"); // the other one does not
  await expect(otherPage).toHaveURL(/\/login$/);
  await other.close();
});
