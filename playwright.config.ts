import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// End-to-end tests run against a real dev server and a throwaway SQLite file, so they never touch
// data/helpdesk.db. They drive the Chrome that is already installed (no browser download). Set
// E2E_BROWSER=msedge to use Edge instead.
const PORT = 3210;
const dbFile = path.join(os.tmpdir(), "helpdesk-e2e.db");
// Playwright loads this file again inside every worker. Only the main process may reset the database,
// otherwise a worker would delete the file the running server is using.
if (!process.env.TEST_WORKER_INDEX) {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) fs.rmSync(dbFile + suffix, { force: true });
}

export default defineConfig({
  testDir: "e2e",
  // Tests share one database and change it, so they run one after another, in file order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_BROWSER ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: `file:${dbFile.replace(/\\/g, "/")}`,
      DEMO_MODE: "1",
      DEMO_PASSWORD: "helpdesk-demo",
    },
  },
});
