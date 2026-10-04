import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PASSWORD = "test-password-123";
let creds: typeof import("@/lib/auth/credentials");
let sessions: typeof import("@/lib/auth/sessions");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-accounts-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "accounts.db").replace(/\\/g, "/")}`;
  process.env.DEMO_PASSWORD = PASSWORD;
  creds = await import("@/lib/auth/credentials");
  sessions = await import("@/lib/auth/sessions");
});

const person = (email: string) => ({ name: "Pat Lee", email, department: "IT", password: "initial-pass-1" });

describe("createAccount (admin path)", () => {
  it("creates an agent or manager when the caller asks for it", async () => {
    const a = await creds.createAccount(person("agent1@example.com"), "agent");
    const m = await creds.createAccount(person("mgr1@example.com"), "manager");
    expect(a.ok && a.user.role).toBe("agent");
    expect(m.ok && m.user.role).toBe("manager");
    expect(await creds.authenticate("agent1@example.com", "initial-pass-1")).toMatchObject({ role: "agent" });
  });

  it("public registerUser still only ever creates employees", async () => {
    const r = await creds.registerUser(person("someone@example.com"));
    expect(r.ok && r.user.role).toBe("employee");
  });
});

describe("setPassword (admin reset)", () => {
  it("replaces the password, signs the user out everywhere, and keeps other users signed in", async () => {
    const r = await creds.createAccount(person("reset-me@example.com"), "employee");
    const other = await creds.createAccount(person("bystander@example.com"), "employee");
    if (!r.ok || !other.ok) throw new Error("setup failed");
    const token = await sessions.createSession(r.user.id);
    const otherToken = await sessions.createSession(other.user.id);

    expect(await creds.setPassword(r.user.id, "brand-new-pass-2")).toEqual({ ok: true });

    expect(await creds.authenticate("reset-me@example.com", "initial-pass-1")).toBeNull();
    expect(await creds.authenticate("reset-me@example.com", "brand-new-pass-2")).not.toBeNull();
    expect(await sessions.getSessionUser(token)).toBeNull();
    expect(await sessions.getSessionUser(otherToken)).not.toBeNull();
  });

  it("rejects a weak password and an unknown account", async () => {
    const r = await creds.createAccount(person("weak@example.com"), "employee");
    if (!r.ok) throw new Error("setup failed");
    expect(await creds.setPassword(r.user.id, "short")).toMatchObject({ ok: false });
    expect(await creds.authenticate("weak@example.com", "initial-pass-1")).not.toBeNull();
    expect(await creds.setPassword("no-such-user", "long-enough-pass")).toMatchObject({ ok: false });
  });
});

describe("deactivated accounts", () => {
  async function deactivate(userId: string) {
    const { getDb } = await import("@/lib/dataverse/db");
    await (await getDb()).execute({ sql: "UPDATE users SET active = 0 WHERE id = ?", args: [userId] });
  }

  it("cannot sign in, with the same answer as a wrong password", async () => {
    const r = await creds.createAccount(person("gone@example.com"), "agent");
    if (!r.ok) throw new Error("setup failed");
    expect(await creds.authenticate("gone@example.com", "initial-pass-1")).not.toBeNull();
    await deactivate(r.user.id);
    expect(await creds.authenticate("gone@example.com", "initial-pass-1")).toBeNull();
  });

  it("loses an existing session immediately", async () => {
    const r = await creds.createAccount(person("kicked@example.com"), "agent");
    if (!r.ok) throw new Error("setup failed");
    const token = await sessions.createSession(r.user.id);
    expect(await sessions.getSessionUser(token)).not.toBeNull();
    await deactivate(r.user.id);
    expect(await sessions.getSessionUser(token)).toBeNull();
  });
});

describe("changeOwnPassword", () => {
  async function setup(email: string) {
    const r = await creds.createAccount(person(email), "employee");
    if (!r.ok) throw new Error("setup failed");
    return r.user;
  }

  it("changes the password and keeps only the current session", async () => {
    const u = await setup("self1@example.com");
    const current = await sessions.createSession(u.id);
    const other = await sessions.createSession(u.id);

    expect(await creds.changeOwnPassword(u.id, "initial-pass-1", "a-new-password-9", current)).toEqual({ ok: true });

    expect(await creds.authenticate("self1@example.com", "a-new-password-9")).not.toBeNull();
    expect(await creds.authenticate("self1@example.com", "initial-pass-1")).toBeNull();
    expect(await sessions.getSessionUser(current)).not.toBeNull();
    expect(await sessions.getSessionUser(other)).toBeNull();
  });

  it("requires the correct current password", async () => {
    const u = await setup("self2@example.com");
    expect(await creds.changeOwnPassword(u.id, "wrong-guess-123", "a-new-password-9")).toMatchObject({ ok: false });
    expect(await creds.authenticate("self2@example.com", "initial-pass-1")).not.toBeNull();
  });

  it("rejects a weak or unchanged new password", async () => {
    const u = await setup("self3@example.com");
    expect(await creds.changeOwnPassword(u.id, "initial-pass-1", "short")).toMatchObject({ ok: false });
    expect(await creds.changeOwnPassword(u.id, "initial-pass-1", "initial-pass-1")).toMatchObject({ ok: false });
  });
});
