import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_DB_PATH = resolve(import.meta.dir, "../../data/codebase-rag.db");
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

let db: Database | null = null;

function ensureReposUpdatedAtColumn(database: Database): void {
  const repoColumns = database
    .query<{ name: string }, []>("PRAGMA table_info(repos)")
    .all()
    .map((row) => row.name);
  if (!repoColumns.includes("updated_at")) {
    database.exec("ALTER TABLE repos ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
  }
}

export function getDb(): Database {
  if (db) return db;

  const dir = dirname(DB_PATH);
  mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const schemaPath = join(import.meta.dir, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  ensureReposUpdatedAtColumn(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
