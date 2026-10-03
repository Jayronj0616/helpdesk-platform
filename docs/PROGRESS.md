# Progress tracker

Update this file as part of every task: tick the box, add a one-line note, and move new ideas into Backlog. See `docs/INDEX.md` for the other docs and `docs/HANDOFF.md` for the next step.

Status key: `[x]` done, `[~]` in progress, `[ ]` to do.

## Done
- [x] Dataverse-style data layer (types, seed, JSON store)
- [x] Persona switcher and role checks (employee, agent, manager)
- [x] Dashboard with KPI tiles and charts
- [x] Tickets: list, new, detail, status and assignee edit
- [x] Assets register
- [x] Asset requests with manager approval
- [x] Flows: ticket created, escalate overdue, asset request decided, with run history
- [x] Power Platform blueprint guide (including Comment table and audit logging)
- [x] Published to GitHub (Jayronj0616/helpdesk-platform)
- [x] Ticket comments: public and internal notes, hidden from employees
- [x] Audit trail: status, assignee and flow changes logged on the ticket
- [x] Ticket search and filters (status, priority, category, assignee, overdue) and sorting, state in the URL
- [x] AI handoff docs (AGENTS.md, CLAUDE.md, docs/*)
- [x] Manager flows verified in a real browser (approve, escalate, reset)
- [x] Priority dropdown ordered low to high
- [x] Link a related asset when creating a ticket (permission-checked), and validate the category
- [x] Pagination for the ticket list
- [x] Vitest unit tests: 47 tests for queries, comments and flows

## Current
Nothing in progress. Pick from the backlog.

## Backlog
- [ ] Link or change a ticket's asset from the ticket detail page (staff)
- [ ] Playwright end-to-end tests for the manual script in TESTING.md
- [ ] Real authentication and a database (replace persona switcher and `data/db.json`); needs a decision on provider, see DECISIONS.md
- [ ] README screenshots
- [ ] Deploy (Vercel needs a hosted database first, because `data/db.json` needs a writable disk)
- [ ] Dashboard: tickets per day trend chart (matches the Power BI line chart in the blueprint)

## Decisions
See `docs/DECISIONS.md`.
