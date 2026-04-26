import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("IndexService", () => {
  test("persists chunks and embeddings into sqlite tables", () => {
    const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-index-service-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const indexServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/index.service.ts")
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts")
    ).href;
    const repoStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/store/repo.store.ts")
    ).href;
    const vectorStoreModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/sqlite-vector-store.ts")
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts")
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

      if (data.repo_id !== repoId || data.chunk_count !== 1 || data.status !== "indexed") {
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
      stdout: "pipe"
    });

    if (run.exitCode !== 0) {
      throw new Error(Buffer.from(run.stderr).toString("utf8"));
    }

    const db = new Database(dbPath, { readonly: true });
    const chunkCountRow = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM chunks").get();
    const embeddingCountRow = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM embeddings").get();
    db.close();

    expect(chunkCountRow?.count).toBe(1);
    expect(embeddingCountRow?.count).toBe(1);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
