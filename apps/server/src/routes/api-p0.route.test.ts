import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function loadServerModules() {
  const testCwd = process.cwd().endsWith("/apps/server") ? join(process.cwd(), "..", "..") : process.cwd();
  const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
  const indexModuleUrl = pathToFileURL(join(testCwd, "apps/server/src/index.ts")).href + cacheBuster;
  const repoModuleUrl = pathToFileURL(join(testCwd, "apps/server/src/db/repo.repository.ts")).href + cacheBuster;
  const storeModuleUrl = pathToFileURL(join(testCwd, "apps/server/src/store/repo.store.ts")).href + cacheBuster;
  const askModuleUrl = pathToFileURL(join(testCwd, "apps/server/src/services/ask.service.ts")).href + cacheBuster;
  const connectionModuleUrl = pathToFileURL(join(testCwd, "apps/server/src/db/connection.ts")).href + cacheBuster;

  const indexModule = await import(indexModuleUrl);
  const repoModule = await import(repoModuleUrl);
  const storeModule = await import(storeModuleUrl);
  const askModule = await import(askModuleUrl);
  const connectionModule = await import(connectionModuleUrl);

  return {
    createApp: indexModule.createApp as () => { handle(request: Request): Promise<Response> },
    repoModule,
    storeModule,
    askModule,
    closeDb: connectionModule.closeDb as () => void
  };
}

describe("API P0 endpoint cases", () => {
  test("creates repository via /api/repos successfully", async () => {
    const repoDir = createTempDir("api-repos-create-ok-");
    const dbDir = createTempDir("api-repos-create-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    mkdirSync(join(repoDir, "src"), { recursive: true });
    writeFileSync(join(repoDir, "src", "main.ts"), "export const value = 1;\n");

    const { createApp, closeDb } = await loadServerModules();
    try {
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/repos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source_type: "local",
            source_value: repoDir,
            auto_reload: true
          })
        })
      );
      const payload = await response.json();
      expect(payload.code).toBe(0);
      expect(typeof payload.data.repo_id).toBe("string");
      expect(payload.data.repo_id.length).toBeGreaterThan(0);
    } finally {
      closeDb();
    }
  });

  test("returns code 1002 when creating duplicate repository via /api/repos", async () => {
    const repoDir = createTempDir("api-repos-duplicate-");
    const dbDir = createTempDir("api-repos-duplicate-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    mkdirSync(join(repoDir, "src"), { recursive: true });
    writeFileSync(join(repoDir, "src", "main.ts"), "export const value = 1;\n");

    const { createApp, closeDb } = await loadServerModules();
    try {
      const app = createApp();
      const request = new Request("http://localhost/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_type: "local",
          source_value: repoDir
        })
      });
      const firstResponse = await app.handle(request.clone());
      expect((await firstResponse.json()).code).toBe(0);

      const secondResponse = await app.handle(request.clone());
      const payload = await secondResponse.json();
      expect(payload.code).toBe(1002);
      expect(payload.data).toBeNull();
    } finally {
      closeDb();
    }
  });

  test("lists repositories with mixed statuses via /api/repos", async () => {
    const dbDir = createTempDir("api-repos-list-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    const { createApp, repoModule, closeDb } = await loadServerModules();
    try {
      repoModule.saveRepo({
        id: "repo-loaded",
        path: "/tmp/repo-loaded",
        type: "local",
        status: "loaded",
        fileCount: 1,
        chunkCount: 0
      });
      repoModule.saveRepo({
        id: "repo-indexing",
        path: "/tmp/repo-indexing",
        type: "local",
        status: "indexing",
        fileCount: 2,
        chunkCount: 0
      });
      repoModule.saveRepo({
        id: "repo-indexed",
        path: "/tmp/repo-indexed",
        type: "git",
        status: "indexed",
        fileCount: 3,
        chunkCount: 6
      });
      repoModule.saveRepo({
        id: "repo-failed",
        path: "/tmp/repo-failed",
        type: "git",
        status: "failed",
        fileCount: 4,
        chunkCount: 0
      });

      const app = createApp();
      const response = await app.handle(new Request("http://localhost/api/repos"));
      const payload = await response.json();
      expect(payload.code).toBe(0);
      expect(Array.isArray(payload.data)).toBe(true);
      expect(payload.data.length).toBe(4);
      const statuses = payload.data.map((item: { status: string }) => item.status).sort();
      expect(statuses).toEqual(["failed", "indexed", "indexing", "loaded"]);
    } finally {
      closeDb();
    }
  });

  test("imports local repository successfully", async () => {
    const repoDir = createTempDir("api-p0-import-ok-");
    const dbDir = createTempDir("api-p0-import-db-");
    const dbPath = join(dbDir, "nested", "codebase-rag.db");
    mkdirSync(join(repoDir, "src"), { recursive: true });
    writeFileSync(join(repoDir, "src", "main.ts"), "export const value = 1;\n");
    process.env.DB_PATH = dbPath;

    const { createApp, closeDb } = await loadServerModules();
    try {
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/repo/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: repoDir, type: "local" })
        })
      );
      const payload = await response.json();
      expect(payload.code).toBe(0);
      expect(payload.data.status).toBe("loaded");
      expect(typeof payload.data.repo_id).toBe("string");
      expect(payload.data.file_count).toBe(1);
    } finally {
      closeDb();
    }
  });

  test("returns code 1001 when importing non-existent path", async () => {
    const dbDir = createTempDir("api-p0-import-fail-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    const badPath = join(dbDir, "not-exists");
    const { createApp, closeDb } = await loadServerModules();
    try {
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/repo/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: badPath, type: "local" })
        })
      );
      const payload = await response.json();
      expect(payload.code).toBe(1001);
      expect(payload.data).toBeNull();
    } finally {
      closeDb();
    }
  });

  test("returns index status for existing repository", async () => {
    const dbDir = createTempDir("api-p0-index-status-ok-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    const { createApp, repoModule, closeDb } = await loadServerModules();
    try {
      repoModule.saveRepo({
        id: "repo-status-ok",
        path: "/tmp/repo-status-ok",
        type: "local",
        status: "indexing",
        fileCount: 4,
        chunkCount: 11
      });
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/index/status?repo_id=repo-status-ok")
      );
      const payload = await response.json();
      expect(payload.code).toBe(0);
      expect(payload.data.status).toBe("indexing");
      expect(payload.data.chunk_count).toBe(11);
    } finally {
      closeDb();
    }
  });

  test("returns code 1001 when index status repo is missing", async () => {
    const dbDir = createTempDir("api-p0-index-status-fail-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    const { createApp, closeDb } = await loadServerModules();
    try {
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/index/status?repo_id=repo-missing")
      );
      const payload = await response.json();
      expect(payload.code).toBe(1001);
      expect(payload.data).toBeNull();
    } finally {
      closeDb();
    }
  });

  test("answers question successfully with references", async () => {
    const dbDir = createTempDir("api-p0-ask-ok-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { createApp, askModule, closeDb } = await loadServerModules();
    const { AskService } = askModule as { AskService: { prototype: { ask: (...args: unknown[]) => Promise<unknown> } } };
    const originalAsk = AskService.prototype.ask;
    try {
      AskService.prototype.ask = async () => ({
        answer: "这是一个测试回答",
        references: [{ chunk_id: "chunk-1", file_path: "src/main.ts", snippet: "export const value = 1", score: 0.9 }]
      });
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-ask-ok", question: "value 是什么？" })
        })
      );
      const payload = await response.json();
      expect(payload.code).toBe(0);
      expect(payload.data.answer).toBe("这是一个测试回答");
      expect(payload.data.references.length).toBe(1);
    } finally {
      AskService.prototype.ask = originalAsk;
      closeDb();
    }
  });

  test("returns code 2001 when asking without index", async () => {
    const dbDir = createTempDir("api-p0-ask-fail-db-");
    process.env.DB_PATH = join(dbDir, "nested", "codebase-rag.db");
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { createApp, askModule, closeDb } = await loadServerModules();
    const { AskService } = askModule as { AskService: { prototype: { ask: (...args: unknown[]) => Promise<unknown> } } };
    const originalAsk = AskService.prototype.ask;
    try {
      AskService.prototype.ask = async () => {
        const { AppError } = await import("../lib/errors");
        throw new AppError(2001, "请先构建索引");
      };
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo_id: "repo-ask-fail", question: "x?" })
        })
      );
      const payload = await response.json();
      expect(payload.code).toBe(2001);
      expect(payload.data).toBeNull();
    } finally {
      AskService.prototype.ask = originalAsk;
      closeDb();
    }
  });
});
