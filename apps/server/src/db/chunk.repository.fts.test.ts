import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { monorepoRootFromCwd } from "../lib/monorepo-root";

describe("db/chunk.repository chunk_fts sync (P1-2)", () => {
  test("saveChunks and saveChunk upsert keep chunk_fts MATCHable body aligned with chunks", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-chunk-fts-sync-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const repositoryModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const tokenA = "fts_p12_token_alpha_unique";
    const tokenB = "fts_p12_token_beta_unique";

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { saveChunks, saveChunk } = await import(${JSON.stringify(repositoryModulePath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      const db = getDb();
      db.query("INSERT INTO repos (id, path, type, status) VALUES (?, ?, ?, ?)").run(
        "repo-fts",
        "/tmp/repo-fts",
        "local",
        "loaded"
      );

      saveChunks([
        {
          id: "chunk-fts-1",
          repo_id: "repo-fts",
          file_path: "src/x.ts",
          content: "export function x() { return '${tokenA}'; }",
          chunk_type: "function",
          chunk_name: "x",
          start_line: 1,
          end_line: 2
        }
      ]);

      saveChunk({
        id: "chunk-fts-1",
        repo_id: "repo-fts",
        file_path: "src/x.ts",
        content: "export function x() { return '${tokenB}'; }",
        chunk_type: "function",
        chunk_name: "x",
        start_line: 1,
        end_line: 2
      });

      closeDb();
    `;

    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe",
    });

    if (run.exitCode !== 0) {
      throw new Error(Buffer.from(run.stderr).toString("utf8"));
    }
    expect(run.exitCode).toBe(0);

    const db = new Database(dbPath, { readonly: true });
    const ftsRows = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM chunk_fts WHERE repo_id = 'repo-fts'",
      )
      .get();
    const matchA = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts
         WHERE chunk_fts MATCH ${JSON.stringify(tokenA)} AND repo_id = 'repo-fts'`,
      )
      .get();
    const matchB = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts
         WHERE chunk_fts MATCH ${JSON.stringify(tokenB)} AND repo_id = 'repo-fts'`,
      )
      .get();
    db.close();

    expect(ftsRows?.n).toBe(1);
    expect(matchA?.c).toBe(0);
    expect(matchB?.c).toBe(1);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
