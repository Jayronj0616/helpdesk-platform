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

## 2b. Password reset by email (optional)
Without email, the "Forgot your password?" link is hidden in production, and managers reset passwords from **Users**. To turn it on:
- `APP_URL` = the public address, for example `https://your-app.vercel.app` (required: reset links are built from it, never from the request's Host header, so they cannot be poisoned)
- `RESEND_API_KEY` and `MAIL_FROM` from https://resend.com (the sender must be on a domain you verified there)

Flows use the same mailer to send real notifications (new ticket to the agent, SLA breach to the manager, request decisions, closures and reopens). With no provider in production they are recorded as skipped, so nothing breaks; addresses on reserved domains (including the `@contoso.test` demo accounts) are never sent to even with a provider. Managers can watch the queue on **Flow runs**. Delivery is at-least-once, so very rarely an email can be sent twice.

The Resend call is covered by unit tests with a mocked `fetch`, but it has **not** been run against the real service. After deploying, request a reset for your own address and read the first mail before relying on it.

## 2c. Scheduled flows (optional)
`vercel.json` already schedules `/api/cron/maintenance` daily at 06:00 UTC (the most a free Vercel plan allows). Set `CRON_SECRET` in Vercel (any long random string; `.env.example` shows how to make one) and Vercel Cron sends it as `Authorization: Bearer ...` automatically. Without the variable the endpoint returns 404 and nothing runs; managers can still press the buttons on **Flow runs**. After the first scheduled run (or by calling it yourself with `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/maintenance`) the run history shows "Scheduled run" entries.

## 3. Deploy
1. Push the repo to GitHub (already done) and import it in Vercel. The Next.js preset is detected automatically.
2. Add environment variables (Project, Settings, Environment Variables):
   - `DATABASE_URL` = the `libsql://...` URL
   - `DATABASE_AUTH_TOKEN` = the token
   - plus the mode variables from the table above
3. Deploy, then open `/api/health`: `{"status":"ok"}` means the database is reachable, migrated and seeded. A bare 503 means something is wrong (check the function logs, for example a missing `ADMIN_EMAIL`).
4. Open the site and sign in.

## 4. Things to know
- **Seeding happens once**, on the first request, guarded by a `seeded` flag in the database. Changing `DEMO_PASSWORD` or `ADMIN_PASSWORD` later does not change existing accounts; use the Account page or Users, Reset password.
- **Rate limiting is stored in the database** (hashed keys), so it holds across Vercel instances. It adds one write per sign-in attempt. `x-forwarded-for` is trusted for the IP part of the key, which Vercel sets, so do not run this behind a proxy that lets clients set it.
- **Latency:** each request is one round trip to read and one to write, so keep the Turso region near the Vercel region.
- **Reads are scoped, writes are not.** Pages load only the tables they use, and the ticket page loads only its own comments (indexed). A write still loads every table to work out what changed, which is fine into the low thousands of rows; plan targeted statements for the hot write paths before it grows beyond that.
- **Secrets** live only in Vercel's environment settings. `.env*` files are gitignored, except `.env.example`.
- **Schema changes** are applied automatically on the first request after a deploy, through the numbered migrations in `src/lib/dataverse/migrations.ts` (each in one batch with its version bump). Back up the Turso database (`turso db shell` or a branch) before deploying a release that adds a migration.
