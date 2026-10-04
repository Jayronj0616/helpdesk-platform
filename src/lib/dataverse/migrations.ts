import type { Client } from "@libsql/client";

// Schema changes for databases that already exist. `CREATE TABLE IF NOT EXISTS` in schema.ts only
// creates missing tables; it never alters one. So every column or constraint change goes here
// as a new numbered migration, AND into schema.ts so brand-new databases are created with it.
//
// Version 1 is the schema shipped before migrations existed. Never edit or reorder a migration
// that has been released; add a new one.

export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 2,
    description: "Add users.active so accounts can be deactivated instead of deleted",
    statements: ["ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1"],
  },
  {
    version: 3,
    description: "Add customer satisfaction ratings to tickets",
    statements: [
      "ALTER TABLE tickets ADD COLUMN rating INTEGER CHECK (rating BETWEEN 1 AND 5)",
      "ALTER TABLE tickets ADD COLUMN rating_comment TEXT",
      "ALTER TABLE tickets ADD COLUMN rated_at TEXT",
    ],
  },
  {
    version: 4,
    description: "Add tickets.waiting_since so the SLA clock can pause while a ticket waits on the customer",
    // Tickets already in Waiting are paused from their last update, the best information the old schema has.
    statements: ["ALTER TABLE tickets ADD COLUMN waiting_since TEXT", "UPDATE tickets SET waiting_since = updated_at WHERE status = 'waiting'"],
  },
];

export const LATEST_VERSION = Math.max(1, ...MIGRATIONS.map((m) => m.version));

const SET_VERSION = "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

async function currentVersion(client: Client): Promise<number> {
  const res = await client.execute("SELECT value FROM meta WHERE key = 'schema_version'");
  // A database that has users but no version predates migrations: it is version 1.
  return res.rows[0] ? Number(res.rows[0].value) : 1;
}

/**
 * Brings the database to LATEST_VERSION. `fresh` means the tables were just created from
 * schema.ts, which already has every column, so there is nothing to migrate.
 */
export async function runMigrations(client: Client, fresh: boolean): Promise<void> {
  if (fresh) {
    await client.execute({ sql: SET_VERSION, args: [String(LATEST_VERSION)] });
    return;
  }

  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if ((await currentVersion(client)) >= m.version) continue;
    try {
      // The schema change and the version bump commit together or not at all.
      await client.batch([...m.statements, { sql: SET_VERSION, args: [String(m.version)] }], "write");
    } catch (err) {
      // Another server instance starting at the same time may have applied it first.
      if ((await currentVersion(client)) >= m.version) continue;
      throw err;
    }
  }
}
