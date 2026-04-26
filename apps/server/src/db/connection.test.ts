import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("db/connection", () => {
  test("creates database file and initializes required tables", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "server-db-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const connectionModulePath = pathToFileURL(
      join(process.cwd(), "apps/server/src/db/connection.ts")
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      getDb();
      closeDb();
    `;
    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: process.cwd(),
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
    db.close();

    expect(rows.map((row) => row.name).sort()).toEqual(["chunks", "embeddings", "repos"]);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
