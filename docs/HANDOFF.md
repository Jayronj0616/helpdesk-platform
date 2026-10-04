# Handoff

The one-page state of the project. **Rewrite this at the end of every working session** (keep it under a page). It is for the next session, human or AI, who has not seen this conversation.

## What this project is
An IT helpdesk and asset tracker in Next.js, structured like a Microsoft Power Platform solution (data layer = Dataverse, pages = Power Apps, flows = Power Automate, dashboard = Power BI). Its purpose is a portfolio piece plus interview prep for a role using the Power Platform. Repo: github.com/Jayronj0616/helpdesk-platform (public, branch `master`).

## State (as of 2026-10-04)
- Everything in PROGRESS.md under "Done" works. Run `git status -sb` to see whether anything is unpushed.
- **Real auth and a real database are in.** SQLite through `@libsql/client` (`data/helpdesk.db`), email and password sign-in, hashed server-side sessions, rate limiting, employee-only registration. The persona switcher and JSON file are gone.
- Verified: 80 unit tests pass (`npm test`), lint, types and build are clean, and the sign-in, registration, flows, approval, escalation and reset paths were run in a real browser (see TESTING.md).

## Next step
Safe, self-contained tasks:
1. **README screenshots** and a **Playwright** suite for the manual script in TESTING.md (needs a browser download).
2. **Admin page** so a manager can create or promote agents and managers (today only the seed or a database insert can).
3. **Password change** (reset needs email sending, so that is a later step).

Needs a decision or outside setup:
- **Deploy**: create a hosted Turso database, set `DATABASE_URL` and `DATABASE_AUTH_TOKEN`, change `DEMO_PASSWORD`, and decide whether `DEMO_MODE` stays on for a public demo. Vercel or any serverless host works because there is no local disk dependency once `DATABASE_URL` is remote.

## Gotchas
- Next.js 16: `params` and `searchParams` are Promises; use `PageProps<"/route">` types. Read `node_modules/next/dist/docs/` if unsure.
- `readDb()` and `mutate()` are **async**; always `await`. Every page and action starts with `requireUser()`.
- `Date.now()` in a component fails lint (`react-hooks/purity`). Put time logic in `src/lib/dataverse/queries.ts`.
- `src/lib/dataverse/schema.ts` and `types.ts` must stay in step. `CREATE TABLE IF NOT EXISTS` never alters an existing table, so a changed column needs a real migration (or delete `data/helpdesk.db` in development).
- SQL returns rows in insertion order, so each table has an `orderBy` in `schema.ts` to keep arrays newest-first where the code relies on `unshift()`.
- React 19 clears a form after every server action. Login and register return the entered values (never the password) to refill it.
- Unit tests depend on the relative dates in `seed.ts`. The DB tests set `DATABASE_URL` before importing the store, because the client is created at import time.
- Vitest 5 needs `@types/node` 22 or newer (already upgraded).
- To sign in during testing: demo accounts and the shared password are on the login page (default `helpdesk-demo`). In a browser tool, use the form; there is no persona cookie any more.
- Bash heredocs with quotes can fail in this environment, and `python` is a hanging Windows Store stub. Write files with the editor tools and use `node` scripts (a file, not `node -e`, when the text has apostrophes).
- Windows: git prints CRLF warnings and may exit 255 on success. Check `git log`, not the exit code.
- The user wants many small, single-purpose commits (they care about GitHub contributions).

## How to resume
```bash
git pull
npm install
npm run dev        # http://localhost:3000, sign in with a demo account
```
Then read PROGRESS.md and continue. Before committing: `npx eslint . && npx tsc --noEmit && npm test && npm run build`.
