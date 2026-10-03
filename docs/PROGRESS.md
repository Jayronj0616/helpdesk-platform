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
- [x] Power Platform blueprint guide
- [x] Published to GitHub (Jayronj0616/helpdesk-platform)
- [x] Ticket comments: public and internal notes, hidden from employees
- [x] Audit trail: status, assignee and flow changes logged on the ticket
- [x] Ticket search and filters (status, priority, category, assignee, overdue) and sorting, state in the URL
- [x] AI handoff docs (AGENTS.md, CLAUDE.md, docs/*)

## Current
- [x] Comment table and audit logging added to POWER-PLATFORM-BLUEPRINT.md
- [ ] Verify the manager flows in the browser (approve/reject, escalate)

## Backlog
- [ ] Sort the priority dropdown low to high on the new-ticket form
- [ ] Link a ticket to an asset from the ticket form
- [ ] Pagination for long ticket lists
- [ ] Unit tests (Vitest) for `filterTickets`, `visibleComments` and the three flows
- [ ] Real authentication and a database (replace persona switcher and `data/db.json`)
- [ ] README screenshots
- [ ] Deploy (Vercel + hosted database)

## Decisions
See `docs/DECISIONS.md`.
