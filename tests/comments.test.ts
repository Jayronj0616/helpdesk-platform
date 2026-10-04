import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { addComment, addSystemEntry, filterVisible, visibleComments } from "@/lib/dataverse/comments";

describe("visibleComments", () => {
  const db = seedDatabase();

  it("hides internal notes from employees", () => {
    const thread = visibleComments(db, "t1", false);
    expect(thread.some((c) => c.internal)).toBe(false);
    expect(thread).toHaveLength(2);
  });

  it("shows internal notes to staff", () => {
    const thread = visibleComments(db, "t1", true);
    expect(thread.some((c) => c.internal)).toBe(true);
    expect(thread).toHaveLength(3);
  });

  it("only returns comments for the requested ticket", () => {
    expect(visibleComments(db, "t2", true).every((c) => c.ticketId === "t2")).toBe(true);
  });

  it("returns the thread oldest first", () => {
    const times = visibleComments(db, "t1", true).map((c) => c.createdAt);
    expect(times).toEqual([...times].sort());
  });
});

describe("adding entries", () => {
  it("addComment stores an authored comment", () => {
    const db = seedDatabase();
    const before = db.comments.length;
    addComment(db, { ticketId: "t5", authorId: "u1", body: "Hello", internal: false });
    const c = db.comments.at(-1)!;
    expect(db.comments).toHaveLength(before + 1);
    expect(c).toMatchObject({ ticketId: "t5", authorId: "u1", kind: "comment", internal: false });
  });

  it("addSystemEntry records a public entry without an author", () => {
    const db = seedDatabase();
    addSystemEntry(db, "t5", "Status changed");
    expect(db.comments.at(-1)).toMatchObject({ kind: "system", authorId: null, internal: false, body: "Status changed" });
  });
});

describe("filterVisible", () => {
  const db = seedDatabase();
  const thread = db.comments.filter((c) => c.ticketId === "t1");

  it("removes internal notes for employees and keeps everything for staff", () => {
    expect(filterVisible(thread, false).some((c) => c.internal)).toBe(false);
    expect(filterVisible(thread, true)).toHaveLength(thread.length);
  });

  it("sorts oldest first whatever order the comments arrive in, without changing the input", () => {
    const reversed = [...thread].reverse();
    const out = filterVisible(reversed, true);
    expect(out.map((c) => c.createdAt)).toEqual([...out.map((c) => c.createdAt)].sort());
    expect(reversed.map((c) => c.id)).toEqual([...thread].reverse().map((c) => c.id));
  });

  it("agrees with visibleComments, which is built on it", () => {
    expect(visibleComments(db, "t1", false)).toEqual(filterVisible(thread, false));
  });
});
