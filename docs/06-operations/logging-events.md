# Server Logging Events

## Goals

- Keep logs queryable and stable across releases.
- Make one request traceable end-to-end with `requestId`.
- Keep event names short, explicit, and easy to grep.

## Required Fields

- `event`: stable event name.
- `requestId`: same value for one HTTP request chain.
- `durationMs`: when the event is about a timed operation.
- Domain fields: `repo_id`, `topK`, `status`, etc.

## Event Naming Rules

- Pattern: `<domain>.<action>.<state>`
- Domain examples: `http`, `ask`, `index`, `repo`, `retrieval`.
- State vocabulary:
  - `start` / `finish` for generic HTTP lifecycle
  - `requested` / `succeeded` / `failed` for route-level business lifecycle
  - `started` / `finished` / `failed` for service-level execution lifecycle
- Use dot-separated lowercase words only.
- Event names are immutable once used externally (dashboards, alerts, parsers).

## Current Event Catalog

- HTTP lifecycle
  - `http.request.start`
  - `http.request.finish`
  - `http.request.error`
- Server lifecycle
  - `server.started`
- Ask route/service
  - `ask.requested`
  - `ask.succeeded`
  - `ask.no_relevant_code`
  - `ask.failed`
  - `ask.service.started`
  - `ask.service.index_not_built`
  - `ask.service.no_relevant_code`
  - `ask.service.llm.request`
  - `ask.service.llm.response`
  - `ask.service.finished`
- Index route/service
  - `index.build.requested`
  - `index.build.background.failed`
  - `index.status.requested`
  - `index.service.started`
  - `index.service.split.finished`
  - `index.service.finished`
  - `index.service.failed`
- Repo route/service
  - `repos.create.requested`
  - `repos.create.succeeded`
  - `repos.delete.requested`
  - `repos.delete.succeeded`
  - `repos.reload.requested`
  - `repos.chat_history.clear.requested`
  - `repos.chat_history.clear.succeeded`
  - `repo.import.requested`
  - `repo.import.succeeded`
  - `repo.service.import.started`
  - `repo.service.import.finished`
  - `repo.service.import.failed`
- Retrieval service
  - `retrieval.started` — may include `sparseMode`, `chunkIdsFilterSize`.
  - `retrieval.finished` — may include `sparseMode`, `sparseSource` (`bm25_fts` \| `full_table` \| `none`); empty `chunk_ids` whitelist short-circuits with `chunkIdsFilterEmpty: true` and `skipReason: "empty_chunk_ids_whitelist"`.

## Sparse index (`chunk_fts`)

- DDL 由迁移 `003_chunk_fts.sql` 创建；**旧库升级**后表可能为空直至对仓库执行 **重建索引 / 重载**（与执行原则：FTS 填充需可追溯说明一致）。
- 行数据在 **`saveChunk` / `saveChunks`** 时与 `chunks` 同步写入（`DELETE` + `INSERT`，每 `chunk_id` 至多一行）。
- 删除与 `chunks` 对齐：**`deleteChunkById`**、**`deleteChunksByRepoId`**（同一事务内先删 `chunk_fts`）、**`deleteRepoById`**（先按 `repo_id` 清空 `chunk_fts`，再删 `repos`；`chunks` 仍由 FK CASCADE 清理）。

## Extension Checklist

- Add new events using the naming pattern.
- Include `requestId` for all request-scoped logs.
- Add `durationMs` for operations that can regress.
- Update this document when adding or renaming events.
