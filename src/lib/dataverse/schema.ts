// Table layout for the SQL database. Column names are camelCase in code and snake_case in SQL.
// Keep this in step with the types in types.ts: every field of a row type needs a column here.

export type ColumnKind = "text" | "int" | "bool" | "json";

export interface TableSpec {
  /** SQL table name */
  sql: string;
  /** key of the array on the Database object */
  key: "users" | "categories" | "tickets" | "comments" | "assets" | "assetRequests" | "flowRuns";
  columns: Record<string, ColumnKind>;
  /** ORDER BY clause used when loading. Arrays are newest first where code relies on unshift(). */
  orderBy: string;
  /** extra column constraints, keyed by column name */
  constraints?: Record<string, string>;
  /** `REFERENCES` clauses or other table-level SQL */
  tableSql?: string[];
}

// Order matters: parents before children (foreign keys).
export const TABLES: TableSpec[] = [
  {
    sql: "users",
    orderBy: "email",
    key: "users",
    columns: { id: "text", name: "text", email: "text", role: "text", department: "text", active: "bool" },
    constraints: {
      id: "PRIMARY KEY",
      email: "NOT NULL UNIQUE",
      role: "NOT NULL CHECK (role IN ('employee','agent','manager'))",
      active: "NOT NULL DEFAULT 1",
    },
  },
  {
    sql: "categories",
    orderBy: "name",
    key: "categories",
    columns: { id: "text", name: "text" },
    constraints: { id: "PRIMARY KEY", name: "NOT NULL" },
  },
  {
    sql: "assets",
    orderBy: "tag",
    key: "assets",
    columns: { id: "text", tag: "text", name: "text", type: "text", status: "text", assignedToId: "text", purchasedAt: "text" },
    constraints: { id: "PRIMARY KEY", tag: "NOT NULL UNIQUE", status: "NOT NULL" },
    tableSql: ["FOREIGN KEY (assigned_to_id) REFERENCES users(id)"],
  },
  {
    sql: "tickets",
    orderBy: "number DESC",
    key: "tickets",
    columns: {
      id: "text", number: "int", title: "text", description: "text", requesterId: "text", assigneeId: "text",
      categoryId: "text", priority: "text", status: "text", assetId: "text", createdAt: "text", updatedAt: "text",
      dueAt: "text", resolvedAt: "text", escalated: "bool", rating: "int", ratingComment: "text", ratedAt: "text", waitingSince: "text",
    },
    constraints: {
      id: "PRIMARY KEY",
      number: "NOT NULL UNIQUE",
      title: "NOT NULL",
      requesterId: "NOT NULL",
      categoryId: "NOT NULL",
      rating: "CHECK (rating BETWEEN 1 AND 5)",
    },
    tableSql: [
      "FOREIGN KEY (requester_id) REFERENCES users(id)",
      "FOREIGN KEY (assignee_id) REFERENCES users(id)",
      "FOREIGN KEY (category_id) REFERENCES categories(id)",
      "FOREIGN KEY (asset_id) REFERENCES assets(id)",
    ],
  },
  {
    sql: "comments",
    orderBy: "created_at, id",
    key: "comments",
    columns: { id: "text", ticketId: "text", authorId: "text", body: "text", kind: "text", internal: "bool", createdAt: "text" },
    constraints: { id: "PRIMARY KEY", ticketId: "NOT NULL", body: "NOT NULL" },
    tableSql: ["FOREIGN KEY (ticket_id) REFERENCES tickets(id)", "FOREIGN KEY (author_id) REFERENCES users(id)"],
  },
  {
    sql: "asset_requests",
    orderBy: "created_at DESC, id",
    key: "assetRequests",
    columns: {
      id: "text", assetType: "text", justification: "text", requesterId: "text", status: "text",
      decidedById: "text", decidedAt: "text", createdAt: "text",
    },
    constraints: { id: "PRIMARY KEY", requesterId: "NOT NULL" },
    tableSql: ["FOREIGN KEY (requester_id) REFERENCES users(id)", "FOREIGN KEY (decided_by_id) REFERENCES users(id)"],
  },
  {
    sql: "flow_runs",
    orderBy: "at DESC, id",
    key: "flowRuns",
    columns: { id: "text", flow: "text", trigger: "text", actions: "json", at: "text" },
    constraints: { id: "PRIMARY KEY" },
  },
];

// Indexes for the lookups pages make. CREATE INDEX IF NOT EXISTS is safe to run on every connect, so
// existing databases get them without a migration.
export const INDEX_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id)",
  "CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id)",
  "CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)",
  "CREATE INDEX IF NOT EXISTS idx_requests_requester ON asset_requests(requester_id)",
];

export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const SQL_TYPE: Record<ColumnKind, string> = { text: "TEXT", int: "INTEGER", bool: "INTEGER", json: "TEXT" };

export function createTableSql(t: TableSpec): string {
  const cols = Object.entries(t.columns).map(
    ([name, kind]) => `${snake(name)} ${SQL_TYPE[kind]}${t.constraints?.[name] ? ` ${t.constraints[name]}` : ""}`,
  );
  return `CREATE TABLE IF NOT EXISTS ${t.sql} (${[...cols, ...(t.tableSql ?? [])].join(", ")})`;
}

// Authentication tables are not part of the Database object, so password hashes
// and session tokens are never loaded into pages. See src/lib/auth.
export const AUTH_SQL = [
  `CREATE TABLE IF NOT EXISTS auth_credentials (
     user_id TEXT PRIMARY KEY,
     password_hash TEXT NOT NULL,
     FOREIGN KEY (user_id) REFERENCES users(id)
   )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     FOREIGN KEY (user_id) REFERENCES users(id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS auth_reset_tokens (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     FOREIGN KEY (user_id) REFERENCES users(id)
   )`,
  `CREATE TABLE IF NOT EXISTS dev_outbox (id TEXT PRIMARY KEY, at INTEGER NOT NULL, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (key_hash TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_key ON auth_attempts(key_hash, at)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];
