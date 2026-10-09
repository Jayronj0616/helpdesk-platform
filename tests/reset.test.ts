import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PASSWORD = "test-password-123";
const MINUTE = 60_000;
let reset: typeof import("@/lib/auth/reset");
let creds: typeof import("@/lib/auth/credentials");
let sessions: typeof import("@/lib/auth/sessions");
let dbmod: typeof import("@/lib/dataverse/db");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-reset-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "reset.db").replace(/\\/g, "/")}`;
  process.env.DEMO_PASSWORD = PASSWORD;
  reset = await import("@/lib/auth/reset");
  creds = await import("@/lib/auth/credentials");
  sessions = await import("@/lib/auth/sessions");
  dbmod = await import("@/lib/dataverse/db");
});

async function newUser(email: string) {
  const r = await creds.createAccount({ name: "Pat Lee", email, department: "IT", password: "initial-pass-1" }, "employee");
  if (!r.ok) throw new Error("setup failed");
  return r.user;
}

describe("createResetToken", () => {
  it("issues a token for an active account, matching the email in any case", async () => {
    const created = await reset.createResetToken("  MARIA@contoso.TEST ");
    expect(created?.user.id).toBe("u1");
    expect(created?.token.length).toBeGreaterThan(30);
  });

  it("returns null for an unknown email and for a deactivated account", async () => {
    expect(await reset.createResetToken("nobody@example.com")).toBeNull();
    await (await dbmod.getDb()).execute("UPDATE users SET active = 0 WHERE id = 'u2'");
    expect(await reset.createResetToken("carlo@contoso.test")).toBeNull();
    await (await dbmod.getDb()).execute("UPDATE users SET active = 1 WHERE id = 'u2'");
  });

  it("stores only a hash of the token", async () => {
    const created = await reset.createResetToken("ana@contoso.test");
    const rows = (await (await dbmod.getDb()).execute("SELECT token_hash FROM auth_reset_tokens")).rows;
    expect(rows.some((r) => String(r.token_hash) === created!.token)).toBe(false);
    for (const r of rows) expect(String(r.token_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replaces an earlier link when a new one is requested", async () => {
    const first = await reset.createResetToken("ben@contoso.test");
    const second = await reset.createResetToken("ben@contoso.test");
    expect(await reset.isResetTokenValid(first!.token)).toBe(false);
    expect(await reset.isResetTokenValid(second!.token)).toBe(true);
  });
});

describe("isResetTokenValid", () => {
  it("accepts a fresh token and rejects garbage and expired tokens", async () => {
    const t = await reset.createResetToken("dina@contoso.test", 1_000);
    expect(await reset.isResetTokenValid(t!.token, 1_000 + 5 * MINUTE)).toBe(true);
    expect(await reset.isResetTokenValid(t!.token, 1_000 + (reset.RESET_TOKEN_MINUTES + 1) * MINUTE)).toBe(false);
    expect(await reset.isResetTokenValid("not-a-token")).toBe(false);
  });
});

describe("consumeResetToken", () => {
  it("sets the new password, kills the old one, and signs the user out everywhere", async () => {
    const u = await newUser("reset1@example.com");
    const session = await sessions.createSession(u.id);
    const t = await reset.createResetToken("reset1@example.com");

    expect(await reset.consumeResetToken(t!.token, "a-brand-new-pass-9")).toMatchObject({ ok: true });

    expect(await creds.authenticate("reset1@example.com", "a-brand-new-pass-9")).not.toBeNull();
    expect(await creds.authenticate("reset1@example.com", "initial-pass-1")).toBeNull();
    expect(await sessions.getSessionUser(session)).toBeNull();
  });

  it("works only once", async () => {
    await newUser("reset2@example.com");
    const t = await reset.createResetToken("reset2@example.com");
    expect(await reset.consumeResetToken(t!.token, "first-new-pass-1")).toMatchObject({ ok: true });
    expect(await reset.consumeResetToken(t!.token, "second-new-pass-2")).toMatchObject({ ok: false });
    expect(await creds.authenticate("reset2@example.com", "first-new-pass-1")).not.toBeNull();
    expect(await creds.authenticate("reset2@example.com", "second-new-pass-2")).toBeNull();
  });

  it("lets only one of two simultaneous requests with the same link succeed", async () => {
    await newUser("race@example.com");
    const t = await reset.createResetToken("race@example.com");
    const results = await Promise.all([reset.consumeResetToken(t!.token, "race-pass-one-1"), reset.consumeResetToken(t!.token, "race-pass-two-2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rejects an expired token", async () => {
    await newUser("expired@example.com");
    const t = await reset.createResetToken("expired@example.com", 1_000);
    const late = 1_000 + (reset.RESET_TOKEN_MINUTES + 1) * MINUTE;
    expect(await reset.consumeResetToken(t!.token, "too-late-pass-1", late)).toMatchObject({ ok: false });
    expect(await creds.authenticate("expired@example.com", "too-late-pass-1")).toBeNull();
  });

  it("rejects a weak password without using up the link", async () => {
    await newUser("weak@example.com");
    const t = await reset.createResetToken("weak@example.com");
    expect(await reset.consumeResetToken(t!.token, "short")).toMatchObject({ ok: false });
    expect(await reset.isResetTokenValid(t!.token)).toBe(true);
    expect(await reset.consumeResetToken(t!.token, "long-enough-pass-1")).toMatchObject({ ok: true });
  });

  it("rejects an unknown token", async () => {
    expect(await reset.consumeResetToken("made-up-token", "long-enough-pass-1")).toMatchObject({ ok: false });
  });

  it("stops working if the account is deactivated after the link was sent", async () => {
    const u = await newUser("late-deactivate@example.com");
    const t = await reset.createResetToken("late-deactivate@example.com");
    await (await dbmod.getDb()).execute({ sql: "UPDATE users SET active = 0 WHERE id = ?", args: [u.id] });
    expect(await reset.isResetTokenValid(t!.token)).toBe(false);
    expect(await reset.consumeResetToken(t!.token, "long-enough-pass-1")).toMatchObject({ ok: false });
  });

  it("is cancelled by a password change made another way", async () => {
    const u = await newUser("changed@example.com");
    const t1 = await reset.createResetToken("changed@example.com");
    await creds.setPassword(u.id, "admin-set-pass-1");
    expect(await reset.isResetTokenValid(t1!.token)).toBe(false);

    const t2 = await reset.createResetToken("changed@example.com");
    expect(await creds.changeOwnPassword(u.id, "admin-set-pass-1", "self-set-pass-2")).toMatchObject({ ok: true });
    expect(await reset.isResetTokenValid(t2!.token)).toBe(false);
  });
});
