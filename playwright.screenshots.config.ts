import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// `npm run screenshots` regenerates docs/screenshots/*.png from a fresh demo database, so the README
// pictures always match the app. Same setup as the e2e config (installed Chrome, throwaway database),
// on its own port, and it is not part of `npm run test:e2e`.
const PORT = 3211;
const dbFile = path.join(os.tmpdir(), "helpdesk-shots.db");
if (!process.env.TEST_WORKER_INDEX) {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) fs.rmSync(dbFile + suffix, { force: true });
}

export default defineConfig({
  testDir: "e2e/screenshots",
  testMatch: /.*\.shots\.ts/,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_BROWSER ?? "chrome",
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    reducedMotion: "reduce",
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: `file:${dbFile.replace(/\\/g, "/")}`, DEMO_MODE: "1", DEMO_PASSWORD: "helpdesk-demo" },
  },
});
