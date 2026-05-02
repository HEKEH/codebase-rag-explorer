import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function loadModules(dbPath: string) {
  process.env.DB_PATH = dbPath;
  process.env.ANTHROPIC_API_KEY = "test-key";
  const testCwd = process.cwd().endsWith("/apps/server")
    ? join(process.cwd(), "..", "..")
    : process.cwd();
  const cacheBuster = `?t=${Date.now()}-${Math.random()}`;

  const indexModule = await import(
    pathToFileURL(join(testCwd, "apps/server/src/index.ts")).href + cacheBuster
  );
  const repoModule = await import(
    pathToFileURL(join(testCwd, "apps/server/src/db/repo.repository.ts")).href +
      cacheBuster
  );
  const askModule = await import(
    pathToFileURL(join(testCwd, "apps/server/src/services/ask.service.ts"))
      .href + cacheBuster
  );
  const indexServiceModule = await import(
    pathToFileURL(join(testCwd, "apps/server/src/services/index.service.ts"))
      .href + cacheBuster
  );
  const connectionModule = await import(
    pathToFileURL(join(testCwd, "apps/server/src/db/connection.ts")).href +
      cacheBuster
  );
  const errorsModule = await import(
    pathToFileURL(join(testCwd, "apps/server/src/lib/errors.ts")).href +
      cacheBuster
  );
  const enumsModule = await import(
    pathToFileURL(join(testCwd, "packages/types/src/enums.ts")).href +
      cacheBuster
  );

  return {
    createApp: indexModule.createApp as () => {
      handle(request: Request): Promise<Response>;
    },
    saveRepo: repoModule.saveRepo as (repo: {
      id: string;
      path: string;
      type: "local" | "git";
      status: "idle" | "loaded" | "indexing" | "indexed" | "failed";
      fileCount: number;
      chunkCount: number;
    }) => void,
    AskService: askModule.AskService as {
      prototype: { ask: (...args: unknown[]) => Promise<unknown> };
    },
    IndexService: indexServiceModule.IndexService as {
      prototype: { buildIndex: (...args: unknown[]) => Promise<unknown> };
    },
    closeDb: connectionModule.closeDb as () => void,
    AppError: errorsModule.AppError as new (
      code: number,
      message: string,
    ) => Error,
    ErrorCode: enumsModule.ErrorCode as Record<string, number>,
  };
}

function assertFailurePayload(
  payload: { code: number; message: unknown; data: unknown },
  expectedCode: number,
) {
  expect(payload.code).toBe(expectedCode);
  expect(typeof payload.message).toBe("string");
  expect(payload.data).toBeNull();
}

describe("failure protocol consistency", () => {
  test("covers failure codes with {code,message,data:null} and preserves NO_RELEVANT_CODE business payload", async () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "server-protocol-consistency-"),
    );
    const repoDir = join(tempRoot, "repo");
    mkdirSync(join(repoDir, "src"), { recursive: true });
    writeFileSync(join(repoDir, "src", "main.ts"), "export const v = 1;\n");
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;

    const {
      createApp,
      saveRepo,
      AskService,
      IndexService,
      closeDb,
      AppError,
      ErrorCode,
    } = await loadModules(dbPath);

    const originalAsk = AskService.prototype.ask;
    const originalBuildIndex = IndexService.prototype.buildIndex;

    try {
      const app = createApp();
      saveRepo({
        id: "repo-1",
        path: "/tmp/repo-1",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1,
      });

      const notFoundRes = await app.handle(
        new Request("http://localhost/api/repo/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: join(tempRoot, "missing"),
            type: "local",
          }),
        }),
      );
      assertFailurePayload(
        await notFoundRes.json(),
        ErrorCode.REPO_LOAD_FAILED,
      );

      const firstImport = await app.handle(
        new Request("http://localhost/api/repo/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: repoDir, type: "local" }),
        }),
      );
      expect((await firstImport.json()).code).toBe(0);
      const duplicateImport = await app.handle(
        new Request("http://localhost/api/repo/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: repoDir, type: "local" }),
        }),
      );
      assertFailurePayload(
        await duplicateImport.json(),
        ErrorCode.REPO_ALREADY_EXISTS,
      );

      AskService.prototype.ask = async () => {
        throw new AppError(ErrorCode.INDEX_NOT_BUILT, "请先构建索引");
      };
      const askNoIndex = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-1", question: "q" }),
        }),
      );
      assertFailurePayload(await askNoIndex.json(), ErrorCode.INDEX_NOT_BUILT);

      saveRepo({
        id: "repo-indexed",
        path: "/tmp/repo-indexed",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1,
      });
      const indexAgain = await app.handle(
        new Request("http://localhost/api/index/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-indexed" }),
        }),
      );
      assertFailurePayload(
        await indexAgain.json(),
        ErrorCode.INDEX_ALREADY_EXISTS,
      );

      AskService.prototype.ask = async () => {
        throw new AppError(ErrorCode.EMBEDDING_FAILED, "embedding failed");
      };
      const askEmbeddingFailed = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-1", question: "q" }),
        }),
      );
      assertFailurePayload(
        await askEmbeddingFailed.json(),
        ErrorCode.EMBEDDING_FAILED,
      );

      AskService.prototype.ask = async () => {
        throw new AppError(ErrorCode.LLM_FAILED, "llm failed");
      };
      const askLlmFailed = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-1", question: "q" }),
        }),
      );
      assertFailurePayload(await askLlmFailed.json(), ErrorCode.LLM_FAILED);

      AskService.prototype.ask = async () => {
        throw new Error("unexpected");
      };
      const askInternalError = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-1", question: "q" }),
        }),
      );
      assertFailurePayload(
        await askInternalError.json(),
        ErrorCode.INTERNAL_ERROR,
      );

      AskService.prototype.ask = async () => {
        throw new AppError(
          ErrorCode.NO_RELEVANT_CODE,
          "未找到相关代码，请尝试更具体的问题",
        );
      };
      const noRelevant = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-1", question: "irrelevant" }),
        }),
      );
      const noRelevantPayload = await noRelevant.json();
      expect(noRelevantPayload.code).toBe(ErrorCode.NO_RELEVANT_CODE);
      expect(noRelevantPayload.data).toEqual({
        answer: "未找到相关代码，请尝试更具体的问题",
        references: [],
      });
    } finally {
      AskService.prototype.ask = originalAsk;
      IndexService.prototype.buildIndex = originalBuildIndex;
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
      closeDb();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
