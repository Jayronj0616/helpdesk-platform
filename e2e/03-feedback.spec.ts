import { expect, test } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

test("a requester rates their resolved ticket once, and staff and the dashboard see it", async ({ page }) => {
  // Maria's ticket 1003 is resolved and unrated.
  await loginAs(page, USERS.maria);
  await page.goto("/tickets/t3");
  await expect(page.getByRole("heading", { name: "Customer satisfaction" })).toBeVisible();

  // She has to choose a rating before sending (the browser's required check)
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks for letting us know.")).toHaveCount(0);

  await page.getByRole("radio", { name: "4 out of 5" }).check();
  await page.getByLabel("Anything to add?").fill("Quick and polite, thanks.");
  await page.getByRole("button", { name: "Send feedback" }).click();
  // The form is replaced by the saved rating, with a thank-you for the requester.
  await expect(page.getByText("Thanks for letting us know.")).toBeVisible();

  // After a reload it is still the rating, not the form, and the ticket has an audit entry.
  await page.reload();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText("4 out of 5").first()).toBeVisible();
  await expect(page.getByText("Quick and polite, thanks.")).toBeVisible();
  await expect(page.getByText("Maria Santos rated this ticket 4 out of 5")).toBeVisible();

  // Her own dashboard shows her one rating.
  await page.goto("/");
  const tile = page.locator("section").filter({ hasText: "Satisfaction" }).first();
  await expect(tile).toContainText("4.0 / 5");
  await expect(tile).toContainText("1 rating");
  await logout(page);

  // An open ticket has no form, and staff see ratings but cannot give one.
  await loginAs(page, USERS.ana);
  await page.goto("/tickets/t3");
  await expect(page.getByText("Quick and polite, thanks.")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.goto("/tickets/t1");
  await expect(page.getByRole("heading", { name: "Customer satisfaction" })).toHaveCount(0); // still open

  // The manager's dashboard averages the seeded 5 and Maria's 4.
  await logout(page);
  await loginAs(page, USERS.dina);
  await page.goto("/");
  const managerTile = page.locator("section").filter({ hasText: "Satisfaction" }).first();
  await expect(managerTile).toContainText("4.5 / 5");
  await expect(managerTile).toContainText("2 ratings");
});

test("the seeded rating on a closed ticket is visible to its requester but gives no form", async ({ page }) => {
  await loginAs(page, USERS.carlo);
  await page.goto("/tickets/t4");
  await expect(page.getByText("Fast fix, thank you.")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});
