import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

describe("db/repo.repository", () => {
  test("persists repo CRUD and status/chunk updates via SQLite", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-repo-repo-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const repositoryModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const {
        getRepoById,
        getRepoByPath,
        saveRepo,
        updateRepoStatus,
        updateRepoChunkCount,
        updateRepoFileCount
      } = await import(${JSON.stringify(repositoryModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      saveRepo({
        id: "repo-1",
        path: "/tmp/repo-1",
        type: "local",
        status: "loaded",
        fileCount: 10,
        chunkCount: 0
      });

      const byId = getRepoById("repo-1");
      if (!byId || byId.fileCount !== 10 || !byId.updatedAt) {
        throw new Error("expected getRepoById to return inserted repo");
      }

      const byPath = getRepoByPath("/tmp/repo-1");
      if (!byPath || byPath.id !== "repo-1") {
        throw new Error("expected getRepoByPath to return inserted repo");
      }

      updateRepoStatus("repo-1", "indexing");
      updateRepoChunkCount("repo-1", 33);
      updateRepoFileCount("repo-1", 11);

      const updated = getRepoById("repo-1");
      if (!updated || updated.status !== "indexing" || updated.chunkCount !== 33 || updated.fileCount !== 11 || !updated.updatedAt) {
        throw new Error("expected repo status and chunkCount to be updated");
      }

      saveRepo({
        id: "repo-1",
        path: "/tmp/repo-1",
        type: "local",
        status: "indexed",
        fileCount: 12,
        chunkCount: 44
      });

      const upserted = getRepoById("repo-1");
      if (!upserted || upserted.fileCount !== 12 || upserted.chunkCount !== 44 || !upserted.updatedAt) {
        throw new Error("expected saveRepo upsert to update fields");
      }

      saveRepo({
        id: "repo-2",
        path: "/tmp/repo-1",
        type: "local",
        status: "loaded",
        fileCount: 1,
        chunkCount: 0
      });

      closeDb();
    `;

    const run = Bun.spawnSync({
      cmd: ["bun", "-e", command],
      cwd: testCwd,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(run.exitCode).toBe(1);
    const stderr = Buffer.from(run.stderr).toString("utf8");
    expect(
      stderr.includes("UNIQUE constraint failed: repos.type, repos.path"),
    ).toBe(true);
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
