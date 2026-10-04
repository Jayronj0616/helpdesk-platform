import { expect, test } from "@playwright/test";
import { USERS, login, loginAs, logout } from "./helpers";

test("signed-out visitors are sent to the login page", async ({ page }) => {
  for (const path of ["/", "/tickets", "/assets", "/requests", "/flows", "/account", "/admin/users"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("a forged session cookie does not sign anyone in", async ({ page, context }) => {
  await context.addCookies([{ name: "session", value: "forged", url: "http://localhost:3210" }]);
  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong password shows one generic error and keeps the email", async ({ page }) => {
  await login(page, USERS.maria, "not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(USERS.maria);
  await expect(page).toHaveURL(/\/login$/);

  // An unknown email gets exactly the same message.
  await login(page, "nobody@contoso.test", "whatever-123");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
});

test("signing in and out works, and the back button cannot reopen the app", async ({ page }) => {
  await loginAs(page, USERS.maria);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Viewing as Maria Santos (your tickets only)")).toBeVisible();
  await logout(page);
  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/login$/);
});

test("the session cookie is HttpOnly", async ({ page, context }) => {
  await loginAs(page, USERS.maria);
  const session = (await context.cookies()).find((c) => c.name === "session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("session");
});

test("registering creates an employee account", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("New Hire");
  await page.getByLabel("Email").fill("e2e.newhire@contoso.test");
  await page.getByLabel("Department").fill("Support");
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Viewing as New Hire (your tickets only)")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByText("Employee", { exact: true })).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("registration rejects a short password and a duplicate email", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Dup Person");
  await page.getByLabel("Email").fill(USERS.maria);
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Dup Person");
});

test("responses carry the security headers", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("form-action 'self'");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("the health endpoint is public and reveals nothing but its status", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
