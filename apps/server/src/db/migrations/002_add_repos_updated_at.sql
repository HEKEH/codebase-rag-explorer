ALTER TABLE repos ADD COLUMN updated_at TEXT;

UPDATE repos
SET updated_at = datetime('now')
WHERE updated_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_repos_set_updated_at_after_insert
AFTER INSERT ON repos
FOR EACH ROW
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE repos SET updated_at = datetime('now') WHERE id = NEW.id;
END;
