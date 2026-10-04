import { expect, type Page } from "@playwright/test";

export const PASSWORD = "helpdesk-demo";

export const USERS = {
  maria: "maria@contoso.test", // employee
  carlo: "carlo@contoso.test", // employee
  ana: "ana@contoso.test", // agent
  ben: "ben@contoso.test", // agent
  dina: "dina@contoso.test", // manager
} as const;

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function loginAs(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
