import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { USERS, loginAs, logout } from "../helpers";

const OUT = path.join(process.cwd(), "docs", "screenshots");

async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForLoadState("networkidle");
  // The dev server draws a small Next.js badge in the corner; it is not part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

test("capture the README screenshots", async ({ page }) => {
  // Signed out
  await page.goto("/login");
  await expect(page.getByText("Demo accounts")).toBeVisible();
  await shot(page, "login", false);

  // Employee: their own, narrower view
  await loginAs(page, USERS.maria);
  await page.goto("/tickets/new");
  await shot(page, "new-ticket");
  // Submitting it runs the "when a ticket is created" flow, which the flow log screenshot shows later.
  await page.getByLabel("Title").fill("Second monitor flickers");
  await page.getByLabel("Description").fill("It flickers every few minutes since the last update.");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByRole("button", { name: "Submit ticket" }).click();
  await expect(page.getByText("Ticket #1007 created.")).toBeVisible();
  await logout(page);

  // Agent: a ticket with a public comment, an internal note and an audit trail
  await loginAs(page, USERS.ana);
  await page.goto("/tickets/t1");
  await page.getByLabel("Add a comment").fill("Replaced the driver. Please restart and confirm it boots.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("Replaced the driver. Please restart and confirm it boots.")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("waiting");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ana Cruz changed status from In progress to Waiting")).toBeVisible();
  await shot(page, "ticket-detail");
  await logout(page);

  // Manager: everything else
  await loginAs(page, USERS.dina);
  await page.goto("/");
  await shot(page, "dashboard");
  await page.goto("/tickets");
  await shot(page, "tickets");
  await page.goto("/assets");
  await shot(page, "assets");
  await page.goto("/requests");
  await shot(page, "requests");
  await page.goto("/admin/users");
  await shot(page, "admin-users");

  // Give the flow log something to show: approve the pending request, then run the escalation flow.
  await page.goto("/requests");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.goto("/flows");
  await page.getByRole("button", { name: /Escalate overdue/ }).click();
  await expect(page.getByText("breached SLA")).toBeVisible();
  await shot(page, "flows");

  // A phone-sized view of the ticket list
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tickets");
  await shot(page, "tickets-mobile", false);
});
