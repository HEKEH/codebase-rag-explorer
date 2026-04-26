import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("RetrievalService", () => {
  test("returns top-k results from SQLiteVectorStore sorted by score", async () => {
    const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-service-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const vectorStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/sqlite-vector-store.ts")
    ).href;
    const retrievalServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/retrieval.service.ts")
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts")
    ).href;
    const chunkRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts")
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts")
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { SQLiteVectorStore } = await import(${JSON.stringify(vectorStoreModulePath)});
      const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
      const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
      const { saveChunks } = await import(${JSON.stringify(chunkRepoModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      const repoId = "repo-test-retrieval";
      saveRepo({
        id: repoId,
        path: "/tmp/repo-test-retrieval",
        type: "local",
        status: "indexed",
        fileCount: 2,
        chunkCount: 2
      });

      saveChunks([
        {
          id: "chunk-1",
          repo_id: repoId,
          file_path: "src/a.ts",
          content: "function alpha() {}",
          chunk_type: "function",
          chunk_name: "alpha",
          start_line: 1,
          end_line: 1
        },
        {
          id: "chunk-2",
          repo_id: repoId,
          file_path: "src/b.ts",
          content: "function beta() {}",
          chunk_type: "function",
          chunk_name: "beta",
          start_line: 1,
          end_line: 1
        }
      ]);

      const store = new SQLiteVectorStore({
        async embedQuery() { return [1, 0, 0]; },
        async embedDocuments(texts) { return texts.map(() => [1, 0, 0]); }
      });
      await store.addVectors(
        [
          [1, 0, 0],
          [0, 1, 0]
        ],
        [
          { pageContent: "function alpha() {}", metadata: { chunk_id: "chunk-1", repo_id: repoId } },
          { pageContent: "function beta() {}", metadata: { chunk_id: "chunk-2", repo_id: repoId } }
        ]
      );

      const service = new RetrievalService({
        embedQuestion: async () => [1, 0, 0]
      });
      const results = await service.retrieve("alpha function", repoId, 1);
      if (results.length !== 1 || results[0]?.chunk_id !== "chunk-1") {
        throw new Error("expected retrieval to return chunk-1 as top-1 result");
      }

      closeDb();
    `;

    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe"
    });

    if (run.exitCode !== 0) {
      throw new Error(Buffer.from(run.stderr).toString("utf8"));
    }

    const db = new Database(dbPath, { readonly: true });
    const embeddingRows = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM embeddings").get();
    db.close();
    expect(embeddingRows?.count).toBe(2);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
