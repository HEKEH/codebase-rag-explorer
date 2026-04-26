import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_DB_PATH = resolve(import.meta.dir, "../../data/codebase-rag.db");
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

let db: Database | null = null;

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

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
