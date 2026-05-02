import { getDb } from "./connection";

export interface EmbeddingData {
  id: string;
  chunk_id: string;
  repo_id: string;
  model: string;
  vector: Float32Array;
}

type EmbeddingRow = {
  id: string;
  chunk_id: string;
  repo_id: string;
  model: string;
  embedding: Uint8Array;
};

function float32ToBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

function bufferToFloat32(blob: Uint8Array): Float32Array {
  const bytes = new Uint8Array(blob);
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

function mapEmbeddingRow(row: EmbeddingRow): EmbeddingData {
  return {
    id: row.id,
    chunk_id: row.chunk_id,
    repo_id: row.repo_id,
    model: row.model,
    vector: bufferToFloat32(row.embedding),
  };
}

export function saveEmbedding(embedding: EmbeddingData): void {
  const db = getDb();
  db.query<never, [string, string, string, Uint8Array, string]>(
    `
      INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        id = excluded.id,
        repo_id = excluded.repo_id,
        embedding = excluded.embedding,
        model = excluded.model
    `,
  ).run(
    embedding.id,
    embedding.chunk_id,
    embedding.repo_id,
    float32ToBuffer(embedding.vector),
    embedding.model,
  );
}

export function saveEmbeddings(embeddings: EmbeddingData[]): void {
  if (embeddings.length === 0) return;

  const db = getDb();
  const insert = db.query<never, [string, string, string, Uint8Array, string]>(
    `
      INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        id = excluded.id,
        repo_id = excluded.repo_id,
        embedding = excluded.embedding,
        model = excluded.model
    `,
  );

  const tx = db.transaction((records: EmbeddingData[]) => {
    for (const item of records) {
      insert.run(
        item.id,
        item.chunk_id,
        item.repo_id,
        float32ToBuffer(item.vector),
        item.model,
      );
    }
  });

  tx(embeddings);
}

export function getEmbeddingByChunkId(
  chunkId: string,
): EmbeddingData | undefined {
  const db = getDb();
  const row = db
    .query<EmbeddingRow, [string]>(
      `
        SELECT id, chunk_id, repo_id, model, embedding
        FROM embeddings
        WHERE chunk_id = ?
      `,
    )
    .get(chunkId);

  if (!row) return undefined;
  return mapEmbeddingRow(row);
}

export function getEmbeddingsByRepoId(repoId: string): EmbeddingData[] {
  const db = getDb();
  const rows = db
    .query<EmbeddingRow, [string]>(
      `
        SELECT id, chunk_id, repo_id, model, embedding
        FROM embeddings
        WHERE repo_id = ?
        ORDER BY chunk_id ASC
      `,
    )
    .all(repoId);

  return rows.map(mapEmbeddingRow);
}

export function deleteEmbeddingByChunkId(chunkId: string): void {
  const db = getDb();
  db.query("DELETE FROM embeddings WHERE chunk_id = ?").run(chunkId);
}

export function deleteEmbeddingsByRepoId(repoId: string): number {
  const db = getDb();
  const result = db
    .query("DELETE FROM embeddings WHERE repo_id = ?")
    .run(repoId);
  return result.changes;
}
