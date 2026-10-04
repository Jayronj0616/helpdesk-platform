import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, login, loginAs } from "./helpers";

// With no email provider configured in development, mail is kept in the database and shown on /dev/outbox.
async function latestMailTo(page: Page, address: string): Promise<string> {
  let body = "";
  await expect(async () => {
    await page.goto("/dev/outbox");
    const card = page.locator("section").filter({ hasText: `To ${address}` }).first();
    await expect(card).toBeVisible();
    body = await card.locator("pre").innerText();
  }).toPass({ timeout: 15_000 });
  return body;
}

const linkIn = (body: string) => body.match(/https?:\/\/\S+\/reset-password\/\S+/)![0];

test("the login page links to password reset", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
});

test("asking for a reset gives the same answer for a real and an unknown email, and only emails the real one", async ({ page }) => {
  const same = "If an account exists for that email, we have sent a link to reset the password.";
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(USERS.ben);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(same);

  await page.getByLabel("Email").fill("nobody-at-all@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(same);

  await latestMailTo(page, USERS.ben);
  await page.goto("/dev/outbox");
  await expect(page.getByText("To nobody-at-all@example.com")).toHaveCount(0);
});

test("the full reset: link, weak password rejected, new password works, old one and old sessions die, link is single-use", async ({ page, browser }) => {
  // Ben is signed in on another device when the reset happens.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await loginAs(otherPage, USERS.ben);

  const body = await latestMailTo(page, USERS.ben);
  expect(body).toContain("Hi Ben Lim,");
  const link = linkIn(body);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

  // A too-short password is refused and the link survives.
  await page.getByLabel("New password").fill("short1");
  await page.getByRole("button", { name: "Set new password" }).click();
  // (the browser's own minlength check stops a short value before the server sees it)
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

  await page.getByLabel("New password").fill("ben-reset-pass-1");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

  await login(page, USERS.ben, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await loginAs(page, USERS.ben, "ben-reset-pass-1");

  // The other device was signed out by the reset.
  await otherPage.goto("http://localhost:3210/tickets");
  await expect(otherPage).toHaveURL(/\/login$/);
  await other.close();

  // The same link cannot be used again, signed in or not.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
});

test("a made-up link shows the same friendly page", async ({ page }) => {
  await page.goto("/reset-password/this-is-not-a-real-token");
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
  await page.getByRole("link", { name: "Request a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("the dev outbox is reachable here because no email provider is configured", async ({ page }) => {
  await page.goto("/dev/outbox");
  await expect(page.getByRole("heading", { name: "Dev outbox" })).toBeVisible();
});
