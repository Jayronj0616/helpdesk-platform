import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { AUTH_SQL, TABLES, createTableSql } from "./schema";

// One client per server process. DATABASE_URL accepts a local file (file:data/helpdesk.db) or a
// hosted libSQL/Turso URL (libsql://...) with DATABASE_AUTH_TOKEN.
const URL = process.env.DATABASE_URL ?? "file:data/helpdesk.db";

let client: Client | undefined;
let ready: Promise<Client> | undefined;

export function getDb(): Promise<Client> {
  ready ??= (async () => {
    if (URL.startsWith("file:") && !URL.includes(":memory:")) {
      fs.mkdirSync(path.dirname(URL.slice("file:".length)), { recursive: true });
    }
    client = createClient({ url: URL, authToken: process.env.DATABASE_AUTH_TOKEN });
    // A local SQLite file needs this switched on. Hosted libSQL/Turso enforces foreign keys already
    // and may refuse the pragma, which is fine.
    await client.execute("PRAGMA foreign_keys = ON").catch(() => undefined);
    await client.batch([...TABLES.map(createTableSql), ...AUTH_SQL], "write");
    return client;
  })().catch((err) => {
    ready = undefined; // a failed connect (for example a network blip on a cold start) is retried next request
    throw err;
  });
  return ready;
}
