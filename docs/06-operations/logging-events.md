# Server Logging Events

## Goals

- Keep logs queryable and stable across releases.
- Make one request traceable end-to-end with `requestId`.
- Keep event names short, explicit, and easy to grep.

## Required Fields

- `event`: stable event name.
- `requestId`: same value for one HTTP request chain.
- `durationMs`: when the event is about a timed operation.
- Domain fields: `repoId`, `topK`, `status`, etc.

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
  - `repo.import.requested`
  - `repo.import.succeeded`
  - `repo.service.import.started`
  - `repo.service.import.finished`
  - `repo.service.import.failed`
- Retrieval service
  - `retrieval.started`
  - `retrieval.finished`

## Extension Checklist

- Add new events using the naming pattern.
- Include `requestId` for all request-scoped logs.
- Add `durationMs` for operations that can regress.
- Update this document when adding or renaming events.
