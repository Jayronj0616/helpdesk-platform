@AGENTS.md

# Project workflow
- Read `docs/STRUCTURE.md` for the file layout and conventions, and `docs/PROGRESS.md` for the current task list.
- After finishing a task, tick it in `docs/PROGRESS.md`. If you add or move files, update `docs/STRUCTURE.md`.
- Verify with `npx eslint src && npx tsc --noEmit && npm run build` before committing.
- Commit one logical change at a time. The user wants many small commits.
