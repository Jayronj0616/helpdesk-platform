# Testing

Verification is automated unit tests (Vitest) plus static checks plus a manual script for the UI.

## Always before committing
```bash
npx eslint . && npx tsc --noEmit && npm test && npm run build
```

## Unit tests (`tests/`, run with `npm test`)
Most logic is pure functions over a `Database`, so those tests build a fresh `seedDatabase()` and call them directly. The database and auth tests use a real SQLite file in a temp folder (set up in `beforeAll`, nothing touches `data/`).

| File | Covers |
|---|---|
| `tests/queries.test.ts` | `isOverdue`, `filterTickets` (every filter, search, sorting, no input mutation), `paginate`, `ticketsPerDay` |
| `tests/comments.test.ts` | `visibleComments` (internal notes hidden from employees, ordering), `addComment`, `addSystemEntry` |
| `tests/flows.test.ts` | `onTicketCreated`, `escalateOverdue`, `onAssetRequestDecided` |
| `tests/password.test.ts` | scrypt hash and verify (random salt, tamper and malformed rejection), login rate limiter |
| `tests/admin.test.ts` | `changeUserRole` (promote, self-change blocked, non-manager blocked, demotion unassigns open tickets with audit), `createAsset`, `updateAsset`, `requestTypes` |
| `tests/accounts.test.ts` | `createAccount` with a role, `registerUser` stays employee-only, `setPassword` (signs the user out, leaves others signed in), `changeOwnPassword` (current password required, keeps only the current session) |
| `tests/production-seed.test.ts`, `tests/production-missing-admin.test.ts` | `DEMO_MODE=0` first run: one manager, categories, no demo data, admin signs in; and a loud, retryable failure when `ADMIN_EMAIL` or `ADMIN_PASSWORD` is missing |
| `tests/db.test.ts` | Seeding, type round-trips, `mutate` persistence, rollback on error, concurrent writes keep ticket numbers unique, newest-first ordering, no-op diff, foreign keys, `authenticate`, registration (employee only, duplicates, bad input), sessions (create, expire, destroy, token stored hashed), `resetDb` (removes registered users with their credentials and sessions) |

Tests depend on the relative dates in `src/lib/dataverse/seed.ts`. If you change the seed, re-run the tests and adjust expectations (for example ticket 1001 is the only overdue open ticket).

Add a test whenever you add or change a function in `queries.ts`, `comments.ts`, `flows/index.ts` or `lib/auth`. Server actions and pages are covered by the manual script below.

## Quick checks with curl
Start the server (`npm run dev -- -p 3100`), and delete `data/helpdesk.db` first to reseed. Everything except `/login` and `/register` requires a session.

| Check | Command | Expect |
|---|---|---|
| Sign-in required | `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" localhost:3100/tickets` | `307` to `/login` |
| Forged cookie rejected | same with `-b session=forged` | `307` to `/login` |
| Login page is public | `curl -s -o /dev/null -w "%{http_code}" localhost:3100/login` | `200` |

Signing in needs a server action, so sign in through the browser for anything beyond these. Demo accounts and their password are on the login page (see `DEMO_PASSWORD`).

## Manual browser script
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

## Not covered yet
Server actions and pages have no automated tests. A Playwright suite for the manual script is the natural next step.
