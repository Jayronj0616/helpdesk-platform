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
});

test("after a reset the demo accounts work again with the demo password", async ({ page }) => {
  await login(page, USERS.maria, PASSWORD);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a registered user can no longer sign in after the reset", async ({ page }) => {
  await login(page, "e2e.newhire@contoso.test", "a-long-password-1");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
});
