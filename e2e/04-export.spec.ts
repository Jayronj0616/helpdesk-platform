import { expect, test } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

test("staff can export the tickets they are looking at, and employees cannot", async ({ page }) => {
  // an employee raises a ticket whose title is a spreadsheet formula
  await loginAs(page, USERS.maria);
  await page.goto("/tickets/new");
  await page.getByLabel("Title").fill('=HYPERLINK("http://evil.example","click")');
  await page.getByRole("button", { name: "Submit ticket" }).click();
  await expect(page.getByText(/Ticket #\d+ created\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  expect((await page.request.get("/tickets/export")).status()).toBe(403);
  await logout(page);

  expect((await page.request.get("/tickets/export")).status()).toBe(401);

  await loginAs(page, USERS.ana);
  await page.goto("/tickets?q=vpn");
  const link = page.getByRole("link", { name: "Export CSV" });
  await expect(link).toHaveAttribute("href", "/tickets/export?q=vpn");

  const filtered = await page.request.get("/tickets/export?q=vpn");
  expect(filtered.status()).toBe(200);
  expect(filtered.headers()["content-type"]).toContain("text/csv");
  expect(filtered.headers()["content-disposition"]).toContain("attachment");
  const vpn = (await filtered.text()).trim().split("\r\n");
  expect(vpn).toHaveLength(2);
  expect(vpn[1]).toContain("Cannot connect to VPN");

  const all = await (await page.request.get("/tickets/export")).text();
  expect(all).toContain("'=HYPERLINK"); // neutralised, so a spreadsheet shows it as text
  expect(all).not.toMatch(/(^|,)=HYPERLINK/m);

  // the button downloads a real file in the browser
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toMatch(/^tickets-\d{4}-\d{2}-\d{2}\.csv$/);
});
