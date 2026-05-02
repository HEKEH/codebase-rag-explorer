import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("db/chunk.repository", () => {
  test("supports batch insert and repo-scoped CRUD", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-chunk-repo-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const repositoryModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const {
        saveChunks,
        saveChunk,
        getChunkById,
        getChunksByRepoId,
        deleteChunkById,
        deleteChunksByRepoId
      } = await import(${JSON.stringify(repositoryModulePath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      const db = getDb();
      db.query("INSERT INTO repos (id, path, type, status) VALUES (?, ?, ?, ?)").run(
        "repo-1",
        "/tmp/repo-1",
        "local",
        "loaded"
      );
      db.query("INSERT INTO repos (id, path, type, status) VALUES (?, ?, ?, ?)").run(
        "repo-2",
        "/tmp/repo-2",
        "local",
        "loaded"
      );

      const initialChunks = [
        {
          id: "chunk-1",
          repo_id: "repo-1",
          file_path: "src/a.ts",
          content: "function alpha() {}",
          chunk_type: "function",
          chunk_name: "alpha",
          start_line: 1,
          end_line: 1
        },
        {
          id: "chunk-2",
          repo_id: "repo-1",
          file_path: "src/b.ts",
          content: "class Beta {}",
          chunk_type: "class",
          chunk_name: "Beta",
          start_line: 1,
          end_line: 1
        }
      ];

      saveChunks(initialChunks);
      const repoChunks = getChunksByRepoId("repo-1");
      if (repoChunks.length !== 2) {
        throw new Error("expected two chunks after batch insert");
      }

      saveChunk({
        id: "chunk-1",
        repo_id: "repo-1",
        file_path: "src/a.ts",
        content: "function alphaUpdated() {}",
        chunk_type: "function",
        chunk_name: "alphaUpdated",
        start_line: 1,
        end_line: 1
      });

      const updated = getChunkById("chunk-1");
      if (!updated || updated.content !== "function alphaUpdated() {}") {
        throw new Error("expected upsert to update chunk content");
      }

      deleteChunkById("chunk-2");
      if (getChunksByRepoId("repo-1").length !== 1) {
        throw new Error("expected deleteChunkById to remove one row");
      }

      saveChunk({
        id: "chunk-3",
        repo_id: "repo-2",
        file_path: "src/c.ts",
        content: "def gamma(): pass",
        chunk_type: "generic",
        chunk_name: null,
        start_line: 1,
        end_line: 1
      });

      const deletedCount = deleteChunksByRepoId("repo-1");
      if (deletedCount !== 1) {
        throw new Error("expected deleteChunksByRepoId to return one deleted row");
      }

      if (getChunksByRepoId("repo-1").length !== 0) {
        throw new Error("expected repo-1 chunks to be empty after deletion");
      }

      if (getChunksByRepoId("repo-2").length !== 1) {
        throw new Error("expected repo-2 chunks to remain untouched");
      }

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
    const rows = db
      .query<{ id: string }, []>("SELECT id FROM chunks ORDER BY id ASC")
      .all();
    db.close();

    expect(rows.map((row) => row.id)).toEqual(["chunk-3"]);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
