# Handoff

The one-page state of the project. **Rewrite this at the end of every working session** (keep it under a page). It is for the next session, human or AI, who has not seen this conversation.

## What this project is
An IT helpdesk and asset tracker in Next.js, structured like a Microsoft Power Platform solution (data layer = Dataverse, pages = Power Apps, flows = Power Automate, dashboard = Power BI). Its purpose is a portfolio piece plus interview prep for a role using the Power Platform. Repo: github.com/Jayronj0616/helpdesk-platform (public, branch `master`).

## State
- Everything in PROGRESS.md under "Done" works and is pushed, **except the latest local commits**; run `git status -sb` and `git log origin/master..` to see what is unpushed.
- Ticket comments (public and internal), an audit trail of status, assignee and flow changes, and ticket search, filters and sorting are built and manually verified (see TESTING.md).
- Not yet browser-verified: manager approve/reject on `/requests`, "Escalate overdue tickets" button, new-ticket form after the comments change.

## Next step
Pick the first unchecked item in PROGRESS.md under "Current", else the top of "Backlog". Suggested order: verify manager flows in the browser, then link a ticket to an asset from the form, then pagination.

## Gotchas
- Next.js 16: `params` and `searchParams` are Promises; use `PageProps<"/route">` types. Read `node_modules/next/dist/docs/` if unsure.
- `Date.now()` in a component fails lint (`react-hooks/purity`). Put time logic in `src/lib/dataverse/queries.ts`.
- `data/db.json` is gitignored runtime state. Delete it to reseed. New tables need a default in `readDb()` so old files still load.
- Bash heredocs with quotes can fail in this environment; write files with the editor tools instead.
- Windows: git prints CRLF warnings and may exit 255 on success. Check `git log`, not the exit code.
- The user wants many small, single-purpose commits (they care about GitHub contributions).

## How to resume
```bash
git pull
npm install
npm run dev        # http://localhost:3000, persona switcher in the header
```
Then read PROGRESS.md and continue. Before committing: `npx eslint src && npx tsc --noEmit && npm run build`.
