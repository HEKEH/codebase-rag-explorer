-- Sparse retrieval (roadmap P1-1): FTS5 shadow index, one logical row per chunk.
-- Rows are kept in sync with `chunks` on insert/update/delete/reload (P1-2, P1-3).
--
-- Why not EXTERNAL CONTENT against `chunks`:
-- `chunks.id` is TEXT PRIMARY KEY; FTS5 content= mapping is rowid-centric and adds
-- coupling. Application-maintained shadow rows are explicit and easy to reason about.
--
-- chunk_id: equals chunks.id (join key).
-- repo_id: equals chunks.repo_id; use WHERE repo_id = ? with MATCH for isolation.
-- body: searchable text (exact composition aligned with embedding input in P1-2).

CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
  chunk_id UNINDEXED,
  repo_id UNINDEXED,
  body,
  tokenize = 'unicode61'
);
