# Handoff

The one-page state of the project. **Rewrite this at the end of every working session** (keep it under a page). It is for the next session, human or AI, who has not seen this conversation.

## What this project is
An IT helpdesk and asset tracker in Next.js, structured like a Microsoft Power Platform solution (data layer = Dataverse, pages = Power Apps, flows = Power Automate, dashboard = Power BI). Its purpose is a portfolio piece plus interview prep for a role using the Power Platform. Repo: github.com/Jayronj0616/helpdesk-platform (public, branch `master`). The owner plans to deploy it to **Vercel**.

## State (as of 2026-10-04)
- Everything in PROGRESS.md under "Done" works. Run `git status -sb` to see whether anything is unpushed.
- Real auth and a real database are in (SQLite via `@libsql/client`; hosted Turso in production, because Vercel's disk is read-only and temporary).
- Admin features are in: `/admin/users` (managers), `/account` (everyone), asset add and edit (staff), and a production first-run mode (`DEMO_MODE=0` plus `ADMIN_EMAIL` and `ADMIN_PASSWORD`).
- Verified: 126 unit tests (`npm test`), 34 Playwright end-to-end tests (`npm run test:e2e`, real Chrome), lint (including type-aware promise rules), types and build are clean. GitHub Actions runs all of it on every push and is green (checked 2026-10-04). Setting it up found two Linux-only problems, both fixed: a Windows-generated lockfile missing `@emnapi/*` (pinned as dev dependencies), and `PageProps`/`LayoutProps` not existing on a fresh clone until `next typegen` runs (use `npm run typecheck`, never a bare `tsc`).
- Also built: versioned schema migrations, user deactivation, a database-backed rate limiter, a reset that restores demo passwords.
- **Not verified:** anything against a real Turso database. Only a local libSQL file has been used.

## Next step
1. **Deploy** (needs the owner): follow `docs/DEPLOY.md`. After the first deploy, fix that doc with whatever differed, and check cold-start time and the latency of a write.
2. Then: README screenshots, password reset by email (needs an email provider), targeted queries instead of loading every table.

## Gotchas
- Next.js 16: `params` and `searchParams` are Promises; use `PageProps<"/route">` types. Read `node_modules/next/dist/docs/` if unsure.
- `readDb()` and `mutate()` are **async**; always `await`. Every page and action starts with `requireUser()`. Admin actions go through `requireManager()` in `admin-actions.ts`.
- `Date.now()` in a component fails lint (`react-hooks/purity`). Put time logic in `src/lib/dataverse/queries.ts`.
- `schema.ts` and `types.ts` must stay in step. A new column on an existing table needs a numbered migration in `migrations.ts` as well (never edit a released one). New tables are created automatically.
- Each table has an `orderBy` in `schema.ts` to keep arrays newest-first where the code relies on `unshift()`.
- React 19 clears a form after every server action. Forms that can fail return the entered values (never a password) to refill them (`FormState.values`).
- `config.ts` reads env vars at import time. Tests that need different env set it before a dynamic `import()`, one test file per scenario (vitest isolates modules per file).
- Unit tests depend on the relative dates in `seed.ts`.
- Async functions (`readDb`, `mutate`, the limiter, auth) must be awaited. TypeScript does not catch `if (!limiter.attempt(k))`, so the type-aware lint rules do; do not turn them off.
- E2E tests share one database and run in file order (01 to 06); a new test must fit that order. Playwright reloads its config in each worker, so never delete the database unconditionally there.
- Vitest 5 needs `@types/node` 22 or newer (already upgraded).
- To sign in during testing: demo accounts and the shared password are on the login page (default `helpdesk-demo`). The browser tool can fill the login form; `form.requestSubmit()` through JavaScript works for inline forms.
- Bash heredocs with quotes can fail in this environment, and `python` is a hanging Windows Store stub. Write files with the editor tools and use `node` scripts (a file, not `node -e`, when the text has apostrophes).
- If `npm ci` fails in CI with a lockfile mismatch after adding a dependency on Windows, run `npm install --package-lock-only` and check for missing optional packages; regenerating on Linux (or WSL) is the clean fix.
- Windows: git prints CRLF warnings and may exit 255 on success. Check `git log`, not the exit code.
- The user wants many small, single-purpose commits (they care about GitHub contributions).

## How to resume
```bash
git pull
npm install
npm run dev        # http://localhost:3000, sign in with a demo account
```
Then read PROGRESS.md and continue. Before committing: `npx eslint . && npm run typecheck && npm test && npm run build`.
