CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('local', 'git')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'loaded', 'indexing', 'indexed', 'failed')),
  file_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_type TEXT NOT NULL DEFAULT 'generic' CHECK(chunk_type IN ('function', 'class', 'generic')),
  chunk_name TEXT,
  start_line INTEGER,
  end_line INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL UNIQUE REFERENCES chunks(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chunks_repo_id ON chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_repo_id ON embeddings(repo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_type_path_unique ON repos(type, path);
