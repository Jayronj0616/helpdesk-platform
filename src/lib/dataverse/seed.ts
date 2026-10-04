import type { Database } from "./types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const hoursFrom = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const defaultCategories = () => [
  { id: "c1", name: "Hardware" },
  { id: "c2", name: "Software" },
  { id: "c3", name: "Network" },
  { id: "c4", name: "Access & Accounts" },
];

// First-run data for a real deployment (DEMO_MODE=0): categories and one manager, nothing else.
export function seedProduction(adminEmail: string): Database {
  return {
    nextTicketNumber: 1001,
    comments: [],
    users: [{ id: "u_admin", name: "Administrator", email: adminEmail.trim().toLowerCase(), role: "manager", department: "IT" }],
    categories: defaultCategories(),
    tickets: [],
    assets: [],
    assetRequests: [],
    flowRuns: [],
  };
}

export function seedDatabase(): Database {
  return {
    nextTicketNumber: 1007,
    comments: [
      { id: "m1", ticketId: "t1", authorId: "u3", body: "Booting into recovery to check the last update.", kind: "comment", internal: false, createdAt: hoursAgo(28) },
      { id: "m2", ticketId: "t1", authorId: "u3", body: "Likely a failed driver update. Loaner laptop LT-0002 is available if recovery fails.", kind: "comment", internal: true, createdAt: hoursAgo(26) },
      { id: "m3", ticketId: "t1", authorId: "u1", body: "I have a deadline tomorrow, please prioritise.", kind: "comment", internal: false, createdAt: hoursAgo(24) },
      { id: "m4", ticketId: "t2", authorId: "u4", body: "Please confirm which Wi-Fi network you are on when it fails.", kind: "comment", internal: false, createdAt: hoursAgo(5) },
    ],
    users: [
      { id: "u1", name: "Maria Santos", email: "maria@contoso.test", role: "employee", department: "Finance" },
      { id: "u2", name: "Carlo Reyes", email: "carlo@contoso.test", role: "employee", department: "Sales" },
      { id: "u3", name: "Ana Cruz", email: "ana@contoso.test", role: "agent", department: "IT" },
      { id: "u4", name: "Ben Lim", email: "ben@contoso.test", role: "agent", department: "IT" },
      { id: "u5", name: "Dina Ramos", email: "dina@contoso.test", role: "manager", department: "IT" },
    ],
    categories: defaultCategories(),
    tickets: [
      {
        id: "t1", number: 1001, title: "Laptop will not boot", description: "Black screen after the Windows update.",
        requesterId: "u1", assigneeId: "u3", categoryId: "c1", priority: "high", status: "in_progress", assetId: "a1",
        createdAt: hoursAgo(30), updatedAt: hoursAgo(2), dueAt: hoursAgo(22), resolvedAt: null, escalated: false,
      },
      {
        id: "t2", number: 1002, title: "Cannot connect to VPN", description: "Error 809 when connecting from home.",
        requesterId: "u2", assigneeId: "u4", categoryId: "c3", priority: "medium", status: "waiting", assetId: null,
        createdAt: hoursAgo(20), updatedAt: hoursAgo(5), dueAt: hoursFrom(4), resolvedAt: null, escalated: false,
      },
      {
        id: "t3", number: 1003, title: "Need Adobe Acrobat license", description: "Required for signing vendor contracts.",
        requesterId: "u1", assigneeId: "u3", categoryId: "c2", priority: "low", status: "resolved", assetId: null,
        createdAt: hoursAgo(60), updatedAt: hoursAgo(40), dueAt: hoursFrom(12), resolvedAt: hoursAgo(40), escalated: false,
      },
      {
        id: "t4", number: 1004, title: "Password reset for shared mailbox", description: "Sales shared mailbox is locked out.",
        requesterId: "u2", assigneeId: "u4", categoryId: "c4", priority: "medium", status: "closed", assetId: null,
        createdAt: hoursAgo(90), updatedAt: hoursAgo(80), dueAt: hoursAgo(66), resolvedAt: hoursAgo(80), escalated: false,
      },
      {
        id: "t5", number: 1005, title: "Printer on 3rd floor offline", description: "Nobody can print since morning.",
        requesterId: "u1", assigneeId: null, categoryId: "c3", priority: "high", status: "new", assetId: null,
        createdAt: hoursAgo(3), updatedAt: hoursAgo(3), dueAt: hoursFrom(5), resolvedAt: null, escalated: false,
      },
      {
        id: "t6", number: 1006, title: "Excel crashes on large workbook", description: "Crashes when opening the Q3 forecast file.",
        requesterId: "u2", assigneeId: "u3", categoryId: "c2", priority: "low", status: "in_progress", assetId: "a3",
        createdAt: hoursAgo(10), updatedAt: hoursAgo(6), dueAt: hoursFrom(62), resolvedAt: null, escalated: false,
      },
    ],
    assets: [
      { id: "a1", tag: "LT-0001", name: "Dell Latitude 5440", type: "Laptop", status: "assigned", assignedToId: "u1", purchasedAt: "2024-03-12" },
      { id: "a2", tag: "LT-0002", name: "Dell Latitude 5440", type: "Laptop", status: "available", assignedToId: null, purchasedAt: "2024-03-12" },
      { id: "a3", tag: "LT-0003", name: "Lenovo ThinkPad T14", type: "Laptop", status: "assigned", assignedToId: "u2", purchasedAt: "2023-09-01" },
      { id: "a4", tag: "MN-0001", name: "Dell 24-inch Monitor", type: "Monitor", status: "available", assignedToId: null, purchasedAt: "2024-06-20" },
      { id: "a5", tag: "MN-0002", name: "Dell 27-inch Monitor", type: "Monitor", status: "repair", assignedToId: null, purchasedAt: "2022-11-05" },
      { id: "a6", tag: "PH-0001", name: "iPhone 14", type: "Phone", status: "assigned", assignedToId: "u2", purchasedAt: "2023-02-14" },
      { id: "a7", tag: "LT-0004", name: "HP EliteBook 840", type: "Laptop", status: "retired", assignedToId: null, purchasedAt: "2019-05-30" },
    ],
    assetRequests: [
      {
        id: "r1", assetType: "Monitor", justification: "Second screen for reconciliation work.",
        requesterId: "u1", status: "pending", decidedById: null, decidedAt: null, createdAt: hoursAgo(8),
      },
    ],
    flowRuns: [],
  };
}
