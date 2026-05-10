/**
 * P1-7: BM25 / FTS sparse query latency baseline on a synthetic corpus (10k+ `chunk_fts` rows).
 *
 * Run from repo root:
 *   bun run --cwd apps/server benchmark:retrieval-sparse
 *
 * Prints JSON to stdout (insert time, average query time). Uses a temp DB under $TMPDIR.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { closeDb, getDb } from "../db/connection";
import { searchChunkIdsByFtsBm25 } from "../db/chunk.repository";
import { normalizeUserQueryForFts5Match } from "../lib/fts-query-normalize";

const ROWS = 12_000;
const REPO_ID = "bench-sparse-repo";
/** Must appear in indexed bodies for MATCH; keep stable for reproducible reports. */
const QUERY_TOKEN = "token_7";
const BM25_LIMIT = 20;
const QUERY_TRIALS = 5;

function main(): void {
  const root = join(tmpdir(), `retrieval-sparse-bench-${Date.now()}`);
  const dbPath = join(root, "nested", "codebase-rag.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  process.env.DB_PATH = dbPath;

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO chunk_fts (chunk_id, repo_id, body) VALUES (?, ?, ?)`,
  );

  const tIns0 = performance.now();
  db.exec("BEGIN");
  for (let i = 0; i < ROWS; i++) {
    insert.run(
      `bench-c-${i}`,
      REPO_ID,
      `common filler words token_${i % 50} padding text for row ${i}`,
    );
  }
  db.exec("COMMIT");
  const tIns1 = performance.now();

  const matchExpr = normalizeUserQueryForFts5Match(QUERY_TOKEN);
  if (!matchExpr) {
    throw new Error(`normalizeUserQueryForFts5Match failed for ${QUERY_TOKEN}`);
  }

  let sumQueryMs = 0;
  let firstHitCount = 0;
  for (let t = 0; t < QUERY_TRIALS; t++) {
    const t0 = performance.now();
    const hits = searchChunkIdsByFtsBm25(
      REPO_ID,
      matchExpr,
      BM25_LIMIT,
    );
    const t1 = performance.now();
    sumQueryMs += t1 - t0;
    if (t === 0) firstHitCount = hits.length;
  }

  closeDb();
  rmSync(root, { recursive: true, force: true });

  const report = {
    chunkFtsRows: ROWS,
    insertMs: Math.round(tIns1 - tIns0),
    bm25Limit: BM25_LIMIT,
    queryTrials: QUERY_TRIALS,
    avgQueryMs: Number((sumQueryMs / QUERY_TRIALS).toFixed(3)),
    firstTrialHitCount: firstHitCount,
    matchQuery: matchExpr,
    note:
      "Cold single-process SQLite; numbers vary by machine. Use for before/after or regression triage (design §8 Q5).",
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
