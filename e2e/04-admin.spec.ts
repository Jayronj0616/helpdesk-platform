import { expect, test } from "@playwright/test";
import { PASSWORD, USERS, login, loginAs, logout } from "./helpers";

const userCard = (page: import("@playwright/test").Page, email: string) => page.locator("section").filter({ hasText: email });

test.beforeEach(async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.goto("/admin/users");
});

test("the manager's own role and account cannot be changed or deactivated here", async ({ page }) => {
  await expect(page.getByLabel("Role for Dina Ramos")).toBeDisabled();
  await expect(page.getByRole("button", { name: /Deactivate Dina Ramos/ })).toHaveCount(0);
});

test("creates an agent who can sign in and is offered as an assignee", async ({ page }) => {
  await page.getByLabel("Full name").fill("Sam Okoye");
  await page.getByLabel("Email").fill("sam@contoso.test");
  await page.getByLabel("Role", { exact: true }).selectOption("agent");
  await page.getByLabel("Temporary password").fill("temp-pass-1234");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Created Sam Okoye (agent)." })).toBeVisible();

  await page.goto("/tickets/t5");
  await expect(page.getByLabel("Assignee").locator("option", { hasText: "Sam Okoye" })).toHaveCount(1);

  await logout(page);
  await loginAs(page, "sam@contoso.test", "temp-pass-1234");
  await page.goto("/assets");
  await expect(page.getByRole("button", { name: "Add asset" })).toBeVisible(); // agents are staff
});

test("demoting an agent unassigns their open tickets and records why", async ({ page }) => {
  await userCard(page, USERS.ana).getByLabel("Role for Ana Cruz").selectOption("employee");
  await userCard(page, USERS.ana).getByRole("button", { name: "Save role" }).click();
  await expect(userCard(page, USERS.ana).getByLabel("Role for Ana Cruz")).toHaveValue("employee");

  await page.goto("/tickets/t6"); // Ana's open ticket
  await expect(page.getByText("Dina Ramos changed Ana Cruz's role to employee, so this ticket is now unassigned")).toBeVisible();
  await expect(page.getByLabel("Assignee")).toHaveValue("");
});

test("a deactivated account cannot sign in until it is reactivated", async ({ page }) => {
  await userCard(page, USERS.ben).getByRole("button", { name: "Deactivate Ben Lim" }).click();
  await expect(userCard(page, USERS.ben).getByText("Deactivated", { exact: true })).toBeVisible();

  await logout(page);
  await login(page, USERS.ben);
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();

  await loginAs(page, USERS.dina);
  await page.goto("/admin/users");
  await userCard(page, USERS.ben).getByRole("button", { name: "Reactivate Ben Lim" }).click();
  await expect(userCard(page, USERS.ben).getByText("Deactivated", { exact: true })).toHaveCount(0);

  await logout(page);
  await loginAs(page, USERS.ben);
});

test("deactivating a signed-in user ends their session immediately", async ({ page, browser }) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:3210/login");
  await loginAs(otherPage, USERS.carlo);

  await userCard(page, USERS.carlo).getByRole("button", { name: "Deactivate Carlo Reyes" }).click();
  await expect(userCard(page, USERS.carlo).getByText("Deactivated", { exact: true })).toBeVisible();

  await otherPage.goto("http://localhost:3210/tickets");
  await expect(otherPage).toHaveURL(/\/login$/);
  await other.close();

  await userCard(page, USERS.carlo).getByRole("button", { name: "Reactivate Carlo Reyes" }).click();
});

test("resetting a password signs the user out and the new password works", async ({ page, browser }) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await loginAs(otherPage, USERS.carlo);

  await userCard(page, USERS.carlo).getByText("Reset password").click();
  await page.getByLabel("New password for Carlo Reyes").fill("carlo-new-pass-1");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "signed out everywhere" })).toBeVisible();

  await otherPage.goto("http://localhost:3210/tickets");
  await expect(otherPage).toHaveURL(/\/login$/);
  await login(otherPage, USERS.carlo, PASSWORD);
  await expect(otherPage.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await loginAs(otherPage, USERS.carlo, "carlo-new-pass-1");
  await other.close();
});
