import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

describe("db/chunk_fts migration", () => {
  test("supports MATCH, repo_id filter, and bm25 ordering", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "chunk-fts-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const run = Bun.spawnSync({
      cmd: [
        "bun",
        "-e",
        `
        process.env.DB_PATH = ${JSON.stringify(dbPath)};
        const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
        const db = getDb();
        db.exec(\`
          INSERT INTO chunk_fts (chunk_id, repo_id, body) VALUES
            ('c-a', 'repo-1', 'function validateToken works'),
            ('c-b', 'repo-1', 'unrelated blob'),
            ('c-c', 'repo-2', 'validateToken duplicate');
        \`);
        closeDb();
      `,
      ],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(run.exitCode).toBe(0);
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const repo1 = db
      .query<
        { chunk_id: string },
        [string]
      >(
        `SELECT chunk_id FROM chunk_fts
         WHERE chunk_fts MATCH 'validateToken' AND repo_id = ?
         ORDER BY bm25(chunk_fts)`,
      )
      .all("repo-1");
    const repo2 = db
      .query<
        { chunk_id: string },
        [string]
      >(
        `SELECT chunk_id FROM chunk_fts
         WHERE chunk_fts MATCH 'validateToken' AND repo_id = ?`,
      )
      .all("repo-2");
    db.close();

    expect(repo1.map((r) => r.chunk_id).sort()).toEqual(["c-a"]);
    expect(repo2.map((r) => r.chunk_id).sort()).toEqual(["c-c"]);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
