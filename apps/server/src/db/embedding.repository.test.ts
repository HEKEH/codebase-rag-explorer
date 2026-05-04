import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

describe("db/embedding.repository", () => {
  test("deleteEmbeddingsByRepoId removes only that repo and returns change count", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-embedding-repo-"));
    try {
      const dbPath = join(tempRoot, "nested", "codebase-rag.db");
      const repositoryModulePath = pathToFileURL(
        join(testCwd, "apps/server/src/db/embedding.repository.ts"),
      ).href;
      const connectionModulePath = pathToFileURL(
        join(testCwd, "apps/server/src/db/connection.ts"),
      ).href;

      const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { deleteEmbeddingsByRepoId } = await import(${JSON.stringify(repositoryModulePath)});
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
      for (const row of [
        ["chunk-1", "repo-1", "src/a.ts"],
        ["chunk-2", "repo-1", "src/b.ts"],
        ["chunk-3", "repo-2", "src/c.ts"],
      ]) {
        db.query(
          "INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)"
        ).run(row[0], row[1], row[2], "x", "generic");
      }
      const blob = new Uint8Array([1, 2, 3, 4]);
      db.query(
        "INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model) VALUES (?, ?, ?, ?, ?)"
      ).run("emb-1", "chunk-1", "repo-1", blob, "m");
      db.query(
        "INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model) VALUES (?, ?, ?, ?, ?)"
      ).run("emb-2", "chunk-2", "repo-1", blob, "m");
      db.query(
        "INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model) VALUES (?, ?, ?, ?, ?)"
      ).run("emb-3", "chunk-3", "repo-2", blob, "m");

      const deleted = deleteEmbeddingsByRepoId("repo-1");
      if (deleted !== 2) {
        throw new Error("expected deleteEmbeddingsByRepoId to return 2, got " + deleted);
      }
      const c1 = db.query("SELECT COUNT(*) AS n FROM embeddings WHERE repo_id = ?").get("repo-1").n;
      const c2 = db.query("SELECT COUNT(*) AS n FROM embeddings WHERE repo_id = ?").get("repo-2").n;
      if (c1 !== 0 || c2 !== 1) {
        throw new Error("expected repo-1 empty and repo-2 count 1, got " + c1 + "," + c2);
      }
      const again = deleteEmbeddingsByRepoId("repo-1");
      if (again !== 0) {
        throw new Error("expected second delete of empty repo to return 0, got " + again);
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
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
