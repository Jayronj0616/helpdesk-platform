# Handoff

The one-page state of the project. **Rewrite this at the end of every working session** (keep it under a page). It is for the next session, human or AI, who has not seen this conversation.

## What this project is
An IT helpdesk and asset tracker in Next.js, structured like a Microsoft Power Platform solution (data layer = Dataverse, pages = Power Apps, flows = Power Automate, dashboard = Power BI). Its purpose is a portfolio piece plus interview prep for a role using the Power Platform. Repo: github.com/Jayronj0616/helpdesk-platform (public, branch `master`).

## State (as of 2026-10-04)
- Everything in PROGRESS.md under "Done" works. Run `git status -sb` to see whether anything is unpushed.
- Verified: 47 unit tests pass (`npm test`), lint, types and build are clean, and the full manual script was run in a browser (see TESTING.md).
- Built since the first handoff: comments and audit trail, search, filters and sorting, pagination, related-asset link on the new-ticket form, category validation, Vitest suite.

## Next step
The remaining backlog items are larger and need a decision or outside setup:
1. **Auth and database**: choose a provider (for example Auth.js with credentials or GitHub, and SQLite via Drizzle for local, Postgres for hosting). Keep the `store.ts` function signatures (`readDb`, `mutate`) or migrate callers deliberately. This is a big change, so plan it in DECISIONS.md first.
2. **Deploy**: blocked on a hosted database, since `data/db.json` needs a writable disk.
3. **README screenshots** and a Playwright suite are safe, self-contained tasks.
4. Smaller: change a ticket's asset from the detail page; tickets-per-day chart on the dashboard.

## Gotchas
- Next.js 16: `params` and `searchParams` are Promises; use `PageProps<"/route">` types. Read `node_modules/next/dist/docs/` if unsure.
- `Date.now()` in a component fails lint (`react-hooks/purity`). Put time logic in `src/lib/dataverse/queries.ts`.
- `data/db.json` is gitignored runtime state. Delete it to reseed. New tables need a default in `readDb()` so old files still load.
- Unit tests depend on the relative dates in `seed.ts`. Changing the seed can break test expectations.
- Vitest 5 needs `@types/node` 22 or newer (already upgraded).
- Bash heredocs with quotes can fail in this environment, and `python` is a hanging Windows Store stub. Write files with the editor tools and use `node` for scripts.
- To test as another persona in a browser, set the cookie: `document.cookie = "persona=u5; path=/"` (u1 Maria employee, u3 Ana agent, u5 Dina manager).
- Windows: git prints CRLF warnings and may exit 255 on success. Check `git log`, not the exit code.
- The user wants many small, single-purpose commits (they care about GitHub contributions).

## How to resume
```bash
git pull
npm install
npm run dev        # http://localhost:3000, persona switcher in the header
```
Then read PROGRESS.md and continue. Before committing: `npx eslint . && npx tsc --noEmit && npm test && npm run build`.
