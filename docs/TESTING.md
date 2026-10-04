# Testing

Verification is unit tests (Vitest), end-to-end browser tests (Playwright), static checks, and a manual script for anything the browser tests do not cover.

## Always before committing
```bash
npx eslint . && npm run typecheck && npm test && npm run build
```
Run `npm run test:e2e` as well when you change a page, an action, or anything about auth. It takes about two minutes.

`npm run typecheck` runs `next typegen` first, because `PageProps` and `LayoutProps` are generated into the gitignored `.next/types` folder; a bare `tsc` fails on a fresh clone (this is what CI hit). The same generation happens on `npm run dev` and `npm run build`.

Lint includes type-aware rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`) for `src/`. They exist because `if (!limiter.attempt(key))` compiles when `attempt` is async but never blocks anything.

## Unit tests (`tests/`, run with `npm test`)
Most logic is pure functions over a `Database`, so those tests build a fresh `seedDatabase()` and call them directly. The database and auth tests use a real SQLite file in a temp folder (set up in `beforeAll`, nothing touches `data/`).

| File | Covers |
|---|---|
| `tests/queries.test.ts` | `isOverdue`, `filterTickets` (every filter, search, sorting, no input mutation), `paginate`, `ticketsPerDay` |
| `tests/comments.test.ts` | `visibleComments` (internal notes hidden from employees, ordering), `addComment`, `addSystemEntry` |
| `tests/flows.test.ts` | `onTicketCreated`, `escalateOverdue`, `onAssetRequestDecided` |
| `tests/password.test.ts` | scrypt hash and verify (random salt, tamper and malformed rejection) |
| `tests/rate-limit.test.ts` | Database-backed limiter: window, independent keys, reset, shared across instances, only hashed keys stored, old attempts purged |
| `tests/migrations.test.ts` | Upgrading a version 1 database keeps data, safe to re-run, two instances migrating at once, fresh databases are stamped without migrating |
| `tests/admin.test.ts` | `changeUserRole` (promote, self-change blocked, non-manager blocked, demotion unassigns open tickets with audit), `setUserActive` (unassigns, self blocked, inactive manager blocked), `createAsset`, `updateAsset`, `requestTypes` |
| `tests/accounts.test.ts` | deactivated accounts cannot sign in and lose their sessions immediately, `createAccount` with a role, `registerUser` stays employee-only, `setPassword` (signs the user out, leaves others signed in), `changeOwnPassword` (current password required, keeps only the current session) |
| `tests/production-seed.test.ts`, `tests/production-missing-admin.test.ts` | `DEMO_MODE=0` first run: one manager, categories, no demo data, admin signs in; and a loud, retryable failure when `ADMIN_EMAIL` or `ADMIN_PASSWORD` is missing |
| `tests/db.test.ts` | Seeding, type round-trips, `mutate` persistence, rollback on error, concurrent writes keep ticket numbers unique, newest-first ordering, no-op diff, foreign keys, `authenticate`, registration (employee only, duplicates, bad input), sessions (create, expire, destroy, token stored hashed), `resetDb` (removes registered users with their credentials and sessions, restores demo passwords and reactivates demo accounts) |

Tests depend on the relative dates in `src/lib/dataverse/seed.ts`. If you change the seed, re-run the tests and adjust expectations (for example ticket 1001 is the only overdue open ticket).

Add a test whenever you add or change a function in `queries.ts`, `comments.ts`, `flows/index.ts` or `lib/auth`. Server actions and pages are covered by the manual script below.

## End-to-end tests (`e2e/`, run with `npm run test:e2e`)
Playwright drives the **already installed Chrome** (no browser download; `E2E_BROWSER=msedge` uses Edge) against a dev server on port 3210 and a throwaway SQLite file in the temp folder, so `data/helpdesk.db` is never touched. The files share one database and run in order, one worker, so later files rely on state from earlier ones.

| File | Covers |
|---|---|
| `01-auth` | Signed-out redirects, forged cookie, generic login error that keeps the email, sign in and out, HttpOnly SameSite=Lax cookie, registration (employee only, duplicate rejected) |
| `02-employee` | 404 on other people's tickets and the admin page, own tickets only, internal notes hidden, creation flow (SLA, auto-assignment, audit trail, flow log), commenting, search and filters, asset requests |
| `03-staff-and-manager` | Agent: all tickets, internal notes (hidden from the requester), audit entries, add asset (uppercased tag, duplicate rejected, status edit), cannot approve. Manager: approve assigns an asset, escalation, reject |
| `04-admin` | Create an agent who can sign in, demote (unassigns tickets), deactivate and reactivate, session ended immediately on deactivation, password reset signs the user out, own role locked |
| `05-account` | Change own password (current one required, old one dies, other devices signed out) |
| `06-reset` | Runs last: reset restores the seed, removes registered users, restores demo passwords, keeps the manager signed in |

Notes: the first test in a run is slow because the dev server compiles pages on demand. A `[WebServer] The destination stream closed early` line is the server noticing a browser tab was closed mid-response and is not an app error. Playwright reloads `playwright.config.ts` in every worker, so the database is only deleted when `TEST_WORKER_INDEX` is unset.

## Quick checks with curl
Start the server (`npm run dev -- -p 3100`), and delete `data/helpdesk.db` first to reseed. Everything except `/login` and `/register` requires a session.

| Check | Command | Expect |
|---|---|---|
| Sign-in required | `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" localhost:3100/tickets` | `307` to `/login` |
| Forged cookie rejected | same with `-b session=forged` | `307` to `/login` |
| Login page is public | `curl -s -o /dev/null -w "%{http_code}" localhost:3100/login` | `200` |

Signing in needs a server action, so sign in through the browser for anything beyond these. Demo accounts and their password are on the login page (see `DEMO_PASSWORD`).

## Manual browser script
Most of this is now automated by the end-to-end tests above; use it as a checklist when changing something they do not cover.
Demo accounts: maria@contoso.test and carlo@contoso.test (employees), ana@contoso.test and ben@contoso.test (agents), dina@contoso.test (manager). Password: `DEMO_PASSWORD` (default `helpdesk-demo`).

1. Signed out, open `/tickets`: you land on `/login`. Sign in with a wrong password: you see "Invalid email or password." and the email stays filled in.
2. As Maria: submit a ticket, then open `/flows` and see the "When a ticket is created" run. Open the ticket and see its activity entries. Opening Carlo's ticket (`/tickets/t2`) gives a 404.
3. As Maria: add a comment on ticket 1001. As Ana: add an internal note and confirm Maria cannot see it.
4. As Ana: change status, assignee and related asset, and confirm audit entries appear.
5. As Maria: submit an asset request. As Dina: approve it on `/requests`, then check `/assets` for the assignment and `/flows` for the run.
6. As Dina: click "Run Escalate overdue tickets", then confirm ticket 1001 is escalated.
7. Register a new account on `/register`: it lands on a dashboard scoped to employee data. As Dina: "Reset demo data" removes that account and restores the seed, and Dina stays signed in.
8. Sign out, then confirm the back button and `/tickets` both lead to `/login`.
9. As Maria: `/admin/users` is a 404 and there is no Users link or Add asset form. On `/account`, a wrong current password is rejected, a correct change signs other devices out, and the old password no longer works.
10. As Dina on `/admin/users`: create an agent (appears in ticket assignee lists), demote Ana to employee (her 2 open tickets become unassigned with an audit entry), reset Carlo's password (confirmation says he was signed out). Your own role selector is disabled.
11. As Dina on `/assets`: add an asset (a duplicate tag is rejected and the form keeps your input; the tag is uppercased and the type spelling reused), then change an asset's status.

## Last manual verification
The pre-auth flows (ticket creation, comments, approval, escalation, reset, pagination) were run in a real browser on 2026-10-03. With real authentication and SQLite, on 2026-10-04 (and the admin features, password change and asset management later the same day): wrong password (generic error, email kept), sign in, HttpOnly session cookie, sign out, signed-out redirects, forged cookie rejected, registration, ticket creation with flow assignment, manager approve, escalation and reset (registered user removed, manager session kept).

## CI
`.github/workflows/ci.yml` runs two jobs on every push to `master` and every pull request: lint, types, unit tests and build; and the end-to-end tests (GitHub's Ubuntu runners include Chrome). Failed e2e runs upload Playwright traces as an artifact.

## Not covered yet
Nothing automated runs against a real Turso database.
