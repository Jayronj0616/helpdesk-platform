# Progress tracker

Update this file as part of every task: tick the box, add a one-line note, and move new ideas into Backlog. See `docs/INDEX.md` for the other docs and `docs/HANDOFF.md` for the next step.

Status key: `[x]` done, `[~]` in progress, `[ ]` to do.

## Done
- [x] Dataverse-style data layer (types, seed)
- [x] Dashboard with KPI tiles, bar charts and a 7-day ticket trend
- [x] Tickets: list, new, detail, status, assignee and related-asset edit
- [x] Ticket search, filters, sorting and pagination (state in the URL)
- [x] Ticket comments (public and internal) and an audit trail of status, assignee, asset and flow changes
- [x] Assets register
- [x] Asset requests with manager approval
- [x] Flows: ticket created, escalate overdue, asset request decided, with run history
- [x] Power Platform blueprint guide (including Comment table, audit logging and the Entra ID sign-in note)
- [x] Published to GitHub (Jayronj0616/helpdesk-platform)
- [x] AI handoff docs (AGENTS.md, CLAUDE.md, docs/*)
- [x] Manager flows verified in a real browser (approve, escalate, reset)
- [x] **Real database**: SQLite via libSQL (local file, Turso-compatible), transactional writes, foreign keys, one round trip to read and one to write
- [x] **Real authentication**: email and password, scrypt, hashed server-side sessions, HttpOnly cookie, rate limiting, employee-only registration, sign out
- [x] Demo mode flag and `.env.example`
- [x] **Deploy readiness**: `DEMO_MODE=0` first run creates only categories and one manager from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (fails loudly without them); failed connects and failed first runs are retried; `docs/DEPLOY.md` for Vercel + Turso
- [x] **Admin page** (`/admin/users`, managers only): create users with any role, change roles (not your own), reset passwords (signs the user out); demotion unassigns open tickets with an audit entry
- [x] **Account page**: change own password (current password required, other devices signed out)
- [x] **Asset management** for staff: add assets (unique tag, normalised type) and change status and holder
- [x] Request types no longer depend on the register (defaults plus register types), so a fresh production database works
- [x] 109 unit tests (flows, queries, comments, admin rules, password hashing, rate limiter, real SQLite database, accounts, production first run)
- [x] Everything above verified in a real browser, including access control (employees get 404 on `/admin/users`)

## Current
Nothing in progress. Pick from the backlog.

## Backlog
- [ ] **Deploy** (needs the owner's accounts): create the Turso database, set the env vars from `docs/DEPLOY.md`, deploy, and record anything that differs from the doc (the Turso path is untested)
- [ ] Playwright end-to-end tests for the manual script in TESTING.md
- [ ] README screenshots
- [ ] Shared rate limiter (Upstash Redis) for serverless, since the in-memory one resets per instance
- [ ] Password reset by email (needs an email provider)
- [ ] Deactivate (not delete) a user account
- [ ] Replace load-everything-per-request in `readDb()` with targeted queries if data grows
- [ ] Real schema migrations (today `CREATE TABLE IF NOT EXISTS` only creates; it does not alter existing tables)

## Decisions
See `docs/DECISIONS.md`.
