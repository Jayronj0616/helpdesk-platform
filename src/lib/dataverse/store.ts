import fs from "node:fs";
import path from "node:path";
import type { Database } from "./types";
import { seedDatabase } from "./seed";

// File-backed stand-in for Dataverse. Swap this module for a real database
// (Postgres, Prisma, ...) without touching pages or flows.
const DB_PATH = path.join(process.cwd(), "data", "db.json");

export function readDb(): Database {
  if (!fs.existsSync(DB_PATH)) {
    writeDb(seedDatabase());
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as Database;
}

export function writeDb(db: Database): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function mutate<T>(fn: (db: Database) => T): T {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

export function resetDb(): void {
  writeDb(seedDatabase());
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
