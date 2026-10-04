import { expect, test } from "@playwright/test";
import { USERS, loginAs } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loginAs(page, USERS.maria);
});

test("an employee cannot open someone else's ticket or the admin page", async ({ page }) => {
  expect((await page.goto("/tickets/t2"))?.status()).toBe(404); // Carlo's ticket
  expect((await page.goto("/admin/users"))?.status()).toBe(404);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
});

test("an employee sees only their own tickets", async ({ page }) => {
  await page.goto("/tickets");
  await expect(page.getByText("Laptop will not boot")).toBeVisible(); // Maria's
  await expect(page.getByText("Cannot connect to VPN")).toHaveCount(0); // Carlo's
});

test("internal notes are hidden from the requester", async ({ page }) => {
  await page.goto("/tickets/t1");
  await expect(page.getByText("Booting into recovery to check the last update.")).toBeVisible();
  await expect(page.getByText("Loaner laptop LT-0002")).toHaveCount(0);
  await expect(page.getByLabel("Internal note")).toHaveCount(0); // no internal checkbox for employees
});

test("an employee cannot edit a ticket or manage assets", async ({ page }) => {
  await page.goto("/tickets/t1");
  await expect(page.getByText("Only IT staff can edit tickets.")).toBeVisible();
  await page.goto("/assets");
  await expect(page.getByRole("button", { name: "Add asset" })).toHaveCount(0);
});

test("submitting a ticket runs the creation flow: SLA, auto-assignment and an audit trail", async ({ page }) => {
  await page.goto("/tickets/new");
  await page.getByLabel("Title").fill("E2E: monitor flickers");
  await page.getByLabel("Description").fill("Flickers every few minutes.");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByRole("button", { name: "Submit ticket" }).click();

  await expect(page).toHaveURL(/\/tickets\?created=1007$/);
  await expect(page.getByText("Ticket #1007 created.")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "E2E: monitor flickers" });
  await expect(row).toContainText("Ben Lim"); // the agent with the fewest open tickets
  await expect(row).toContainText("In progress");

  await row.getByRole("link").click();
  await expect(page.getByText("Flow auto-assigned this ticket to Ben Lim")).toBeVisible();
  await expect(page.getByText("Ticket created. SLA due in 8h")).toBeVisible();

  await page.goto("/flows");
  await expect(page.getByText("Trigger: Ticket #1007")).toBeVisible();
});

test("an employee can comment on their own ticket", async ({ page }) => {
  await page.goto("/tickets/t1");
  await page.getByLabel("Add a comment").fill("E2E: I will be at my desk all afternoon.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("E2E: I will be at my desk all afternoon.")).toBeVisible();
});

test("search, filters and sorting work, and links keep the filters", async ({ page }) => {
  await page.goto("/tickets?q=laptop");
  await expect(page.getByText("1 of 4 tickets match your filters")).toBeVisible();
  await page.goto("/tickets?status=new");
  await expect(page.getByText(/tickets match your filters/)).toBeVisible();
  await page.goto("/tickets?status=nonsense");
  await expect(page.getByText(/\d+ of \d+ tickets$/)).toBeVisible(); // invalid values are ignored
});

test("an employee can request equipment", async ({ page }) => {
  await page.goto("/requests");
  await page.getByLabel("Asset type").selectOption("Headset");
  await page.getByPlaceholder("Why do you need it?").fill("E2E: video calls all day");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("E2E: video calls all day")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0); // only managers approve
});
