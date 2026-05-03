import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_DB_PATH = resolve(import.meta.dir, "../../data/codebase-rag.db");

let db: Database | null = null;

function resolveDbFilePath(): string {
  // Read env when opening the DB, not at module load — otherwise tests (or any
  // code) that set DB_PATH after connection.ts was first imported would still
  // hit the wrong file and can pollute the dev database under data/.
  return process.env.DB_PATH ?? DEFAULT_DB_PATH;
}

function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationDir = join(import.meta.dir, "migrations");
  const migrationFiles = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const migrationId of migrationFiles) {
    const existing = database
      .query<
        { id: string },
        [string]
      >("SELECT id FROM schema_migrations WHERE id = ?")
      .get(migrationId);
    if (existing) continue;

    const migrationSql = readFileSync(join(migrationDir, migrationId), "utf-8");
    database.exec("BEGIN");
    try {
      database.exec(migrationSql);
      database
        .query("INSERT INTO schema_migrations (id) VALUES (?)")
        .run(migrationId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

export function getDb(): Database {
  if (db) return db;

  const dbFilePath = resolveDbFilePath();
  const dir = dirname(dbFilePath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbFilePath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  runMigrations(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
