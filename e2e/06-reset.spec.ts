import { expect, test } from "@playwright/test";
import { PASSWORD, USERS, login, loginAs } from "./helpers";

// Runs last: resetting wipes everything the earlier files created.
test("resetting demo data restores the seed, removes registered users, and keeps the manager signed in", async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.goto("/flows");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByText("No runs yet. Create a ticket or run a flow.")).toBeVisible();

  await page.goto("/admin/users");
  await expect(page.getByText("e2e.newhire@contoso.test")).toHaveCount(0);
  await expect(page.getByText("sam@contoso.test")).toHaveCount(0);
  await expect(page.getByText("Ana Cruz")).toBeVisible();
  await expect(page.getByLabel("Role for Ana Cruz")).toHaveValue("agent"); // demotion undone

  await page.goto("/tickets");
  await expect(page.getByText("6 of 6 tickets")).toBeVisible();

  // The audit log is not part of the demo data: the reset is recorded in it and everything before it stays.
  await page.goto("/admin/audit");
  await expect(page.getByRole("row").filter({ hasText: "Demo data reset" }).first()).toContainText("Dina Ramos");
  await expect(page.getByRole("row").filter({ hasText: "User created" }).filter({ hasText: "Sam Okoye" }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Password changed" }).filter({ hasText: "Maria Santos" }).first()).toBeVisible(); // 05-account
  await expect(page.getByRole("row").filter({ hasText: "Password reset by email" }).filter({ hasText: "Ben Lim" }).first()).toBeVisible(); // 05-password-reset
});

test("after a reset the demo accounts work again with the demo password", async ({ page }) => {
  await login(page, USERS.maria, PASSWORD);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a registered user can no longer sign in after the reset", async ({ page }) => {
  await login(page, "e2e.newhire@contoso.test", "a-long-password-1");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
});
