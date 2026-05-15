import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { monorepoRootFromCwd } from "./monorepo-root";

describe("lib/embedding-repo-compatibility (P4-3/P4-4)", () => {
  test("retrieve rejects when indexed embedding model differs from current config", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-emb-compat-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const connectionPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;
    const repoRepoPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const chunkRepoPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const retrievalPath = pathToFileURL(
      join(testCwd, "apps/server/src/services/retrieval.service.ts"),
    ).href;
    const errorsPath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/errors.ts"),
    ).href;
    const enumsPath = pathToFileURL(
      join(testCwd, "packages/types/src/enums.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      process.env.EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
      const { getDb, closeDb } = await import(${JSON.stringify(connectionPath)});
      const { saveRepo } = await import(${JSON.stringify(repoRepoPath)});
      const { saveChunks } = await import(${JSON.stringify(chunkRepoPath)});
      const { RetrievalService } = await import(${JSON.stringify(retrievalPath)});
      const { AppError } = await import(${JSON.stringify(errorsPath)});
      const { ErrorCode } = await import(${JSON.stringify(enumsPath)});

      const repoId = "repo-emb-mismatch";
      saveRepo({
        id: repoId,
        path: "/tmp/repo-emb-mismatch",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1,
      });
      saveChunks([{
        id: "chunk-1",
        repo_id: repoId,
        file_path: "a.ts",
        content: "export const x = 1",
        chunk_type: "function",
        chunk_name: "x",
        start_line: 1,
        end_line: 1,
      }]);

      const db = getDb();
      const buf = new Uint8Array(12);
      new Float32Array(buf.buffer, buf.byteOffset, 3).set([1, 0, 0]);
      db.query(
        "INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model) VALUES (?, ?, ?, ?, ?)"
      ).run("emb-1", "chunk-1", repoId, buf, "other-model/legacy-space");

      const svc = new RetrievalService({
        embedQuestion: async () => [1, 0, 0],
      });

      let code = 0;
      try {
        await svc.retrieve("where is x", repoId, 3);
      } catch (e) {
        if (e instanceof AppError) code = e.code;
        else throw e;
      }
      if (code !== ErrorCode.EMBEDDING_MODEL_MISMATCH) {
        throw new Error("expected EMBEDDING_MODEL_MISMATCH, got " + code);
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
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
