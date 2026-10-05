import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, loginAs, logout } from "./helpers";

// The app is light-only. These run with the browser told the device prefers dark mode, which is how a
// colour problem that the normal (light) test runs cannot see showed up: a near-black page with dark text.

// Browsers report modern colours as lab(...) or oklch(...), so let the browser turn one into plain RGB
// (by painting it on a canvas) and work out its relative luminance there, 0 = black and 1 = white.
const LUMINANCE_OF = `(css) => {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.canvas.width = ctx.canvas.height = 1;
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}`;

async function luminanceOf(page: Page, target: Locator | "body", property: "backgroundColor" | "color") {
  const css = target === "body"
    ? await page.evaluate((p) => getComputedStyle(document.body)[p as "color"], property)
    : await target.evaluate((el, p) => getComputedStyle(el)[p as "color"], property);
  return page.evaluate(`(${LUMINANCE_OF})(${JSON.stringify(css)})`) as Promise<number>;
}

test.describe("on a device set to dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("the page stays light with dark, readable text", async ({ page }) => {
    await page.goto("/login");
    expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true); // the emulation worked
    expect(await luminanceOf(page, "body", "backgroundColor")).toBeGreaterThan(0.85); // light page
    expect(await luminanceOf(page, "body", "color")).toBeLessThan(0.1); // dark text
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  });

  test("form controls are drawn light too", async ({ page }) => {
    await page.goto("/login");
    for (const field of [page.getByLabel("Email"), page.getByLabel("Password")]) {
      expect(await luminanceOf(page, field, "backgroundColor")).toBeGreaterThan(0.85);
      expect(await luminanceOf(page, field, "color")).toBeLessThan(0.1);
    }
  });

  test("text keeps enough contrast on the sign-in page and signed-in pages", async ({ page }) => {
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    }
    await loginAs(page, USERS.dina);
    for (const path of ["/", "/tickets", "/tickets/t1"]) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    }
    await logout(page);
  });

  test("the app font is applied, not the browser default", async ({ page }) => {
    await page.goto("/login");
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family.toLowerCase()).toContain("geist");
  });
});

test("the same holds on a light device (the default for every other test)", async ({ page }) => {
  await page.goto("/login");
  expect(await luminanceOf(page, "body", "backgroundColor")).toBeGreaterThan(0.85);
  expect(await luminanceOf(page, "body", "color")).toBeLessThan(0.1);
});
