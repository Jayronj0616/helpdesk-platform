# Progress tracker

Update this file as part of every task: tick the box, add a one-line note, and move new ideas into Backlog. See `docs/STRUCTURE.md` for how the code is organised.

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

## Current: Comments and search
- [ ] Comment type, store migration and seed data
- [ ] Add comment action (role-aware, internal notes)
- [ ] Audit trail: status and assignee changes logged as system entries
- [ ] Comment thread UI on ticket detail
- [ ] `filterTickets` query helper
- [ ] Ticket list: search, status, priority, category, assignee, overdue filters and sort
- [ ] Update STRUCTURE.md, blueprint (Comment table) and README

## Backlog
- [ ] Verify the manager flows in the browser (approve/reject, escalate)
- [ ] Sort the priority dropdown low to high on the new-ticket form
- [ ] Link a ticket to an asset from the ticket form
- [ ] Pagination for long ticket lists
- [ ] Real authentication and a database (replace persona switcher and `data/db.json`)
- [ ] README screenshots
- [ ] Deploy (Vercel + hosted database)

## Decisions
- JSON file store instead of a database, to keep the demo zero-setup. The store module is the only thing to swap.
- Persona switcher instead of real login, so each security role can be demoed instantly.
