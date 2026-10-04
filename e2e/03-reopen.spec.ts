import { expect, test } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

test("a requester reopens a resolved ticket and the assignee is notified", async ({ page }) => {
  // Maria's ticket 1003 is resolved. Ticket 1001 is still open and 1004 is Carlo's closed ticket.
  await loginAs(page, USERS.maria);
  await page.goto("/tickets/t1");
  await expect(page.getByRole("heading", { name: "Still not fixed?" })).toHaveCount(0); // open tickets cannot be reopened

  await page.goto("/tickets/t3");
  await expect(page.getByRole("heading", { name: "Still not fixed?" })).toBeVisible();

  // a reason is required (the browser's own check stops an empty one)
  await page.getByRole("button", { name: "Reopen ticket" }).click();
  await expect(page.getByText("Maria Santos reopened this ticket")).toHaveCount(0);

  await page.getByLabel("What is still wrong?").fill("It stopped working again this morning.");
  await page.getByRole("button", { name: "Reopen ticket" }).click();

  // the page now shows an open ticket: the reopen form is gone and the history says why
  await expect(page.getByText("Maria Santos reopened this ticket")).toBeVisible();
  await expect(page.getByText("It stopped working again this morning.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Still not fixed?" })).toHaveCount(0);
  await page.goto("/tickets?status=in_progress");
  await expect(page.getByRole("row").filter({ hasText: "Need Adobe Acrobat license" })).toContainText("In progress");
  await logout(page);

  // staff see the comment, and the flow log has the run
  await loginAs(page, USERS.dina);
  await page.goto("/flows");
  await expect(page.getByText("When a ticket is reopened")).toBeVisible();
  await expect(page.getByText("Sent email to ana@contoso.test: ticket #1003 was reopened by the requester")).toBeVisible();
  await logout(page);
});

test("closed tickets and other people's tickets cannot be reopened", async ({ page }) => {
  await loginAs(page, USERS.carlo);
  await page.goto("/tickets/t4"); // Carlo's own ticket, closed
  await expect(page.getByRole("heading", { name: "Still not fixed?" })).toHaveCount(0);
  expect((await page.goto("/tickets/t3"))?.status()).toBe(404); // Maria's
});
