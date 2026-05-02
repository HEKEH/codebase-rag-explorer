import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

describe("askRoutes", () => {
  test("rejects ask when repo status is loaded (only indexed can answer)", async () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-ask-route-loaded-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    process.env.DB_PATH = dbPath;
    const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    const cacheBuster = `?t=${Date.now()}`;
    const { createApp } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/index.ts")).href +
        cacheBuster
    );
    const { saveRepo } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/db/repo.repository.ts"))
        .href + cacheBuster
    );
    const { closeDb } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/db/connection.ts")).href +
        cacheBuster
    );
    const { ErrorCode } = await import(
      pathToFileURL(join(testCwd, "packages/types/src/enums.ts")).href +
        cacheBuster
    );

    try {
      saveRepo({
        id: "repo-loaded-status",
        path: "/tmp/repo-loaded-status",
        type: "local",
        status: "loaded",
        fileCount: 3,
        chunkCount: 0,
      });
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo_id: "repo-loaded-status",
            question: "can I ask?",
          }),
        }),
      );
      const payload = await response.json();

      expect(payload.code).toBe(ErrorCode.INDEX_NOT_BUILT);
      expect(payload.message).toBe("请先构建索引");
      expect(payload.data).toBeNull();
    } finally {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
      closeDb();
    }

    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("returns business payload for NO_RELEVANT_CODE", async () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-ask-route-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    process.env.DB_PATH = dbPath;
    const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    const cacheBuster = `?t=${Date.now()}`;
    const { Elysia } = await import("elysia");
    const { askRoutes } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/routes/ask.ts")).href +
        cacheBuster
    );
    const { AskService } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/services/ask.service.ts"))
        .href + cacheBuster
    );
    const { saveRepo } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/db/repo.repository.ts"))
        .href + cacheBuster
    );
    const { AppError } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/lib/errors.ts")).href +
        cacheBuster
    );
    const { ErrorCode } = await import(
      pathToFileURL(join(testCwd, "packages/types/src/enums.ts")).href +
        cacheBuster
    );
    const { closeDb } = await import(
      pathToFileURL(join(testCwd, "apps/server/src/db/connection.ts")).href +
        cacheBuster
    );

    const originalAsk = AskService.prototype.ask;

    try {
      saveRepo({
        id: "repo-ask-route-test",
        path: "/tmp/repo-ask-route-test",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1,
      });
      AskService.prototype.ask = async function mockedAsk() {
        throw new AppError(
          ErrorCode.NO_RELEVANT_CODE,
          "未找到相关代码，请尝试更具体的问题",
        );
      };

      const app = new Elysia().use(askRoutes);
      const response = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo_id: "repo-ask-route-test",
            question: "irrelevant question",
          }),
        }),
      );
      const payload = await response.json();

      expect(payload.code).toBe(ErrorCode.NO_RELEVANT_CODE);
      expect(payload?.data?.answer).toBe("未找到相关代码，请尝试更具体的问题");
      expect(Array.isArray(payload?.data?.references)).toBe(true);
      expect(payload.data.references.length).toBe(0);
    } finally {
      AskService.prototype.ask = originalAsk;
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
      closeDb();
    }

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
