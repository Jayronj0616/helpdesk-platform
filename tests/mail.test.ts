import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let mail: typeof import("@/lib/mail");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-mail-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "mail.db").replace(/\\/g, "/")}`;
  mail = await import("@/lib/mail");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Start every test from "no email settings, development".
function clean(env: Record<string, string> = {}) {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("MAIL_FROM", "");
  vi.stubEnv("APP_URL", "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

describe("mailMode", () => {
  it("is dev with no provider outside production", () => {
    clean();
    expect(mail.mailMode()).toBe("dev");
  });
  it("is off with no provider in production", () => {
    clean({ NODE_ENV: "production" });
    expect(mail.mailMode()).toBe("off");
  });
  it("is provider only when both the key and the sender are set", () => {
    clean({ RESEND_API_KEY: "re_test" });
    expect(mail.mailMode()).toBe("dev");
    clean({ RESEND_API_KEY: "re_test", MAIL_FROM: "Helpdesk <no-reply@example.com>" });
    expect(mail.mailMode()).toBe("provider");
    clean({ NODE_ENV: "production", RESEND_API_KEY: "re_test", MAIL_FROM: "x@example.com" });
    expect(mail.mailMode()).toBe("provider");
  });
});

describe("appUrl", () => {
  it("prefers APP_URL and trims trailing slashes", () => {
    clean({ APP_URL: "https://help.example.com//" });
    expect(mail.appUrl("evil.example", "https")).toBe("https://help.example.com");
  });
  it("never builds links from the request host in production, which would allow reset link poisoning", () => {
    clean({ NODE_ENV: "production" });
    expect(mail.appUrl("evil.example", "https")).toBeNull();
  });
  it("derives the address from the request in development, defaulting to localhost", () => {
    clean();
    expect(mail.appUrl("localhost:3100", "http")).toBe("http://localhost:3100");
    expect(mail.appUrl("localhost:3100")).toBe("http://localhost:3100");
    expect(mail.appUrl()).toBe("http://localhost:3000");
  });
});

describe("passwordResetAvailable", () => {
  it("is on in development", () => {
    clean();
    expect(mail.passwordResetAvailable()).toBe(true);
  });
  it("is off in production without a provider", () => {
    clean({ NODE_ENV: "production", APP_URL: "https://help.example.com" });
    expect(mail.passwordResetAvailable()).toBe(false);
  });
  it("is off in production with a provider but no fixed APP_URL", () => {
    clean({ NODE_ENV: "production", RESEND_API_KEY: "k", MAIL_FROM: "a@example.com" });
    expect(mail.passwordResetAvailable()).toBe(false);
  });
  it("is on in production with a provider and APP_URL", () => {
    clean({ NODE_ENV: "production", RESEND_API_KEY: "k", MAIL_FROM: "a@example.com", APP_URL: "https://help.example.com" });
    expect(mail.passwordResetAvailable()).toBe(true);
  });
});

describe("sendMail", () => {
  const message = { to: "maria@contoso.test", subject: "Hello", text: "Body text" };

  it("stores the message in the dev outbox when there is no provider", async () => {
    clean();
    await mail.sendMail(message);
    const box = await mail.devOutbox();
    expect(box[0]).toMatchObject({ to: "maria@contoso.test", subject: "Hello", body: "Body text" });
  });

  it("posts to Resend with the key as a bearer token when a provider is set", async () => {
    clean({ RESEND_API_KEY: "re_secret_key", MAIL_FROM: "Helpdesk <no-reply@example.com>" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await mail.sendMail(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_secret_key");
    expect(JSON.parse(init.body)).toEqual({ from: "Helpdesk <no-reply@example.com>", to: ["maria@contoso.test"], subject: "Hello", text: "Body text" });
  });

  it("throws, without leaking the key, when the provider rejects the message", async () => {
    clean({ RESEND_API_KEY: "re_secret_key", MAIL_FROM: "a@example.com" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    const err = await mail.sendMail(message).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("422");
    expect((err as Error).message).not.toContain("re_secret_key");
  });

  it("refuses to send in production with no provider", async () => {
    clean({ NODE_ENV: "production" });
    await expect(mail.sendMail(message)).rejects.toThrow(/not configured/);
  });
});
