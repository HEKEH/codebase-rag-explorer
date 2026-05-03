# Codebase RAG Explorer

Monorepo (Bun workspaces): `apps/server`, `apps/web`, `packages/*`.

## Requirements

- [Bun](https://bun.sh/) **>= 1.3.11** (`package.json` `engines` / `packageManager`). Install must use Bun; the root `preinstall` script rejects npm/yarn/pnpm-only installs.

## Commands

| Command | Purpose |
| --- | --- |
| `bun install` | Install dependencies |
| `bun run dev` | Run server + web dev servers in parallel |
| `bun run dev:server` / `bun run dev:web` | One app only |
| `bun run typecheck` | Typecheck packages and apps |
| `bun run test` | Tests across packages and apps |
| `bun run acceptance-eval` | PRD acceptance eval script (needs `.env`; see server docs) |

## Documentation

- **[docs/README.md](docs/README.md)** — index of `docs/` (PRD, TRD, roadmaps, quality, operations).

There is no `.cursor/rules/` directory in this repo; optional agent skills live under **`.agents/skills/`**.
