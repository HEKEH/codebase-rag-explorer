import { SQLiteError } from "bun:sqlite";
import type { RepoStatus } from "@repo/types";
import { getDb } from "./connection";

/** True when INSERT hits the unique index on (type, path). Prefer over parsing `message`. */
export function isDuplicateRepoSourceError(error: unknown): boolean {
  return (
    error instanceof SQLiteError && error.code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export interface RepoRecord {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  fileCount: number;
  chunkCount: number;
  updatedAt?: string;
}

type RepoRow = {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  file_count: number;
  chunk_count: number;
  updated_at: string;
};

function mapRepoRow(row: RepoRow): RepoRecord {
  return {
    id: row.id,
    path: row.path,
    type: row.type,
    status: row.status,
    fileCount: row.file_count,
    chunkCount: row.chunk_count,
    updatedAt: row.updated_at,
  };
}

export function getRepoById(id: string): RepoRecord | undefined {
  const db = getDb();
  const row = db
    .query<RepoRow, [string]>(
      `
        SELECT id, path, type, status, file_count, chunk_count, updated_at
        FROM repos
        WHERE id = ?
      `,
    )
    .get(id);

  if (!row) return undefined;
  return mapRepoRow(row);
}

export function getRepoByPath(repoPath: string): RepoRecord | undefined {
  const db = getDb();
  const row = db
    .query<RepoRow, [string]>(
      `
        SELECT id, path, type, status, file_count, chunk_count, updated_at
        FROM repos
        WHERE path = ?
      `,
    )
    .get(repoPath);

  if (!row) return undefined;
  return mapRepoRow(row);
}

export function getRepoBySource(
  type: "local" | "git",
  sourceValue: string,
): RepoRecord | undefined {
  const db = getDb();
  const row = db
    .query<RepoRow, ["local" | "git", string]>(
      `
        SELECT id, path, type, status, file_count, chunk_count, updated_at
        FROM repos
        WHERE type = ? AND path = ?
      `,
    )
    .get(type, sourceValue);

  if (!row) return undefined;
  return mapRepoRow(row);
}

export function saveRepo(repo: RepoRecord): void {
  const db = getDb();
  db.query<
    never,
    [string, string, "local" | "git", RepoStatus, number, number]
  >(
    `
      INSERT INTO repos (id, path, type, status, file_count, chunk_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        type = excluded.type,
        status = excluded.status,
        file_count = excluded.file_count,
        chunk_count = excluded.chunk_count,
        updated_at = datetime('now')
    `,
  ).run(
    repo.id,
    repo.path,
    repo.type,
    repo.status,
    repo.fileCount,
    repo.chunkCount,
  );
}

export function updateRepoStatus(repoId: string, status: RepoStatus): void {
  const db = getDb();
  db.query(
    "UPDATE repos SET status = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(status, repoId);
}

export function updateRepoChunkCount(repoId: string, chunkCount: number): void {
  const db = getDb();
  db.query(
    "UPDATE repos SET chunk_count = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(chunkCount, repoId);
}

export function updateRepoFileCount(repoId: string, fileCount: number): void {
  const db = getDb();
  db.query(
    "UPDATE repos SET file_count = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(fileCount, repoId);
}

export function listRepos(): RepoRecord[] {
  const db = getDb();
  const rows = db
    .query<RepoRow, []>(
      `
        SELECT id, path, type, status, file_count, chunk_count, updated_at
        FROM repos
        ORDER BY created_at DESC, id DESC
      `,
    )
    .all();
  return rows.map(mapRepoRow);
}

export function deleteRepoById(repoId: string): number {
  const db = getDb();
  const result = db.query("DELETE FROM repos WHERE id = ?").run(repoId);
  return result.changes;
}
