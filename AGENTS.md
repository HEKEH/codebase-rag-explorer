# Agent notes (Cursor / Claude)

## Tooling

- **Package manager**: Bun only. Use `bun install`, `bun run …`; do not assume pnpm/npm for this repo.
- **Workspaces**: `apps/*`, `packages/*` (see root `package.json`).

## Layout

- **Server**: `apps/server` (Elysia API, SQLite, RAG pipeline).
- **Web**: `apps/web` (Vite + React; routes `/repos`, `/chat` via `App.tsx`).
- **Shared**: `packages/types`, `packages/api-client`, `packages/constants`, etc.

## Project rules in-repo

- **Cursor**: no `.cursor/rules/` or root `.cursorrules` checked in; plan snapshots under `.cursor/plans/` may use legacy `docs/*.md` shorthand — canonical paths are under `docs/01-product/`, `docs/02-technical/`, `docs/03-planning/`, etc. (**[docs/README.md](docs/README.md)**).
- **Skills**: `.agents/skills/` (e.g. `cursor-neat-freak`, `vercel-react-best-practices`).

## Docs hygiene

- Executable acceptance assets: **`docs/05-quality/acceptance-question-set.json`**, report **`docs/05-quality/acceptance-eval-report.md`**, script **`apps/server/src/scripts/acceptance-eval.ts`**.
