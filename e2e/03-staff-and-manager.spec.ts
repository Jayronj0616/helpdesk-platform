import { expect, test } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

test.describe("agent", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.ana);
  });

  test("sees every ticket but not the admin page", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page.getByText("Cannot connect to VPN")).toBeVisible(); // Carlo's ticket
    expect((await page.goto("/admin/users"))?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });

  test("an internal note is visible to staff but not to the requester", async ({ page }) => {
    await page.goto("/tickets/t5");
    await page.getByLabel("Add a comment").fill("E2E internal: check the print server");
    await page.getByLabel("Internal note").check();
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(page.getByText("E2E internal: check the print server")).toBeVisible();
    await expect(page.getByText("Internal note", { exact: true })).toBeVisible();

    await logout(page);
    await loginAs(page, USERS.maria); // Maria raised ticket 1005
    await page.goto("/tickets/t5");
    await expect(page.getByText("Printer on 3rd floor offline").first()).toBeVisible();
    await expect(page.getByText("E2E internal: check the print server")).toHaveCount(0);
  });

  test("changing status and assignee writes audit entries", async ({ page }) => {
    await page.goto("/tickets/t5");
    await page.getByLabel("Status", { exact: true }).selectOption("waiting");
    await page.getByLabel("Assignee").selectOption({ label: "Ben Lim" });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Ana Cruz changed status from New to Waiting")).toBeVisible();
    await expect(page.getByText("Ana Cruz changed assignee from Unassigned to Ben Lim")).toBeVisible();
  });

  test("waiting pauses the SLA clock and resuming gives the time back", async ({ page }) => {
    await page.goto("/tickets/t5");
    // Put it in Waiting (it may already be, from the test above; saving the same status changes nothing)
    await page.getByLabel("Status", { exact: true }).selectOption("waiting");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Paused while waiting for the customer", { exact: true })).toBeVisible();
    await expect(page.getByText("SLA clock paused while waiting for the customer")).toBeVisible();

    await page.goto("/tickets?q=printer");
    await expect(page.getByRole("row").filter({ hasText: "Printer on 3rd floor offline" })).toContainText("Paused");

    await page.goto("/tickets/t5");
    await page.getByLabel("Status", { exact: true }).selectOption("in_progress");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/SLA clock resumed: due date moved .*h later for the time spent waiting/)).toBeVisible();
    await expect(page.getByText("Paused while waiting for the customer", { exact: true })).toHaveCount(0);
  });

  test("can add an asset, rejects a duplicate tag, and changes status", async ({ page }) => {
    await page.goto("/assets");
    await page.getByLabel("Asset tag").fill("e2e-001");
    await page.getByLabel("Name", { exact: true }).fill("E2E Docking Station");
    await page.getByLabel("Type", { exact: true }).fill("docking station");
    await page.getByRole("button", { name: "Add asset" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added E2E-001." })).toBeVisible(); // tag uppercased

    await page.getByLabel("Asset tag").fill("E2E-001");
    await page.getByLabel("Name", { exact: true }).fill("Another");
    await page.getByLabel("Type", { exact: true }).fill("Dock");
    await page.getByRole("button", { name: "Add asset" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "E2E-001" });
    await row.getByLabel("Status of E2E-001").selectOption("repair");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("row").filter({ hasText: "E2E-001" }).locator("td").nth(3)).toHaveText("Repair"); // the status cell
  });

  test("cannot approve requests or run flows", async ({ page }) => {
    await page.goto("/requests");
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await page.goto("/flows");
    await expect(page.getByRole("button", { name: /Escalate overdue/ })).toBeDisabled();
  });
});

test.describe("manager", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.dina);
  });

  test("approving a request assigns an asset and logs the flow", async ({ page }) => {
    await page.goto("/requests");
    const card = page.locator("section").filter({ hasText: "Second screen for reconciliation work." });
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(card.getByText("Approved", { exact: true })).toBeVisible();

    await page.goto("/assets");
    await expect(page.getByRole("row").filter({ hasText: "MN-0001" })).toContainText("Maria Santos");
    await page.goto("/flows");
    await expect(page.getByText("Assigned MN-0001 (Dell 24-inch Monitor) to Maria Santos")).toBeVisible();
  });

  test("escalating overdue tickets raises priority and writes an audit entry", async ({ page }) => {
    await page.goto("/flows");
    await page.getByRole("button", { name: /Escalate overdue/ }).click();
    await expect(page.getByText("Ticket #1001: priority high -> critical, flagged as escalated")).toBeVisible();

    await page.goto("/tickets/t1");
    await expect(page.getByText("Flow escalated this ticket: priority high to critical (SLA breached)")).toBeVisible();
  });

  test("a rejected request does not assign anything", async ({ page }) => {
    await page.goto("/requests");
    const card = page.locator("section").filter({ hasText: "E2E: video calls all day" });
    await card.getByRole("button", { name: "Reject" }).click();
    await expect(card.getByText("Rejected", { exact: true })).toBeVisible();
  });
});
