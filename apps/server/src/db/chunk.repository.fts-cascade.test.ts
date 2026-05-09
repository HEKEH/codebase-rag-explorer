import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";

describe("db/chunk.repository chunk_fts cascade (P1-3)", () => {
  test("deleteChunkById removes matching chunk_fts row", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-chunk-fts-del-one-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const chunkRepoPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const tKeep = "fts_p13_keep_token";
    const tGone = "fts_p13_gone_token";

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { saveChunks, deleteChunkById } = await import(${JSON.stringify(chunkRepoPath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionPath)});
      const db = getDb();
      db.query("INSERT INTO repos (id, path, type, status) VALUES (?, ?, ?, ?)").run(
        "repo-p13",
        "/tmp/repo-p13",
        "local",
        "loaded"
      );
      saveChunks([
        {
          id: "c-del-a",
          repo_id: "repo-p13",
          file_path: "a.ts",
          content: "A ${tGone}",
          chunk_type: "generic",
          chunk_name: null,
          start_line: 1,
          end_line: 1
        },
        {
          id: "c-del-b",
          repo_id: "repo-p13",
          file_path: "b.ts",
          content: "B ${tKeep}",
          chunk_type: "generic",
          chunk_name: null,
          start_line: 1,
          end_line: 1
        }
      ]);
      deleteChunkById("c-del-a");
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
    const ftsTotal = db
      .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM chunk_fts")
      .get();
    const matchGone = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts WHERE chunk_fts MATCH ${JSON.stringify(tGone)}`,
      )
      .get();
    const matchKeep = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts WHERE chunk_fts MATCH ${JSON.stringify(tKeep)}`,
      )
      .get();
    db.close();

    expect(ftsTotal?.n).toBe(1);
    expect(matchGone?.c).toBe(0);
    expect(matchKeep?.c).toBe(1);

    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("deleteChunksByRepoId clears chunk_fts for that repo only", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-chunk-fts-del-repo-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const chunkRepoPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const connectionPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const t1 = "fts_p13_repo1_token";
    const t2 = "fts_p13_repo2_token";

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { saveChunks, deleteChunksByRepoId } = await import(${JSON.stringify(chunkRepoPath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionPath)});
      const db = getDb();
      for (const r of [
        ["repo-x", "/tmp/rx", "local", "loaded"],
        ["repo-y", "/tmp/ry", "local", "loaded"]
      ]) {
        db.query("INSERT INTO repos (id, path, type, status) VALUES (?, ?, ?, ?)").run(...r);
      }
      saveChunks([
        {
          id: "cx-1",
          repo_id: "repo-x",
          file_path: "x.ts",
          content: "X ${t1}",
          chunk_type: "generic",
          chunk_name: null,
          start_line: 1,
          end_line: 1
        },
        {
          id: "cy-1",
          repo_id: "repo-y",
          file_path: "y.ts",
          content: "Y ${t2}",
          chunk_type: "generic",
          chunk_name: null,
          start_line: 1,
          end_line: 1
        }
      ]);
      deleteChunksByRepoId("repo-x");
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
    const n1 = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts WHERE repo_id = 'repo-x'`,
      )
      .get();
    const n2 = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts WHERE repo_id = 'repo-y'`,
      )
      .get();
    const m2 = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts WHERE chunk_fts MATCH ${JSON.stringify(t2)}`,
      )
      .get();
    db.close();

    expect(n1?.c).toBe(0);
    expect(n2?.c).toBe(1);
    expect(m2?.c).toBe(1);

    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("deleteRepoById removes chunk_fts rows for that repo (CASCADE does not cover FTS)", () => {
    const testCwd = process.cwd().endsWith("/apps/server")
      ? join(process.cwd(), "..", "..")
      : process.cwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "server-chunk-fts-del-reporepo-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const chunkRepoPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/chunk.repository.ts"),
    ).href;
    const repoRepoPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/repo.repository.ts"),
    ).href;
    const connectionPath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;

    const tR = "fts_p13_repodel_token";

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { saveChunks } = await import(${JSON.stringify(chunkRepoPath)});
      const { saveRepo, deleteRepoById } = await import(${JSON.stringify(repoRepoPath)});
      const { getDb, closeDb } = await import(${JSON.stringify(connectionPath)});
      const db = getDb();
      saveRepo({
        id: "repo-del",
        path: "/tmp/repo-del",
        type: "local",
        status: "indexed",
        fileCount: 1,
        chunkCount: 1
      });
      saveChunks([
        {
          id: "cd-1",
          repo_id: "repo-del",
          file_path: "z.ts",
          content: "Z ${tR}",
          chunk_type: "generic",
          chunk_name: null,
          start_line: 1,
          end_line: 1
        }
      ]);
      deleteRepoById("repo-del");
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
    const fts = db
      .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM chunk_fts")
      .get();
    const chunks = db
      .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM chunks")
      .get();
    const match = db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) AS c FROM chunk_fts WHERE chunk_fts MATCH ${JSON.stringify(tR)}`,
      )
      .get();
    db.close();

    expect(chunks?.c).toBe(0);
    expect(fts?.c).toBe(0);
    expect(match?.c).toBe(0);

    rmSync(tempRoot, { recursive: true, force: true });
  });
});
