import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

describe("db/connection", () => {
  test("creates database file and initializes required tables", () => {
    const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-db-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts")
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      getDb();
      closeDb();
    `;
    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(run.exitCode).toBe(0);
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('repos', 'chunks', 'embeddings')"
      )
      .all();
    const repoColumns = db.query<{ name: string }, []>("PRAGMA table_info(repos)").all().map((row) => row.name);
    db.close();

    expect(rows.map((row) => row.name).sort()).toEqual(["chunks", "embeddings", "repos"]);
    expect(repoColumns.includes("updated_at")).toBe(true);

    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("adds repos.updated_at for existing legacy database", () => {
    const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-db-legacy-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts")
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      const { Database } = await import("bun:sqlite");
      mkdirSync(dirname(${JSON.stringify(dbPath)}), { recursive: true });
      const legacyDb = new Database(${JSON.stringify(dbPath)}, { create: true });
      legacyDb.exec("CREATE TABLE repos (id TEXT PRIMARY KEY, path TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle', file_count INTEGER NOT NULL DEFAULT 0, chunk_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
      legacyDb.close();

      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      getDb();
      closeDb();
    `;
    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(run.exitCode).toBe(0);

    const db = new Database(dbPath, { readonly: true });
    const repoColumns = db.query<{ name: string }, []>("PRAGMA table_info(repos)").all().map((row) => row.name);
    db.close();

    expect(repoColumns.includes("updated_at")).toBe(true);
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
