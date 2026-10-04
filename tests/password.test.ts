import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createLimiter } from "@/lib/auth/rate-limit";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery", h)).toBe(false);
  });

  it("uses a random salt, so equal passwords hash differently", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("never stores the plain password", async () => {
    expect(await hashPassword("plain-text-secret")).not.toContain("plain-text-secret");
  });

  it("rejects tampered or malformed hashes", async () => {
    const h = await hashPassword("password123");
    // Change the first character of the hash itself (the last one is base64 padding and changes nothing).
    const parts = h.split("$");
    parts[5] = (parts[5][0] === "A" ? "B" : "A") + parts[5].slice(1);
    const tampered = parts.join("$");
    expect(await verifyPassword("password123", tampered)).toBe(false);
    expect(await verifyPassword("password123", "")).toBe(false);
    expect(await verifyPassword("password123", "bcrypt$10$abc$def")).toBe(false);
  });
});

describe("login rate limiter", () => {
  it("allows up to max attempts in the window, then blocks", () => {
    const l = createLimiter(3, 1000);
    expect([1, 2, 3, 4].map((i) => l.attempt("k", i))).toEqual([true, true, true, false]);
  });

  it("tracks keys independently", () => {
    const l = createLimiter(1, 1000);
    expect(l.attempt("a", 0)).toBe(true);
    expect(l.attempt("b", 0)).toBe(true);
    expect(l.attempt("a", 1)).toBe(false);
  });

  it("allows attempts again once the window has passed", () => {
    const l = createLimiter(1, 1000);
    l.attempt("k", 0);
    expect(l.attempt("k", 500)).toBe(false);
    expect(l.attempt("k", 2000)).toBe(true);
  });

  it("reset clears a key after a successful sign-in", () => {
    const l = createLimiter(1, 1000);
    l.attempt("k", 0);
    l.reset("k");
    expect(l.attempt("k", 1)).toBe(true);
  });
});
