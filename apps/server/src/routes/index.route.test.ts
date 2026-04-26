import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

describe("indexRoutes", () => {
  test("build endpoint returns immediately and does not leak unhandled rejection", async () => {
    const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-index-route-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    process.env.DB_PATH = dbPath;

    const cacheBuster = `?t=${Date.now()}`;
    const { Elysia } = await import("elysia");
    const { indexRoutes } = await import(pathToFileURL(join(testCwd, "apps/server/src/routes/index.ts")).href + cacheBuster);
    const { saveRepo } = await import(pathToFileURL(join(testCwd, "apps/server/src/db/repo.repository.ts")).href + cacheBuster);
    const { IndexService } = await import(pathToFileURL(join(testCwd, "apps/server/src/services/index.service.ts")).href + cacheBuster);
    const { closeDb } = await import(pathToFileURL(join(testCwd, "apps/server/src/db/connection.ts")).href + cacheBuster);

    const originalBuildIndex = IndexService.prototype.buildIndex;
    const originalConsoleError = console.error;
    const observedUnhandled: string[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      observedUnhandled.push(String(reason));
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      saveRepo({
        id: "repo-route-test",
        path: "/tmp/repo-route-test",
        type: "local",
        status: "loaded",
        fileCount: 1,
        chunkCount: 0
      });

      IndexService.prototype.buildIndex = async function mockedBuildIndex() {
        throw new Error("synthetic index failure");
      };
      console.error = () => {};

      const app = new Elysia().use(indexRoutes);
      const response = await app.handle(new Request("http://localhost/api/index/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo_id: "repo-route-test" })
      }));
      const payload = await response.json();
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(payload.code).toBe(0);
      expect(payload?.data?.status).toBe("indexing");
      expect(observedUnhandled.length).toBe(0);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
      IndexService.prototype.buildIndex = originalBuildIndex;
      console.error = originalConsoleError;
      closeDb();
    }

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
