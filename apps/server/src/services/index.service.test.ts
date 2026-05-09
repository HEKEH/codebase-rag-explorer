import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { monorepoRootFromCwd } from "../lib/monorepo-root";

describe("IndexService", () => {
  test("persists chunks and embeddings into sqlite tables", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-index-service-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const indexServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/index.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const repoStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/store/repo.store.ts"),
    ).href;
    const vectorStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/sqlite-vector-store.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { IndexService } = await import(${JSON.stringify(indexServiceModulePath)});
      const { saveRepo, getRepoById } = await import(${JSON.stringify(repoRepoModulePath)});
      const { saveSourceFiles } = await import(${JSON.stringify(repoStoreModulePath)});
      const { SQLiteVectorStore } = await import(${JSON.stringify(vectorStoreModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      const repoId = "repo-index-test";
      saveRepo({
        id: repoId,
        path: "/tmp/repo-index-test",
        type: "local",
        status: "loaded",
        fileCount: 1,
        chunkCount: 0
      });

      saveSourceFiles(repoId, [
        {
          path: "src/math.ts",
          content: "export function add(a: number, b: number) { return a + b; }"
        }
      ]);

      const splitter = {
        async splitFile(inputRepoId, file) {
          return [
            {
              id: "chunk-idx-1",
              repo_id: inputRepoId,
              file_path: file.path,
              content: "export function add(a: number, b: number) { return a + b; }",
              chunk_type: "function",
              chunk_name: "add",
              start_line: 1,
              end_line: 1
            }
          ];
        }
      };

      const embedder = {
        async embedChunks(_chunks) {
          return [[1, 0, 0]];
        }
      };

      const vectorStore = new SQLiteVectorStore({
        async embedQuery() { return [1, 0, 0]; },
        async embedDocuments(texts) { return texts.map(() => [1, 0, 0]); }
      });

      const service = new IndexService({ splitter, embedder, vectorStore });
      const data = await service.buildIndex(repoId);

      if (data.repo_id !== repoId || data.chunk_count !== 1 || data.status !== "indexing") {
        throw new Error("unexpected buildIndex response payload");
      }

      const repo = getRepoById(repoId);
      if (!repo || repo.status !== "indexed" || repo.chunkCount !== 1) {
        throw new Error("expected repo status/chunkCount to be updated");
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

    const db = new Database(dbPath, { readonly: true });
    const chunkCountRow = db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM chunks")
      .get();
    const embeddingCountRow = db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM embeddings")
      .get();
    const ftsCountRow = db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM chunk_fts")
      .get();
    db.close();

    expect(chunkCountRow?.count).toBe(1);
    expect(embeddingCountRow?.count).toBe(1);
    expect(ftsCountRow?.count).toBe(1);

    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("rejects buildIndex when repo is indexing, but allows rebuilding indexed repo", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-index-service-state-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const indexServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/index.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const repoStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/store/repo.store.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;
    const enumsModulePath = pathToFileURL(
      join(testCwd, "packages/types/src/enums.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { IndexService } = await import(${JSON.stringify(indexServiceModulePath)});
      const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
      const { saveSourceFiles } = await import(${JSON.stringify(repoStoreModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});
      const { ErrorCode } = await import(${JSON.stringify(enumsModulePath)});

      saveRepo({
        id: "repo-indexing-state",
        path: "/tmp/repo-indexing-state",
        type: "local",
        status: "indexing",
        fileCount: 1,
        chunkCount: 10
      });
      saveSourceFiles("repo-indexing-state", [{ path: "src/a.ts", content: "export const x = 1;" }]);

      saveRepo({
        id: "repo-indexed-state",
        path: "/tmp/repo-indexed-state",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 10
      });
      saveSourceFiles("repo-indexed-state", [{ path: "src/b.ts", content: "export const y = 2;" }]);

      const service = new IndexService({
        splitter: { async splitFile() { return []; } },
        embedder: {
          async embedChunks() { return []; },
          getEmbeddingsClient() {
            return {
              async embedQuery() { return []; },
              async embedDocuments() { return []; }
            };
          }
        }
      });

      let indexingCode = -1;
      try {
        await service.buildIndex("repo-indexing-state");
      } catch (error) {
        indexingCode = error.code ?? -1;
      }

      if (indexingCode !== ErrorCode.INDEX_ALREADY_EXISTS) {
        throw new Error("expected INDEX_ALREADY_EXISTS for indexing repo rebuild");
      }

      const indexedResult = await service.buildIndex("repo-indexed-state");
      if (indexedResult.repo_id !== "repo-indexed-state") {
        throw new Error("expected indexed repo rebuild to succeed");
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
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("resets chunk_count to zero when indexed repo rebuild fails", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(
      join(tmpdir(), "server-index-service-failed-zero-"),
    );
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const indexServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/index.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const repoStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/store/repo.store.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { IndexService } = await import(${JSON.stringify(indexServiceModulePath)});
      const { saveRepo, getRepoById } = await import(${JSON.stringify(repoRepoModulePath)});
      const { saveSourceFiles } = await import(${JSON.stringify(repoStoreModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      saveRepo({
        id: "repo-rebuild-failure",
        path: "/tmp/repo-rebuild-failure",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 9
      });
      saveSourceFiles("repo-rebuild-failure", [{ path: "src/a.ts", content: "export const x = 1;" }]);

      const service = new IndexService({
        splitter: {
          async splitFile(inputRepoId, file) {
            return [{
              id: "chunk-failed-1",
              repo_id: inputRepoId,
              file_path: file.path,
              content: file.content,
              chunk_type: "generic",
              chunk_name: null,
              start_line: 1,
              end_line: 1
            }];
          }
        },
        embedder: {
          async embedChunks() { throw new Error("embed failed"); },
          getEmbeddingsClient() {
            return {
              async embedQuery() { return []; },
              async embedDocuments() { return []; }
            };
          }
        }
      });

      let thrown = false;
      try {
        await service.buildIndex("repo-rebuild-failure");
      } catch {
        thrown = true;
      }

      const repo = getRepoById("repo-rebuild-failure");
      closeDb();

      if (!thrown) {
        throw new Error("expected buildIndex to fail");
      }
      if (!repo || repo.status !== "failed" || repo.chunkCount !== 0) {
        throw new Error("expected failed rebuild to reset chunkCount to zero");
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

    expect(run.exitCode).toBe(0);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("updates file_count to latest source file count after rebuild", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(
      join(tmpdir(), "server-index-service-file-count-"),
    );
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const indexServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/index.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const repoStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/store/repo.store.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { IndexService } = await import(${JSON.stringify(indexServiceModulePath)});
      const { saveRepo, getRepoById } = await import(${JSON.stringify(repoRepoModulePath)});
      const { saveSourceFiles } = await import(${JSON.stringify(repoStoreModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      saveRepo({
        id: "repo-file-count",
        path: "/tmp/repo-file-count",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 0
      });
      saveSourceFiles("repo-file-count", [
        { path: "src/a.ts", content: "export const a = 1;" },
        { path: "src/b.ts", content: "export const b = 2;" },
        { path: "src/c.ts", content: "export const c = 3;" }
      ]);

      const service = new IndexService({
        splitter: {
          async splitFile(inputRepoId, file) {
            return [{
              id: "chunk-" + file.path,
              repo_id: inputRepoId,
              file_path: file.path,
              content: file.content,
              chunk_type: "generic",
              chunk_name: null,
              start_line: 1,
              end_line: 1
            }];
          }
        },
        embedder: {
          async embedChunks(chunks) { return chunks.map(() => [1, 0, 0]); },
          getEmbeddingsClient() {
            return {
              async embedQuery() { return [1, 0, 0]; },
              async embedDocuments(texts) { return texts.map(() => [1, 0, 0]); }
            };
          }
        }
      });

      await service.buildIndex("repo-file-count");
      const repo = getRepoById("repo-file-count");
      closeDb();

      if (!repo || repo.fileCount !== 3) {
        throw new Error("expected file_count to be updated to latest source file count");
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

    expect(run.exitCode).toBe(0);
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
