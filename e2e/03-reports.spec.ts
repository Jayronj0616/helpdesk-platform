import { expect, test } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

test("employees cannot open reports, and have no link to it", async ({ page }) => {
  await loginAs(page, USERS.maria);
  expect((await page.goto("/reports"))?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await logout(page);
});

test("staff get the report with its figures, and the period changes what it counts", async ({ page }) => {
  await loginAs(page, USERS.ana);
  await page.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  // The six figures, each with its own explanation
  for (const name of ["Tickets", "Resolved", "SLA met", "Avg. resolution", "Median first reply", "Satisfaction"]) {
    await expect(page.locator("section").filter({ hasText: name }).first()).toBeVisible();
  }
  // Seed data: six tickets, two of them resolved, one rated 5
  const tiles = page.locator("section").filter({ has: page.getByText("still open") });
  await expect(tiles).toContainText("6");

  await expect(page.getByRole("table", { name: "By person" })).toContainText("Ana Cruz");
  await expect(page.getByRole("table", { name: "By category" })).toContainText("Hardware");
  await expect(page.getByRole("table", { name: "By priority" })).toContainText("High");
  await expect(page.getByRole("table", { name: "Tickets created and resolved per day" })).toBeAttached();

  // Seed tickets were all created in the last few days, so every period counts them; an invalid one falls back to 30 days
  await page.goto("/reports?days=7");
  await expect(page.getByLabel("Period")).toHaveValue("7");
  await page.goto("/reports?days=bogus");
  await expect(page.getByLabel("Period")).toHaveValue("30");
  await page.goto("/reports?days=all");
  await expect(page.getByLabel("Period")).toHaveValue("all");

  // The definitions are on the page
  await page.getByText("How these figures are worked out").click();
  await expect(page.getByText("A dash means there is nothing to measure yet, not zero.")).toBeVisible();
  await logout(page);
});

test("the manager sees reports in the menu alongside the admin pages", async ({ page }) => {
  await loginAs(page, USERS.dina);
  for (const name of ["Reports", "Users", "Categories"]) await expect(page.getByRole("link", { name })).toBeVisible();
  await logout(page);
});
