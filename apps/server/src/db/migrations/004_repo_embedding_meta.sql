-- P4-4: persist canonical embedding model id and vector dimension per repo (updated on successful index).
ALTER TABLE repos ADD COLUMN embedding_model_id TEXT;
ALTER TABLE repos ADD COLUMN embedding_dimension INTEGER;
