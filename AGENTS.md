<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HelpDesk Platform: instructions for AI agents

IT helpdesk and asset tracker in Next.js 16 + TypeScript + Tailwind, structured like a Microsoft Power Platform solution. You can work without reading the whole repo: the docs below are written for that.

## Read in this order
1. `docs/HANDOFF.md`: current state, next step, gotchas. Read first.
2. `docs/PROGRESS.md`: pick the task.
3. Then only what the task needs: `docs/STRUCTURE.md` (files and conventions), `docs/DATA-MODEL.md`, `docs/FEATURES.md` (routes and permissions), `docs/FLOWS.md`, `docs/TESTING.md`, `docs/DECISIONS.md`. `docs/INDEX.md` lists them all.

## Hard rules
- All mutations go in `src/app/actions.ts`, and each action re-checks the role and validates input.
- Always render comments through `visibleComments()` so internal notes never reach employees.
- No `Date.now()` in components; use `src/lib/dataverse/queries.ts`.
- Every form control needs a label or `aria-label`.
- Tables added to the data model need a default in `readDb()`, a seed entry, and an update to `docs/DATA-MODEL.md` and the blueprint.

## Definition of done
1. `npx eslint . && npx tsc --noEmit && npm test && npm run build` all pass.
2. The change is verified (see `docs/TESTING.md`).
3. Docs updated: tick `docs/PROGRESS.md`; update `STRUCTURE.md`, `DATA-MODEL.md`, `FEATURES.md` or `FLOWS.md` if what they describe changed; rewrite `docs/HANDOFF.md`.
4. Committed in small, single-purpose commits.
