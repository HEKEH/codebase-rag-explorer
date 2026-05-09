import { chunkToSparseIndexBody } from "../lib/chunk-index-text";
import { getDb } from "./connection";
import type { ChunkData } from "../types/chunk";
import type { Database } from "bun:sqlite";

type ChunkRow = {
  id: string;
  repo_id: string;
  file_path: string;
  content: string;
  chunk_type: ChunkData["chunk_type"];
  chunk_name: string | null;
  start_line: number | null;
  end_line: number | null;
};

function mapChunkRow(row: ChunkRow): ChunkData {
  return {
    ...row,
    start_line: row.start_line ?? 0,
    end_line: row.end_line ?? 0,
  };
}

function toChunkParams(
  chunk: ChunkData,
): [
  string,
  string,
  string,
  string,
  ChunkData["chunk_type"],
  string | null,
  number,
  number,
] {
  return [
    chunk.id,
    chunk.repo_id,
    chunk.file_path,
    chunk.content,
    chunk.chunk_type,
    chunk.chunk_name,
    chunk.start_line,
    chunk.end_line,
  ];
}

function replaceChunkFtsRow(db: Database, chunk: ChunkData): void {
  db.query("DELETE FROM chunk_fts WHERE chunk_id = ?").run(chunk.id);
  db.query(
    "INSERT INTO chunk_fts (chunk_id, repo_id, body) VALUES (?, ?, ?)",
  ).run(chunk.id, chunk.repo_id, chunkToSparseIndexBody(chunk));
}

export function saveChunk(chunk: ChunkData): void {
  const db = getDb();
  const upsert = db.query<
    never,
    [
      string,
      string,
      string,
      string,
      ChunkData["chunk_type"],
      string | null,
      number,
      number,
    ]
  >(
    `
      INSERT INTO chunks (id, repo_id, file_path, content, chunk_type, chunk_name, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        repo_id = excluded.repo_id,
        file_path = excluded.file_path,
        content = excluded.content,
        chunk_type = excluded.chunk_type,
        chunk_name = excluded.chunk_name,
        start_line = excluded.start_line,
        end_line = excluded.end_line
    `,
  );
  db.transaction(() => {
    upsert.run(...toChunkParams(chunk));
    replaceChunkFtsRow(db, chunk);
  })();
}

export function saveChunks(chunks: ChunkData[]): void {
  if (chunks.length === 0) return;

  const db = getDb();
  const insert = db.query<
    never,
    [
      string,
      string,
      string,
      string,
      ChunkData["chunk_type"],
      string | null,
      number,
      number,
    ]
  >(
    `
      INSERT INTO chunks (id, repo_id, file_path, content, chunk_type, chunk_name, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        repo_id = excluded.repo_id,
        file_path = excluded.file_path,
        content = excluded.content,
        chunk_type = excluded.chunk_type,
        chunk_name = excluded.chunk_name,
        start_line = excluded.start_line,
        end_line = excluded.end_line
    `,
  );

  const tx = db.transaction((records: ChunkData[]) => {
    for (const chunk of records) {
      insert.run(...toChunkParams(chunk));
      replaceChunkFtsRow(db, chunk);
    }
  });

  tx(chunks);
}

export function getChunkById(id: string): ChunkData | undefined {
  const db = getDb();
  const row = db
    .query<ChunkRow, [string]>(
      `
        SELECT id, repo_id, file_path, content, chunk_type, chunk_name, start_line, end_line
        FROM chunks
        WHERE id = ?
      `,
    )
    .get(id);

  if (!row) return undefined;
  return mapChunkRow(row);
}

export function getChunksByRepoId(repoId: string): ChunkData[] {
  const db = getDb();
  const rows = db
    .query<ChunkRow, [string]>(
      `
        SELECT id, repo_id, file_path, content, chunk_type, chunk_name, start_line, end_line
        FROM chunks
        WHERE repo_id = ?
        ORDER BY file_path ASC, start_line ASC, id ASC
      `,
    )
    .all(repoId);

  return rows.map(mapChunkRow);
}

export function deleteChunkById(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.query("DELETE FROM chunk_fts WHERE chunk_id = ?").run(id);
    db.query("DELETE FROM chunks WHERE id = ?").run(id);
  })();
}

export function deleteChunksByRepoId(repoId: string): number {
  const db = getDb();
  let chunkChanges = 0;
  db.transaction(() => {
    db.query("DELETE FROM chunk_fts WHERE repo_id = ?").run(repoId);
    chunkChanges = db
      .query("DELETE FROM chunks WHERE repo_id = ?")
      .run(repoId).changes;
  })();
  return chunkChanges;
}
