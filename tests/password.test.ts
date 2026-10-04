import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

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
