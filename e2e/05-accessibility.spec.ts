import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

// Automated checks catch roughly a third of accessibility problems (missing labels, contrast, roles,
// landmarks). They do not replace keyboard and screen reader testing. Only serious and critical
// violations fail the run, so the list below stays a hard floor rather than a wish list.
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(summary, `accessibility violations on ${page.url()}`).toEqual([]);
}

test("public pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/login", "/register", "/forgot-password"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
});

test("employee pages have no serious accessibility violations", async ({ page }) => {
  await loginAs(page, USERS.maria);
  for (const path of ["/", "/tickets", "/tickets/new", "/tickets/t1", "/assets", "/requests", "/flows", "/account"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
});

test("staff and manager pages have no serious accessibility violations", async ({ page }) => {
  await loginAs(page, USERS.dina);
  for (const path of ["/tickets/t1", "/assets", "/flows", "/admin/users", "/admin/categories"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
  await logout(page);
});

test("the page can be used with the keyboard alone: skip to the sign-in form and submit", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab"); // brand link
  await page.keyboard.press("Tab"); // email
  await page.keyboard.type(USERS.maria);
  await page.keyboard.press("Tab");
  await page.keyboard.type("helpdesk-demo");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await logout(page);
});
