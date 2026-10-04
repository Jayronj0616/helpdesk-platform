import { describe, expect, it } from "vitest";
import { seedDatabase } from "@/lib/dataverse/seed";
import { changeUserRole, createAsset, requestTypes, setUserActive, updateAsset, updateProfile } from "@/lib/dataverse/admin";

const asset = (over: Partial<Parameters<typeof createAsset>[1]> = {}) => ({ tag: "LT-0042", name: "ThinkPad X1", type: "Laptop", purchasedAt: "2026-01-15", ...over });

describe("changeUserRole", () => {
  it("promotes an employee to agent", () => {
    const db = seedDatabase();
    expect(changeUserRole(db, "u5", "u1", "agent")).toMatchObject({ ok: true });
    expect(db.users.find((u) => u.id === "u1")!.role).toBe("agent");
  });

  it("refuses to change your own role, so the last manager cannot lock everyone out", () => {
    const db = seedDatabase();
    expect(changeUserRole(db, "u5", "u5", "employee")).toMatchObject({ ok: false });
    expect(db.users.find((u) => u.id === "u5")!.role).toBe("manager");
  });

  it("refuses when the actor is not a manager, even if the caller says otherwise", () => {
    const db = seedDatabase();
    expect(changeUserRole(db, "u3", "u1", "manager")).toMatchObject({ ok: false });
    expect(db.users.find((u) => u.id === "u1")!.role).toBe("employee");
  });

  it("rejects an unknown role and an unknown user", () => {
    const db = seedDatabase();
    expect(changeUserRole(db, "u5", "u1", "superadmin")).toMatchObject({ ok: false });
    expect(changeUserRole(db, "u5", "nobody", "agent")).toMatchObject({ ok: false });
  });

  it("unassigns open tickets, with an audit entry, when an agent is demoted to employee", () => {
    const db = seedDatabase(); // Ana (u3) has open tickets 1001 and 1006, and a resolved one (1003)
    const result = changeUserRole(db, "u5", "u3", "employee");
    expect(result).toMatchObject({ ok: true, unassigned: 2 });
    const byNumber = (n: number) => db.tickets.find((t) => t.number === n)!;
    expect(byNumber(1001).assigneeId).toBeNull();
    expect(byNumber(1006).assigneeId).toBeNull();
    expect(byNumber(1003).assigneeId).toBe("u3"); // resolved tickets keep their history
    expect(db.comments.some((c) => c.ticketId === "t1" && c.kind === "system" && c.body.includes("unassigned"))).toBe(true);
  });

  it("does nothing when the role is unchanged", () => {
    const db = seedDatabase();
    expect(changeUserRole(db, "u5", "u3", "agent")).toMatchObject({ ok: true, unassigned: 0 });
    expect(db.tickets.find((t) => t.number === 1001)!.assigneeId).toBe("u3");
  });
});

describe("setUserActive", () => {
  it("deactivates a user and unassigns their open tickets with an audit entry", () => {
    const db = seedDatabase();
    expect(setUserActive(db, "u5", "u3", false)).toMatchObject({ ok: true, unassigned: 2 });
    expect(db.users.find((u) => u.id === "u3")!.active).toBe(false);
    expect(db.tickets.find((t) => t.number === 1001)!.assigneeId).toBeNull();
    expect(db.tickets.find((t) => t.number === 1003)!.assigneeId).toBe("u3"); // resolved: history kept
    expect(db.comments.some((c) => c.ticketId === "t1" && c.body.includes("deactivated"))).toBe(true);
  });

  it("reactivates without touching tickets", () => {
    const db = seedDatabase();
    setUserActive(db, "u5", "u3", false);
    expect(setUserActive(db, "u5", "u3", true)).toMatchObject({ ok: true, unassigned: 0 });
    expect(db.users.find((u) => u.id === "u3")!.active).toBe(true);
  });

  it("refuses to let a manager deactivate themselves", () => {
    const db = seedDatabase();
    expect(setUserActive(db, "u5", "u5", false)).toMatchObject({ ok: false });
    expect(db.users.find((u) => u.id === "u5")!.active).toBe(true);
  });

  it("refuses non-managers, unknown users, and deactivated managers", () => {
    const db = seedDatabase();
    expect(setUserActive(db, "u3", "u1", false)).toMatchObject({ ok: false });
    expect(setUserActive(db, "u5", "ghost", false)).toMatchObject({ ok: false });
    db.users.find((u) => u.id === "u5")!.active = false;
    expect(setUserActive(db, "u5", "u1", false)).toMatchObject({ ok: false });
    expect(changeUserRole(db, "u5", "u1", "agent")).toMatchObject({ ok: false });
  });
});

describe("createAsset", () => {
  it("adds an available asset with a normalised tag", () => {
    const db = seedDatabase();
    const r = createAsset(db, asset({ tag: " lt-0042 " }));
    expect(r.ok).toBe(true);
    expect(db.assets.at(-1)).toMatchObject({ tag: "LT-0042", status: "available", assignedToId: null, purchasedAt: "2026-01-15" });
  });

  it("rejects a duplicate tag", () => {
    const db = seedDatabase();
    expect(createAsset(db, asset({ tag: "lt-0001" }))).toMatchObject({ ok: false });
  });

  it("rejects bad tags, names, types and dates", () => {
    const db = seedDatabase();
    for (const bad of [{ tag: "x" }, { tag: "has space" }, { tag: "" }, { name: " " }, { type: "" }, { purchasedAt: "15/01/2026" }, { purchasedAt: "2026-13-45" }]) {
      expect(createAsset(db, asset(bad))).toMatchObject({ ok: false });
    }
    expect(db.assets).toHaveLength(7);
  });

  it("defaults the purchase date to today", () => {
    const db = seedDatabase();
    createAsset(db, asset({ purchasedAt: "" }), "2026-10-04");
    expect(db.assets.at(-1)!.purchasedAt).toBe("2026-10-04");
  });

  it("reuses the spelling of an existing type", () => {
    const db = seedDatabase();
    createAsset(db, asset({ type: "laptop" }));
    expect(db.assets.at(-1)!.type).toBe("Laptop");
  });
});

describe("updateAsset", () => {
  it("assigns an asset to a user", () => {
    const db = seedDatabase();
    expect(updateAsset(db, "a2", "assigned", "u2")).toMatchObject({ ok: true });
    expect(db.assets.find((a) => a.id === "a2")).toMatchObject({ status: "assigned", assignedToId: "u2" });
  });

  it("requires a holder for assigned assets", () => {
    const db = seedDatabase();
    expect(updateAsset(db, "a2", "assigned", "")).toMatchObject({ ok: false });
    expect(updateAsset(db, "a2", "assigned", "ghost")).toMatchObject({ ok: false });
    expect(db.assets.find((a) => a.id === "a2")!.status).toBe("available");
  });

  it("clears the holder when the asset leaves the assigned state", () => {
    const db = seedDatabase();
    updateAsset(db, "a1", "repair", "u1"); // a holder in the form is ignored for other statuses
    expect(db.assets.find((a) => a.id === "a1")).toMatchObject({ status: "repair", assignedToId: null });
  });

  it("rejects an unknown status or asset", () => {
    const db = seedDatabase();
    expect(updateAsset(db, "a1", "stolen", "")).toMatchObject({ ok: false });
    expect(updateAsset(db, "nope", "available", "")).toMatchObject({ ok: false });
  });
});

describe("requestTypes", () => {
  it("offers the defaults even with an empty register", () => {
    expect(requestTypes({ assets: [] })).toEqual(["Headset", "Keyboard and mouse", "Laptop", "Monitor", "Phone"]);
  });

  it("adds new types from the register without duplicating by case", () => {
    const db = seedDatabase();
    db.assets.push({ ...db.assets[0], id: "x1", type: "Docking station" }, { ...db.assets[0], id: "x2", type: "laptop" });
    const types = requestTypes(db);
    expect(types).toContain("Docking station");
    expect(types.filter((t) => t.toLowerCase() === "laptop")).toEqual(["Laptop"]);
  });
});

describe("updateProfile", () => {
  it("changes the name and department, trimming whitespace", () => {
    const db = seedDatabase();
    expect(updateProfile(db, "u1", { name: "  Maria S. Santos ", department: " Accounting " })).toMatchObject({ ok: true, name: "Maria S. Santos", department: "Accounting" });
    expect(db.users.find((u) => u.id === "u1")).toMatchObject({ name: "Maria S. Santos", department: "Accounting" });
  });

  it("defaults an empty department", () => {
    const db = seedDatabase();
    updateProfile(db, "u1", { name: "Maria", department: "  " });
    expect(db.users.find((u) => u.id === "u1")!.department).toBe("General");
  });

  it("never touches email, role or active", () => {
    const db = seedDatabase();
    const before = { ...db.users.find((u) => u.id === "u3")! };
    updateProfile(db, "u3", { name: "Ana C.", department: "IT" });
    const after = db.users.find((u) => u.id === "u3")!;
    expect({ email: after.email, role: after.role, active: after.active }).toEqual({ email: before.email, role: before.role, active: before.active });
  });

  it("rejects an empty or very long name and a very long department", () => {
    const db = seedDatabase();
    expect(updateProfile(db, "u1", { name: "   ", department: "IT" })).toMatchObject({ ok: false });
    expect(updateProfile(db, "u1", { name: "x".repeat(81), department: "IT" })).toMatchObject({ ok: false });
    expect(updateProfile(db, "u1", { name: "Maria", department: "d".repeat(61) })).toMatchObject({ ok: false });
    expect(db.users.find((u) => u.id === "u1")!.name).toBe("Maria Santos");
  });

  it("refuses unknown and deactivated accounts", () => {
    const db = seedDatabase();
    db.users.find((u) => u.id === "u2")!.active = false;
    expect(updateProfile(db, "ghost", { name: "X", department: "Y" })).toMatchObject({ ok: false });
    expect(updateProfile(db, "u2", { name: "X", department: "Y" })).toMatchObject({ ok: false });
  });
});
