import type { RepoStatus } from "@repo/types";
import { getDb } from "./connection";

export interface RepoRecord {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  fileCount: number;
  chunkCount: number;
}

type RepoRow = {
  id: string;
  path: string;
  type: "local" | "git";
  status: RepoStatus;
  file_count: number;
  chunk_count: number;
};

function mapRepoRow(row: RepoRow): RepoRecord {
  return {
    id: row.id,
    path: row.path,
    type: row.type,
    status: row.status,
    fileCount: row.file_count,
    chunkCount: row.chunk_count
  };
}

export function getRepoById(id: string): RepoRecord | undefined {
  const db = getDb();
  const row = db
    .query<RepoRow, [string]>(
      `
        SELECT id, path, type, status, file_count, chunk_count
        FROM repos
        WHERE id = ?
      `
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
        SELECT id, path, type, status, file_count, chunk_count
        FROM repos
        WHERE path = ?
      `
    )
    .get(repoPath);

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
        chunk_count = excluded.chunk_count
    `
  ).run(repo.id, repo.path, repo.type, repo.status, repo.fileCount, repo.chunkCount);
}

export function updateRepoStatus(repoId: string, status: RepoStatus): void {
  const db = getDb();
  db.query("UPDATE repos SET status = ? WHERE id = ?").run(status, repoId);
}

export function updateRepoChunkCount(repoId: string, chunkCount: number): void {
  const db = getDb();
  db.query("UPDATE repos SET chunk_count = ? WHERE id = ?").run(chunkCount, repoId);
}
