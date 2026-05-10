import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  buildFtsOrMatchFromRetrievalTokens,
  normalizeUserQueryForFts5Match,
} from "./fts-query-normalize";
import { monorepoRootFromCwd } from "./monorepo-root";

describe("lib/fts-query-normalize (P1-4)", () => {
  test("AND-joins phrase-quoted tokens and dedupes ASCII case-insensitively", () => {
    expect(normalizeUserQueryForFts5Match(`Foo OR bar foo`)).toBe(
      `"Foo" "OR" "bar"`,
    );
  });

  test("preserves CJK runs and mixes with English", () => {
    expect(normalizeUserQueryForFts5Match(`如何在app里用validateToken？`)).toBe(
      `"如何在" "app" "里用" "validateToken"`,
    );
  });

  test("buildFtsOrMatchFromRetrievalTokens OR-joins quoted tokens", () => {
    expect(buildFtsOrMatchFromRetrievalTokens(["alpha", "beta"])).toBe(
      `"alpha" OR "beta"`,
    );
    expect(buildFtsOrMatchFromRetrievalTokens([])).toBeNull();
  });

  test("phrase-quotes FTS keywords so they are literal tokens, not operators", () => {
    expect(normalizeUserQueryForFts5Match(`NEAR OR AND NOT`)).toBe(
      `"NEAR" "OR" "AND" "NOT"`,
    );
  });

  test("returns null when there are no searchable tokens", () => {
    expect(normalizeUserQueryForFts5Match(`@@@   !!!`)).toBeNull();
    expect(normalizeUserQueryForFts5Match(`""`)).toBeNull();
  });

  test("MATCH with normalized queries does not throw on awkward user strings", () => {
    const testCwd = monorepoRootFromCwd();
    const tempRoot = mkdtempSync(join(tmpdir(), "fts-norm-match-"));
    const dbPath = join(tempRoot, "nested", "codebase-rag.db");
    const connectionModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/db/connection.ts"),
    ).href;
    const normalizeModulePath = pathToFileURL(
      join(testCwd, "apps/server/src/lib/fts-query-normalize.ts"),
    ).href;

    const samples = [
      `What is "validateToken" in ./src/app?`,
      `test @#$ %^& ***`,
      `中文 和 English mix, NEAR() OR NOT`,
      `''' """ mixed 'quotes' and "apostrophe's"`,
      `a + b * c ^ foo`,
      `path/to/file.ts — unicode dash`,
    ];

    const command = `
      process.env.DB_PATH = ${JSON.stringify(dbPath)};
      const { getDb, closeDb } = await import(${JSON.stringify(connectionModulePath)});
      const { normalizeUserQueryForFts5Match } = await import(${JSON.stringify(normalizeModulePath)});
      const db = getDb();
      db.exec(\`
        INSERT INTO chunk_fts (chunk_id, repo_id, body) VALUES
          ('c1', 'r1', 'validateToken 中文 English');
      \`);
      const samples = ${JSON.stringify(samples)};
      for (const q of samples) {
        const m = normalizeUserQueryForFts5Match(q);
        if (m) {
          db.query(
            \`SELECT 1 FROM chunk_fts WHERE chunk_fts MATCH ? AND repo_id = ? LIMIT 1\`,
          ).get(m, 'r1');
        }
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
});
