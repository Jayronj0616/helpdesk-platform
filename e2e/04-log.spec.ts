import { expect, test, type Page } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

const row = (page: Page, ...texts: string[]) => {
  let r = page.getByRole("row");
  for (const t of texts) r = r.filter({ hasText: t });
  return r.first();
};

test("only managers can open the audit log", async ({ page }) => {
  await loginAs(page, USERS.ben); // an agent (Ana was demoted by 04-admin)
  expect((await page.goto("/admin/audit"))?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await logout(page);
});

test("the manager's earlier admin work is all in the log, with who and about whom", async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText("Entries cannot be edited or deleted.")).toBeVisible();

  // files 03 and 04 did these, in this order
  await expect(row(page, "Asset added", "E2E-001", "Ana Cruz")).toBeVisible(); // an agent added it
  await expect(row(page, "Escalation flow run by hand", "Dina Ramos")).toBeVisible();
  await expect(row(page, "User created", "Sam Okoye (agent)", "Dina Ramos")).toBeVisible();
  await expect(row(page, "Role changed", "Ana Cruz", "agent to employee")).toBeVisible();
  await expect(row(page, "Role changed", "Ana Cruz")).toContainText("unassigned"); // the tickets freed by the demotion
  await expect(row(page, "Account deactivated", "Ben Lim")).toBeVisible();
  await expect(row(page, "Account reactivated", "Ben Lim")).toBeVisible();
  await expect(row(page, "Account deactivated", "Carlo Reyes")).toBeVisible();
  await expect(row(page, "Password reset by a manager", "Carlo Reyes")).toContainText("signed out everywhere");
  await expect(row(page, "Category added", "Printers")).toBeVisible();
  await expect(row(page, "Category renamed", "Printing and scanning")).toContainText("from Printers");
  await expect(row(page, "Category deleted", "Printing and scanning")).toBeVisible();

  // a secret never appears in the log
  const text = await page.getByRole("table", { name: "Audit log" }).innerText();
  expect(text).not.toContain("temp-pass-1234");
  expect(text).not.toContain("carlo-new-pass-1");
  await logout(page);
});

test("filtering shows one kind of action, and a made-up filter is ignored", async ({ page }) => {
  await loginAs(page, USERS.dina);
  await page.goto("/admin/audit");
  await page.getByLabel("Show").selectOption("user.role_changed");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/action=user\.role_changed/);
  await expect(page.getByText(/\d+ entr(y|ies) for "Role changed"/)).toBeVisible();
  const rows = page.getByRole("row").filter({ hasText: "Role changed" });
  await expect(rows.first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Account deactivated" })).toHaveCount(0);

  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page.getByLabel("Show")).toHaveValue("");

  await page.goto("/admin/audit?action=nonsense&page=999");
  await expect(page.getByLabel("Show")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await logout(page);
});
