import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { monorepoRootFromCwd } from "../lib/monorepo-root";

describe("AskService", () => {
  test("generates answer via prompt+LLM and builds references from retrieval whitelist", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-ask-service-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const askServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/ask.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { AskService } = await import(${JSON.stringify(askServiceModulePath)});
      const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      const repoId = "repo-ask-test";
      saveRepo({
        id: repoId,
        path: "/tmp/repo-ask-test",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1
      });

      const retrieval = {
        async retrieve() {
          return [
            {
              chunk_id: "chunk-1",
              file_path: "src/math.ts",
              content: "export function add(a, b) { return a + b; }",
              chunk_type: "function",
              chunk_name: "add",
              score: 0.95,
              fusion: "weighted",
            }
          ];
        }
      };

      const chatModel = {
        async invoke(messages) {
          const normalized = messages.map((message) =>
            typeof message.content === "string" ? message.content : JSON.stringify(message.content)
          );
          if (!normalized.join("\\n").includes("How does add work?")) {
            throw new Error("question was not injected into prompt");
          }
          return { content: "add() returns the sum of two inputs." };
        }
      };

      const service = new AskService({ retrievalService: retrieval, chatModel });
      const data = await service.ask(repoId, "How does add work?", 1);

      if (!data.answer.includes("sum of two inputs")) {
        throw new Error("expected answer from chat model");
      }
      if (data.references.length !== 1 || data.references[0]?.chunk_id !== "chunk-1") {
        throw new Error("expected references from retrieval whitelist");
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

  test("throws NO_RELEVANT_CODE when retrieval returns empty", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-ask-service-no-hit-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const askServiceModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/services/ask.service.ts"),
    ).href;
    const repoRepoModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;
    const enumsModulePath = pathToFileURL(
      join(testCwd, "packages/types/src/enums.ts"),
    ).href;

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { AskService } = await import(${JSON.stringify(askServiceModulePath)});
      const { saveRepo } = await import(${JSON.stringify(repoRepoModulePath)});
      const { ErrorCode } = await import(${JSON.stringify(enumsModulePath)});
      const { closeDb } = await import(${JSON.stringify(connectionModulePath)});

      const repoId = "repo-ask-no-hit";
      saveRepo({
        id: repoId,
        path: "/tmp/repo-ask-no-hit",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1
      });

      const service = new AskService({
        retrievalService: { async retrieve() { return []; } },
        chatModel: { async invoke() { return { content: "unused" }; } }
      });

      let observedCode = -1;
      try {
        await service.ask(repoId, "unknown question", 3);
      } catch (error) {
        observedCode = error.code ?? -1;
      } finally {
        closeDb();
      }

      if (observedCode !== ErrorCode.NO_RELEVANT_CODE) {
        throw new Error("expected AskService to throw NO_RELEVANT_CODE for empty retrieval");
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
