import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { monorepoRootFromCwd } from "../lib/monorepo-root";

describe("RetrievalService", () => {
  test("returns top-k results from SQLiteVectorStore sorted by score", async () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-service-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const vectorStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/sqlite-vector-store.ts"),
    ).href;
    const retrievalServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/retrieval.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const chunkRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    try {
      const command = `
        process.env.DB_PATH = ${JSON.stringify(dbPath)};
        const { SQLiteVectorStore } = await import(${JSON.stringify(vectorStoreModulePath)});
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const { saveChunks } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
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
        } finally {
          closeDb();
        }
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

      const db = new Database(dbPath, { readonly: true });
      const embeddingRows = db
        .query<
          { count: number },
          []
        >("SELECT COUNT(*) AS count FROM embeddings")
        .get();
      db.close();
      expect(embeddingRows?.count).toBe(2);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("uses lexical/path fallback for module location questions", async () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(
      join(tmpdir(), "server-retrieval-service-lexical-"),
    );
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const retrievalServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/retrieval.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const chunkRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    try {
      const command = `
        process.env.DB_PATH = ${JSON.stringify(dbPath)};
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const { saveChunks } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
          const repoId = "repo-test-retrieval-lexical";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-test-retrieval-lexical",
            type: "local",
            status: "indexed",
            fileCount: 2,
            chunkCount: 2
          });

          saveChunks([
            {
              id: "chunk-route-ask",
              repo_id: repoId,
              file_path: "apps/server/src/routes/ask.ts",
              content: "export const askRoutes = new Elysia();",
              chunk_type: "generic",
              chunk_name: "askRoutes",
              start_line: 1,
              end_line: 1
            },
            {
              id: "chunk-unrelated",
              repo_id: repoId,
              file_path: "apps/server/src/services/repo.service.ts",
              content: "export class RepoService {}",
              chunk_type: "class",
              chunk_name: "RepoService",
              start_line: 1,
              end_line: 1
            }
          ]);

          // Semantic scores are intentionally flat/low to force lexical fallback to matter.
          const fakeVectorStore = {
            async similaritySearchVectorWithScore() {
              return [
                [{ pageContent: "export class RepoService {}", metadata: { chunk_id: "chunk-unrelated", file_path: "apps/server/src/services/repo.service.ts", chunk_type: "class", chunk_name: "RepoService" } }, 0.01],
                [{ pageContent: "export const askRoutes = new Elysia();", metadata: { chunk_id: "chunk-route-ask", file_path: "apps/server/src/routes/ask.ts", chunk_type: "generic", chunk_name: "askRoutes" } }, 0.01]
              ];
            }
          };

          const service = new RetrievalService(
            { embedQuestion: async () => [0, 0, 0] },
            fakeVectorStore
          );
          const results = await service.retrieve("问答 API 在哪里定义 ask route", repoId, 1);
          if (results.length !== 1 || results[0]?.chunk_id !== "chunk-route-ask") {
            throw new Error("expected lexical fallback to prioritize ask route chunk");
          }
        } finally {
          closeDb();
        }
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
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
