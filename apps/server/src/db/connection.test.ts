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
});
