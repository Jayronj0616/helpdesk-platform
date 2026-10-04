import { expect, test } from "@playwright/test";
import { PASSWORD, USERS, login, loginAs, logout } from "./helpers";

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
