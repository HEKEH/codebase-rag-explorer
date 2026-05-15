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

  test("P2-5 weighted and rrf both return top-1 chunk on same logical fixture", async () => {
    const testCwd = monorepoRootFromCwd();
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

    for (const fusion of ["weighted", "rrf"] as const) {
      const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-p2-5-"));
      const dbPath = join(tempRoot, "nested", "codebase-rag.db");
      try {
        const command = `
        process.env.DB_PATH = ${JSON.stringify(dbPath)};
        process.env.RETRIEVAL_FUSION = ${JSON.stringify(fusion)};
        process.env.RETRIEVAL_SPARSE_MODE = "fts";
        const { SQLiteVectorStore } = await import(${JSON.stringify(vectorStoreModulePath)});
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const { saveChunks } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
          const repoId = "repo-p2-5";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-p2-5",
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
            [[1, 0, 0], [0, 1, 0]],
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
            throw new Error(
              "fusion ${fusion} expected chunk-1, got " + JSON.stringify(results),
            );
          }
          if (results[0]?.fusion !== ${JSON.stringify(fusion)}) {
            throw new Error(
              "expected fusion " + ${JSON.stringify(fusion)} + " got " + results[0]?.fusion,
            );
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
          throw new Error(
            `fusion ${fusion}: ${Buffer.from(run.stderr).toString("utf8")}`,
          );
        }
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  test("P3-3 RRF top-1 follows dense-first under force_nl vs BM25-first under force_pl", async () => {
    const testCwd = monorepoRootFromCwd();
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

    const marker = "p3uniqmarker99";
    const topByModality: Record<string, string> = {};

    for (const modality of ["force_nl", "force_pl"] as const) {
      const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-p3-3-"));
      const dbPath = join(tempRoot, "nested", "codebase-rag.db");
      try {
        const command = `
        process.env.DB_PATH = ${JSON.stringify(dbPath)};
        process.env.RETRIEVAL_FUSION = "rrf";
        process.env.RETRIEVAL_RRF_K = "2";
        process.env.RETRIEVAL_SPARSE_MODE = "fts";
        process.env.RETRIEVAL_QUERY_MODALITY = ${JSON.stringify(modality)};
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const { saveChunks, getChunksByIds, searchChunkIdsByFtsBm25, getChunksByRepoId } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
          const repoId = "repo-p3-3";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-p3-3",
            type: "local",
            status: "indexed",
            fileCount: 2,
            chunkCount: 2
          });

          saveChunks([
            {
              id: "p3-dense-first",
              repo_id: repoId,
              file_path: "src/dense.ts",
              content: "function denseWinner() { return 1; } // ref " + ${JSON.stringify(marker)},
              chunk_type: "function",
              chunk_name: "denseWinner",
              start_line: 1,
              end_line: 2
            },
            {
              id: "p3-bm25-first",
              repo_id: repoId,
              file_path: "src/bm25.ts",
              content: "const k = " + ${JSON.stringify(marker)} + " + " + ${JSON.stringify(marker)} + ";",
              chunk_type: "generic",
              chunk_name: null,
              start_line: 1,
              end_line: 1
            }
          ]);

          const fakeVectorStore = {
            async similaritySearchVectorWithScore() {
              return [
                [{ pageContent: "denseWinner body", metadata: { chunk_id: "p3-dense-first", file_path: "src/dense.ts", chunk_type: "function", chunk_name: "denseWinner" } }, 0.99],
                [{ pageContent: "bm25 body", metadata: { chunk_id: "p3-bm25-first", file_path: "src/bm25.ts", chunk_type: "generic", chunk_name: null } }, 0.01]
              ];
            }
          };

          const service = new RetrievalService(
            { embedQuestion: async () => [1, 0, 0] },
            fakeVectorStore,
            {
              sparseMode: "fts",
              dataAccess: { getChunksByRepoId, getChunksByIds, searchChunkIdsByFtsBm25 }
            }
          );

          const q = ${JSON.stringify(marker)} + " where is it defined";
          const results = await service.retrieve(q, repoId, 1);
          if (results.length < 1) throw new Error("no results");
          console.log("TOP:" + results[0].chunk_id);
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
          throw new Error(
            `${modality}: ${Buffer.from(run.stderr).toString("utf8")}`,
          );
        }
        const out = Buffer.from(run.stdout).toString("utf8");
        const m = out.match(/TOP:(\S+)/);
        if (!m) throw new Error("missing TOP line: " + out);
        topByModality[modality] = m[1]!;
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }

    expect(topByModality["force_nl"]).toBe("p3-dense-first");
    expect(topByModality["force_pl"]).toBe("p3-bm25-first");
  });

  test("P3-3 weighted fusion top-1 follows dense-first under force_nl vs lexical-first under force_pl", async () => {
    const testCwd = monorepoRootFromCwd();
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

    const marker = "p3uniqmarker99";
    const topByModality: Record<string, string> = {};

    for (const modality of ["force_nl", "force_pl"] as const) {
      const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-p3-w-"));
      const dbPath = join(tempRoot, "nested", "codebase-rag.db");
      try {
        const command = `
        process.env.DB_PATH = ${JSON.stringify(dbPath)};
        process.env.RETRIEVAL_FUSION = "weighted";
        process.env.RETRIEVAL_SPARSE_MODE = "fts";
        process.env.RETRIEVAL_QUERY_MODALITY = ${JSON.stringify(modality)};
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const { saveChunks, getChunksByIds, searchChunkIdsByFtsBm25, getChunksByRepoId } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        try {
          const repoId = "repo-p3-w";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-p3-w",
            type: "local",
            status: "indexed",
            fileCount: 2,
            chunkCount: 2
          });

          saveChunks([
            {
              id: "p3-dense-first",
              repo_id: repoId,
              file_path: "src/dense.ts",
              content: "function denseWinner() { return 1; } // ref " + ${JSON.stringify(marker)},
              chunk_type: "function",
              chunk_name: "denseWinner",
              start_line: 1,
              end_line: 2
            },
            {
              id: "p3-bm25-first",
              repo_id: repoId,
              file_path: "src/bm25.ts",
              content: "const k = " + ${JSON.stringify(marker)} + " + " + ${JSON.stringify(marker)} + ";",
              chunk_type: "generic",
              chunk_name: null,
              start_line: 1,
              end_line: 1
            }
          ]);

          const fakeVectorStore = {
            async similaritySearchVectorWithScore() {
              return [
                [{ pageContent: "denseWinner body", metadata: { chunk_id: "p3-dense-first", file_path: "src/dense.ts", chunk_type: "function", chunk_name: "denseWinner" } }, 0.99],
                [{ pageContent: "bm25 body", metadata: { chunk_id: "p3-bm25-first", file_path: "src/bm25.ts", chunk_type: "generic", chunk_name: null } }, 0.01]
              ];
            }
          };

          const service = new RetrievalService(
            { embedQuestion: async () => [1, 0, 0] },
            fakeVectorStore,
            {
              sparseMode: "fts",
              dataAccess: { getChunksByRepoId, getChunksByIds, searchChunkIdsByFtsBm25 }
            }
          );

          const q = ${JSON.stringify(marker)} + " where is it defined";
          const results = await service.retrieve(q, repoId, 1);
          if (results.length < 1) throw new Error("no results");
          console.log("TOP:" + results[0].chunk_id);
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
          throw new Error(
            `weighted ${modality}: ${Buffer.from(run.stderr).toString("utf8")}`,
          );
        }
        const out = Buffer.from(run.stdout).toString("utf8");
        const m = out.match(/TOP:(\S+)/);
        if (!m) throw new Error("missing TOP line: " + out);
        topByModality[modality] = m[1]!;
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }

    expect(topByModality["force_nl"]).toBe("p3-dense-first");
    expect(topByModality["force_pl"]).toBe("p3-bm25-first");
  });

  /**
   * P6-1 — single-recall-route coverage: BM25 stubbed empty ⇒ dense-only; vector stub empty ⇒ bm25-only;
   * both fusion modes. Dual-path weighted/RRF remains in «P2-5 weighted and rrf both return…».
   */
  test("P6-1 dense-only path: bm25 stub returns empty; weighted fusion", async () => {
    await runP6SingleRouteCase({
      fusion: "weighted",
      variant: "dense_only",
    });
  });

  test("P6-1 dense-only path: bm25 stub returns empty; rrf fusion", async () => {
    await runP6SingleRouteCase({
      fusion: "rrf",
      variant: "dense_only",
    });
  });

  test("P6-1 bm25-only path: vector stub returns empty; weighted fusion", async () => {
    await runP6SingleRouteCase({
      fusion: "weighted",
      variant: "bm25_only",
    });
  });

  test("P6-1 bm25-only path: vector stub returns empty; rrf fusion", async () => {
    await runP6SingleRouteCase({
      fusion: "rrf",
      variant: "bm25_only",
    });
  });
});

type P6FusionMode = "weighted" | "rrf";
type P6RouteVariant = "dense_only" | "bm25_only";

async function runP6SingleRouteCase(params: {
  fusion: P6FusionMode;
  variant: P6RouteVariant;
}): Promise<void> {
  const { fusion, variant } = params;
  const testCwd = monorepoRootFromCwd();
  const tempRoot = mkdtempSync(join(tmpdir(), "server-retrieval-p6-1-"));
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
        process.env.RETRIEVAL_FUSION = ${JSON.stringify(fusion)};
        process.env.RETRIEVAL_SPARSE_MODE = "fts";
        process.env.RETRIEVAL_QUERY_MODALITY = "force_nl";
        const { RetrievalService } = await import(${JSON.stringify(retrievalServiceModulePath)});
        const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
        const {
          saveChunks,
          getChunksByIds,
          searchChunkIdsByFtsBm25,
          getChunksByRepoId
        } = await import(${JSON.stringify(chunkRepoModulePath)});
        const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

        const variant = ${JSON.stringify(variant)};
        const marker = "p6uniqtoken_z9x";
        const expectTop = variant === "dense_only" ? "p6-dense-win" : "p6-bm25-win";

        try {
          const repoId = "repo-p6-1";
          saveRepo({
            id: repoId,
            path: "/tmp/repo-p6-1",
            type: "local",
            status: "indexed",
            fileCount: 2,
            chunkCount: 2,
          });

          saveChunks([
            {
              id: "p6-dense-win",
              repo_id: repoId,
              file_path: "src/dense_win.ts",
              content: "// dense primary " + marker,
              chunk_type: "generic",
              chunk_name: null,
              start_line: 1,
              end_line: 1,
            },
            {
              id: "p6-bm25-win",
              repo_id: repoId,
              file_path: "src/bm25_win.ts",
              content: marker + " " + marker + " extra hits for fts",
              chunk_type: "generic",
              chunk_name: null,
              start_line: 1,
              end_line: 1,
            },
          ]);

          const emptyVectorStore = {
            async similaritySearchVectorWithScore() {
              return [];
            }
          };

          const rankedDenseStore = {
            async similaritySearchVectorWithScore() {
              return [
                [{ pageContent: "dense winner", metadata: { chunk_id: "p6-dense-win", file_path: "src/dense_win.ts", chunk_type: "generic", chunk_name: null } }, 0.95],
                [{ pageContent: "dense body", metadata: { chunk_id: "p6-other", file_path: "src/other.ts", chunk_type: "generic", chunk_name: null } }, 0.2],
              ];
            }
          };

          const dataAccessBm25Stub = {
            getChunksByRepoId,
            getChunksByIds,
            searchChunkIdsByFtsBm25() {
              return [];
            },
          };

          const dataAccessPassthrough = {
            getChunksByRepoId,
            getChunksByIds,
            searchChunkIdsByFtsBm25,
          };

          const service = new RetrievalService(
            { embedQuestion: async () => [1, 0, 0] },
            variant === "dense_only" ? rankedDenseStore : emptyVectorStore,
            {
              sparseMode: "fts",
              dataAccess: variant === "dense_only" ? dataAccessBm25Stub : dataAccessPassthrough,
            }
          );

          const q =
            marker +
            " where is it defined locate";
          const results = await service.retrieve(q, repoId, 1);
          if (results.length !== 1 || results[0]?.chunk_id !== expectTop) {
            throw new Error(
              "P6-1 " + variant + "/" + ${JSON.stringify(fusion)} +
                " expected top " +
                expectTop +
                "; got " +
                JSON.stringify(results),
            );
          }
          if (results[0]?.fusion !== ${JSON.stringify(fusion)}) {
            throw new Error(
              "expected fusion ${fusion} got " + results[0]?.fusion,
            );
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
      throw new Error(
        `P6-1 ${variant} ${fusion}: ${Buffer.from(run.stderr).toString("utf8")}`,
      );
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
