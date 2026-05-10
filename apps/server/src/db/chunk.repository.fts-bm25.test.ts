import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { monorepoRootFromCwd } from "../lib/monorepo-root";

describe("db/chunk.repository searchChunkIdsByFtsBm25 (P1-5)", () => {
  test("orders by bm25() and respects repo_id and limit", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "chunk-fts-bm25-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const repositoryModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;
    const normalizeModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/fts-query-normalize.ts"),
    ).href;

    const probe = "bm25_rank_probe_abc123_unique";

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { searchChunkIdsByFtsBm25 } = await import(${JSON.stringify(repositoryModulePath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      const { normalizeUserQueryForFts5Match } = await import(${JSON.stringify(normalizeModulePath)});
      const db = getDb();
      db.exec(\`
        INSERT INTO chunk_fts (chunk_id, repo_id, body) VALUES
          ('c-once', 'repo-bm25', '${probe} common common common common'),
          ('c-thrice', 'repo-bm25', '${probe} ${probe} ${probe} common'),
          ('c-none', 'repo-bm25', 'unrelated filler text'),
          ('c-remote', 'repo-other', '${probe} only in other repo');
      \`);

      const matchExpr = normalizeUserQueryForFts5Match(${JSON.stringify(probe)});
      if (!matchExpr) throw new Error("expected normalized query");

      const full = searchChunkIdsByFtsBm25("repo-bm25", matchExpr, 10);
      if (full.length < 2) throw new Error("expected 2+ hits: " + JSON.stringify(full));
      if (full[0].chunk_id !== "c-thrice") {
        throw new Error("expected c-thrice best bm25, got " + JSON.stringify(full));
      }
      if (full[1].chunk_id !== "c-once") {
        throw new Error("expected c-once second, got " + JSON.stringify(full));
      }
      for (const h of full) {
        if (h.chunk_id === "c-none") throw new Error("unexpected zero-token row");
        if (h.chunk_id === "c-remote") throw new Error("repo filter leak");
      }

      const top1 = searchChunkIdsByFtsBm25("repo-bm25", matchExpr, 1);
      if (top1.length !== 1 || top1[0].chunk_id !== "c-thrice") {
        throw new Error("limit 1 broken: " + JSON.stringify(top1));
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
    expect(existsSync(dbPath)).toBe(true);

    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("optional chunk_id filter restricts hits (P1-6)", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "chunk-fts-bm25-filter-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const repositoryModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;
    const normalizeModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/fts-query-normalize.ts"),
    ).href;

    const probe = "bm25_filter_probe_xyz";

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { searchChunkIdsByFtsBm25 } = await import(${JSON.stringify(repositoryModulePath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      const { normalizeUserQueryForFts5Match } = await import(${JSON.stringify(normalizeModulePath)});
      const db = getDb();
      db.exec(\`
        INSERT INTO chunk_fts (chunk_id, repo_id, body) VALUES
          ('hit-a', 'repo-f', '${probe} a'),
          ('hit-b', 'repo-f', '${probe} b');
      \`);
      const matchExpr = normalizeUserQueryForFts5Match(${JSON.stringify(probe)});
      const onlyA = searchChunkIdsByFtsBm25("repo-f", matchExpr, 10, ["hit-a"]);
      if (onlyA.length !== 1 || onlyA[0].chunk_id !== "hit-a") {
        throw new Error("expected filter hit-a only: " + JSON.stringify(onlyA));
      }
      const emptyFilter = searchChunkIdsByFtsBm25("repo-f", matchExpr, 10, []);
      if (emptyFilter.length !== 0) {
        throw new Error("empty filter should return no rows");
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
});
