import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let store: typeof import("@/lib/dataverse/store");
let deliver: typeof import("@/lib/notifications/deliver");
let queue: typeof import("@/lib/notifications/queue");
let mail: typeof import("@/lib/mail");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-deliver-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "deliver.db").replace(/\\/g, "/")}`;
  store = await import("@/lib/dataverse/store");
  deliver = await import("@/lib/notifications/deliver");
  queue = await import("@/lib/notifications/queue");
  mail = await import("@/lib/mail");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setMode(mode: "dev" | "provider" | "off") {
  vi.stubEnv("NODE_ENV", mode === "off" ? "production" : "development");
  vi.stubEnv("RESEND_API_KEY", mode === "provider" ? "re_test_key" : "");
  vi.stubEnv("MAIL_FROM", mode === "provider" ? "Helpdesk <no-reply@example.com>" : "");
  vi.stubEnv("APP_URL", "");
}

/** Empties the outbox, then queues one email per address and returns their subjects. */
async function queueFor(...addresses: string[]) {
  await store.mutate((db) => {
    db.notifications = [];
    addresses.forEach((to, i) => queue.queueMail(db, { to, subject: `Subject ${i}`, body: `Body ${i}`, ticketId: i === 0 ? "t1" : null }));
  });
}
const rows = async () => (await store.readDb(["notifications"])).notifications;
const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });

describe("deliverPending", () => {
  it("in development, delivers into the dev outbox with a link to the ticket, and marks the email sent", async () => {
    setMode("dev");
    await queueFor("person@gmail.com");
    expect(await deliver.deliverPending()).toEqual({ sent: 1, skipped: 0, failed: 0 });

    const [n] = await rows();
    expect(n).toMatchObject({ status: "sent", attempts: 1, lastError: null });
    expect(n.sentAt).not.toBeNull();
    const box = await mail.devOutbox();
    expect(box[0]).toMatchObject({ to: "person@gmail.com", subject: "Subject 0" });
    expect(box[0].body).toContain("Body 0");
    expect(box[0].body).toContain("/tickets/t1");
  });

  it("does not add a link when the email is not about a ticket", async () => {
    setMode("dev");
    await queueFor("a@gmail.com", "b@gmail.com");
    await deliver.deliverPending();
    const box = await mail.devOutbox();
    expect(box.find((m) => m.subject === "Subject 1")!.body).not.toContain("/tickets/");
  });

  it("with a provider, sends through it once and marks the email sent", async () => {
    setMode("provider");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await queueFor("person@gmail.com");

    expect(await deliver.deliverPending()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: ["person@gmail.com"], subject: "Subject 0" });
    expect((await rows())[0].status).toBe("sent");
  });

  it("with a provider, never sends to reserved addresses such as the demo accounts", async () => {
    setMode("provider");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await queueFor("maria@contoso.test", "someone@example.com", "x@foo.invalid");

    expect(await deliver.deliverPending()).toEqual({ sent: 0, skipped: 3, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    const all = await rows();
    expect(all.every((n) => n.status === "skipped" && n.lastError === "Reserved address, never delivered")).toBe(true);
  });

  it("with no provider in production, skips everything with a clear reason and does not retry", async () => {
    setMode("off");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await queueFor("person@gmail.com");
    expect(await deliver.deliverPending()).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await rows())[0]).toMatchObject({ status: "skipped", lastError: "Email is not configured" });
    expect(await deliver.deliverPending()).toEqual({ sent: 0, skipped: 0, failed: 0 }); // nothing left to try
  });

  it("a provider failure is recorded with its reason and retried on the next run", async () => {
    setMode("provider");
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await queueFor("person@gmail.com");

    expect(await deliver.deliverPending()).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect((await rows())[0]).toMatchObject({ status: "failed", attempts: 1 });
    expect((await rows())[0].lastError).toContain("500");
    expect((await rows())[0].lastError).not.toContain("re_test_key"); // the key never reaches the outbox

    expect(await deliver.deliverPending()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect((await rows())[0]).toMatchObject({ status: "sent", attempts: 2, lastError: null });
  });

  it("gives up after five attempts, and only the manager's retry tries again", async () => {
    setMode("provider");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    await queueFor("person@gmail.com");

    for (let i = 0; i < 8; i++) await deliver.deliverPending();
    expect(fetchMock).toHaveBeenCalledTimes(queue.MAX_ATTEMPTS);
    expect((await rows())[0]).toMatchObject({ status: "failed", attempts: queue.MAX_ATTEMPTS });

    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const result = await deliver.retryFailedAndDeliver();
    expect(result).toMatchObject({ requeued: 1, sent: 1 });
    expect((await rows())[0]).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("two workers running at once send each email exactly once", async () => {
    setMode("provider");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await queueFor("a@gmail.com", "b@gmail.com", "c@gmail.com", "d@gmail.com");

    const [first, second] = await Promise.all([deliver.deliverPending(), deliver.deliverPending()]);
    expect(first.sent + second.sent).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new Set(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).to[0])).size).toBe(4);
  });

  it("respects the batch limit and leaves the rest for the next run", async () => {
    setMode("dev");
    await queueFor("a@gmail.com", "b@gmail.com", "c@gmail.com");
    expect((await deliver.deliverPending(2)).sent).toBe(2);
    expect((await rows()).filter((n) => n.status === "pending")).toHaveLength(1);
    expect((await deliver.deliverPending(2)).sent).toBe(1);
  });

  it("sends oldest first", async () => {
    setMode("provider");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await store.mutate((db) => {
      db.notifications = [];
      queue.queueMail(db, { to: "second@gmail.com", subject: "s", body: "" }, Date.now());
      queue.queueMail(db, { to: "first@gmail.com", subject: "f", body: "" }, Date.now() - 60_000);
    });
    await deliver.deliverPending();
    expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).to[0])).toEqual(["first@gmail.com", "second@gmail.com"]);
  });
});

describe("the outbox is transactional", () => {
  it("an email queued by a change that rolls back is never saved, so it can never be sent", async () => {
    setMode("provider");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await queueFor(); // empty outbox

    await expect(
      store.mutate((db) => {
        queue.queueMail(db, { to: "person@gmail.com", subject: "Should not exist", body: "" });
        db.tickets[0].title = "Changed in the same step";
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");

    expect(await rows()).toEqual([]);
    expect(await deliver.deliverPending()).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await store.readDb(["tickets"])).tickets[0].title).not.toBe("Changed in the same step");
  });

  it("an email queued by a change that commits is saved together with it", async () => {
    await queueFor();
    await store.mutate((db) => {
      db.tickets[0].title = "Saved together";
      queue.queueMail(db, { to: "person@gmail.com", subject: "With the change", body: "" });
    });
    expect((await store.readDb(["tickets"])).tickets[0].title).toBe("Saved together");
    expect((await rows()).map((n) => n.subject)).toEqual(["With the change"]);
  });

  it("delivery marking is not undone by a later save of other data", async () => {
    setMode("dev");
    await queueFor("person@gmail.com");
    await deliver.deliverPending();
    await store.mutate((db) => {
      db.tickets[0].title = "Unrelated change";
    });
    expect((await rows())[0].status).toBe("sent");
  });
});

describe("isReservedAddress", () => {
  it("matches reserved names and the example domains, in any case, and nothing else", () => {
    for (const a of ["maria@contoso.test", "a@b.example", "a@b.invalid", "a@host.localhost", "x@example.com", "x@EXAMPLE.ORG", "  y@example.net "]) {
      expect(deliver.isReservedAddress(a)).toBe(true);
    }
    for (const a of ["person@gmail.com", "x@mytest.com", "x@contoso.com", "x@example.com.au", "x@notexample.com"]) {
      expect(deliver.isReservedAddress(a)).toBe(false);
    }
  });
});
