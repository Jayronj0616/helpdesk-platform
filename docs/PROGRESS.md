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
- [x] Vitest unit tests (flows, queries, comments, password hashing, rate limiter, real SQLite database and auth)
- [x] **Real database**: SQLite via libSQL (local file, Turso-compatible), transactional writes, foreign keys
- [x] **Real authentication**: email and password, scrypt, hashed server-side sessions, HttpOnly cookie, rate limiting, employee-only registration, sign out
- [x] Persona switcher removed; every page and action requires a session
- [x] Demo mode flag (login hints and reset button) and `.env.example`
- [x] Hardening found while migrating: category, assignee and request type validated against the database, input length caps

## Current
Nothing in progress. Pick from the backlog.

## Backlog
- [ ] Playwright end-to-end tests for the manual script in TESTING.md
- [ ] README screenshots
- [ ] Deploy: needs a hosted Turso database (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`), `DEMO_PASSWORD` changed, and a decision on `DEMO_MODE`
- [ ] Admin page for managers to create or promote agent and manager accounts (today only the seed or a database insert can)
- [ ] Password change and password reset (reset needs email sending)
- [ ] Replace load-everything-per-request in `readDb()` with targeted queries if data grows
- [ ] Shared rate limiter (Redis) and trusted-proxy handling of `x-forwarded-for` if running more than one instance
- [ ] Real schema migrations (today `CREATE TABLE IF NOT EXISTS` only creates; it does not alter existing tables)

## Decisions
See `docs/DECISIONS.md`.
