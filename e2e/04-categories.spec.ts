import { expect, test, type Page } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

const card = (page: Page, name: string) => page.locator("section").filter({ has: page.getByLabel(`Name of category ${name}`) });

test("only managers can open the categories page", async ({ page }) => {
  await loginAs(page, USERS.ana);
  expect((await page.goto("/admin/categories"))?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Categories" })).toHaveCount(0);
  await logout(page);
});

test("a manager adds, renames and deletes a category, and the ticket form follows", async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.goto("/admin/categories");
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

  await page.getByLabel("Category name").fill("Printers");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Printers." })).toBeVisible();

  // a duplicate (any case) is refused and the input is kept
  await page.getByLabel("Category name").fill("printers");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already a category" })).toBeVisible();
  await expect(page.getByLabel("Category name")).toHaveValue("printers");

  await page.goto("/tickets/new");
  await expect(page.getByLabel("Category").locator("option", { hasText: "Printers" })).toHaveCount(1);

  await page.goto("/admin/categories");
  await page.getByLabel("Name of category Printers").fill("Printing and scanning");
  await card(page, "Printers").getByRole("button", { name: "Rename" }).click();
  await expect(page.getByLabel("Name of category Printing and scanning")).toBeVisible();
  await expect(page.getByLabel("Name of category Printers")).toHaveCount(0);

  await page.getByRole("button", { name: "Delete category Printing and scanning" }).click();
  await expect(page.getByLabel("Name of category Printing and scanning")).toHaveCount(0);
});

test("renaming to another category's name is refused", async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.goto("/admin/categories");
  await page.getByLabel("Name of category Network").fill("software");
  await card(page, "Network").getByRole("button", { name: "Rename" }).click();
  await expect(card(page, "Network").getByRole("alert")).toContainText("already a category");
});

test("a category with tickets cannot be deleted, only renamed", async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.goto("/admin/categories");
  await expect(page.getByRole("button", { name: "Delete category Hardware" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete category Network" })).toBeDisabled();
});
