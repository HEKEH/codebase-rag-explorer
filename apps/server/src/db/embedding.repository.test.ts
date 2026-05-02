import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("db/embedding.repository", () => {
  test("stores float32 vectors as blobs and supports repo-scoped reads", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-embedding-repo-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const repositoryModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/embedding.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const {
        saveEmbedding,
        saveEmbeddings,
        getEmbeddingByChunkId,
        getEmbeddingsByRepoId,
        deleteEmbeddingByChunkId,
        deleteEmbeddingsByRepoId
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
      db.query(
        "INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)"
      ).run("chunk-1", "repo-1", "src/a.ts", "function alpha() {}", "function");
      db.query(
        "INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)"
      ).run("chunk-2", "repo-1", "src/b.ts", "function beta() {}", "function");
      db.query(
        "INSERT INTO chunks (id, repo_id, file_path, content, chunk_type) VALUES (?, ?, ?, ?, ?)"
      ).run("chunk-3", "repo-2", "src/c.ts", "function gamma() {}", "function");

      saveEmbeddings([
        {
          id: "emb-1",
          chunk_id: "chunk-1",
          repo_id: "repo-1",
          model: "test-model",
          vector: new Float32Array([0.1, 0.2, 0.3])
        },
        {
          id: "emb-2",
          chunk_id: "chunk-2",
          repo_id: "repo-1",
          model: "test-model",
          vector: new Float32Array([0.3, 0.4, 0.5])
        }
      ]);

      const repo1Embeddings = getEmbeddingsByRepoId("repo-1");
      if (repo1Embeddings.length !== 2) {
        throw new Error("expected two embeddings for repo-1");
      }
      if (!(repo1Embeddings[0].vector instanceof Float32Array)) {
        throw new Error("expected vector to be Float32Array");
      }

      saveEmbedding({
        id: "emb-1",
        chunk_id: "chunk-1",
        repo_id: "repo-1",
        model: "test-model-v2",
        vector: new Float32Array([0.9, 1.0, 1.1])
      });
      const updated = getEmbeddingByChunkId("chunk-1");
      if (!updated || updated.model !== "test-model-v2" || Math.abs(updated.vector[0] - 0.9) > 0.0001) {
        throw new Error("expected embedding upsert to update data");
      }

      saveEmbedding({
        id: "emb-3",
        chunk_id: "chunk-3",
        repo_id: "repo-2",
        model: "test-model",
        vector: new Float32Array([0.6, 0.7, 0.8])
      });

      deleteEmbeddingByChunkId("chunk-2");
      if (getEmbeddingsByRepoId("repo-1").length !== 1) {
        throw new Error("expected deleteEmbeddingByChunkId to remove one row");
      }

      const deletedCount = deleteEmbeddingsByRepoId("repo-1");
      if (deletedCount !== 1) {
        throw new Error("expected deleteEmbeddingsByRepoId to return one deleted row");
      }

      if (getEmbeddingsByRepoId("repo-1").length !== 0) {
        throw new Error("expected repo-1 embeddings to be empty after deletion");
      }
      if (getEmbeddingsByRepoId("repo-2").length !== 1) {
        throw new Error("expected repo-2 embeddings to remain");
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
      .query<
        { id: string; size: number },
        []
      >("SELECT id, length(embedding) AS size FROM embeddings ORDER BY id ASC")
      .all();
    db.close();

    expect(rows.map((row) => row.id)).toEqual(["emb-3"]);
    expect(rows[0]?.size).toBe(12);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
