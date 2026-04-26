import { randomUUID } from "node:crypto";
import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";
import { getDb } from "../db/connection";

type SQLiteVectorFilter = {
  repo_id?: string;
  chunk_ids?: string[];
};

type SQLiteVectorAddOptions = {
  ids?: string[];
  model?: string;
};

type EmbeddingRow = {
  id: string;
  chunk_id: string;
  repo_id: string;
  model: string;
  embedding: Uint8Array;
  file_path: string;
  content: string;
  chunk_type: "function" | "class" | "generic";
  chunk_name: string | null;
  start_line: number | null;
  end_line: number | null;
};

function float32ToBuffer(vector: number[]): Buffer {
  const typed = Float32Array.from(vector);
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

function bufferToVector(blob: Uint8Array): number[] {
  const bytes = new Uint8Array(blob);
  const view = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return Array.from(view);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const dim = Math.min(a.length, b.length);
  for (let i = 0; i < dim; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SQLiteVectorStore extends VectorStore {
  FilterType: SQLiteVectorFilter = {};

  constructor(embeddings: EmbeddingsInterface) {
    super(embeddings, {});
  }

  _vectorstoreType(): string {
    return "sqlite";
  }

  async addDocuments(documents: Document[], options: SQLiteVectorAddOptions = {}): Promise<string[] | void> {
    const vectors = await this.embeddings.embedDocuments(documents.map((doc) => doc.pageContent));
    return this.addVectors(vectors, documents, options);
  }

  async addVectors(vectors: number[][], documents: Document[], options: SQLiteVectorAddOptions = {}): Promise<string[]> {
    if (vectors.length !== documents.length) {
      throw new Error("vectors length must match documents length");
    }
    if (vectors.length === 0) return [];

    const ids = options.ids ?? [];
    const model = options.model ?? "nomic-ai/nomic-embed-text-v1.5";
    const db = getDb();

    const insert = db.query<
      never,
      [string, string, string, Uint8Array, string]
    >(
      `
        INSERT INTO embeddings (id, chunk_id, repo_id, embedding, model)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(chunk_id) DO UPDATE SET
          id = excluded.id,
          repo_id = excluded.repo_id,
          embedding = excluded.embedding,
          model = excluded.model
      `
    );

    const createdIds: string[] = [];
    const tx = db.transaction(() => {
      for (let i = 0; i < vectors.length; i++) {
        const document = documents[i];
        const chunkId = String(document.metadata?.chunk_id ?? "");
        const repoId = String(document.metadata?.repo_id ?? "");
        if (!chunkId || !repoId) {
          throw new Error("document metadata must include chunk_id and repo_id");
        }

        const id = ids[i] ?? randomUUID();
        insert.run(id, chunkId, repoId, float32ToBuffer(vectors[i]), model);
        createdIds.push(id);
      }
    });

    tx();
    return createdIds;
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter: SQLiteVectorFilter = {}
  ): Promise<[Document, number][]> {
    const db = getDb();
    const rows = this.queryRows(filter, db);

    const ranked = rows
      .map((row) => {
        const vector = bufferToVector(row.embedding);
        return {
          row,
          score: cosineSimilarity(query, vector)
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return ranked.map(({ row, score }) => [
      new Document({
        pageContent: row.content,
        metadata: {
          embedding_id: row.id,
          chunk_id: row.chunk_id,
          repo_id: row.repo_id,
          model: row.model,
          file_path: row.file_path,
          chunk_type: row.chunk_type,
          chunk_name: row.chunk_name,
          start_line: row.start_line ?? 0,
          end_line: row.end_line ?? 0
        }
      }),
      score
    ]);
  }

  async delete(params: SQLiteVectorFilter = {}): Promise<void> {
    const db = getDb();
    const byRepo = params.repo_id;
    const chunkIds = params.chunk_ids ?? [];

    if (byRepo && chunkIds.length > 0) {
      const placeholders = chunkIds.map(() => "?").join(", ");
      db.query(`DELETE FROM embeddings WHERE repo_id = ? AND chunk_id IN (${placeholders})`).run(byRepo, ...chunkIds);
      return;
    }
    if (byRepo) {
      db.query("DELETE FROM embeddings WHERE repo_id = ?").run(byRepo);
      return;
    }
    if (chunkIds.length > 0) {
      const placeholders = chunkIds.map(() => "?").join(", ");
      db.query(`DELETE FROM embeddings WHERE chunk_id IN (${placeholders})`).run(...chunkIds);
      return;
    }

    db.query("DELETE FROM embeddings").run();
  }

  private queryRows(filter: SQLiteVectorFilter, db = getDb()): EmbeddingRow[] {
    const repoId = filter.repo_id;
    const chunkIds = filter.chunk_ids ?? [];

    if (repoId && chunkIds.length > 0) {
      const placeholders = chunkIds.map(() => "?").join(", ");
      return db
        .query<EmbeddingRow, [string, ...string[]]>(
          `
            SELECT e.id, e.chunk_id, e.repo_id, e.model, e.embedding,
                   c.file_path, c.content, c.chunk_type, c.chunk_name, c.start_line, c.end_line
            FROM embeddings e
            JOIN chunks c ON c.id = e.chunk_id
            WHERE e.repo_id = ? AND e.chunk_id IN (${placeholders})
          `
        )
        .all(repoId, ...chunkIds);
    }

    if (repoId) {
      return db
        .query<EmbeddingRow, [string]>(
          `
            SELECT e.id, e.chunk_id, e.repo_id, e.model, e.embedding,
                   c.file_path, c.content, c.chunk_type, c.chunk_name, c.start_line, c.end_line
            FROM embeddings e
            JOIN chunks c ON c.id = e.chunk_id
            WHERE e.repo_id = ?
          `
        )
        .all(repoId);
    }

    if (chunkIds.length > 0) {
      const placeholders = chunkIds.map(() => "?").join(", ");
      return db
        .query<EmbeddingRow, string[]>(
          `
            SELECT e.id, e.chunk_id, e.repo_id, e.model, e.embedding,
                   c.file_path, c.content, c.chunk_type, c.chunk_name, c.start_line, c.end_line
            FROM embeddings e
            JOIN chunks c ON c.id = e.chunk_id
            WHERE e.chunk_id IN (${placeholders})
          `
        )
        .all(...chunkIds);
    }

    return db
      .query<EmbeddingRow, []>(
        `
          SELECT e.id, e.chunk_id, e.repo_id, e.model, e.embedding,
                 c.file_path, c.content, c.chunk_type, c.chunk_name, c.start_line, c.end_line
          FROM embeddings e
          JOIN chunks c ON c.id = e.chunk_id
        `
      )
      .all();
  }
}
