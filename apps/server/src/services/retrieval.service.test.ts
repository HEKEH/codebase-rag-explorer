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

  test("P1-6 fts sparse path does not call getChunksByRepoId (full-table scan)", async () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-fts-noscan-"));
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
        process.env.RETRIEVAL_SPARSE_MODE = "fts";
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const {
          saveChunks,
          getChunksByIds,
          searchChunkIdsByFtsBm25,
          getChunksByRepoId
        } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
          const repoId = "repo-fts-noscan";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-fts-noscan",
            type: "local",
            status: "indexed",
            fileCount: 3,
            chunkCount: 3
          });

          const rare = "p16_noscan_marker_qwerty";
          saveChunks([
            {
              id: "c1",
              repo_id: repoId,
              file_path: "src/a.ts",
              content: "function one() {}",
              chunk_type: "function",
              chunk_name: "one",
              start_line: 1,
              end_line: 1
            },
            {
              id: "c2",
              repo_id: repoId,
              file_path: "src/b.ts",
              content: "function two() {}",
              chunk_type: "function",
              chunk_name: "two",
              start_line: 1,
              end_line: 1
            },
            {
              id: "c3",
              repo_id: repoId,
              file_path: "src/c.ts",
              content: "export const x = '" + rare + "';",
              chunk_type: "generic",
              chunk_name: "x",
              start_line: 1,
              end_line: 1
            }
          ]);

          const store = {
            async similaritySearchVectorWithScore() {
              return [
                [{ pageContent: "weak", metadata: { chunk_id: "c1", file_path: "src/a.ts", chunk_type: "function", chunk_name: "one" } }, 0.01],
                [{ pageContent: "weak2", metadata: { chunk_id: "c3", file_path: "src/c.ts", chunk_type: "generic", chunk_name: "x" } }, 0.01]
              ];
            }
          };

          const service = new RetrievalService(
            { embedQuestion: async () => [0, 0, 1] },
            store,
            {
              sparseMode: "fts",
              dataAccess: {
                getChunksByRepoId: () => {
                  throw new Error("getChunksByRepoId_should_not_run");
                },
                getChunksByIds,
                searchChunkIdsByFtsBm25
              }
            }
          );

          const results = await service.retrieve(rare + " locate", repoId, 2);
          if (!results.some((r) => r.chunk_id === "c3")) {
            throw new Error("expected c3 in results: " + JSON.stringify(results));
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

  test("P1-6 chunk_ids whitelist applies to dense and sparse paths", async () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-chunk-filter-"));
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
        process.env.RETRIEVAL_SPARSE_MODE = "fts";
        const { SQLiteVectorStore } = await import(${JSON.stringify(vectorStoreModulePath)});
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const { saveChunks } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
          const repoId = "repo-whitelist";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-whitelist",
            type: "local",
            status: "indexed",
            fileCount: 2,
            chunkCount: 2
          });

          saveChunks([
            {
              id: "only-a",
              repo_id: repoId,
              file_path: "src/a.ts",
              content: "function alphaOnly() { return 1; }",
              chunk_type: "function",
              chunk_name: "alphaOnly",
              start_line: 1,
              end_line: 2
            },
            {
              id: "only-b",
              repo_id: repoId,
              file_path: "src/b.ts",
              content: "function betaOnly() { return 2; }",
              chunk_type: "function",
              chunk_name: "betaOnly",
              start_line: 1,
              end_line: 2
            }
          ]);

          const store = new SQLiteVectorStore({
            async embedQuery() { return [1, 0, 0]; },
            async embedDocuments(texts) { return texts.map(() => [1, 0, 0]); }
          });
          await store.addVectors(
            [[1, 0, 0], [0, 1, 0]],
            [
              { pageContent: "function alphaOnly() { return 1; }", metadata: { chunk_id: "only-a", repo_id: repoId, file_path: "src/a.ts", chunk_type: "function", chunk_name: "alphaOnly" } },
              { pageContent: "function betaOnly() { return 2; }", metadata: { chunk_id: "only-b", repo_id: repoId, file_path: "src/b.ts", chunk_type: "function", chunk_name: "betaOnly" } }
            ]
          );

          const service = new RetrievalService({
            embedQuestion: async () => [1, 0, 0]
          });

          const results = await service.retrieve("alpha function", repoId, 2, undefined, {
            chunk_ids: ["only-b"]
          });
          if (results.length !== 1 || results[0].chunk_id !== "only-b") {
            throw new Error("expected only whitelisted chunk-b: " + JSON.stringify(results));
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

  test("P1-6 full_table sparse mode uses repo-wide scan (legacy path)", async () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-fulltable-"));
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
          const repoId = "repo-fulltable";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-fulltable",
            type: "local",
            status: "indexed",
            fileCount: 1,
            chunkCount: 1
          });
          saveChunks([{
            id: "ft1",
            repo_id: repoId,
            file_path: "src/x.ts",
            content: "function zeta() {}",
            chunk_type: "function",
            chunk_name: "zeta",
            start_line: 1,
            end_line: 1
          }]);

          const store = {
            async similaritySearchVectorWithScore() {
              return [[{ pageContent: "function zeta() {}", metadata: { chunk_id: "ft1", file_path: "src/x.ts", chunk_type: "function", chunk_name: "zeta" } }, 0.5]];
            }
          };

          const service = new RetrievalService(
            { embedQuestion: async () => [1, 0, 0] },
            store,
            { sparseMode: "full_table" }
          );
          const results = await service.retrieve("zeta function", repoId, 1);
          if (results.length !== 1 || results[0].chunk_id !== "ft1") {
            throw new Error("full_table path failed: " + JSON.stringify(results));
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
