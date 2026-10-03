# System structure

Read this before changing code. Keep it updated when files are added, moved or removed.

## Stack
Next.js 16 (App Router, server components, server actions), TypeScript, Tailwind v4. No client-side data fetching. Pages read the store directly, and forms post to server actions.

Next.js 16 has breaking changes. Check `node_modules/next/dist/docs/` before using an API you are unsure about. `params` and `searchParams` are Promises, and the typed helpers are `PageProps<"/route">` and `LayoutProps<"/">`.

## Layout

```
src/
  app/
    layout.tsx            Shell: nav + persona switcher
    page.tsx              Dashboard (Power BI analog)
    actions.ts            ALL mutations (server actions). Role checks live here.
    tickets/
      page.tsx            Ticket list with search and filters (model-driven view)
      new/page.tsx        Submit ticket form (canvas app analog)
      [id]/page.tsx       Ticket detail, status edit, comment thread
    assets/page.tsx       Asset register
    requests/page.tsx     Asset request approval workflow
    flows/page.tsx        Flow run history, manual flow triggers
  components/
    Nav.tsx               Top nav
    PersonaSwitcher.tsx   Client component, switches the signed-in persona cookie
    ui.tsx                Badge, Card, PageTitle, class constants, label(), fmt()
  lib/
    dataverse/
      types.ts            Table types, SLA_HOURS. Source of truth for the data model.
      seed.ts             Demo data
      store.ts            File-backed DB (data/db.json): readDb, mutate, resetDb, newId
      queries.ts          Pure helpers over rows (isOpen, isOverdue, filterTickets)
      comments.ts         addComment, addSystemEntry (audit trail), visibleComments (hides internal notes)
    flows/index.ts        Automation flows (Power Automate analog). Each logs a FlowRun.
    session.ts            currentUser() from the persona cookie, role checks
docs/
  INDEX.md                Which doc answers which question
  HANDOFF.md              Current state and next step. Rewrite every session.
  PROGRESS.md             Task tracker. Update after every task.
  STRUCTURE.md            This file
  DATA-MODEL.md           Tables, enums, visibility rules
  FEATURES.md             Routes, permissions, server actions
  FLOWS.md                Automation flows
  TESTING.md              Checks and manual test script
  DECISIONS.md            Why it is built this way
  POWER-PLATFORM-BLUEPRINT.md   Guide to rebuilding this in the real Power Platform
AGENTS.md, CLAUDE.md      Auto-loaded by AI tools; point at docs/
data/db.json              Runtime database, gitignored, created from seed on first read
```

## Conventions
- **Mutations** go in `src/app/actions.ts` only. Each action calls `currentUser()`, checks the role, validates input, mutates via `mutate()`, then calls `revalidatePath`.
- **Role checks**: `canWorkTickets` (agent or manager) and `canApprove` (manager) in `session.ts`. Employees can only see their own tickets, and this is enforced both in list pages and in `tickets/[id]` (404).
- **Pure logic** (filtering, overdue checks) lives in `lib/dataverse/queries.ts`. The `react-hooks/purity` lint rule forbids `Date.now()` in components, so anything time-dependent goes there.
- **Automations** go in `lib/flows/index.ts`, take the `db` object so they run inside one `mutate()`, and call `logRun`.
- **Adding a table**: add the type and the `Database` field in `types.ts`, seed rows in `seed.ts`, and a default in `readDb()` (so old `db.json` files still load), then update `docs/POWER-PLATFORM-BLUEPRINT.md`.
- **UI**: reuse `ui.tsx` primitives. Every form control needs a label or `aria-label`.
- **Commits**: small, one logical change each, with a clear message.

## Verify before committing
```bash
npx eslint src && npx tsc --noEmit && npm run build
```
