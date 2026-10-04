# Deploying to Vercel with Turso

Vercel's filesystem is read-only and temporary, so the local SQLite file used in development cannot be the production database. The app uses `@libsql/client`, which speaks to **Turso** (hosted SQLite) with the same code: you only change `DATABASE_URL`.

> Status: the Turso path has **not** been run against a real Turso database yet. Everything else was tested against a local libSQL file. Treat the first deploy as the test, and update this doc with anything that differs.

## 1. Create the database
Use the Turso dashboard (https://turso.tech) or the CLI (on Windows, run the CLI inside WSL):
```bash
turso auth login
turso db create helpdesk                # pick a region close to your Vercel functions
turso db show helpdesk --url            # libsql://helpdesk-<you>.turso.io
turso db tokens create helpdesk         # the auth token
```
Tables are created automatically on the first request, so there is no schema step.

## 2. Choose a mode
| | Public portfolio demo | Real internal use |
|---|---|---|
| `DEMO_MODE` | leave unset (on) | `0` |
| First run creates | 5 demo users and sample data | categories and one manager from `ADMIN_EMAIL` |
| Login page | lists demo accounts and the password | plain login |
| Reset demo data button | yes | no |
| Must also set | `DEMO_PASSWORD` (change it) | `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ characters) |

With `DEMO_MODE=0` and no `ADMIN_EMAIL` or `ADMIN_PASSWORD`, the first request fails with a clear error instead of starting a system nobody can administer. After signing in as that manager, use **Users** to create agents and managers, and rotate the admin password on the Account page.

## 3. Deploy
1. Push the repo to GitHub (already done) and import it in Vercel. The Next.js preset is detected automatically.
2. Add environment variables (Project, Settings, Environment Variables):
   - `DATABASE_URL` = the `libsql://...` URL
   - `DATABASE_AUTH_TOKEN` = the token
   - plus the mode variables from the table above
3. Deploy, open the site, and sign in.

## 4. Things to know
- **Seeding happens once**, on the first request, guarded by a `seeded` flag in the database. Changing `DEMO_PASSWORD` or `ADMIN_PASSWORD` later does not change existing accounts; use the Account page or Users, Reset password.
- **Rate limiting is per server instance and in memory.** On Vercel each cold instance starts with an empty counter, so it slows guessing but does not stop a determined attacker. Put a shared store (Upstash Redis) behind `src/lib/auth/rate-limit.ts` before relying on it.
- **Latency:** each request is one round trip to read and one to write, so keep the Turso region near the Vercel region.
- **Every request loads every table.** Fine for hundreds of tickets, so plan targeted queries (see PROGRESS backlog) before it grows into the thousands.
- **Secrets** live only in Vercel's environment settings. `.env*` files are gitignored, except `.env.example`.
- **Schema changes** to an existing database need a real migration: `CREATE TABLE IF NOT EXISTS` never alters tables. Until migrations exist, avoid changing columns on a database that holds data you care about.
